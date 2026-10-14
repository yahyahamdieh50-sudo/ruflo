// Ziina adapter against a mocked API, plus checks on the real YAHIVO catalogue seed.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { Store } from '../lib/db.mjs';

const ADMIN_PASSWORD = 'ziina-test-password';
let base; let app; let cookie;
const calls = [];
const intent = { status: 'requires_payment_instrument', amount: null, currency_code: 'AED', fail: false };

async function mockFetch(url, init = {}) {
  calls.push({ url, init });
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url === 'https://api-v2.ziina.com/api/payment_intent' && init.method === 'POST') {
    if (intent.fail) return json(401, { message: 'unauthorised' });
    intent.amount = JSON.parse(init.body).amount;
    return json(201, { id: 'pi_123', redirect_url: 'https://pay.ziina.com/payment_intent/pi_123' });
  }
  if (url === 'https://api-v2.ziina.com/api/payment_intent/pi_123') {
    return json(200, { id: 'pi_123', status: intent.status, amount: intent.amount, currency_code: intent.currency_code });
  }
  return json(404, {});
}

before(async () => {
  app = createApp({
    store: new Store(':memory:', { seed: 'sample' }),
    env: { ADMIN_PASSWORD, SITE_URL: 'https://shop.example', ZIINA_API_TOKEN: 'ziina-secret-token' },
    fetchImpl: mockFetch,
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YH-Admin': '1' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
  await fetch(`${base}/api/admin/settings/delivery`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-YH-Admin': '1', Cookie: cookie },
    body: JSON.stringify({ zones: [{ id: 'uae', name: 'UAE', country: 'United Arab Emirates', areas: [], fee: 15, enabled: true }], couriers: [] }),
  });
});
after(() => app.server.close());

const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
};
const items = [{ slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 1 }];
const customer = { name: 'Ziina Buyer', email: 'z@example.com', phone: '+971 50 000 0002', country: 'United Arab Emirates', region: 'Abu Dhabi', city: 'Yas', address1: 'Villa 9' };

let token;
test('Ziina is offered at checkout only because its token is set; token never reaches the browser', async () => {
  const text = await (await fetch(`${base}/api/settings`)).text();
  const s = JSON.parse(text);
  assert.deepEqual(s.paymentMethods.map((m) => m.id), ['ziina']);
  assert.equal(text.includes('ziina-secret-token'), false);
});

test('order creates a Ziina payment intent in TEST mode and redirects to it', async () => {
  const r = await post('/api/orders', { items, customer, paymentMethod: 'ziina', expectedTotal: 214 });
  assert.equal(r.status, 201);
  assert.equal(r.json.redirectUrl, 'https://pay.ziina.com/payment_intent/pi_123');
  token = r.json.token;
  const create = calls.find((c) => c.init.method === 'POST');
  assert.equal(create.init.headers.Authorization, 'Bearer ziina-secret-token');
  const body = JSON.parse(create.init.body);
  assert.deepEqual([body.amount, body.currency_code, body.test], [21400, 'AED', true]);
  assert.equal(body.success_url, `https://shop.example/order/${token}?payment=return`);
  assert.equal(body.cancel_url, `https://shop.example/order/${token}?payment=cancelled`);
  assert.equal(JSON.stringify(body).includes('Villa 9'), false, 'no address sent to Ziina');
});

test('payment confirmed only when Ziina says completed and the amount matches', async () => {
  let r = await post(`/api/orders/${token}/verify-payment`, {});
  assert.equal(r.json.order.paymentStatus, 'awaiting_payment');
  const real = intent.amount;
  intent.status = 'completed';
  intent.amount = 100;
  r = await post(`/api/orders/${token}/verify-payment`, {});
  assert.equal(r.json.order.paymentStatus, 'awaiting_payment', 'amount mismatch not trusted');
  intent.amount = real;
  r = await post(`/api/orders/${token}/verify-payment`, {});
  assert.equal(r.json.order.paymentStatus, 'paid');
});

test('Ziina failure cancels the order and releases stock', async () => {
  intent.fail = true;
  const r = await post('/api/orders', { items, customer, paymentMethod: 'ziina', expectedTotal: 214 });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /not been charged/);
  intent.fail = false;
});

const crownStock = (list) => list.find((p) => p.slug === 'yahivo-crown-graphic-oversized-hoodie').colors[0].stock;

test('real YAHIVO catalogue: Shopify details, owner sizes/stock, hidden third-party designs', async () => {
  const store = new Store(':memory:', { seed: 'yahivo' });
  const all = store.listProducts({ includeUnpublished: true });
  const published = store.listProducts();
  assert.equal(all.length, 23);
  assert.equal(published.length, 14);
  assert.ok(published.every((p) => p.sizes.join() === 'S,M,L,XL' && !p.sample), 'owner-confirmed sizes on live hoodies');
  assert.ok(all.filter((p) => !p.published).every((p) => p.sizes.length === 0), 'hidden designs untouched');
  assert.deepEqual(crownStock(published), { S: 10, M: 10, L: 10, XL: 10 }, 'owner stock: 10 per size');
  assert.equal(store.getSettings().contact.whatsapp, '+971 52 586 6612');
  assert.ok(!published.some((p) => /toyota|bmw|drop-shoulder-hoodie-[24]|tonal|portrait/.test(p.slug)), 'designs without confirmed rights stay hidden');
  assert.ok(['essential-heavyweight-drop-shoulder-hoodie-3', 'essential-heavyweight-drop-shoulder-hoodie', 'oversize-fleeced-hoodie-tom-jerry'].every((s) => published.some((p) => p.slug === s && p.images.length)), 'owner-confirmed designs published with photos');
  const crown = published.find((p) => p.slug === 'yahivo-crown-graphic-oversized-hoodie');
  assert.equal(crown.price, 153.52);
  assert.deepEqual(crown.colors.map((c) => c.name), ['Black', 'Klein Blue', 'White']);
  assert.ok(crown.images.every((i) => i.color));
  assert.ok(published.every((p) => p.description && p.material && p.fit), 'descriptions/material/fit imported from Shopify');
  const coffee = published.find((p) => p.slug === 'yahivo-coffee-graphic-oversized-hoodie');
  assert.equal(coffee.colors[0].name, 'Light Gray');
  assert.deepEqual(coffee.colors[0].stock, { S: 10, M: 10, L: 10, XL: 10 }, 'available on Shopify → owner stock rule');
  const script = published.find((p) => p.slug === 'yahivo-script-oversized-fleece-hoodie-pink-apricot');
  assert.deepEqual(script.colors.map((c) => c.name), ['Pink', 'Apricot']);
  const settings = store.getSettings();
  assert.equal(settings.contact.email, 'yahia.h2026@hotmail.com');
  assert.ok(settings.policies.shipping && settings.policies.returns, 'policies from Shopify');
  assert.equal(/confirmation email|we('ll)? email|weight/i.test(settings.policies.shipping), false, 'no promises this store cannot keep');
  assert.equal(settings.sizeGuide.rows.length, 4);
  store.close();
});

test('real store settings: cash-on-delivery orders with Dubai AED 15 / rest of UAE AED 25 delivery', async () => {
  const { quote, placeOrder, paymentMethods } = await import('../lib/checkout.mjs');
  const store = new Store(':memory:', { seed: 'yahivo' });
  const settings = store.getSettings();
  const methods = paymentMethods(settings, {});
  assert.deepEqual(methods.map((m) => m.id), ['manual'], 'cash on delivery only');
  const items = [{ slug: 'yahivo-crown-graphic-oversized-hoodie', color: 'Klein Blue', size: 'L', qty: 2 }];
  const ctx = { settings, products: store.listProducts(), methods };
  const dubai = quote({ items, country: 'United Arab Emirates', region: 'Dubai' }, ctx);
  assert.deepEqual([dubai.totals.items, dubai.totals.delivery, dubai.totals.tax, dubai.totals.total], [307.04, 15, 0, 322.04]);
  const sharjah = quote({ items, country: 'United Arab Emirates', region: 'Sharjah' }, ctx);
  assert.equal(sharjah.totals.delivery, 25);
  const placed = placeOrder({ items, paymentMethod: 'manual', expectedTotal: 322.04,
    customer: { name: 'Real Buyer', email: 'r@example.com', phone: '+971 50 111 0000', country: 'United Arab Emirates', region: 'Dubai', city: 'JBR', address1: 'Tower 1' } }, { store, settings, methods });
  const order = store.getOrder(placed.id);
  assert.equal(order.paymentStatus, 'awaiting_payment');
  assert.equal(order.totals.total, 322.04);
  const coffee = quote({ items: [{ slug: 'yahivo-coffee-graphic-oversized-hoodie', color: 'Light Gray', size: 'M', qty: 1 }] }, ctx);
  assert.deepEqual(coffee.issues, [], 'available again, as on Shopify');
  store.close();
});

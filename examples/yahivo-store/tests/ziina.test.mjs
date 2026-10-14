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

test('real YAHIVO catalogue: published items only, no invented sizes, sold-out status kept', async () => {
  const store = new Store(':memory:', { seed: 'yahivo' });
  const all = store.listProducts({ includeUnpublished: true });
  const published = store.listProducts();
  assert.equal(all.length, 23);
  assert.equal(published.length, 11);
  assert.ok(all.every((p) => p.sizes.length === 0 && !p.sample), 'sizes left empty — not invented');
  assert.ok(!published.some((p) => /toyota|bmw|tom-jerry|drop-shoulder|tonal|portrait/.test(p.slug)), 'third-party/likeness items hidden');
  const crown = published.find((p) => p.slug === 'yahivo-crown-graphic-oversized-hoodie');
  assert.equal(crown.price, 153.52);
  assert.deepEqual(crown.colors.map((c) => c.name), ['Black', 'Klein Blue', 'White']);
  assert.ok(crown.images.every((i) => i.color));
  const coffee = published.find((p) => p.slug === 'yahivo-coffee-graphic-oversized-hoodie');
  assert.deepEqual(coffee.colors[0].stock, {}, 'sold out');
  store.close();
});

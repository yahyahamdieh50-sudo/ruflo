// N-Genius adapter against a mocked provider: request shapes, redirect, server-side
// payment confirmation (amount must match), and safe failure handling.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { Store } from '../lib/db.mjs';

const ADMIN_PASSWORD = 'ngenius-test-password';
let base; let app; let cookie;
const calls = [];
const provider = { state: 'STARTED', amount: null, failCreate: false };

async function mockFetch(url, init = {}) {
  calls.push({ url, init });
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  if (url.endsWith('/identity/auth/access-token')) return json(200, { access_token: 'tok-123' });
  if (/\/transactions\/outlets\/outlet-1\/orders$/.test(url)) {
    if (provider.failCreate) return json(500, {});
    const body = JSON.parse(init.body);
    provider.amount = body.amount;
    return json(201, { reference: 'ng-ref-1', _links: { payment: { href: 'https://paypage.sandbox.ngenius-payments.com/?code=abc' } } });
  }
  if (url.endsWith('/orders/ng-ref-1')) {
    return json(200, { reference: 'ng-ref-1', amount: provider.amount, _embedded: { payment: [{ state: provider.state }] } });
  }
  return json(404, {});
}

before(async () => {
  app = createApp({
    store: new Store(':memory:'),
    env: { ADMIN_PASSWORD, SITE_URL: 'https://shop.example', NGENIUS_API_KEY: 'base64key', NGENIUS_OUTLET_REF: 'outlet-1' },
    fetchImpl: mockFetch,
  });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YH-Admin': '1' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
  await fetch(`${base}/api/admin/settings/delivery`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-YH-Admin': '1', Cookie: cookie },
    body: JSON.stringify({ zones: [{ id: 'uae', name: 'UAE', country: 'United Arab Emirates', areas: [], fee: 20, enabled: true }], couriers: [] }),
  });
});
after(() => app.server.close());

const post = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
};
const items = [{ slug: 'sample-core-pullover', color: 'Bone', size: 'S', qty: 1 }];
const customer = { name: 'Card Buyer', email: 'card@example.com', phone: '+971 50 000 0001', country: 'United Arab Emirates', region: 'Dubai', city: 'JLT', address1: 'Cluster A' };
const stock = async () => (await (await fetch(`${base}/api/products/sample-core-pullover`)).json()).product.colors.find((c) => c.name === 'Bone').stock.S;

let token;
test('card payment is offered only because N-Genius is configured', async () => {
  const s = await (await fetch(`${base}/api/settings`)).json();
  assert.deepEqual(s.paymentMethods.map((m) => m.id), ['ngenius']);
  assert.equal(s.ordering, true);
});

test('order creates an N-Genius hosted payment and redirects there', async () => {
  const r = await post('/api/orders', { items, customer, paymentMethod: 'ngenius', expectedTotal: 219 });
  assert.equal(r.status, 201);
  assert.equal(r.json.redirectUrl, 'https://paypage.sandbox.ngenius-payments.com/?code=abc');
  token = r.json.token;
  const [tok, create] = calls;
  assert.equal(tok.url, 'https://api-gateway.sandbox.ngenius-payments.com/identity/auth/access-token');
  assert.equal(tok.init.headers.Authorization, 'Basic base64key');
  assert.equal(tok.init.headers['Content-Type'], 'application/vnd.ni-identity.v1+json');
  assert.equal(create.init.headers.Authorization, 'Bearer tok-123');
  assert.equal(create.init.headers['Content-Type'], 'application/vnd.ni-payment.v2+json');
  const body = JSON.parse(create.init.body);
  assert.equal(body.action, 'PURCHASE');
  assert.deepEqual(body.amount, { currencyCode: 'AED', value: 21900 });
  assert.equal(body.merchantOrderReference, 'YH-1001');
  assert.equal(body.merchantAttributes.redirectUrl, `https://shop.example/order/${token}?payment=return`);
  assert.equal(JSON.stringify(calls).includes('card@example.com') && !JSON.stringify(calls).includes('Cluster A'), true, 'only email is shared, not the address');
  assert.equal(await stock(), 1, 'stock reserved (2 → 1)');
});

test('payment is confirmed server-side only when the provider says paid and the amount matches', async () => {
  provider.state = 'STARTED';
  let r = await post(`/api/orders/${token}/verify-payment`, {});
  assert.equal(r.json.order.paymentStatus, 'awaiting_payment');
  assert.equal(r.json.order.payment.providerRef, undefined, 'provider reference not exposed');

  const realAmount = provider.amount;
  provider.state = 'PURCHASED';
  provider.amount = { currencyCode: 'AED', value: 100 };
  r = await post(`/api/orders/${token}/verify-payment`, {});
  assert.equal(r.json.order.paymentStatus, 'awaiting_payment', 'amount mismatch is not marked paid');

  provider.amount = realAmount;
  r = await post(`/api/orders/${token}/verify-payment`, {});
  assert.equal(r.json.order.paymentStatus, 'paid');
});

test('if the payment page cannot be created the order is cancelled and stock released', async () => {
  provider.failCreate = true;
  const before = await stock();
  const r = await post('/api/orders', { items, customer, paymentMethod: 'ngenius', expectedTotal: 219 });
  assert.equal(r.status, 502);
  assert.match(r.json.error, /not been charged/);
  assert.equal(await stock(), before);
  provider.failCreate = false;
});

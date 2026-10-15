// AI control: customer self-cancellation in the chat, and the owner's AI admin assistant
// (proposes actions; nothing changes until /apply). Own app instance so rate limits are isolated.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { Store } from '../lib/db.mjs';
import { parseCommand } from '../lib/admin-ai.mjs';

const ADMIN_PASSWORD = 'ai-control-password';
let base; let app; let cookie = '';

async function call(path, { method = 'GET', body, admin = false } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { 'X-YH-Admin': '1', Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const customer = { name: 'Chat Buyer', email: 'chat@example.com', phone: '+971 50 000 0001', country: 'United Arab Emirates', region: 'Dubai', city: 'Marina', address1: 'Tower 5' };
const items = [{ slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 1 }];
const stockM = async () => (await call('/api/products/sample-core-pullover')).json.product.colors.find((c) => c.name === 'Black').stock.M;
async function placeOrder() {
  const q = (await call('/api/quote', { method: 'POST', body: { items, country: 'United Arab Emirates', region: 'Dubai' } })).json;
  return (await call('/api/orders', { method: 'POST', body: { items, customer, paymentMethod: 'manual', expectedTotal: q.totals.total } })).json;
}
const chat = async (...contents) => (await call('/api/assistant', { method: 'POST', body: { messages: contents.flatMap((c, i) => (i ? [{ role: 'assistant', content: 'ok' }, { role: 'user', content: c }] : [{ role: 'user', content: c }])) } })).json;

before(async () => {
  app = createApp({ store: new Store(':memory:', { seed: 'sample' }), env: { ADMIN_PASSWORD } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YH-Admin': '1' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
  await call('/api/admin/settings/delivery', { method: 'PUT', admin: true, body: { zones: [{ id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', areas: ['Dubai'], fee: 15, enabled: true }], couriers: [{ id: 'imile', name: 'iMile', trackingUrlTemplate: 'https://parcelsapp.com/en/tracking/{tracking}' }] } });
  await call('/api/admin/settings/payments', { method: 'PUT', admin: true, body: { manualOrderRequests: true } });
});
after(() => app.server.close());

test('customer can cancel a Received order in the chat, only after typing the exact confirmation', async () => {
  const order = await placeOrder();
  assert.equal(order.number, 'YH-1001');
  assert.equal(await stockM(), 9);

  const offer = await chat('please cancel my order YH-1001, email chat@example.com');
  assert.match(offer.reply, /reply exactly:\nCANCEL YH-1001/);
  assert.equal((await call(`/api/orders/${order.token}`)).json.order.status, 'received', 'asking is not cancelling');

  const wrongEmail = await chat('cancel YH-1001 other@example.com', 'CANCEL YH-1001');
  assert.match(wrongEmail.reply, /couldn’t find order YH-1001/);
  assert.equal((await call(`/api/orders/${order.token}`)).json.order.status, 'received', 'wrong email cannot cancel');

  const done = await chat('please cancel my order YH-1001, email chat@example.com', 'CANCEL YH-1001');
  assert.match(done.reply, /Order YH-1001 is cancelled/);
  const view = (await call(`/api/orders/${order.token}`)).json.order;
  assert.equal(view.status, 'cancelled');
  assert.equal(await stockM(), 10, 'stock returned');
  const again = await chat('YH-1001 chat@example.com', 'CANCEL YH-1001');
  assert.match(again.reply, /already cancelled/);
});

test('admin AI: proposes actions, changes nothing until confirmed, re-validates on apply', async () => {
  assert.equal((await call('/api/admin/ai', { method: 'POST', body: { message: 'summary' } })).status, 401, 'admin only');
  const order = await placeOrder();
  assert.equal(order.number, 'YH-1002');
  const ask = async (message) => (await call('/api/admin/ai', { method: 'POST', admin: true, body: { message } })).json;
  const apply = async (actions) => (await call('/api/admin/ai/apply', { method: 'POST', admin: true, body: { actions } })).json.results;
  const status = async () => (await call(`/api/orders/${order.token}`)).json.order;

  const summary = await ask('what do I need to pack today?');
  assert.match(summary.reply, /To prepare and pack \(1\):\n {2}• YH-1002/);

  const packed = await ask('mark YH-1002 packed');
  assert.equal(packed.actions.length, 1);
  assert.equal(packed.actions[0].ok, true);
  assert.match(packed.actions[0].description, /from Received to Packed/);
  assert.equal((await status()).status, 'received', 'proposal alone changes nothing');
  assert.deepEqual((await apply([packed.actions[0].action])).map((r) => r.ok), [true]);
  assert.equal((await status()).status, 'packed');

  const ship = await ask('YH-1002 shipped with iMile 6031225370927');
  assert.deepEqual(ship.actions[0].action, { type: 'ship', number: 'YH-1002', courierId: 'imile', trackingNumber: '6031225370927' });
  await apply([ship.actions[0].action]);
  const shipped = await status();
  assert.equal(shipped.status, 'handed_to_courier');
  assert.equal(shipped.fulfilment.trackingUrl, 'https://parcelsapp.com/en/tracking/6031225370927');

  await apply([(await ask('YH-1002 paid')).actions[0].action]);
  assert.equal((await status()).paymentStatus, 'paid');

  const stock = await ask('set core pullover black M stock to 7');
  assert.deepEqual(stock.actions[0].action, { type: 'stock', slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 7 });
  await apply([stock.actions[0].action]);
  assert.equal(await stockM(), 7);

  const missing = await ask('mark YH-9999 packed');
  assert.equal(missing.actions[0].ok, false);
  const forged = await apply([{ type: 'status', number: 'YH-1002', status: 'received' }, { type: 'stock', slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: -3 }]);
  assert.deepEqual(forged.map((r) => r.ok), [false, false], 'invalid transitions and quantities are refused at apply time');
  assert.equal((await status()).status, 'handed_to_courier');
});

test('admin AI parser understands the common requests', () => {
  const store = new Store(':memory:', { seed: 'sample' });
  const c = { store, settings: { ...store.getSettings(), delivery: { zones: [], couriers: [{ id: 'imile', name: 'iMile' }] } } };
  assert.deepEqual(parseCommand('cancel YH-1004', c).actions, [{ type: 'status', number: 'YH-1004', status: 'cancelled' }]);
  assert.deepEqual(parseCommand('YH-1004 and YH-1005 delivered', c).actions.map((a) => a.number), ['YH-1004', 'YH-1005']);
  assert.deepEqual(parseCommand('YH-1004 sent 6031225370927', c).actions, [{ type: 'ship', number: 'YH-1004', courierId: 'imile', trackingNumber: '6031225370927' }], 'single courier is assumed');
  assert.equal(parseCommand('set stock to 5', c).actions.length, 0, 'asks which product instead of guessing');
  store.close();
});

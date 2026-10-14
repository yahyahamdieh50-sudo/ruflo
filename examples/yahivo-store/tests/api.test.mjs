// End-to-end API tests against a real server instance with an in-memory database.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { createApp } from '../server.mjs';
import { Store } from '../lib/db.mjs';

const ADMIN_PASSWORD = 'correct-horse-battery';
let base; let app; let cookie = '';
const uploaded = [];

before(async () => {
  app = createApp({ store: new Store(':memory:', { seed: 'sample' }), env: { ADMIN_PASSWORD, SITE_URL: 'https://shop.example' } });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(() => {
  app.server.close();
  for (const src of uploaded) rmSync(new URL(`../public${src}`, import.meta.url), { force: true });
});

async function call(path, { method = 'GET', body, admin = false, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { 'X-YH-Admin': '1', Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, json, text, headers: res.headers };
}

const customer = { name: 'Test Buyer', email: 'buyer@example.com', phone: '+971 50 000 0000', country: 'United Arab Emirates', region: 'Dubai', city: 'Marina', address1: 'Tower 1, Flat 2' };

test('fresh store: no ordering until delivery + payment are configured', async () => {
  const s = (await call('/api/settings')).json;
  assert.equal(s.ordering, false);
  assert.deepEqual(s.paymentMethods, []);
  assert.equal(s.sampleData, true);
  assert.equal(s.aiMode, 'demo');
  assert.equal(s.tax.enabled, false);
  const r = await call('/api/orders', { method: 'POST', body: { items: [{ slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 1 }], customer, paymentMethod: 'manual', expectedTotal: 199 } });
  assert.equal(r.status, 422);
  assert.ok(r.json.fields.paymentMethod);
});

test('catalog API filters and 404s', async () => {
  const r = await call('/api/products?color=olive&size=M&inStock=1');
  assert.deepEqual(r.json.products.map((p) => p.slug), ['sample-oversized-hoodie']);
  assert.ok(r.json.facets.sizes.includes('XS'));
  assert.equal((await call('/api/products/does-not-exist')).status, 404);
});

test('admin auth: header, password, session, and CSRF protection', async () => {
  assert.equal((await call('/api/admin/overview')).status, 401);
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: ADMIN_PASSWORD } })).status, 403, 'login needs X-YH-Admin header');
  assert.equal((await call('/api/admin/login', { method: 'POST', body: { password: 'nope-nope-nope' }, headers: { 'X-YH-Admin': '1' } })).status, 401);
  const ok = await call('/api/admin/login', { method: 'POST', body: { password: ADMIN_PASSWORD }, headers: { 'X-YH-Admin': '1' } });
  assert.equal(ok.status, 200);
  const set = ok.headers.get('set-cookie');
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  assert.match(set, /Secure/);
  cookie = set.split(';')[0];
  const noHeader = await fetch(`${base}/api/admin/settings/payments`, { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(noHeader.status, 403);
  assert.equal((await call('/api/admin/overview', { admin: true })).status, 200);
});

test('admin configures delivery, couriers, packing, tax and payments', async () => {
  const put = (sec, body) => call(`/api/admin/settings/${sec}`, { method: 'PUT', body, admin: true });
  const bad = await put('tax', { enabled: true, rate: 80 });
  assert.equal(bad.status, 422);
  assert.equal((await put('delivery', {
    zones: [
      { id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', areas: ['Dubai'], fee: 25, freeOver: 500, estimate: 'Test estimate', enabled: true },
      { id: 'north', name: 'Northern Emirates', country: 'United Arab Emirates', areas: ['Sharjah', 'Ajman'], fee: 35, freeOver: null, estimate: null, enabled: true },
    ],
    couriers: [{ id: 'test-courier', name: 'Test Courier', trackingUrlTemplate: 'https://courier.example/t?n={tracking}' }],
  })).status, 200);
  assert.equal((await put('packing', { options: [{ id: 'standard', name: 'Standard bag', fee: 0, isDefault: true }, { id: 'gift', name: 'Gift box', fee: 15 }] })).status, 200);
  assert.equal((await put('tax', { enabled: true, name: 'VAT', rate: 5, pricesIncludeTax: false, appliesToDelivery: true, appliesToPacking: true })).status, 200);
  assert.equal((await put('payments', { manualOrderRequests: true })).status, 200);
  const s = (await call('/api/settings')).json;
  assert.equal(s.ordering, true);
  assert.deepEqual(s.paymentMethods.map((m) => m.id), ['manual']);
  assert.equal(s.tax.enabled, true);
  assert.equal(s.delivery.zones[0].fee, 25);
  assert.equal(JSON.stringify(s).includes('courier.example'), false, 'courier internals are not public');
});

let order;
test('quote → place order → confirmation: totals include packing, delivery and tax', async () => {
  const items = [{ slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 2 }];
  const q = (await call('/api/quote', { method: 'POST', body: { items, country: 'United Arab Emirates', region: 'Dubai', packingId: 'gift' } })).json;
  // 2 × 199 = 398; gift 15; Dubai 25; VAT 5% of 438 = 21.90 → 459.90
  assert.deepEqual([q.totals.items, q.totals.packing, q.totals.delivery, q.totals.tax, q.totals.total], [398, 15, 25, 21.9, 459.9]);
  assert.equal(q.totals.taxLabel, 'VAT (5%)');

  const stale = await call('/api/orders', { method: 'POST', body: { items, customer, packingId: 'gift', paymentMethod: 'manual', expectedTotal: 400 } });
  assert.equal(stale.status, 409, 'order is refused if the customer saw a different total');

  const placed = await call('/api/orders', { method: 'POST', body: { items, customer, packingId: 'gift', paymentMethod: 'manual', expectedTotal: 459.9 } });
  assert.equal(placed.status, 201);
  assert.equal(placed.json.number, 'YH-1001');
  assert.equal(placed.json.redirectUrl, null);
  order = placed.json;

  const view = (await call(`/api/orders/${order.token}`)).json.order;
  assert.equal(view.status, 'received');
  assert.equal(view.paymentStatus, 'awaiting_payment');
  assert.equal(view.totals.total, 459.9);
  assert.equal(view.packing.name, 'Gift box');
  assert.equal(view.customer.email, undefined, 'confirmation page does not expose email');
  assert.equal(view.internalNotes, undefined);

  const stock = (await call('/api/products/sample-core-pullover')).json.product.colors.find((c) => c.name === 'Black').stock.M;
  assert.equal(stock, 8, 'stock reserved (10 → 8)');
});

test('order tracking requires matching number + email', async () => {
  assert.equal((await call('/api/track', { method: 'POST', body: { number: 'YH-1001', email: 'other@example.com' } })).status, 404);
  const ok = await call('/api/track', { method: 'POST', body: { number: 'yh-1001', email: 'BUYER@example.com' } });
  assert.equal(ok.json.token, order.token);
});

test('admin fulfilment workflow: courier + tracking, packing notes, statuses, payment', async () => {
  const list = (await call('/api/admin/orders?status=received', { admin: true })).json;
  const id = list.orders[0].id;
  const patch = (body) => call(`/api/admin/orders/${id}`, { method: 'PATCH', body, admin: true });
  assert.equal((await patch({ status: 'handed_to_courier' })).status, 422, 'courier required first');
  assert.equal((await patch({ status: 'preparing', packingNotes: 'Gift box + tissue' })).status, 200);
  assert.equal((await patch({ status: 'packed' })).status, 200);
  const c = await patch({ courierId: 'test-courier', trackingNumber: 'AB 123', status: 'handed_to_courier' });
  assert.equal(c.status, 200);
  assert.equal(c.json.order.fulfilment.trackingUrl, 'https://courier.example/t?n=AB%20123');
  assert.equal((await patch({ paymentStatus: 'paid' })).json.order.paymentStatus, 'paid');
  assert.equal((await patch({ status: 'delivered' })).status, 200);
  assert.equal((await patch({ status: 'cancelled' })).status, 422, 'delivered is final');
  const pub = (await call(`/api/orders/${order.token}`)).json.order;
  assert.equal(pub.status, 'delivered');
  assert.equal(pub.fulfilment.trackingNumber, 'AB 123');
  assert.deepEqual(pub.history.map((h) => h.status), ['received', 'preparing', 'packed', 'handed_to_courier', 'delivered']);
  const events = (await call(`/api/admin/orders/${id}`, { admin: true })).json.events;
  assert.ok(events.some((e) => e.type === 'packing'));
});

test('cancelling an order returns stock; sold-out items cannot be ordered', async () => {
  const items = [{ slug: 'sample-heavy-pullover', color: 'Burgundy', size: 'XL', qty: 2 }];
  const q = (await call('/api/quote', { method: 'POST', body: { items, country: 'United Arab Emirates', region: 'Sharjah', packingId: 'standard' } })).json;
  const placed = await call('/api/orders', { method: 'POST', body: { items, customer: { ...customer, region: 'Sharjah' }, packingId: 'standard', paymentMethod: 'manual', expectedTotal: q.totals.total } });
  assert.equal(placed.status, 201);
  const stockOf = async () => (await call('/api/products/sample-heavy-pullover')).json.product.colors[0].stock.XL;
  assert.equal(await stockOf(), 0);
  const again = await call('/api/quote', { method: 'POST', body: { items } });
  assert.equal(again.json.lines.length, 0);
  assert.equal(again.json.issues[0].type, 'sold_out');
  const { orders } = (await call('/api/admin/orders', { admin: true })).json;
  const id = orders.find((o) => o.number === placed.json.number).id;
  assert.equal((await call(`/api/admin/orders/${id}`, { method: 'PATCH', body: { status: 'cancelled' }, admin: true })).status, 200);
  assert.equal(await stockOf(), 2);
});

test('outside delivery zones is refused', async () => {
  const items = [{ slug: 'sample-zip-up-hoodie', color: 'Navy', size: 'M', qty: 1 }];
  const r = await call('/api/orders', { method: 'POST', body: { items, customer: { ...customer, region: 'Fujairah' }, packingId: 'standard', paymentMethod: 'manual', expectedTotal: 0 } });
  assert.equal(r.status, 422);
  assert.ok(r.json.fields.region);
});

test('admin products: create, conflict, unpublish, delete', async () => {
  const product = { slug: 'real-hoodie', name: 'Real Hoodie', style: 'Pullover', price: 210, sizes: ['M', 'L'], colors: [{ name: 'Black', hex: '#111111', stock: { M: 3, L: 0 } }], published: true };
  assert.equal((await call('/api/admin/products/_new', { method: 'PUT', body: product, admin: true })).status, 200);
  assert.equal((await call('/api/admin/products/_new', { method: 'PUT', body: product, admin: true })).status, 422);
  assert.equal((await call('/api/products/real-hoodie')).status, 200);
  assert.equal((await call('/api/admin/products/real-hoodie', { method: 'PUT', body: { ...product, published: false }, admin: true })).status, 200);
  assert.equal((await call('/api/products/real-hoodie')).status, 404, 'unpublished products are hidden');
  assert.equal((await call('/api/admin/products/real-hoodie', { method: 'DELETE', admin: true })).status, 200);
});

test('image uploads accept real images only', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const ok = await call('/api/admin/uploads', { method: 'POST', body: { dataBase64: png.toString('base64') }, admin: true });
  assert.equal(ok.status, 201);
  assert.match(ok.json.src, /^\/uploads\/[a-f0-9]{24}\.png$/);
  uploaded.push(ok.json.src);
  assert.equal((await fetch(base + ok.json.src)).status, 200);
  const bad = await call('/api/admin/uploads', { method: 'POST', body: { dataBase64: Buffer.from('<script>alert(1)</script>').toString('base64') }, admin: true });
  assert.equal(bad.status, 422);
});

test('pages: SEO/social meta, 404s, security headers, no traversal', async () => {
  const home = await call('/');
  assert.match(home.text, /<title>YAHIVO — Hoodies<\/title>/);
  assert.match(home.text, /og:image" content="https:\/\/shop\.example\/img\/og-default\.png/);
  assert.match(home.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
  const pdp = await call('/product/sample-core-pullover');
  assert.match(pdp.text, /og:type" content="product"/);
  assert.match(pdp.text, /product:price:currency" content="AED"/);
  assert.match(pdp.text, /"@type":"Product"/);
  assert.match(pdp.text, /noindex/, 'sample products are not indexed');
  assert.equal((await call('/product/nope')).status, 404);
  assert.equal((await call('/nope')).status, 404);
  assert.equal((await call('/..%2f..%2fserver.mjs')).status, 404);
  assert.equal((await call('/%2e%2e/lib/db.mjs')).status, 404);
  assert.equal((await call('/index.html')).status, 404);
  assert.match((await call('/robots.txt')).text, /Disallow: \/admin/);
  assert.doesNotMatch((await call('/sitemap.xml')).text, /sample-/);
  const admin = await call('/admin');
  assert.equal(admin.headers.get('x-robots-tag'), 'noindex');
});

test('assistant demo endpoint + input validation; stripe webhook disabled without keys', async () => {
  const r = await call('/api/assistant', { method: 'POST', body: { messages: [{ role: 'user', content: 'How much is delivery to Dubai?' }] } });
  assert.equal(r.json.mode, 'demo');
  assert.match(r.json.reply, /Dubai — AED 25\.00/);
  assert.match(r.json.reply, /can’t promise a specific delivery date/);
  const tax = await call('/api/assistant', { method: 'POST', body: { messages: [{ role: 'user', content: 'is vat included?' }] } });
  assert.match(tax.json.reply, /VAT at 5% is applied; prices exclude it/);
  assert.equal((await call('/api/assistant', { method: 'POST', body: { messages: [{ role: 'user', content: 'x'.repeat(2000) }] } })).status, 400);
  assert.equal((await call('/api/stripe/webhook', { method: 'POST', body: {} })).status, 404);
});

test('courier/packing CSV export is admin-only and complete', async () => {
  assert.equal((await call('/api/admin/orders.csv')).status, 401);
  const r = await call('/api/admin/orders.csv?status=delivered', { admin: true });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="yahivo-orders-/);
  const lines = r.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 2, 'header + the one delivered order');
  assert.match(lines[0], /"Order","Placed","Status"/);
  assert.match(lines[1], /"YH-1001".*"Test Buyer".*"Tower 1, Flat 2".*"2 x Core Pullover Hoodie \(Black, M\)".*"Test Courier","AB 123"/);
});

test('customer data removal: only for finished orders, irreversible, keeps totals', async () => {
  const items = [{ slug: 'sample-zip-up-hoodie', color: 'Navy', size: 'S', qty: 1 }];
  const q = (await call('/api/quote', { method: 'POST', body: { items, country: 'United Arab Emirates', region: 'Dubai', packingId: 'standard' } })).json;
  const open = await call('/api/orders', { method: 'POST', body: { items, customer, packingId: 'standard', paymentMethod: 'manual', expectedTotal: q.totals.total } });
  const { orders } = (await call('/api/admin/orders', { admin: true })).json;
  const openId = orders.find((o) => o.number === open.json.number).id;
  assert.equal((await call(`/api/admin/orders/${openId}/anonymise`, { method: 'POST', body: {}, admin: true })).status, 409);

  const deliveredId = orders.find((o) => o.number === 'YH-1001').id;
  assert.equal((await call(`/api/admin/orders/${deliveredId}/anonymise`, { method: 'POST', body: {} })).status, 401);
  const r = await call(`/api/admin/orders/${deliveredId}/anonymise`, { method: 'POST', body: {}, admin: true });
  assert.equal(r.status, 200);
  const o = r.json.order;
  assert.equal(o.customer.name, '[removed]');
  assert.equal(o.customer.phone, '[removed]');
  assert.equal(o.customer.email, undefined);
  assert.equal(o.email, `removed-${deliveredId}@invalid`);
  assert.equal(o.fulfilment.packingNotes, null);
  assert.equal(o.totals.total, 459.9, 'financial record kept');
  assert.ok(r.json.events.some((e) => e.type === 'privacy'));
  assert.equal((await call('/api/track', { method: 'POST', body: { number: 'YH-1001', email: 'buyer@example.com' } })).status, 404);
  const csv = (await call('/api/admin/orders.csv?q=YH-1001', { admin: true })).text;
  assert.doesNotMatch(csv, /Test Buyer|buyer@example\.com|Tower 1/);
});

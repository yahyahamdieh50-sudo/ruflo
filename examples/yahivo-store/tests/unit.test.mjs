import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { computeTotals } from '../lib/money.mjs';
import { applySection, deliveryRegions, launchChecklist, zoneFor } from '../lib/settings.mjs';
import { validateCustomer, validateProduct, ValidationError } from '../lib/validate.mjs';
import { sessionParams, verifyWebhook } from '../lib/stripe.mjs';
import { demoReply, orderRefFrom, parsePrefs, validateHistory } from '../lib/assistant.mjs';
import { filterProducts, parseQuery } from '../lib/catalog.mjs';
import { nextStatuses } from '../lib/orders.mjs';
import { readFileSync } from 'node:fs';

const seedSettings = JSON.parse(readFileSync(new URL('../data/seed/settings.sample.json', import.meta.url)));
const sampleProducts = JSON.parse(readFileSync(new URL('../data/seed/products.sample.json', import.meta.url))).products.map(validateProduct);

test('totals: no tax configured → no tax line, total = items + packing + delivery', () => {
  const t = computeTotals({ itemsMinor: 19900, packingMinor: 1000, deliveryMinor: 2500, tax: seedSettings.tax });
  assert.equal(t.tax, 0);
  assert.equal(t.taxApplied, false);
  assert.equal(t.total, 23400);
});

test('totals: exclusive tax adds tax only on taxable parts', () => {
  const tax = { enabled: true, name: 'VAT', rate: 5, pricesIncludeTax: false, appliesToDelivery: true, appliesToPacking: false };
  const t = computeTotals({ itemsMinor: 20000, packingMinor: 1000, deliveryMinor: 2000, tax });
  assert.equal(t.taxable, 22000);
  assert.equal(t.tax, 1100);
  assert.equal(t.total, 24100);
});

test('totals: inclusive tax is reported but not added', () => {
  const tax = { enabled: true, name: 'VAT', rate: 5, pricesIncludeTax: true, appliesToDelivery: false, appliesToPacking: false };
  const t = computeTotals({ itemsMinor: 21000, packingMinor: 0, deliveryMinor: 2500, tax });
  assert.equal(t.tax, 1000);
  assert.equal(t.taxIncluded, true);
  assert.equal(t.total, 23500);
});

test('tax cannot be enabled without a name and rate', () => {
  assert.throws(() => applySection(seedSettings, 'tax', { enabled: true }), (e) => e instanceof ValidationError && Boolean(e.fields.rate && e.fields.name));
});

test('delivery zones: an area cannot be in two enabled zones; regions/zone lookup', () => {
  const zone = (id, areas) => ({ id, name: id, country: 'United Arab Emirates', areas, fee: 10, enabled: true });
  assert.throws(() => applySection(seedSettings, 'delivery', { zones: [zone('a', ['Dubai']), zone('b', ['Dubai'])], couriers: [] }), ValidationError);
  const s = applySection(seedSettings, 'delivery', { zones: [zone('dubai', ['Dubai']), { ...zone('rest', ['Sharjah']), fee: 20 }], couriers: [] });
  assert.deepEqual(deliveryRegions(s), { 'United Arab Emirates': ['Dubai', 'Sharjah'] });
  assert.equal(zoneFor(s, 'United Arab Emirates', 'Sharjah').fee, 20);
  assert.equal(zoneFor(s, 'United Arab Emirates', 'Fujairah'), null);
});

test('courier tracking links must contain {tracking}', () => {
  assert.throws(() => applySection(seedSettings, 'delivery', { zones: [], couriers: [{ id: 'x', name: 'X', trackingUrlTemplate: 'https://x.example/track' }] }), ValidationError);
  const s = applySection(seedSettings, 'delivery', { zones: [], couriers: [{ id: 'x', name: 'X', trackingUrlTemplate: 'https://x.example/t?n={tracking}' }] });
  assert.equal(s.delivery.couriers[0].trackingUrlTemplate, 'https://x.example/t?n={tracking}');
});

test('social links: placeholder/home URLs from the brief are rejected, real profiles accepted', () => {
  const base = { brand: 'YAHIVO', hero: { headline: 'H' } };
  assert.throws(() => applySection(seedSettings, 'store', { ...base, social: { instagram: 'https://www.instagram.com/' } }), ValidationError);
  assert.throws(() => applySection(seedSettings, 'store', { ...base, social: { facebook: 'https://accountscenter.facebook.com/manage' } }), (e) => Boolean(e.fields['social.facebook']));
  assert.throws(() => applySection(seedSettings, 'store', { ...base, social: { tiktok: 'https://evil.example/@yahivo' } }), ValidationError);
  const s = applySection(seedSettings, 'store', { ...base, social: { instagram: 'https://www.instagram.com/yahivo', tiktok: 'https://www.tiktok.com/@yahivo' } });
  assert.equal(s.social.instagram, 'https://www.instagram.com/yahivo');
});

test('customer validation rejects bad email/phone and unknown regions', () => {
  const regions = { 'United Arab Emirates': ['Dubai'] };
  assert.throws(() => validateCustomer({ name: 'A', email: 'bad', phone: '12', address1: 'x', city: 'y', country: 'United Arab Emirates', region: 'Mars' }, { regions }),
    (e) => Boolean(e.fields.email && e.fields.phone && e.fields.region));
  const ok = validateCustomer({ name: ' Ali ', email: 'A@X.COM', phone: '+971 50 123 4567', address1: 'Street 1', city: 'Marina', country: 'United Arab Emirates', region: 'Dubai' }, { regions });
  assert.equal(ok.name, 'Ali');
  assert.equal(ok.email, 'a@x.com');
});

test('product validation: price, sizes, stock integers', () => {
  assert.throws(() => validateProduct({ slug: 'Bad Slug', name: '', style: 'x', price: -1, sizes: ['Q'], colors: [] }), ValidationError);
  const p = validateProduct({ slug: 'ok', name: 'Ok', style: 'Pullover', price: '199.5', sizes: ['s', 'm'], colors: [{ name: 'Black', hex: '#000000', stock: { S: 1, M: '2' } }] });
  assert.equal(p.price, 199.5);
  assert.deepEqual(p.colors[0].stock, { S: 1, M: 2 });
});

test('catalog filters by size, colour, style, price and stock', () => {
  const q = (s) => filterProducts(sampleProducts, parseQuery(new URLSearchParams(s))).map((p) => p.slug);
  assert.ok(q('color=black').every((s) => ['sample-core-pullover', 'sample-zip-up-hoodie'].includes(s)));
  assert.deepEqual(q('style=cropped'), ['sample-cropped-hoodie']);
  assert.ok(!q('inStock=1').includes('sample-essential-zip'));
  assert.ok(q('max=180').every((s) => ['sample-cropped-hoodie', 'sample-essential-zip'].includes(s)));
  assert.deepEqual(q('sort=price-asc').slice(0, 1), ['sample-essential-zip']);
  assert.ok(q('size=XS').includes('sample-cropped-hoodie') && q('size=XS').length === 1);
});

test('order status flow only moves forward; delivered/cancelled are final', () => {
  assert.deepEqual(nextStatuses('packed'), ['handed_to_courier', 'delivered', 'cancelled']);
  assert.deepEqual(nextStatuses('delivered'), []);
  assert.deepEqual(nextStatuses('cancelled'), []);
});

test('stripe webhook signature verification', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'checkout.session.completed' });
  const t = 1_800_000_000;
  const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  assert.ok(verifyWebhook(body, `t=${t},v1=${sig}`, secret, t));
  assert.equal(verifyWebhook(body, `t=${t},v1=${sig}`, 'wrong', t), null);
  assert.equal(verifyWebhook(body, `t=${t},v1=${sig}`, secret, t + 1000), null, 'stale timestamp rejected');
  assert.equal(verifyWebhook(`${body} `, `t=${t},v1=${sig}`, secret, t), null, 'tampered body rejected');
});

test('stripe session line items mirror the order total (exclusive tax)', () => {
  const order = { id: 1, number: 'YH-1001', token: 'tok_abcdefghij', email: 'a@b.co', currency: 'AED',
    lines: [{ name: 'Hoodie', color: 'Black', size: 'M', unitPrice: 199, qty: 2 }],
    packing: { name: 'Gift' }, delivery: { zoneName: 'Dubai' },
    totals: { items: 398, packing: 10, delivery: 25, tax: 21.65, taxIncluded: false, taxApplied: true, taxLabel: 'VAT (5%)', total: 454.65 } };
  const p = sessionParams(order, 'https://shop.example');
  const sum = Object.values(p.line_items).reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
  assert.equal(sum, 45465);
  assert.equal(p.line_items[0].price_data.currency, 'aed');
});

test('assistant demo: grounded answers, no invented info, contact fallback', () => {
  const ctx = { settings: seedSettings, products: sampleProducts };
  assert.match(demoReply('how much is delivery?', ctx).reply, /haven’t been published/);
  assert.match(demoReply('where is my order?', ctx).reply, /order number .*email you used at checkout/);
  assert.match(demoReply('where is my order?', ctx, { status: 'not_found', number: 'YH-1001' }).reply, /couldn’t find order YH-1001/);
  assert.match(demoReply('where is my order?', ctx, { status: 'limited', number: 'YH-1001' }).reply, /Too many order checks/);
  assert.match(demoReply('what is your return policy', ctx).reply, /hasn’t been published/);
  assert.match(demoReply('what is the meaning of life', ctx).reply, /not confident/);
  const rec = demoReply('black hoodie size M under 220 aed', ctx);
  assert.ok(rec.products.length > 0);
  for (const p of rec.products) {
    assert.ok(p.price <= 220);
    assert.ok(p.colors.some((c) => c.name === 'Black' && c.stock.M > 0));
  }
  assert.deepEqual(parsePrefs('Olive oversized in size L below 300', sampleProducts), { colors: ['Olive'], styles: ['Oversized'], size: 'L', budget: 300 });
});

test('assistant history validation', () => {
  assert.equal(validateHistory([]), null);
  assert.equal(validateHistory([{ role: 'assistant', content: 'hi' }]), null);
  assert.equal(validateHistory([{ role: 'user', content: 'x'.repeat(1001) }]), null);
  assert.equal(validateHistory([{ role: 'user', content: 'hi' }]).length, 1);
});

test('launch checklist flags everything missing in the seed', () => {
  const list = launchChecklist(seedSettings, sampleProducts, { stripe: false, aiLive: false, adminPasswordSet: true });
  const todo = list.filter((i) => !i.ok).map((i) => i.label).join('|');
  for (const word of ['Real products', 'Delivery zones', 'Packing', 'Tax settings', 'Payment provider', 'Facebook', 'Instagram', 'TikTok', 'contact']) {
    assert.match(todo, new RegExp(word, 'i'), word);
  }
});

test('CSV export neutralises spreadsheet formulas and quotes cells', async () => {
  const { ordersCsv } = await import('../lib/fulfilment.mjs');
  const order = { number: 'YH-1', createdAt: '2026-01-01', status: 'received', paymentStatus: 'paid', email: 'a@b.co', currency: 'AED',
    payment: { label: 'Card' }, customer: { name: '=HYPERLINK("http://x")', phone: '+971 50', address1: 'Line "1"', city: 'Dubai', country: 'UAE' },
    delivery: null, packing: null, lines: [{ qty: 1, name: 'H', color: 'Black', size: 'M' }], fulfilment: {}, totals: { total: 10 } };
  const row = ordersCsv([order]).split('\r\n')[1];
  assert.match(row, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.match(row, /"'\+971 50"/);
  assert.match(row, /"Line ""1"""/);
});

test('assistant reads order number + checkout email from the chat (latest of each)', () => {
  const u = (content) => ({ role: 'user', content });
  assert.equal(orderRefFrom([u('where is my order?')]), null);
  assert.equal(orderRefFrom([u('order yh 1002')]), null, 'number alone is not enough');
  assert.deepEqual(orderRefFrom([u('order YH-1002'), { role: 'assistant', content: 'email?' }, u('it is Me@Example.com')]), { number: 'YH-1002', email: 'Me@Example.com' });
  assert.deepEqual(orderRefFrom([u('yh1001 a@b.co'), u('sorry, YH-1003')]), { number: 'YH-1003', email: 'a@b.co' });
});

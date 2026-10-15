// ChatGPT / Gemini providers (mocked HTTP) and the n8n integration: channel chat endpoint,
// order events to the n8n webhook, and return requests. No real network calls.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
import { Store } from '../lib/db.mjs';
import { configuredProviders, providerChat } from '../lib/ai-providers.mjs';
import { answer } from '../lib/assistant.mjs';
import { liveCommand } from '../lib/admin-ai.mjs';
import { integrationTokenOk, plainReply } from '../lib/integrations.mjs';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const openaiOk = (text) => json(200, { choices: [{ message: { content: text } }] });
const geminiOk = (text) => json(200, { candidates: [{ content: { parts: [{ text }] } }] });
const OPENAI = { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-test' };
const GEMINI = { GEMINI_API_KEY: 'g-test', GEMINI_MODEL: 'gemini-test' };

test('providers: AI_PROVIDER goes first; a provider needs both key and model', () => {
  assert.deepEqual(configuredProviders({ ...OPENAI, ...GEMINI }), ['openai', 'gemini']);
  assert.deepEqual(configuredProviders({ ...OPENAI, ...GEMINI, AI_PROVIDER: 'gemini' }), ['gemini', 'openai']);
  assert.deepEqual(configuredProviders({ OPENAI_API_KEY: 'x', AI_PROVIDER: 'openai' }), []);
});

test('providers: OpenAI and Gemini requests are built server-side with the key in a header', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return url.includes('openai') ? openaiOk('hi from gpt') : geminiOk('hi from gemini'); };
  const history = [{ role: 'user', content: 'hello' }];
  assert.equal(await providerChat('openai', { system: 'SYS', history, env: OPENAI, fetchImpl }), 'hi from gpt');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sk-test');
  assert.deepEqual(calls[0].body.messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hello' }]);
  assert.equal(await providerChat('gemini', { system: 'SYS', history, env: GEMINI, fetchImpl }), 'hi from gemini');
  assert.equal(calls[1].url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(calls[1].init.headers['x-goog-api-key'], 'g-test');
  assert.equal(calls[1].body.systemInstruction.parts[0].text, 'SYS');
  assert.ok(!calls[1].url.includes('g-test'), 'key not in the URL');
});

test('assistant: falls back from ChatGPT to Gemini, then to basic mode if every provider fails', async () => {
  const store = new Store(':memory:', { seed: 'sample' });
  const ctx = { settings: store.getSettings(), products: store.listProducts() };
  const slug = ctx.products[0].slug;
  const env = { ...OPENAI, ...GEMINI };
  const messages = [{ role: 'user', content: 'recommend a hoodie' }];
  const flaky = async (url) => (url.includes('openai') ? json(500, { error: { message: 'down' } }) : geminiOk(`Try [[product:${slug}]] and [[product:not-real]].`));
  const out = await answer(messages, { ...ctx, fetchImpl: flaky }, env);
  assert.equal(out.mode, 'live');
  assert.equal(out.provider, 'gemini');
  assert.equal(out.reply, `Try ${ctx.products[0].name} and .`);
  assert.deepEqual(out.products.map((p) => p.slug), [slug], 'only real products become cards');
  const down = await answer(messages, { ...ctx, fetchImpl: async () => json(503, {}) }, env);
  assert.equal(down.mode, 'demo');
  assert.match(down.notice, /unavailable/);
  store.close();
});

test('admin AI works with ChatGPT structured output', async () => {
  const store = new Store(':memory:', { seed: 'sample' });
  const action = { type: 'stock', number: null, status: null, courierId: null, trackingNumber: null, slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 4 };
  let sent;
  const fetchImpl = async (url, init) => { sent = JSON.parse(init.body); return openaiOk(JSON.stringify({ reply: 'Setting stock.', actions: [action] })); };
  const out = await liveCommand('set core black M to 4', { store, settings: store.getSettings(), fetchImpl }, OPENAI);
  assert.equal(sent.response_format.type, 'json_schema');
  assert.equal(out.provider, 'openai');
  assert.deepEqual(out.actions, [{ type: 'stock', slug: 'sample-core-pullover', color: 'Black', size: 'M', qty: 4 }]);
  assert.equal(await liveCommand('x', { store, settings: store.getSettings(), fetchImpl: async () => openaiOk('not json') }, OPENAI), null, 'bad output falls back to the basic parser');
  store.close();
});

test('integration token: disabled unless long, then checked exactly', () => {
  assert.equal(integrationTokenOk({}, 'Bearer x'), null);
  assert.equal(integrationTokenOk({ N8N_API_TOKEN: 'short' }, 'Bearer short'), null);
  const env = { N8N_API_TOKEN: 'a'.repeat(32) };
  assert.equal(integrationTokenOk(env, `Bearer ${'a'.repeat(32)}`), true);
  assert.equal(integrationTokenOk(env, `Bearer ${'a'.repeat(31)}b`), false);
  assert.equal(integrationTokenOk(env, undefined), false);
  assert.equal(plainReply({ reply: 'Hi', links: [{ href: '/track', label: 'Track' }] }, 'https://shop.example', 'AED'), 'Hi\nTrack: https://shop.example/track');
});

// ---------- n8n end to end (own app instance)

const TOKEN = 'n8n-test-token-0123456789abcdef';
const HOOK = 'https://n8n.example.test/webhook/yahivo-orders';
const ADMIN_PASSWORD = 'integrations-password';
const events = [];
let base; let app; let cookie = '';

async function call(path, { method = 'GET', body, admin = false, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(admin ? { 'X-YH-Admin': '1', Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const customer = { name: 'WA Buyer', email: 'wa@example.com', phone: '+971 50 000 0002', country: 'United Arab Emirates', region: 'Dubai', city: 'Marina', address1: 'Tower 6' };
const items = [{ slug: 'sample-core-pullover', color: 'Black', size: 'L', qty: 1 }];
async function placeOrder() {
  const q = (await call('/api/quote', { method: 'POST', body: { items, country: 'United Arab Emirates', region: 'Dubai' } })).json;
  return (await call('/api/orders', { method: 'POST', body: { items, customer, paymentMethod: 'manual', expectedTotal: q.totals.total } })).json;
}
const say = async (channel, userId, text) => (await call('/api/integrations/chat', { method: 'POST', token: TOKEN, body: { channel, userId, text } }));
const eventsFor = async (type) => { await app.notifier.flush(); return events.filter((e) => e.body.event === type); };

before(async () => {
  const fetchImpl = async (url, init) => {
    if (url === HOOK) { events.push({ headers: init.headers, body: JSON.parse(init.body) }); return json(200, { ok: true }); }
    throw new Error(`unexpected outbound call ${url}`);
  };
  app = createApp({ store: new Store(':memory:', { seed: 'sample' }), env: { ADMIN_PASSWORD, N8N_API_TOKEN: TOKEN, N8N_WEBHOOK_URL: HOOK, N8N_WEBHOOK_SECRET: 'hook-secret', SITE_URL: 'https://shop.example' }, fetchImpl });
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.server.address().port}`;
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-YH-Admin': '1' }, body: JSON.stringify({ password: ADMIN_PASSWORD }) });
  cookie = login.headers.get('set-cookie').split(';')[0];
  await call('/api/admin/settings/delivery', { method: 'PUT', admin: true, body: { zones: [{ id: 'dubai', name: 'Dubai', country: 'United Arab Emirates', areas: ['Dubai'], fee: 15, enabled: true }], couriers: [{ id: 'imile', name: 'iMile', trackingUrlTemplate: 'https://parcelsapp.com/en/tracking/{tracking}' }] } });
  await call('/api/admin/settings/payments', { method: 'PUT', admin: true, body: { manualOrderRequests: true } });
});
after(() => app.server.close());

test('n8n chat endpoint: bearer token required, input validated', async () => {
  assert.equal((await call('/api/integrations/chat', { method: 'POST', body: { channel: 'whatsapp', userId: '1', text: 'hi' } })).status, 401);
  assert.equal((await call('/api/integrations/chat', { method: 'POST', token: 'wrong-token-wrong-token-wrong', body: { channel: 'whatsapp', userId: '1', text: 'hi' } })).status, 401);
  assert.equal((await say('sms', '1', 'hi')).status, 400);
  const ok = await say('whatsapp', '971500000009', 'what payment methods do you accept?');
  assert.equal(ok.status, 200);
  assert.match(ok.json.reply, /cash on delivery/i);
});

test('n8n: order events, tracking and cancelling over WhatsApp with conversation memory', async () => {
  const order = await placeOrder();
  const [created] = await eventsFor('order.created');
  assert.equal(created.headers['X-YAHIVO-Token'], 'hook-secret');
  assert.equal(created.body.order.number, order.number);
  assert.equal(created.body.order.customer.phone, customer.phone);
  assert.equal(created.body.order.orderUrl, `https://shop.example/order/${order.token}`);

  const status = await say('whatsapp', '971500000002', `where is my order ${order.number}? email wa@example.com`);
  assert.match(status.json.reply, /Received/);
  const cancelled = await say('whatsapp', '971500000002', `CANCEL ${order.number}`);
  assert.match(cancelled.json.reply, new RegExp(`Order ${order.number} is cancelled`), 'remembers the email from the previous message');
  assert.equal((await call(`/api/orders/${order.token}`)).json.order.status, 'cancelled');
  const [changed] = await eventsFor('order.status_changed');
  assert.equal(changed.body.order.status, 'cancelled');

  const stranger = await say('messenger', 'someone-else', `CANCEL ${order.number}`);
  assert.doesNotMatch(stranger.json.reply, /is cancelled/, 'another customer has no verified order in their conversation');
});

test('n8n: return request over Instagram for a delivered order, visible to admin', async () => {
  const order = await placeOrder();
  const { json: { orders } } = await call(`/api/admin/orders?q=${order.number}`, { admin: true });
  const id = orders[0].id;
  for (const patch of [{ status: 'packed' }, { courierId: 'imile', trackingNumber: '6031225370927', status: 'handed_to_courier' }]) {
    assert.equal((await call(`/api/admin/orders/${id}`, { method: 'PATCH', admin: true, body: patch })).status, 200);
  }
  const shipped = (await eventsFor('order.status_changed')).at(-1);
  assert.equal(shipped.body.order.trackingUrl, 'https://parcelsapp.com/en/tracking/6031225370927');

  const early = await say('instagram', 'ig-1', `I want to return ${order.number}, wa@example.com`);
  assert.match(early.json.reply, /once an order is delivered/);
  await call(`/api/admin/orders/${id}`, { method: 'PATCH', admin: true, body: { status: 'delivered' } });

  const offer = await say('instagram', 'ig-1', 'can I return it?');
  assert.match(offer.json.reply, new RegExp(`RETURN ${order.number}`));
  assert.match(offer.json.reply, /https:\/\/shop\.example\/shipping-returns/);
  const done = await say('instagram', 'ig-1', `RETURN ${order.number} too small`);
  assert.match(done.json.reply, /return request .* is recorded/i);
  const again = await say('instagram', 'ig-1', `RETURN ${order.number} too small`);
  assert.match(again.json.reply, /already recorded/);

  const [ret] = await eventsFor('order.return_requested');
  assert.equal(ret.body.order.returnRequest.reason, 'too small');
  assert.equal((await call(`/api/orders/${order.token}`)).json.order.returnRequest.status, 'requested');
  const admin = (await call(`/api/admin/orders/${id}`, { admin: true })).json;
  assert.equal(admin.order.returnRequest.channel, 'instagram');
  assert.ok(admin.events.some((e) => e.type === 'return'));
  assert.match((await call('/api/admin/summary', { admin: true })).json.text, /Return requests to arrange \(1\)/);
});

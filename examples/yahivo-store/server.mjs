// YAHIVO storefront + admin server. Zero npm dependencies (Node >= 22.13).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Store, usableDir } from './lib/db.mjs';
import { AdminAuth, RateLimiter } from './lib/auth.mjs';
import { facets, filterProducts, parseQuery, publicProduct } from './lib/catalog.mjs';
import { CheckoutConflict, paymentMethods, placeOrder, quote } from './lib/checkout.mjs';
import { findForTracking, publicOrder, releaseStock, requestReturn, updateOrder, ORDER_STATUSES, STATUS_LABELS } from './lib/orders.mjs';
import { applySection, launchChecklist, publicSettings, SECTIONS } from './lib/settings.mjs';
import { answer, assistantMode, liveProviders } from './lib/assistant.mjs';
import { PROVIDER_LABELS } from './lib/ai-providers.mjs';
import { Conversations, createNotifier, integrationTokenOk, parseChatRequest, plainReply } from './lib/integrations.mjs';
import { createCheckoutSession, stripeConfigured, verifyWebhook } from './lib/stripe.mjs';
import { createNgeniusOrder, ngeniusConfigured, ngeniusStatus } from './lib/ngenius.mjs';
import { createZiinaPayment, ziinaConfigured, ziinaLive, ziinaStatus } from './lib/ziina.mjs';

// Hosted-payment-page providers confirmed server-side via a status lookup.
const HOSTED = {
  ziina: { name: 'Ziina', configured: ziinaConfigured, create: createZiinaPayment, status: ziinaStatus },
  ngenius: { name: 'Network International', configured: ngeniusConfigured, create: createNgeniusOrder, status: ngeniusStatus },
};
import { routeMeta, robots, sitemap } from './lib/seo.mjs';
import { clientIp, HttpError, readBody, readJson, securityHeaders, sendJson, serveStatic } from './lib/http.mjs';
import { validateProduct, ValidationError } from './lib/validate.mjs';
import { anonymiseOrder, ordersCsv } from './lib/fulfilment.mjs';
import { catalogueProducts, importCatalogue } from './lib/catalogue-import.mjs';
import { applyAction, checkAction, dailySummary, liveCommand, parseCommand, summaryText } from './lib/admin-ai.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
// Admin photo uploads; point YAHIVO_UPLOADS at a persistent disk in production.
// Falls back to a temporary folder (with a warning) if that path can't be written.
const uploadsDir = usableDir(path.resolve(process.env.YAHIVO_UPLOADS || path.join(PUBLIC, 'uploads')), 'uploads');
const UPLOADS = uploadsDir.dir;

export function createApp({ store = new Store(), env = process.env, fetchImpl = fetch } = {}) {
  const auth = new AdminAuth(store, env.ADMIN_PASSWORD);
  const limiter = new RateLimiter();
  const port = Number(env.PORT) || 4173;
  const siteUrl = (env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const secure = siteUrl.startsWith('https://');
  const shell = readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const adminShell = readFileSync(path.join(PUBLIC, 'admin.html'), 'utf8');
  // n8n: order events out (N8N_WEBHOOK_URL) and channel chat in (N8N_API_TOKEN).
  const notifier = createNotifier({ env, fetchImpl, siteUrl, statusLabels: STATUS_LABELS });
  const conversations = new Conversations();
  const notifyStatus = (before, after) => { if (after && before?.status !== after.status) notifier.send('order.status_changed', after); };

  // Order tools for the AI assistant (website chat and n8n channels). Every action re-verifies number + checkout email.
  const orderTools = (trackKey, channel) => ({
    lookupOrder: (number, email) => {
      if (!limiter.allow(trackKey, 10, 10 * 60_000)) return { status: 'limited' };
      const order = findForTracking(store, number, email);
      return order ? { status: 'found', order: publicOrder(store, order) } : { status: 'not_found' };
    },
    // Customer cancellation: only while "Received" and unpaid; stock is released by updateOrder.
    cancelOrder: (number, email) => {
      const order = findForTracking(store, number, email);
      if (!order || order.status !== 'received' || order.paymentStatus === 'paid') return false;
      notifyStatus(order, updateOrder(store, store.getSettings(), order.id, { status: 'cancelled', note: `Cancelled by the customer through the AI assistant (${channel}).` }, 'ai-assistant'));
      return true;
    },
    // Return request: only for delivered orders, once; the team arranges it.
    requestReturn: (number, email, reason) => {
      const order = findForTracking(store, number, email);
      if (!requestReturn(store, order, reason, channel)) return false;
      notifier.send('order.return_requested', store.getOrder(order.id));
      return true;
    },
  });
  const aiLabel = async () => (await liveProviders(env)).map((x) => PROVIDER_LABELS[x]).join(' → ');

  const stripe = () => stripeConfigured(env);
  const ctx = () => {
    const settings = store.getSettings();
    return { settings, products: store.listProducts(), methods: paymentMethods(settings, { stripe: stripe(), ngenius: ngeniusConfigured(env), ziina: ziinaConfigured(env) }) };
  };
  const limit = (req, bucket, n, ms) => {
    if (!limiter.allow(`${bucket}:${clientIp(req)}`, n, ms)) throw new HttpError(429, 'Too many requests. Please wait a moment and try again.');
  };
  const requireAdmin = (req) => {
    if (!auth.enabled) throw new HttpError(503, 'Admin is disabled. Set ADMIN_PASSWORD (12+ characters) and restart.');
    if (!auth.isAuthed(req)) throw new HttpError(401, 'Please sign in.');
    if (req.method !== 'GET' && req.headers['x-yh-admin'] !== '1') throw new HttpError(403, 'Missing admin request header.');
  };

  async function api(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    let match;

    // ---------- public
    if (p === '/api/settings' && m === 'GET') {
      const { settings, products, methods } = ctx();
      return sendJson(res, 200, publicSettings(settings, { paymentMethods: methods, aiMode: await assistantMode(env), sampleData: products.some((x) => x.sample) }));
    }
    if (p === '/api/products' && m === 'GET') {
      const products = store.listProducts();
      const list = filterProducts(products, parseQuery(url.searchParams));
      return sendJson(res, 200, { products: list.map(publicProduct), total: list.length, facets: facets(products) });
    }
    if ((match = p.match(/^\/api\/products\/([a-z0-9-]{1,80})$/)) && m === 'GET') {
      const prod = store.getProduct(match[1]);
      if (!prod) throw new HttpError(404, 'Product not found.');
      return sendJson(res, 200, { product: publicProduct(prod) });
    }
    if (p === '/api/quote' && m === 'POST') {
      limit(req, 'quote', 120, 60_000);
      return sendJson(res, 200, quote(await readJson(req), ctx()));
    }
    if (p === '/api/orders' && m === 'POST') {
      limit(req, 'order', 10, 10 * 60_000);
      const c = ctx();
      const placed = placeOrder(await readJson(req), { store, settings: c.settings, methods: c.methods });
      let redirectUrl = null;
      if (placed.method === 'stripe' || HOSTED[placed.method]) {
        const order = store.getOrder(placed.id);
        try {
          if (placed.method === 'stripe') redirectUrl = (await createCheckoutSession(order, { siteUrl, env, fetchImpl })).url;
          else {
            const session = await HOSTED[placed.method].create(order, { siteUrl, env, fetchImpl });
            order.payment = { ...order.payment, providerRef: session.reference };
            store.saveOrder(order);
            redirectUrl = session.url;
          }
        } catch (e) {
          console.error(`[${placed.method}]`, e.message);
          store.transaction(() => { releaseStock(store, order); order.status = 'cancelled'; order.paymentStatus = 'failed'; store.saveOrder(order); store.addEvent(order.id, { type: 'status', status: 'cancelled', note: 'Payment session could not be created.' }); });
          throw new HttpError(502, 'We could not start the secure payment. You have not been charged — please try again.');
        }
      }
      notifier.send('order.created', store.getOrder(placed.id));
      return sendJson(res, 201, { number: placed.number, token: placed.token, redirectUrl });
    }
    if ((match = p.match(/^\/api\/orders\/([A-Za-z0-9_-]{10,64})$/)) && m === 'GET') {
      limit(req, 'order-view', 60, 60_000);
      const order = store.getOrderByToken(match[1]);
      if (!order) throw new HttpError(404, 'Order not found.');
      return sendJson(res, 200, { order: publicOrder(store, order) });
    }
    // Re-check payment with the provider (customer return page or admin). Never trusts the redirect.
    if ((match = p.match(/^\/api\/orders\/([A-Za-z0-9_-]{10,64})\/verify-payment$/)) && m === 'POST') {
      limit(req, 'verify', 20, 60_000);
      const order = store.getOrderByToken(match[1]);
      if (!order) throw new HttpError(404, 'Order not found.');
      const provider = HOSTED[order.payment.method];
      if (provider?.configured(env) && order.paymentStatus === 'awaiting_payment') {
        let result;
        try {
          result = await provider.status(order, { env, fetchImpl });
        } catch (e) {
          console.error(`[${order.payment.method}]`, e.message);
          throw new HttpError(502, 'We could not confirm your payment right now. Please refresh in a minute.');
        }
        const actor = order.payment.method;
        if (result.status === 'paid') {
          order.paymentStatus = 'paid';
          store.saveOrder(order);
          store.addEvent(order.id, { type: 'payment', note: `Payment confirmed by ${provider.name} (${result.states.join(', ')}).`, actor });
        } else if (result.status === 'failed') {
          order.paymentStatus = 'failed';
          store.saveOrder(order);
          store.addEvent(order.id, { type: 'payment', note: `Payment failed at ${provider.name} (${result.states.join(', ')}). Stock is still reserved — cancel the order to release it.`, actor });
        } else if (result.status === 'mismatch') {
          store.addEvent(order.id, { type: 'payment', note: `${provider.name} reported payment but the amount did not match the order total — check manually.`, actor });
        }
      }
      return sendJson(res, 200, { order: publicOrder(store, store.getOrder(order.id)) });
    }
    if (p === '/api/track' && m === 'POST') {
      limit(req, 'track', 10, 10 * 60_000);
      const b = await readJson(req);
      const order = findForTracking(store, b?.number, b?.email);
      if (!order) throw new HttpError(404, 'No order matches that order number and email.');
      return sendJson(res, 200, { token: order.token });
    }
    if (p === '/api/assistant' && m === 'POST') {
      limit(req, 'assistant', 20, 60_000);
      const b = await readJson(req, 32 * 1024);
      // Order lookups share the Track order rate limit.
      const out = await answer(b?.messages, { ...ctx(), fetchImpl, ...orderTools(`track:${clientIp(req)}`, 'website chat') }, env);
      if (out.error) throw new HttpError(400, out.error);
      return sendJson(res, 200, out);
    }
    // n8n → AI assistant for WhatsApp / Messenger / Instagram. Server-to-server only (bearer token).
    if (p === '/api/integrations/chat' && m === 'POST') {
      const ok = integrationTokenOk(env, req.headers.authorization);
      if (ok === null) throw new HttpError(404, 'Not found.');
      if (!ok) { limit(req, 'integration-auth', 10, 60_000); throw new HttpError(401, 'Invalid token.'); }
      const body = parseChatRequest(await readJson(req, 16 * 1024));
      if (!body) throw new HttpError(400, 'Send { channel: whatsapp|messenger|instagram|other, userId, text }.');
      const key = `${body.channel}:${body.userId}`;
      if (!limiter.allow(`integration:${key}`, 20, 60_000)) throw new HttpError(429, 'Too many messages from this customer. Please wait a moment.');
      conversations.add(key, 'user', body.text);
      const c = ctx();
      const out = await answer(conversations.history(key), { ...c, fetchImpl, ...orderTools(`track:${key}`, body.channel) }, env);
      if (out.error) throw new HttpError(400, out.error);
      const reply = plainReply(out, siteUrl, c.settings.currency);
      conversations.add(key, 'assistant', reply);
      return sendJson(res, 200, { reply, mode: out.mode, provider: out.provider ?? null });
    }
    if (p === '/api/stripe/webhook' && m === 'POST') {
      if (!stripe()) throw new HttpError(404, 'Not found.');
      const raw = await readBody(req, 256 * 1024);
      const event = verifyWebhook(raw, req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
      if (!event) throw new HttpError(400, 'Invalid signature.');
      const session = event.data?.object;
      const order = session?.metadata?.order_id ? store.getOrder(Number(session.metadata.order_id)) : null;
      if (order && event.type === 'checkout.session.completed' && session.payment_status === 'paid' && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        store.saveOrder(order);
        store.addEvent(order.id, { type: 'payment', note: 'Payment received (Stripe).', actor: 'stripe' });
      } else if (order && event.type === 'checkout.session.expired' && order.paymentStatus === 'awaiting_payment' && order.status === 'received') {
        store.transaction(() => { releaseStock(store, order); order.status = 'cancelled'; order.paymentStatus = 'expired'; store.saveOrder(order); store.addEvent(order.id, { type: 'status', status: 'cancelled', note: 'Payment not completed in time.', actor: 'stripe' }); });
      }
      return sendJson(res, 200, { received: true });
    }

    // ---------- admin
    if (p === '/api/admin/login' && m === 'POST') {
      limit(req, 'login', 5, 15 * 60_000);
      if (!auth.enabled) throw new HttpError(503, 'Admin is disabled. Set ADMIN_PASSWORD (12+ characters) and restart.');
      if (req.headers['x-yh-admin'] !== '1') throw new HttpError(403, 'Missing admin request header.');
      const token = auth.login((await readJson(req))?.password);
      if (!token) throw new HttpError(401, 'Incorrect password.');
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(token, { secure }) });
    }
    if (p === '/api/admin/logout' && m === 'POST') {
      auth.logout(req);
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.cookie(null, { secure }) });
    }
    if (p === '/api/admin/session' && m === 'GET') {
      return sendJson(res, 200, { enabled: auth.enabled, authed: auth.isAuthed(req) });
    }
    if (!p.startsWith('/api/admin/')) throw new HttpError(404, 'Not found.');
    requireAdmin(req);

    if (p === '/api/admin/overview' && m === 'GET') {
      const settings = store.getSettings();
      const products = store.listProducts({ includeUnpublished: true });
      const { counts } = store.listOrders({ limit: 1 });
      const aiLive = (await assistantMode(env)) === 'live';
      const n8nChat = integrationTokenOk(env, '') !== null;
      return sendJson(res, 200, {
        checklist: launchChecklist(settings, products, { stripe: stripe() || ngeniusConfigured(env) || ziinaConfigured(env), aiLive, adminPasswordSet: auth.enabled }),
        orderCounts: counts,
        storageWarning: store.temporary || uploadsDir.temporary
          ? `Data is NOT being saved permanently: ${[store.temporary, uploadsDir.wanted].filter(Boolean).join(' and ')} can't be written, so orders, settings and photos are kept in a temporary folder and are lost when the server restarts or redeploys. Attach a persistent disk at that path (Render: Starter plan → Disk) before taking real orders.`
          : null,
        integrations: {
          payments: [ziinaConfigured(env) && `Ziina configured (${ziinaLive(env) ? 'LIVE' : 'TEST mode'}) — run a test payment before launch`, ngeniusConfigured(env) && `Network International N-Genius configured (${env.NGENIUS_API_BASE ? 'custom API base' : 'SANDBOX'}) — run a test payment before launch`, stripe() && 'Stripe configured — run a test payment before launch'].filter(Boolean).join(' · ') || 'No payment provider configured',
          courier: 'Manual workflow — no courier API connected',
          assistant: aiLive ? `Full AI (${await aiLabel()}): customer chat + admin assistant` : 'Basic mode (add ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY for full AI)',
          n8n: [notifier.enabled && 'order events → n8n webhook', n8nChat && 'WhatsApp / Messenger / Instagram chat via n8n'].filter(Boolean).join(' · ') || 'Not connected (see README: n8n)',
        },
      });
    }
    // AI admin assistant: proposes actions; /apply runs only what the owner confirmed, re-validated.
    if (p === '/api/admin/summary' && m === 'GET') {
      const summary = dailySummary(store);
      return sendJson(res, 200, { summary, text: summaryText(summary) });
    }
    if (p === '/api/admin/ai' && m === 'POST') {
      limit(req, 'admin-ai', 30, 60_000);
      const message = String((await readJson(req))?.message ?? '').slice(0, 1000);
      const c = { store, settings: store.getSettings(), fetchImpl };
      const out = (await liveCommand(message, c, env)) ?? parseCommand(message, c);
      const live = (await assistantMode(env)) === 'live';
      return sendJson(res, 200, { mode: live ? 'live' : 'basic', reply: out.reply, actions: out.actions.map((a) => ({ action: a, ...checkAction(a, c) })) });
    }
    // Reply helper: drafts an answer to a customer's message from any channel (TikTok, Instagram…).
    // Read-only: it can look up an order but never cancels or records anything.
    if (p === '/api/admin/ai/reply' && m === 'POST') {
      limit(req, 'admin-ai', 30, 60_000);
      const b = await readJson(req, 16 * 1024);
      const message = String(b?.message ?? '').trim().slice(0, 1000);
      if (!message) throw new HttpError(400, 'Paste the customer’s message.');
      const extra = [b?.orderNumber, b?.email].map((x) => String(x ?? '').trim().slice(0, 254)).filter(Boolean).join(' ');
      const lookupOrder = (number, email) => {
        const order = findForTracking(store, number, email);
        return order ? { status: 'found', order: publicOrder(store, order) } : { status: 'not_found' };
      };
      const c = ctx();
      const out = await answer([{ role: 'user', content: extra ? `${message}\n(${extra})` : message }], { ...c, fetchImpl, lookupOrder }, env);
      if (out.error) throw new HttpError(400, out.error);
      return sendJson(res, 200, { reply: plainReply(out, siteUrl, c.settings.currency), mode: out.mode, provider: out.provider ?? null, notice: out.notice ?? null });
    }
    if (p === '/api/admin/ai/apply' && m === 'POST') {
      const actions = (await readJson(req))?.actions;
      if (!Array.isArray(actions) || !actions.length || actions.length > 20) throw new HttpError(400, 'Nothing to apply.');
      const c = { store, settings: store.getSettings() };
      const results = actions.map((a) => {
        const chk = checkAction(a, c);
        if (!chk.ok) return { description: chk.description, ok: false, error: chk.error };
        try {
          const before = a.number ? store.getOrderByNumber(String(a.number).toUpperCase()) : null;
          applyAction(a, c);
          if (before) notifyStatus(before, store.getOrder(before.id));
          return { description: chk.description, ok: true };
        } catch (e) {
          return { description: chk.description, ok: false, error: e instanceof ValidationError ? Object.values(e.fields).join(' ') : 'Could not apply.' };
        }
      });
      return sendJson(res, 200, { results });
    }
    if ((match = p.match(/^\/api\/admin\/settings\/(policies|tax)\/recommended$/)) && m === 'POST') {
      const recommended = JSON.parse(readFileSync(path.join(here, 'data', 'seed', 'settings.json'), 'utf8'))[match[1]];
      const next = applySection(store.getSettings(), match[1], recommended);
      store.saveSettings(next);
      return sendJson(res, 200, { settings: next });
    }
    if (p === '/api/admin/settings' && m === 'GET') return sendJson(res, 200, { settings: store.getSettings(), sections: SECTIONS });
    if ((match = p.match(/^\/api\/admin\/settings\/([a-zA-Z]+)$/)) && m === 'PUT') {
      const next = applySection(store.getSettings(), match[1], await readJson(req));
      store.saveSettings(next);
      return sendJson(res, 200, { settings: next });
    }
    if (p === '/api/admin/catalogue' && m === 'GET') {
      const list = catalogueProducts();
      return sendJson(res, 200, { total: list.length, published: list.filter((x) => x.published).length });
    }
    if (p === '/api/admin/catalogue/import' && m === 'POST') return sendJson(res, 200, importCatalogue(store));
    if (p === '/api/admin/products' && m === 'GET') {
      return sendJson(res, 200, { products: store.listProducts({ includeUnpublished: true }) });
    }
    if ((match = p.match(/^\/api\/admin\/products\/([a-z0-9-]{1,80}|_new)$/))) {
      const original = match[1];
      if (m === 'PUT') {
        const product = validateProduct(await readJson(req));
        if (original === '_new' && store.getProduct(product.slug, { includeUnpublished: true })) throw new ValidationError({ slug: 'A product with this URL slug already exists.' });
        try {
          store.upsertProduct(product, original === '_new' ? product.slug : original);
        } catch (e) {
          if (e.code === 'slug_taken') throw new ValidationError({ slug: 'A product with this URL slug already exists.' });
          throw e;
        }
        return sendJson(res, 200, { product });
      }
      if (m === 'DELETE') {
        if (!store.deleteProduct(original)) throw new HttpError(404, 'Product not found.');
        return sendJson(res, 200, { ok: true });
      }
    }
    const orderFilter = () => ({
      status: ORDER_STATUSES.includes(url.searchParams.get('status')) ? url.searchParams.get('status') : null,
      q: (url.searchParams.get('q') || '').slice(0, 60).replace(/[%_]/g, ''),
    });
    if (p === '/api/admin/orders' && m === 'GET') return sendJson(res, 200, store.listOrders(orderFilter()));
    if (p === '/api/admin/orders.csv' && m === 'GET') {
      const { orders } = store.listOrders({ ...orderFilter(), limit: 10000 });
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="yahivo-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      });
      return res.end(ordersCsv(orders));
    }
    if ((match = p.match(/^\/api\/admin\/orders\/(\d{1,9})\/anonymise$/)) && m === 'POST') {
      let order;
      try {
        order = anonymiseOrder(store, Number(match[1]));
      } catch (e) {
        if (e.code === 'not_final') throw new HttpError(409, e.message);
        throw e;
      }
      if (!order) throw new HttpError(404, 'Order not found.');
      return sendJson(res, 200, { order, events: store.events(order.id) });
    }
    if ((match = p.match(/^\/api\/admin\/orders\/(\d{1,9})$/))) {
      const id = Number(match[1]);
      if (m === 'GET') {
        const order = store.getOrder(id);
        if (!order) throw new HttpError(404, 'Order not found.');
        return sendJson(res, 200, { order, events: store.events(id) });
      }
      if (m === 'PATCH') {
        const before = store.getOrder(id);
        const order = updateOrder(store, store.getSettings(), id, await readJson(req));
        if (!order) throw new HttpError(404, 'Order not found.');
        notifyStatus(before, order);
        return sendJson(res, 200, { order, events: store.events(id) });
      }
    }
    if (p === '/api/admin/uploads' && m === 'POST') {
      const b = await readJson(req, 8 * 1024 * 1024);
      return sendJson(res, 201, { src: saveUpload(b?.dataBase64) });
    }
    throw new HttpError(404, 'Not found.');
  }

  function page(req, res, url) {
    const p = url.pathname;
    if (p === '/robots.txt') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(robots(siteUrl)); }
    if (p === '/sitemap.xml') { res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' }); return res.end(sitemap(siteUrl, store.listProducts())); }
    if (p === '/admin' || p.startsWith('/admin/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return res.end(adminShell);
    }
    if (p.startsWith('/uploads/') && serveStatic(req, res, UPLOADS, p.slice('/uploads'.length), { immutable: true })) return undefined;
    if (p !== '/' && !p.endsWith('.html') && serveStatic(req, res, PUBLIC, p)) return undefined;
    if (/\.[a-z0-9]{2,5}$/i.test(p)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const settings = store.getSettings();
    const { status, head } = routeMeta(p, { settings, siteUrl, getProduct: (s) => store.getProduct(s) });
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(shell.replace('<!--HEAD-->', head));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    securityHeaders(res, { analytics: Boolean(store.getSettings().analytics?.ga4MeasurementId) });
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') page(req, res, url);
      else throw new HttpError(405, 'Method not allowed.');
    } catch (e) {
      if (res.headersSent) return res.end();
      if (e instanceof ValidationError) return sendJson(res, 422, { error: 'Please check the highlighted fields.', fields: e.fields });
      if (e instanceof CheckoutConflict) return sendJson(res, 409, { error: e.message, quote: e.quote });
      if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message, ...e.extra });
      console.error('[server]', e);
      return sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    }
    return undefined;
  });
  return { server, store, port, siteUrl, notifier };
}

/** Accept JPEG / PNG / WebP up to 5 MB, verified by magic bytes; random filename. */
export function saveUpload(dataBase64) {
  if (typeof dataBase64 !== 'string') throw new ValidationError({ file: 'Choose an image to upload.' });
  const buf = Buffer.from(dataBase64.replace(/^data:[^,]+,/, ''), 'base64');
  if (!buf.length || buf.length > 5 * 1024 * 1024) throw new ValidationError({ file: 'Images must be under 5 MB.' });
  const ext = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff ? 'jpg'
    : buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'png'
      : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
  if (!ext) throw new ValidationError({ file: 'Only JPEG, PNG or WebP images are allowed.' });
  mkdirSync(UPLOADS, { recursive: true });
  const name = `${randomBytes(12).toString('hex')}.${ext}`;
  writeFileSync(path.join(UPLOADS, name), buf, { flag: 'wx' });
  return `/uploads/${name}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server, port, siteUrl } = createApp();
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`YAHIVO store running at ${siteUrl}`);
    console.log(process.env.ADMIN_PASSWORD?.length >= 12 ? `Admin: ${siteUrl}/admin` : 'Admin disabled: set ADMIN_PASSWORD (12+ chars) to enable /admin');
  });
}

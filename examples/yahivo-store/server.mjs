// YAHIVO storefront + admin server. Zero npm dependencies (Node >= 22.13).
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Store } from './lib/db.mjs';
import { AdminAuth, RateLimiter } from './lib/auth.mjs';
import { facets, filterProducts, parseQuery, publicProduct } from './lib/catalog.mjs';
import { CheckoutConflict, paymentMethods, placeOrder, quote } from './lib/checkout.mjs';
import { findForTracking, publicOrder, releaseStock, updateOrder, ORDER_STATUSES } from './lib/orders.mjs';
import { applySection, launchChecklist, publicSettings, SECTIONS } from './lib/settings.mjs';
import { answer, assistantMode } from './lib/assistant.mjs';
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

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
// Admin photo uploads; point YAHIVO_UPLOADS at a persistent disk in production.
const UPLOADS = path.resolve(process.env.YAHIVO_UPLOADS || path.join(PUBLIC, 'uploads'));

export function createApp({ store = new Store(), env = process.env, fetchImpl = fetch } = {}) {
  const auth = new AdminAuth(store, env.ADMIN_PASSWORD);
  const limiter = new RateLimiter();
  const port = Number(env.PORT) || 4173;
  const siteUrl = (env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, '');
  const secure = siteUrl.startsWith('https://');
  const shell = readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const adminShell = readFileSync(path.join(PUBLIC, 'admin.html'), 'utf8');

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
      const out = await answer(b?.messages, ctx(), env);
      if (out.error) throw new HttpError(400, out.error);
      return sendJson(res, 200, out);
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
      return sendJson(res, 200, {
        checklist: launchChecklist(settings, products, { stripe: stripe() || ngeniusConfigured(env) || ziinaConfigured(env), aiLive, adminPasswordSet: auth.enabled }),
        orderCounts: counts,
        integrations: {
          payments: [ziinaConfigured(env) && `Ziina configured (${ziinaLive(env) ? 'LIVE' : 'TEST mode'}) — run a test payment before launch`, ngeniusConfigured(env) && `Network International N-Genius configured (${env.NGENIUS_API_BASE ? 'custom API base' : 'SANDBOX'}) — run a test payment before launch`, stripe() && 'Stripe configured — run a test payment before launch'].filter(Boolean).join(' · ') || 'No payment provider configured',
          courier: 'Manual workflow — no courier API connected',
          assistant: aiLive ? 'Live (Claude)' : 'Demo mode',
        },
      });
    }
    if (p === '/api/admin/settings' && m === 'GET') return sendJson(res, 200, { settings: store.getSettings(), sections: SECTIONS });
    if ((match = p.match(/^\/api\/admin\/settings\/([a-zA-Z]+)$/)) && m === 'PUT') {
      const next = applySection(store.getSettings(), match[1], await readJson(req));
      store.saveSettings(next);
      return sendJson(res, 200, { settings: next });
    }
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
        const order = updateOrder(store, store.getSettings(), id, await readJson(req));
        if (!order) throw new HttpError(404, 'Order not found.');
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
  return { server, store, port, siteUrl };
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

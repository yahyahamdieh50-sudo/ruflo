// Analytics + ads pixels. Events always go to window.dataLayer; each tracker loads only when
// its ID is set in Admin → Analytics: Google Analytics 4, Meta Pixel, TikTok Pixel.
window.dataLayer = window.dataLayer || [];

let ready = false;
export function initAnalytics(settings) {
  if (ready) return;
  ready = true;
  const a = settings?.analytics ?? {};
  if (a.ga4MeasurementId && /^G-[A-Z0-9]{4,15}$/.test(a.ga4MeasurementId)) loadGa4(a.ga4MeasurementId);
  if (a.metaPixelId && /^\d{10,20}$/.test(a.metaPixelId)) loadMeta(a.metaPixelId);
  if (a.tiktokPixelId && /^[A-Z0-9]{15,30}$/i.test(a.tiktokPixelId)) loadTiktok(a.tiktokPixelId);
  pageView();
}

function addScript(src) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.append(s);
}

function loadGa4(id) {
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
  addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

// Same queue stub as Meta's base code, without the inline script.
function loadMeta(id) {
  if (window.fbq) return;
  const fbq = window.fbq = function fbq() { fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments); };
  if (!window._fbq) window._fbq = fbq;
  fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
  addScript('https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', id);
}

// Same queue stub as TikTok's base code, without the inline script.
function loadTiktok(id) {
  if (window.ttq) return;
  const ttq = window.ttq = [];
  ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];
  ttq.setAndDefer = (t, e) => { t[e] = function () { t.push([e, ...arguments]); }; };
  for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
  ttq.instance = (t) => { const e = ttq._i[t] || []; for (const m of ttq.methods) ttq.setAndDefer(e, m); return e; };
  ttq.load = (sdkid, opts) => {
    const u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i || {}; ttq._i[sdkid] = []; ttq._i[sdkid]._u = u;
    ttq._t = ttq._t || {}; ttq._t[sdkid] = +new Date();
    ttq._o = ttq._o || {}; ttq._o[sdkid] = opts || {};
    addScript(`${u}?sdkid=${encodeURIComponent(sdkid)}&lib=ttq`);
  };
  ttq.load(id);
}

/** Called after every storefront route change (single-page app), so ads count each page. */
let lastPage = null;
export function pageView() {
  const page = location.pathname + location.search;
  if (!ready || page === lastPage) return; // initAnalytics and the first render may both report the same page
  lastPage = page;
  window.fbq?.('track', 'PageView');
  window.ttq?.page();
}

// Store events (GA4 names) → Meta and TikTok standard events.
const META = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase', search: 'Search' };
const TIKTOK = { view_item: 'ViewContent', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'CompletePayment', search: 'Search' };

function adsParams(event, p) {
  const items = p.items ?? [];
  const out = { currency: p.currency, value: Number(p.value) || 0 };
  if (items.length) {
    out.content_type = 'product';
    out.content_ids = items.map((i) => i.item_id);
    out.contents = items.map((i) => ({ id: i.item_id, content_id: i.item_id, content_name: i.item_name, quantity: i.quantity ?? 1 }));
  }
  if (p.search_term) { out.search_string = p.search_term; out.query = p.search_term; }
  if (event === 'purchase' && p.transaction_id) out.order_id = p.transaction_id;
  return out;
}

/** track('add_to_cart', { items, value, currency }) — GA4-style event names. */
export function track(event, params = {}) {
  if (window.gtag) window.gtag('event', event, params);
  else window.dataLayer.push({ event, ...params });
  const ads = (window.fbq || window.ttq) && adsParams(event, params);
  if (window.fbq && META[event]) {
    // eventID lets Meta de-duplicate a purchase if a server-side event is added later.
    window.fbq('track', META[event], ads, event === 'purchase' && params.transaction_id ? { eventID: params.transaction_id } : undefined);
  }
  if (window.ttq && TIKTOK[event]) window.ttq.track(TIKTOK[event], ads, event === 'purchase' && params.transaction_id ? { event_id: params.transaction_id } : undefined);
}

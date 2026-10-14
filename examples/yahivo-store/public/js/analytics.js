// Analytics placeholder. Events always go to window.dataLayer; Google Analytics 4 is
// loaded only when a Measurement ID is set in Admin → Analytics.
window.dataLayer = window.dataLayer || [];

let ready = false;
export function initAnalytics(settings) {
  const id = settings?.analytics?.ga4MeasurementId;
  if (!id || ready || !/^G-[A-Z0-9]{4,15}$/.test(id)) return;
  ready = true;
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.append(s);
}

/** track('add_to_cart', { item_id, value, currency }) — GA4-style event names. */
export function track(event, params = {}) {
  if (window.gtag) window.gtag('event', event, params);
  else window.dataLayer.push({ event, ...params });
}

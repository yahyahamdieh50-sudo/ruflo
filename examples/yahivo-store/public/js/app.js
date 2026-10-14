// Client router + shell (header, footer, banner, cart badge).
import { cart, getSettings } from './api.js';
import { errorState, esc, loading, setLocale, socialLinks } from './ui.js';
import { initAnalytics } from './analytics.js';
import { initChat } from './chat.js';

const routes = [
  [/^\/$/, () => import('./views/home.js')],
  [/^\/(shop|search)$/, () => import('./views/shop.js')],
  [/^\/product\/([a-z0-9-]{1,80})$/, () => import('./views/product.js')],
  [/^\/cart$/, () => import('./views/cart.js')],
  [/^\/checkout$/, () => import('./views/checkout.js')],
  [/^\/order\/([A-Za-z0-9_-]{10,64})$/, () => import('./views/order.js')],
  [/^\/track$/, () => import('./views/order.js'), 'track'],
  [/^\/(size-guide|faq|shipping-returns|contact|privacy)$/, () => import('./views/pages.js')],
];

const main = document.getElementById('main');
let renderId = 0;
let cleanup = null;

export function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) { location.href = href; return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', url.pathname + url.search + url.hash);
  render();
}

async function render() {
  const id = ++renderId;
  const { pathname } = location;
  cleanup?.();
  cleanup = null;
  document.body.classList.remove('has-sticky-atc');
  closeMenus();
  markNav(pathname);
  main.innerHTML = loading();
  // Scroll before the view renders so a late scroll can't undo the user's own scrolling.
  if (!location.hash) window.scrollTo({ top: 0 });
  let settings;
  try {
    settings = await getSettings();
    setLocale(settings.currency, settings.locale);
  } catch (e) {
    main.innerHTML = errorState(e.message);
    main.querySelector('[data-retry]')?.addEventListener('click', render);
    return;
  }
  const found = routes.find(([re]) => re.test(pathname));
  try {
    const mod = found ? await found[1]() : await import('./views/pages.js');
    if (id !== renderId) return;
    const params = found ? pathname.match(found[0]).slice(1) : [];
    const ctx = { settings, params, query: new URLSearchParams(location.search), pathname, navigate, variant: found?.[2], isCurrent: () => id === renderId };
    const view = found ? mod.default : mod.notFound;
    const viewCleanup = (await view(main, ctx)) ?? null;
    if (id !== renderId) { viewCleanup?.(); return; }
    cleanup = viewCleanup;
  } catch (e) {
    if (id !== renderId) return;
    console.error(e);
    main.innerHTML = errorState(e.message || 'This page failed to load.');
    main.querySelector('[data-retry]')?.addEventListener('click', render);
    return;
  }
  if (id !== renderId) return;
  main.focus({ preventScroll: true });
}

function markNav(pathname) {
  document.querySelectorAll('.main-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === pathname + location.search || (href === '/shop' && pathname === '/shop' && !location.search.includes('new=1'))) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function closeMenus() {
  document.getElementById('mobile-nav').hidden = true;
  document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');
}

function updateCartBadge() {
  const n = cart.count();
  const el = document.getElementById('cart-count');
  el.textContent = n > 99 ? '99+' : String(n);
  el.hidden = n === 0;
  el.closest('a').setAttribute('aria-label', `Cart, ${n} item${n === 1 ? '' : 's'}`);
}

async function initShell() {
  // Intercept same-origin links for client-side navigation.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.origin);
    if (url.origin !== location.origin || url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/')) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    e.preventDefault();
    navigate(url.href);
  });
  window.addEventListener('popstate', render);

  const menuBtn = document.getElementById('menu-btn');
  menuBtn.addEventListener('click', () => {
    const nav = document.getElementById('mobile-nav');
    nav.hidden = !nav.hidden;
    menuBtn.setAttribute('aria-expanded', String(!nav.hidden));
  });
  const searchBar = document.getElementById('search-bar');
  document.getElementById('search-btn').addEventListener('click', () => {
    searchBar.hidden = !searchBar.hidden;
    if (!searchBar.hidden) document.getElementById('search-input').focus();
  });
  searchBar.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('search-input').value.trim();
    searchBar.hidden = true;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { searchBar.hidden = true; closeMenus(); } });

  cart.subscribe(updateCartBadge);
  updateCartBadge();

  try {
    const s = await getSettings();
    setLocale(s.currency, s.locale);
    if (s.logo) document.getElementById('logo-slot').innerHTML = `<img src="${esc(s.logo)}" alt="${esc(s.brand)}" width="120" height="34">`;
    if (s.sampleData) {
      const banner = document.getElementById('sample-banner');
      banner.innerHTML = 'Preview store: products, prices and stock shown are <strong>sample data</strong>, not real YAHIVO items.';
      banner.hidden = false;
    }
    document.getElementById('footer-social').innerHTML = socialLinks(s.social);
    document.getElementById('footer-legal').textContent = `© ${new Date().getFullYear()} ${s.brand}. Prices in ${s.currency}.`;
    initAnalytics(s);
    initChat(s);
  } catch { /* render() shows the error state */ }
}

initShell();
render();

// Admin entry: sign-in, hash router, dashboard + launch checklist.
import { adminApi, ApiError, esc, STATUS } from './core.js';
import { setLocale } from '../ui.js';

const main = document.getElementById('admin-main');
const nav = document.getElementById('admin-nav');
const logout = document.getElementById('logout');

const views = {
  '': dashboard,
  orders: (el, arg) => import('./orders.js').then((m) => m.default(el, arg)),
  products: (el, arg) => import('./products.js').then((m) => m.default(el, arg)),
  ai: (el) => import('./ai.js').then((m) => m.default(el)),
};
const SETTINGS_VIEWS = ['delivery', 'packing', 'tax', 'payments', 'store', 'policies', 'sizeGuide', 'analytics'];

async function route() {
  const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  nav.querySelectorAll('a').forEach((a) => {
    const target = a.getAttribute('href').replace(/^#\/?/, '');
    if (target === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  main.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';
  try {
    if (views[name]) await views[name](main, arg && decodeURIComponent(arg));
    else if (SETTINGS_VIEWS.includes(name)) await (await import('./settings.js')).default(main, name);
    else main.innerHTML = '<h1>Not found</h1>';
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return showLogin();
    main.innerHTML = `<div class="notice notice-err"><strong>Could not load this page.</strong> ${esc(e.message)}</div>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  return undefined;
}

async function dashboard(el) {
  const [data, today] = await Promise.all([adminApi('/api/admin/overview'), adminApi('/api/admin/summary')]);
  const todo = data.checklist.filter((c) => !c.ok);
  const counts = data.orderCounts;
  el.innerHTML = `
    <h1>Dashboard</h1>
    <section class="panel"><h2>Today</h2><p class="pre">${esc(today.text)}</p><a class="btn btn-small" href="#/ai">Ask the AI assistant</a></section>
    <div class="stats">${Object.entries(STATUS).map(([k, l]) => `<a class="stat" href="#/orders?status=${k}"><strong>${counts[k] ?? 0}</strong>${esc(l)}</a>`).join('')}</div>
    <section class="panel"><h2>Integrations</h2>
      <ul>
        <li><strong>Payments:</strong> ${esc(data.integrations.payments)}</li>
        <li><strong>Courier:</strong> ${esc(data.integrations.courier)}</li>
        <li><strong>AI assistant:</strong> ${esc(data.integrations.assistant)}</li>
        <li><strong>n8n (WhatsApp, Messenger, Instagram):</strong> ${esc(data.integrations.n8n)}</li>
      </ul>
    </section>
    <section class="panel"><h2>Launch checklist — ${todo.length ? `${todo.length} item${todo.length === 1 ? '' : 's'} to do` : 'all done'}</h2>
      <p class="muted small">The store stays local until you deploy it. Complete the required items before launch.</p>
      <ul class="checklist">${[...todo, ...data.checklist.filter((c) => c.ok)].map((c) => `<li class="${c.ok ? 'ok' : 'todo'}"><span class="mark" aria-hidden="true">${c.ok ? '✓' : '!'}</span><span><strong>${esc(c.label)}</strong><span class="sev">${c.ok ? 'done' : esc(c.severity)}</span><br><span class="muted small">${esc(c.how)}</span></span></li>`).join('')}</ul>
    </section>`;
}

function showLogin(message = '') {
  nav.hidden = true;
  logout.hidden = true;
  main.innerHTML = `<div class="login panel"><h1>Sign in</h1>
    <form id="login-form" novalidate>
      <div class="field"><label for="pw">Admin password</label><input id="pw" name="password" type="password" autocomplete="current-password" required maxlength="200"></div>
      <div id="login-error" role="alert">${message ? `<p class="field-error">${esc(message)}</p>` : ''}</div>
      <button class="btn btn-block" type="submit">Sign in</button>
    </form></div>`;
  const form = main.querySelector('#login-form');
  form.password.focus();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await adminApi('/api/admin/login', { method: 'POST', body: { password: form.password.value } });
      start();
    } catch (err) {
      main.querySelector('#login-error').innerHTML = `<p class="field-error">${esc(err.message)}</p>`;
      form.password.select();
    }
  });
}

async function start() {
  let s;
  try {
    s = await adminApi('/api/admin/session');
  } catch (e) {
    main.innerHTML = `<div class="notice notice-err">${esc(e.message)}</div>`;
    return;
  }
  if (!s.enabled) {
    main.innerHTML = `<div class="login panel"><h1>Admin is disabled</h1><p>Set the <code>ADMIN_PASSWORD</code> environment variable (12+ characters) and restart the server. See README.</p></div>`;
    return;
  }
  if (!s.authed) { showLogin(); return; }
  try { const st = await adminApi('/api/settings'); setLocale(st.currency, st.locale); } catch { /* defaults */ }
  nav.hidden = false;
  logout.hidden = false;
  route();
}

logout.addEventListener('click', async () => {
  await adminApi('/api/admin/logout', { method: 'POST', body: {} }).catch(() => {});
  showLogin('Signed out.');
});
window.addEventListener('hashchange', () => { if (!nav.hidden) route(); });
start();

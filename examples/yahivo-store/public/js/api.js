// Fetch wrapper + shared client state (settings + cart).

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body ?? {};
  }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { error: 'You appear to be offline. Check your connection and try again.' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

let settingsPromise;
export function getSettings({ refresh = false } = {}) {
  if (refresh || !settingsPromise) settingsPromise = api('/api/settings').catch((e) => { settingsPromise = null; throw e; });
  return settingsPromise;
}

// ---- cart (browser storage; prices are never stored or trusted client-side)
const KEY = 'yh_cart_v1';
const listeners = new Set();
let memoryCart = [];

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((i) => i && typeof i.slug === 'string' && Number.isInteger(i.qty)).slice(0, 30) : [];
  } catch {
    return memoryCart;
  }
}
function write(items) {
  memoryCart = items;
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage blocked: keep in memory */ }
  listeners.forEach((fn) => fn(items));
}

export const cart = {
  items: read,
  count: () => read().reduce((s, i) => s + i.qty, 0),
  add({ slug, color, size, qty }) {
    const items = read();
    const found = items.find((i) => i.slug === slug && i.color === color && i.size === size);
    if (found) found.qty = Math.min(10, found.qty + qty);
    else items.push({ slug, color, size, qty: Math.min(10, qty) });
    write(items);
  },
  setQty(key, qty) {
    const items = read().map((i) => (`${i.slug}|${i.color}|${i.size}` === key ? { ...i, qty } : i)).filter((i) => i.qty > 0);
    write(items);
  },
  remove(key) { write(read().filter((i) => `${i.slug}|${i.color}|${i.size}` !== key)); },
  /** Align stored cart with the server quote (drops unavailable lines, applies reduced quantities). */
  reconcile(quote) {
    write(quote.lines.map((l) => ({ slug: l.slug, color: l.color, size: l.size, qty: l.qty })));
  },
  clear() { write([]); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

window.addEventListener('storage', (e) => { if (e.key === KEY) listeners.forEach((fn) => fn(read())); });

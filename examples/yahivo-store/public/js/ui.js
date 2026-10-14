// Shared UI helpers. All dynamic text goes through esc() before reaching innerHTML.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let currency = 'AED';
let locale = 'en-AE';
export function setLocale(cur, loc) { currency = cur || currency; locale = loc || locale; }

export function money(n) {
  if (n === null || n === undefined) return 'Price not set';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${currency} ${Number(n).toFixed(2)}`;
  }
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Product illustration used until real product photos are added. */
export function hoodieSvg(hex = '#151515', { view = 'front', label = 'Hoodie illustration' } = {}) {
  const light = luminance(hex) > 0.55;
  const line = light ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.14)';
  const string = light ? '#3a3a3a' : '#f2efe8';
  const body = 'M70 58C60 60 46 64 40 70C30 92 22 124 18 150L38 158C44 132 50 112 56 100L56 196C56 200 60 203 64 203L136 203C140 203 144 200 144 196L144 100C150 112 156 132 162 158L182 150C178 124 170 92 160 70C154 64 140 60 130 58Z';
  const hood = 'M66 62C62 34 80 16 100 16C120 16 138 34 134 62C126 70 112 74 100 74C88 74 74 70 66 62Z';
  const front = `
    <path d="M80 58C80 40 90 30 100 30C110 30 120 40 120 58C114 64 108 66 100 66C92 66 86 64 80 58Z" fill="rgba(0,0,0,.38)"/>
    <path d="M70 150L130 150L138 184L62 184Z" fill="rgba(0,0,0,.12)" stroke="${line}"/>
    <path d="M93 66L91 104M107 66L109 104" stroke="${string}" stroke-width="2.4" stroke-linecap="round"/>`;
  const back = `<path d="M100 20L100 72" stroke="${line}" stroke-width="1.5"/>`;
  return `<svg class="hoodie-svg" viewBox="0 0 200 220" role="img" aria-label="${esc(label)}">
    <path d="${body}" fill="${esc(hex)}" stroke="${line}" stroke-width="1.5"/>
    <path d="M56 100L56 196M144 100L144 196" stroke="rgba(0,0,0,.12)" stroke-width="2"/>
    <path d="${hood}" fill="${esc(hex)}" stroke="${line}" stroke-width="1.5"/>
    <rect x="56" y="191" width="88" height="12" rx="3" fill="rgba(0,0,0,.15)"/>
    <path d="M18 150L38 158L35 167L15 159Z M182 150L162 158L165 167L185 159Z" fill="${esc(hex)}" stroke="${line}"/>
    ${view === 'front' ? front : back}
  </svg>`;
}

/** Colour swatch as SVG (CSP forbids inline style attributes). */
export function swatch(hex, size = 14, cls = 'swatch-dot') {
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="${esc(hex)}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/></svg>`;
}

/** First product photo, or the illustration in the given colour. */
export function productMedia(p, color, { view = 'front' } = {}) {
  const c = color ?? p.colors[0];
  if (p.images?.length) {
    const img = p.images[0];
    return `<img src="${esc(img.src)}" alt="${esc(img.alt || `${p.name} in ${c?.name ?? ''}`)}" loading="lazy" decoding="async">`;
  }
  return hoodieSvg(c?.hex, { view, label: `${p.name} in ${c?.name ?? ''} (illustration — photo coming soon)` });
}

export function availabilityLabel(p) {
  return { sold_out: 'Sold out', low: 'Low stock', in_stock: 'In stock', unknown: 'Ask about availability' }[p.availability];
}

export function productCard(p) {
  const badges = [
    p.sample ? '<span class="badge badge-sample">Sample</span>' : '',
    p.isNew ? '<span class="badge badge-accent">New</span>' : '',
    p.availability === 'sold_out' ? '<span class="badge">Sold out</span>' : '',
  ].join('');
  return `<a class="card" href="/product/${esc(p.slug)}" data-link>
    <div class="card-media">${productMedia(p)}<div class="card-badges">${badges}</div></div>
    <div class="card-body">
      <span class="card-name">${esc(p.name)}</span>
      <span class="card-meta">${esc(p.style)} · ${p.colors.length} colour${p.colors.length === 1 ? '' : 's'}</span>
      <span class="card-price">${esc(money(p.price))}</span>
      <span class="swatches" aria-label="Colours: ${esc(p.colors.map((c) => c.name).join(', '))}">${p.colors.map((c) => swatch(c.hex, 14)).join('')}</span>
    </div>
  </a>`;
}

export function toast(message, { link, error = false, timeout = 3500 } = {}) {
  const region = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast${error ? ' err' : ''}`;
  el.innerHTML = `<span>${esc(message)}</span>${link ? `<a href="${esc(link.href)}" data-link>${esc(link.label)}</a>` : ''}`;
  region.append(el);
  setTimeout(() => el.remove(), timeout);
}

export const ICONS = {
  instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM12 2c-2.7 0-3 0-4.1.1-1 0-1.8.2-2.4.5-.7.3-1.2.6-1.8 1.2S2.9 5 2.6 5.6c-.3.6-.4 1.4-.5 2.4C2 9 2 9.3 2 12s0 3 .1 4.1c0 1 .2 1.8.5 2.4.3.7.6 1.2 1.2 1.8s1.1.9 1.8 1.2c.6.3 1.4.4 2.4.5 1 .1 1.4.1 4.1.1s3 0 4.1-.1c1 0 1.8-.2 2.4-.5.7-.3 1.2-.6 1.8-1.2s.9-1.1 1.2-1.8c.3-.6.4-1.4.5-2.4.1-1 .1-1.4.1-4.1s0-3-.1-4.1c0-1-.2-1.8-.5-2.4-.3-.7-.6-1.2-1.2-1.8S19 2.9 18.4 2.6c-.6-.3-1.4-.4-2.4-.5C15 2 14.7 2 12 2zm0 1.8c2.7 0 3 0 4 .1.9 0 1.5.2 1.8.3.5.2.8.4 1.1.7.4.4.6.7.7 1.1.1.3.3.9.3 1.8.1 1 .1 1.4.1 4s0 3-.1 4c0 .9-.2 1.5-.3 1.8-.2.5-.4.8-.7 1.1-.4.4-.7.6-1.1.7-.3.1-.9.3-1.8.3-1 .1-1.4.1-4 .1s-3 0-4-.1c-.9 0-1.5-.2-1.8-.3-.5-.2-.8-.4-1.1-.7-.4-.4-.6-.7-.7-1.1-.1-.3-.3-.9-.3-1.8-.1-1-.1-1.4-.1-4s0-3 .1-4c0-.9.2-1.5.3-1.8.2-.5.4-.8.7-1.1.4-.4.7-.6 1.1-.7.3-.1.9-.3 1.8-.3 1-.1 1.4-.1 4-.1z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22z"/></svg>',
  tiktok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.6 2h-3.3v13.4a2.8 2.8 0 1 1-2-2.7V9.3a6.1 6.1 0 1 0 5.3 6.1V8.6a7.7 7.7 0 0 0 4.4 1.4V6.7a4.4 4.4 0 0 1-4.4-4.4z"/></svg>',
};

export function socialLinks(social) {
  return ['instagram', 'tiktok', 'facebook'].filter((k) => social?.[k])
    .map((k) => `<a href="${esc(social[k])}" target="_blank" rel="noopener noreferrer">${ICONS[k]}<span>${k === 'tiktok' ? 'TikTok' : k[0].toUpperCase() + k.slice(1)}</span></a>`).join('');
}

export function loading(label = 'Loading…') {
  return `<div class="wrap page-loading" aria-busy="true"><div class="spinner" aria-hidden="true"></div><p>${esc(label)}</p></div>`;
}

export function errorState(message, retry = true) {
  return `<div class="wrap empty"><h2>Something went wrong</h2><p class="muted">${esc(message)}</p>${retry ? '<button class="btn" data-retry>Try again</button>' : ''}</div>`;
}

/** Show per-field errors returned by the API (or client validation) next to inputs. */
export function showFieldErrors(form, fields = {}) {
  form.querySelectorAll('.field-error').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(fields)) {
    const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const err = document.createElement('p');
    err.className = 'field-error';
    err.id = `err-${name.replace(/\W/g, '-')}`;
    err.textContent = msg;
    input.setAttribute('aria-describedby', err.id);
    (input.closest('.field') ?? input.parentElement).append(err);
    first ??= input;
  }
  first?.focus();
  return Boolean(first);
}

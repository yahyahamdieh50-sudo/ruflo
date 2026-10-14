// Product detail page.
import { api, ApiError, cart } from '../api.js';
import { track } from '../analytics.js';
import { esc, hoodieSvg, money, swatch, toast } from '../ui.js';
import { notFound } from './pages.js';
import { deliveryTable, sizeTable } from './shared.js';

export default async function product(main, ctx) {
  const { settings, params } = ctx;
  let p;
  try {
    ({ product: p } = await api(`/api/products/${params[0]}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return ctx.isCurrent() ? notFound(main, ctx) : undefined;
    throw e;
  }
  if (!ctx.isCurrent()) return undefined;
  document.title = `${p.name} — ${settings.brand}`;
  track('view_item', { currency: settings.currency, value: p.price, items: [{ item_id: p.slug, item_name: p.name }] });

  const stockFor = (color, size) => {
    const c = p.colors.find((x) => x.name === color);
    if (!c?.stock) return null;
    return c.stock[size] ?? 0;
  };
  const colorHasStock = (c) => !c.stock || Object.values(c.stock).some((n) => n > 0);
  const state = { color: (p.colors.find(colorHasStock) ?? p.colors[0]).name, size: null, qty: 1, view: 0 };

  const views = () => {
    const c = p.colors.find((x) => x.name === state.color);
    if (p.images.length) return p.images.map((img) => `<img src="${esc(img.src)}" alt="${esc(img.alt || p.name)}" decoding="async">`);
    return [hoodieSvg(c.hex, { view: 'front', label: `${p.name} in ${c.name}, front (illustration — photo coming soon)` }), hoodieSvg(c.hex, { view: 'back', label: `${p.name} in ${c.name}, back (illustration)` })];
  };

  const shareUrl = encodeURIComponent(location.origin + location.pathname);
  const shareText = encodeURIComponent(`${p.name} — ${settings.brand}`);

  main.innerHTML = `
    <div class="wrap">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="/shop" data-link>Hoodies</a> / <a href="/shop?style=${esc(p.style.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}" data-link>${esc(p.style)}</a> / <span aria-current="page">${esc(p.name)}</span></nav>
      <div class="pdp">
        <div class="gallery">
          <div class="gallery-main" id="gallery-main"></div>
          <div class="thumbs" id="thumbs" role="group" aria-label="Product images"></div>
          ${p.images.length ? '' : '<p class="muted small">Illustration shown — product photos have not been added yet.</p>'}
        </div>
        <div class="pdp-info">
          <div class="pdp-badges">${p.sample ? '<span class="badge badge-sample">Sample product</span> ' : ''}${p.isNew ? '<span class="badge badge-accent">New</span>' : ''}</div>
          <h1>${esc(p.name)}</h1>
          <p class="pdp-price">${esc(money(p.price))}</p>
          <p class="muted small" id="tax-note">${settings.tax.enabled ? `${settings.tax.pricesIncludeTax ? 'Includes' : 'Excludes'} ${esc(settings.tax.name)} (${esc(settings.tax.rate)}%).` : ''} Delivery${settings.packing.options.length ? ' and packing' : ''} calculated at checkout.</p>

          <div class="opt-label"><span>Colour</span><span class="val" id="color-val"></span></div>
          <div class="color-opts" role="group" aria-label="Colour">${p.colors.map((c) => `<button type="button" class="color-opt" data-color="${esc(c.name)}" aria-label="${esc(c.name)}${colorHasStock(c) ? '' : ' (sold out)'}">${swatch(c.hex, 36, '')}</button>`).join('')}</div>

          <div class="opt-label"><span>Size</span><a href="/size-guide" data-link class="val">Size guide</a></div>
          <div class="size-opts" role="group" aria-label="Size" id="size-opts"></div>
          <p class="stock-line" id="stock-line" aria-live="polite"></p>

          <div class="atc-row">
            <div class="qty" role="group" aria-label="Quantity">
              <button type="button" id="qty-dec" aria-label="Decrease quantity">−</button><output id="qty" aria-live="polite">1</output><button type="button" id="qty-inc" aria-label="Increase quantity">+</button>
            </div>
            <button type="button" class="btn btn-accent" id="atc">Add to cart</button>
          </div>
          <p class="field-error" id="atc-error" hidden></p>

          <div class="accordion">
            <details open><summary>Details</summary><div class="acc-body">
              ${p.description ? `<p class="pre">${esc(p.description)}</p>` : ''}
              <p><strong>Style:</strong> ${esc(p.style)}<br><strong>Material:</strong> ${p.material ? esc(p.material) : '<span class="muted">Not provided yet</span>'}<br><strong>Fit:</strong> ${p.fit ? esc(p.fit) : '<span class="muted">Not provided yet</span>'}</p>
              ${p.details.length ? `<ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
            </div></details>
            <details><summary>Size &amp; fit</summary><div class="acc-body">${sizeTable(settings)}</div></details>
            <details><summary>Delivery &amp; packing</summary><div class="acc-body">${deliveryTable(settings)}</div></details>
            <details><summary>Returns</summary><div class="acc-body">${settings.policies.returns ? `<p class="pre">${esc(settings.policies.returns)}</p>` : '<p class="muted">The returns policy hasn’t been published yet. Please <a href="/contact" data-link>contact us</a> before ordering if you have questions.</p>'}</div></details>
          </div>
          <div class="share-row">
            <a class="btn btn-ghost btn-small" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${shareText}%20${shareUrl}">Share on WhatsApp</a>
            <a class="btn btn-ghost btn-small" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${shareUrl}">Share on Facebook</a>
            <button type="button" class="btn btn-ghost btn-small" id="copy-link">Copy link</button>
          </div>
        </div>
      </div>
    </div>
    <div class="sticky-atc" id="sticky-atc" aria-hidden="true">
      <div class="sa-info"><strong>${esc(p.name)}</strong><span id="sa-sel"></span></div>
      <button type="button" class="btn btn-accent btn-small" id="sa-btn" tabindex="-1">Add to cart</button>
    </div>`;

  const $ = (s) => main.querySelector(s);
  const renderGallery = () => {
    const v = views();
    state.view = Math.min(state.view, v.length - 1);
    $('#gallery-main').innerHTML = v[state.view];
    $('#thumbs').innerHTML = v.length > 1 ? v.map((html, i) => `<button type="button" aria-label="Image ${i + 1}" aria-pressed="${i === state.view}" data-i="${i}">${html}</button>`).join('') : '';
  };
  const renderOptions = () => {
    main.querySelectorAll('.color-opt').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === state.color)));
    $('#color-val').textContent = state.color;
    $('#size-opts').innerHTML = p.sizes.map((s) => {
      const n = stockFor(state.color, s);
      const sold = n === 0;
      return `<button type="button" class="size-opt${sold ? ' sold' : ''}" data-size="${esc(s)}" aria-pressed="${state.size === s}" ${sold ? 'aria-disabled="true"' : ''} aria-label="${esc(s)}${sold ? ' (sold out)' : ''}">${esc(s)}</button>`;
    }).join('');
    const line = $('#stock-line');
    const max = state.size ? stockFor(state.color, state.size) : null;
    if (!state.size) {
      const anyStock = p.colors.find((c) => c.name === state.color);
      line.innerHTML = colorHasStock(anyStock) ? '<span class="muted">Select a size to see availability.</span>' : '<span class="dot out"></span> This colour is sold out.';
    } else if (max === null) line.innerHTML = '<span class="muted">Stock isn’t tracked for this item — availability is confirmed after you order.</span>';
    else if (max === 0) line.innerHTML = '<span class="dot out"></span> Sold out in this size.';
    else if (max <= 3) line.innerHTML = `<span class="dot low"></span> Only ${max} left in ${esc(state.size)}.`;
    else line.innerHTML = `<span class="dot"></span> In stock in ${esc(state.size)}.`;
    const cap = Math.min(10, max ?? 10);
    if (state.qty > cap) state.qty = Math.max(1, cap);
    $('#qty').textContent = state.qty;
    $('#qty-dec').disabled = state.qty <= 1;
    $('#qty-inc').disabled = state.qty >= cap;
    const soldOut = max === 0;
    $('#atc').disabled = soldOut;
    $('#atc').textContent = soldOut ? 'Sold out' : `Add to cart — ${money(p.price * state.qty)}`;
    $('#sa-sel').textContent = `${state.color} · ${state.size ?? 'Choose size'} · ${money(p.price)}`;
  };

  const add = () => {
    const err = $('#atc-error');
    if (!state.size) {
      err.textContent = 'Please choose a size.';
      err.hidden = false;
      $('#size-opts button:not([aria-disabled])')?.focus();
      $('#size-opts').scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    if (stockFor(state.color, state.size) === 0) return;
    err.hidden = true;
    cart.add({ slug: p.slug, color: state.color, size: state.size, qty: state.qty });
    track('add_to_cart', { currency: settings.currency, value: p.price * state.qty, items: [{ item_id: p.slug, item_name: p.name, item_variant: `${state.color}/${state.size}`, quantity: state.qty }] });
    toast(`Added ${p.name} (${state.color}, ${state.size})`, { link: { href: '/cart', label: 'View cart' } });
  };

  // <main> persists across views: remove this listener when the view is left.
  const listeners = new AbortController();
  main.addEventListener('click', (e) => {
    const color = e.target.closest('.color-opt');
    const size = e.target.closest('.size-opt');
    const thumb = e.target.closest('#thumbs button');
    if (color) { state.color = color.dataset.color; if (state.size && stockFor(state.color, state.size) === 0) state.size = null; renderOptions(); renderGallery(); }
    else if (size && !size.hasAttribute('aria-disabled')) { state.size = size.dataset.size; $('#atc-error').hidden = true; renderOptions(); }
    else if (thumb) { state.view = Number(thumb.dataset.i); renderGallery(); }
  }, { signal: listeners.signal });
  $('#qty-dec').addEventListener('click', () => { state.qty = Math.max(1, state.qty - 1); renderOptions(); });
  $('#qty-inc').addEventListener('click', () => { state.qty += 1; renderOptions(); });
  $('#atc').addEventListener('click', add);
  $('#sa-btn').addEventListener('click', add);
  $('#copy-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Link copied'); } catch { toast('Copy failed — copy the address bar instead', { error: true }); }
  });

  // Sticky add-to-cart on mobile once the main button has scrolled above the viewport.
  document.body.classList.add('has-sticky-atc');
  const sticky = $('#sticky-atc');
  const updateSticky = () => {
    const show = $('#atc').getBoundingClientRect().bottom < 0;
    if (show === sticky.classList.contains('show')) return;
    sticky.classList.toggle('show', show);
    sticky.setAttribute('aria-hidden', String(!show));
    $('#sa-btn').tabIndex = show ? 0 : -1;
  };
  window.addEventListener('scroll', updateSticky, { passive: true, signal: listeners.signal });
  window.addEventListener('resize', updateSticky, { passive: true, signal: listeners.signal });

  renderGallery();
  renderOptions();
  updateSticky();
  return () => { listeners.abort(); document.body.classList.remove('has-sticky-atc'); };
}

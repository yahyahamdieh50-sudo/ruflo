// Admin products: list + editor (prices, sizes, colours, stock per size, images, publishing).
import { adminApi, ApiError, esc, money, showErrors, toast } from './core.js';
import { swatch } from '../ui.js';

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export default async function products(el, slug) {
  if (slug) return editor(el, slug);
  const { products: list } = await adminApi('/api/admin/products');
  const total = (p) => p.colors.reduce((s, c) => s + (c.stock ? Object.values(c.stock).reduce((a, b) => a + b, 0) : 0), 0);
  el.innerHTML = `<h1>Products</h1>
    ${list.some((p) => p.sample) ? '<div class="panel-note"><strong>Sample products are loaded.</strong> They exist only to test the store. Add your real hoodies, then unpublish or delete every item marked SAMPLE.</div>' : ''}
    <div class="actions"><a class="btn" href="#/products/_new">+ Add product</a></div><br>
    ${list.length ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>Product</th><th>Style</th><th>Price</th><th>Colours</th><th>Stock</th><th>Status</th></tr></thead><tbody>
      ${list.sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<tr data-href="#/products/${esc(p.slug)}" tabindex="0">
        <td><a href="#/products/${esc(p.slug)}"><strong>${esc(p.name)}</strong></a> ${p.sample ? '<span class="badge badge-sample">Sample</span>' : ''}<br><span class="muted small">/product/${esc(p.slug)}</span></td>
        <td>${esc(p.style)}</td><td>${esc(money(p.price))}</td>
        <td>${p.colors.map((c) => swatch(c.hex, 16)).join(' ')}</td>
        <td>${p.colors.every((c) => c.stock) ? total(p) : 'Not tracked'}</td>
        <td>${p.published ? 'Published' : '<span class="muted">Hidden</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="panel empty"><h2>No products</h2></div>'}`;
  el.querySelectorAll('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  return undefined;
}

async function editor(el, slug) {
  const isNew = slug === '_new';
  const p = isNew
    ? { slug: '', name: '', style: '', description: '', details: [], material: '', fit: '', price: '', sizes: ['S', 'M', 'L', 'XL'], colors: [{ name: '', hex: '#151515', stock: { S: 0, M: 0, L: 0, XL: 0 } }], images: [], featured: false, isNew: true, published: false, sample: false }
    : (await adminApi('/api/admin/products')).products.find((x) => x.slug === slug);
  if (!p) { el.innerHTML = '<p>Product not found. <a href="#/products">Back</a></p>'; return; }
  const state = structuredClone(p);

  const stockGrid = () => `<div class="table-wrap"><table class="stock-grid"><thead><tr><th>Colour</th><th>Swatch</th>${state.sizes.map((s) => `<th>${esc(s)}</th>`).join('')}<th>Track</th><th></th></tr></thead><tbody>
    ${state.colors.map((c, i) => `<tr data-ci="${i}">
      <td><label class="sr-only" for="cn${i}">Colour name</label><input id="cn${i}" name="colorName" type="text" value="${esc(c.name)}" maxlength="40" placeholder="e.g. Black"></td>
      <td><label class="sr-only" for="ch${i}">Swatch</label><input id="ch${i}" name="colorHex" type="color" value="${esc(c.hex)}"></td>
      ${state.sizes.map((s) => `<td><label class="sr-only" for="st${i}${s}">Stock ${esc(s)}</label><input id="st${i}${s}" name="stock" data-size="${esc(s)}" type="number" min="0" step="1" value="${c.stock ? c.stock[s] ?? 0 : ''}" ${c.stock ? '' : 'disabled'}></td>`).join('')}
      <td><input type="checkbox" name="track" aria-label="Track stock for this colour" ${c.stock ? 'checked' : ''}></td>
      <td><button type="button" class="link-btn" data-rm-color>Remove</button></td></tr>`).join('')}
  </tbody></table></div><button type="button" class="btn btn-ghost btn-small" id="add-color">+ Add colour</button>`;

  const images = () => `<div class="img-list">${state.images.map((img, i) => `<div class="img-item"><img src="${esc(img.src)}" alt=""><label class="sr-only" for="ia${i}">Image description</label><input id="ia${i}" data-img-alt="${i}" type="text" value="${esc(img.alt)}" placeholder="Describe image" maxlength="160"><button type="button" class="link-btn" data-rm-img="${i}">Remove</button></div>`).join('') || '<p class="muted">No photos yet — the storefront shows an illustration until you add some.</p>'}</div>`;

  el.innerHTML = `<p><a href="#/products">← All products</a></p>
    <h1>${isNew ? 'Add product' : esc(p.name)}</h1>
    ${p.sample ? '<div class="panel-note">This is a SAMPLE product. Replace its details with a real hoodie (and untick “Sample”) or delete it.</div>' : ''}
    <form id="pf" novalidate>
      <section class="panel"><h2>Basics</h2>
        <div class="field-row">
          <div class="field"><label for="name">Name</label><input id="name" name="name" type="text" maxlength="100" value="${esc(state.name)}" required></div>
          <div class="field"><label for="slug">URL slug <span class="hint">/product/…</span></label><input id="slug" name="slug" type="text" maxlength="80" value="${esc(state.slug)}" required></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="style">Style <span class="hint">(e.g. Pullover, Zip-up, Oversized)</span></label><input id="style" name="style" type="text" maxlength="40" value="${esc(state.style)}" required></div>
          <div class="field"><label for="price">Price (AED)</label><input id="price" name="price" type="number" min="0" step="0.01" value="${esc(state.price)}" required></div>
        </div>
        <div class="field"><label for="description">Description</label><textarea id="description" name="description" maxlength="2000">${esc(state.description ?? '')}</textarea></div>
        <div class="field-row">
          <div class="field"><label for="material">Material <span class="hint">(leave blank if unconfirmed)</span></label><input id="material" name="material" type="text" maxlength="200" value="${esc(state.material ?? '')}"></div>
          <div class="field"><label for="fit">Fit</label><input id="fit" name="fit" type="text" maxlength="200" value="${esc(state.fit ?? '')}"></div>
        </div>
        <div class="field"><label for="details">Details <span class="hint">(one per line)</span></label><textarea id="details" name="details">${esc(state.details.join('\n'))}</textarea></div>
      </section>
      <section class="panel"><h2>Sizes, colours &amp; stock</h2>
        <div class="field"><label for="sizes">Sizes <span class="hint">(comma separated, e.g. S, M, L, XL)</span></label><input id="sizes" name="sizes" type="text" value="${esc(state.sizes.join(', '))}"></div>
        <div id="stock">${stockGrid()}</div>
        <p class="hint">Stock is reduced automatically when an order is placed and returned if the order is cancelled. Untick “Track” only if you don’t know the quantity.</p>
      </section>
      <section class="panel"><h2>Photos</h2>
        <div id="images">${images()}</div>
        <div class="actions">
          <label class="btn btn-ghost btn-small" for="upload">Upload photo</label><input id="upload" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
          <label class="sr-only" for="imgurl">Image URL</label><input id="imgurl" type="url" placeholder="or paste https:// image URL"><button type="button" class="btn btn-ghost btn-small" id="add-url">Add URL</button>
        </div>
      </section>
      <section class="panel"><h2>Visibility</h2>
        <label class="check"><input type="checkbox" name="published" ${state.published ? 'checked' : ''}> Published (visible in the store)</label>
        <label class="check"><input type="checkbox" name="featured" ${state.featured ? 'checked' : ''}> Featured on homepage</label>
        <label class="check"><input type="checkbox" name="isNew" ${state.isNew ? 'checked' : ''}> Mark as new arrival</label>
        <label class="check"><input type="checkbox" name="sample" ${state.sample ? 'checked' : ''}> Sample / test product</label>
      </section>
      <div class="actions">
        <button class="btn" type="submit">${isNew ? 'Create product' : 'Save product'}</button>
        ${isNew ? '' : '<button type="button" class="btn btn-danger" id="del">Delete</button>'}
      </div>
    </form>`;

  const form = el.querySelector('#pf');
  // Keep state in sync with the stock grid before re-rendering it.
  const syncColors = () => {
    form.querySelectorAll('tr[data-ci]').forEach((tr) => {
      const c = state.colors[Number(tr.dataset.ci)];
      c.name = tr.querySelector('[name="colorName"]').value;
      c.hex = tr.querySelector('[name="colorHex"]').value;
      const track = tr.querySelector('[name="track"]').checked;
      c.stock = track ? Object.fromEntries(state.sizes.map((s) => [s, Number(tr.querySelector(`[data-size="${CSS.escape(s)}"]`)?.value || 0)])) : null;
    });
  };
  const rerenderStock = () => { el.querySelector('#stock').innerHTML = stockGrid(); };
  form.name.addEventListener('input', () => { if (isNew) form.slug.value = slugify(form.name.value); });
  form.sizes.addEventListener('change', () => {
    const next = [...new Set(form.sizes.value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))];
    if (next.join() === state.sizes.join()) return;
    syncColors();
    state.sizes = next;
    // Defer so the field the user just clicked receives focus first, then restore it after re-render.
    setTimeout(() => {
      const id = document.activeElement?.id;
      rerenderStock();
      if (id) document.getElementById(id)?.focus();
    });
  });
  el.querySelector('#stock').addEventListener('change', (e) => { if (e.target.name === 'track') { syncColors(); rerenderStock(); } });
  el.querySelector('#stock').addEventListener('click', (e) => {
    if (e.target.id === 'add-color') { syncColors(); state.colors.push({ name: '', hex: '#151515', stock: Object.fromEntries(state.sizes.map((s) => [s, 0])) }); rerenderStock(); }
    const rm = e.target.closest('[data-rm-color]');
    if (rm) { syncColors(); state.colors.splice(Number(rm.closest('tr').dataset.ci), 1); rerenderStock(); }
  });
  const syncAlts = () => el.querySelectorAll('[data-img-alt]').forEach((i) => { state.images[Number(i.dataset.imgAlt)].alt = i.value; });
  el.querySelector('#images').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm-img]');
    if (rm) { syncAlts(); state.images.splice(Number(rm.dataset.rmImg), 1); el.querySelector('#images').innerHTML = images(); }
  });
  el.querySelector('#add-url').addEventListener('click', () => {
    const v = el.querySelector('#imgurl').value.trim();
    if (!/^https:\/\//.test(v)) { toast('Image URL must start with https://', { error: true }); return; }
    syncAlts();
    state.images.push({ src: v, alt: '' });
    el.querySelector('#imgurl').value = '';
    el.querySelector('#images').innerHTML = images();
  });
  el.querySelector('#upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Images must be under 5 MB', { error: true }); return; }
    const dataBase64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    try {
      const { src } = await adminApi('/api/admin/uploads', { method: 'POST', body: { dataBase64 } });
      syncAlts();
      state.images.push({ src, alt: '' });
      el.querySelector('#images').innerHTML = images();
      toast('Photo uploaded — remember to save');
    } catch (err) {
      toast(err.body?.fields?.file ?? err.message, { error: true });
    }
    e.target.value = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    syncColors();
    syncAlts();
    const body = {
      ...state,
      name: form.name.value, slug: form.slug.value.trim(), style: form.style.value,
      price: form.price.value === '' ? null : Number(form.price.value),
      description: form.description.value, material: form.material.value, fit: form.fit.value,
      details: form.details.value.split('\n').map((d) => d.trim()).filter(Boolean),
      published: form.published.checked, featured: form.featured.checked, isNew: form.isNew.checked, sample: form.sample.checked,
    };
    try {
      const { product } = await adminApi(`/api/admin/products/${isNew ? '_new' : encodeURIComponent(slug)}`, { method: 'PUT', body });
      toast('Product saved');
      location.hash = `#/products/${product.slug}`;
      if (product.slug === slug) editor(el, product.slug);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) showErrors(form, err.body.fields);
      else showErrors(form, {}, { message: err.message });
    }
  });
  el.querySelector('#del')?.addEventListener('click', async () => {
    if (!confirm(`Delete “${p.name}”? Existing orders keep their copy of the item.`)) return;
    await adminApi(`/api/admin/products/${encodeURIComponent(slug)}`, { method: 'DELETE' });
    toast('Product deleted');
    location.hash = '#/products';
  });
}

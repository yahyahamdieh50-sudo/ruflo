// Collection + search with filters (size, colour, style, price, availability) and sorting.
import { api } from '../api.js';
import { track } from '../analytics.js';
import { errorState, esc, loading, money, productCard, swatch } from '../ui.js';

const SORTS = [['featured', 'Featured'], ['newest', 'Newest'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name A–Z']];
const KEYS = ['q', 'size', 'color', 'style', 'min', 'max', 'inStock', 'new', 'sort'];

export default async function shop(main, ctx) {
  const { pathname, query, navigate, isCurrent, settings } = ctx;
  const isSearch = pathname === '/search';
  const params = new URLSearchParams();
  for (const k of KEYS) if (query.get(k)) params.set(k, query.get(k));

  const title = isSearch ? (params.get('q') ? `Results for “${params.get('q')}”` : 'Search') : params.get('new') ? 'New arrivals' : 'All hoodies';
  document.title = `${title} — YAHIVO`;
  if (isSearch && params.get('q')) track('search', { search_term: params.get('q') });

  main.innerHTML = `<div class="wrap page-head"><h1>${esc(title)}</h1>
    ${isSearch ? `<form class="search-bar" id="page-search" role="search"><label class="sr-only" for="ps">Search</label><input id="ps" type="search" name="q" maxlength="80" value="${esc(params.get('q') ?? '')}" placeholder="Search hoodies"><button class="btn btn-small">Search</button></form>` : ''}
  </div><div class="wrap" id="shop-body">${loading('Loading hoodies…')}</div>`;

  main.querySelector('#page-search')?.addEventListener('submit', (e) => {
    e.preventDefault();
    navigate(`/search?q=${encodeURIComponent(e.target.q.value.trim())}`);
  });

  let data;
  try {
    data = await api(`/api/products?${params}`);
  } catch (e) {
    main.querySelector('#shop-body').innerHTML = errorState(e.message);
    main.querySelector('[data-retry]').addEventListener('click', () => shop(main, ctx));
    return undefined;
  }
  if (!isCurrent()) return undefined;
  const { products, facets } = data;
  const list = (k) => (params.get(k) ? params.get(k).split(',') : []);
  const checked = (k, v) => (list(k).includes(v) ? 'checked' : '');

  const chips = (k, items, render) => items.map((it) => `<label class="chip"><input type="checkbox" name="${k}" value="${esc(it.id)}" ${checked(k, it.id)}><span>${render(it)}</span></label>`).join('');
  const activeCount = ['size', 'color', 'style', 'min', 'max', 'inStock', 'new'].filter((k) => params.get(k)).length;

  const body = main.querySelector('#shop-body');
  body.innerHTML = `
    <div class="shop-layout">
      <form class="filters" id="filters" aria-label="Filters">
        <div class="filters-head"><h2 class="filters-title">Filter</h2><button type="button" class="icon-btn" id="close-filters" aria-label="Close filters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
        <fieldset><legend>Size</legend><div class="chip-row">${chips('size', facets.sizes.map((s) => ({ id: s })), (s) => esc(s.id))}</div></fieldset>
        <fieldset><legend>Colour</legend><div class="chip-row">${chips('color', facets.colors, (c) => `${swatch(c.hex, 14)} ${esc(c.name)}`)}</div></fieldset>
        <fieldset><legend>Style</legend><div class="chip-row">${chips('style', facets.styles, (s) => esc(s.name))}</div></fieldset>
        <fieldset><legend>Price (${esc(settings.currency)})</legend>
          <div class="price-inputs">
            <label class="sr-only" for="fmin">Minimum price</label><input id="fmin" type="number" inputmode="numeric" name="min" min="0" placeholder="${facets.price ? `Min ${Math.floor(facets.price.min)}` : 'Min'}" value="${esc(params.get('min') ?? '')}">
            <span aria-hidden="true">–</span>
            <label class="sr-only" for="fmax">Maximum price</label><input id="fmax" type="number" inputmode="numeric" name="max" min="0" placeholder="${facets.price ? `Max ${Math.ceil(facets.price.max)}` : 'Max'}" value="${esc(params.get('max') ?? '')}">
          </div></fieldset>
        <fieldset><legend>Availability</legend><div class="chip-row">
          <label class="chip"><input type="checkbox" name="inStock" value="1" ${params.get('inStock') ? 'checked' : ''}><span>In stock</span></label>
          <label class="chip"><input type="checkbox" name="new" value="1" ${params.get('new') ? 'checked' : ''}><span>New</span></label>
        </div></fieldset>
        ${activeCount ? '<button type="button" class="link-btn" id="clear-filters">Clear all filters</button>' : ''}
        <div class="filters-apply"><button type="button" class="btn btn-block" id="apply-filters">Show results</button></div>
      </form>
      <div>
        <div class="toolbar">
          <button type="button" class="btn btn-ghost btn-small filter-toggle" id="open-filters" aria-controls="filters">Filter${activeCount ? ` (${activeCount})` : ''}</button>
          <span class="count" aria-live="polite">${products.length} hoodie${products.length === 1 ? '' : 's'}</span>
          <label class="sr-only" for="sort">Sort by</label>
          <select id="sort" name="sort">${SORTS.map(([v, l]) => `<option value="${v}" ${(params.get('sort') ?? 'featured') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        </div>
        ${products.length ? `<div class="grid">${products.map(productCard).join('')}</div>` : `
          <div class="empty"><h2>No hoodies found</h2><p class="muted">Try removing a filter${params.get('q') ? ' or searching for something else' : ''}.</p>
          <a class="btn" href="/shop" data-link>See all hoodies</a></div>`}
        ${facets.price && products.length ? `<p class="muted small">Prices from ${esc(money(facets.price.min))} to ${esc(money(facets.price.max))}.</p>` : ''}
      </div>
    </div>`;

  const form = body.querySelector('#filters');
  const apply = () => {
    const next = new URLSearchParams();
    if (params.get('q')) next.set('q', params.get('q'));
    for (const k of ['size', 'color', 'style']) {
      const vals = [...form.querySelectorAll(`input[name="${k}"]:checked`)].map((i) => i.value);
      if (vals.length) next.set(k, vals.join(','));
    }
    for (const k of ['min', 'max']) { const v = form[k].value.trim(); if (v && Number(v) >= 0) next.set(k, String(Math.floor(Number(v)))); }
    if (form.inStock.checked) next.set('inStock', '1');
    if (form.new.checked) next.set('new', '1');
    const sort = body.querySelector('#sort').value;
    if (sort !== 'featured') next.set('sort', sort);
    navigate(`${pathname}?${next}`, { replace: true });
  };
  const desktop = () => window.matchMedia('(min-width: 900px)').matches;
  form.addEventListener('change', (e) => { if (desktop() || e.target.name === 'sort') apply(); });
  body.querySelector('#sort').addEventListener('change', apply);
  body.querySelector('#apply-filters').addEventListener('click', apply);
  body.querySelector('#open-filters').addEventListener('click', () => { form.classList.add('open'); form.querySelector('input')?.focus(); });
  body.querySelector('#close-filters').addEventListener('click', () => form.classList.remove('open'));
  body.querySelector('#clear-filters')?.addEventListener('click', () => navigate(params.get('q') ? `${pathname}?q=${encodeURIComponent(params.get('q'))}` : pathname, { replace: true }));
  return undefined;
}

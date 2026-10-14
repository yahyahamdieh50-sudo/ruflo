// Catalog querying: filtering, sorting, facets and public product shape.

/** Stock for one colour/size. null = stock not tracked (unknown). */
export function stockOf(product, colorName, size) {
  const color = product.colors.find((c) => c.name === colorName);
  if (!color || !product.sizes.includes(size)) return 0;
  if (!color.stock) return null;
  return color.stock[size] ?? 0;
}

export function productAvailability(product) {
  if (!product.colors.every((c) => c.stock)) return 'unknown';
  const total = product.colors.reduce((sum, c) => sum + Object.values(c.stock).reduce((a, b) => a + b, 0), 0);
  if (total === 0) return 'sold_out';
  return total <= 5 ? 'low' : 'in_stock';
}

export const SORTS = ['featured', 'newest', 'price-asc', 'price-desc', 'name'];

export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Shape sent to the browser. Stock is exposed per colour/size so the UI can show status. */
export function publicProduct(p) {
  return {
    slug: p.slug,
    name: p.name,
    style: p.style,
    description: p.description ?? null,
    details: p.details ?? [],
    material: p.material ?? null,
    fit: p.fit ?? null,
    price: p.price,
    sizes: p.sizes,
    colors: p.colors.map((c) => ({
      name: c.name,
      hex: c.hex,
      stock: c.stock ? Object.fromEntries(p.sizes.map((s) => [s, stockOf(p, c.name, s)])) : null,
    })),
    images: p.images ?? [],
    featured: Boolean(p.featured),
    isNew: Boolean(p.isNew),
    createdAt: p.createdAt ?? null,
    availability: productAvailability(p),
    sample: Boolean(p.sample),
  };
}

function parseNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? n : null;
}

const listParam = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : []);

/** Parse URLSearchParams into a normalised, bounded query. */
export function parseQuery(params) {
  const q = (params.get('q') || '').slice(0, 80).trim().toLowerCase();
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'featured';
  return {
    q,
    sizes: listParam(params.get('size')).map((s) => s.toUpperCase()),
    colors: listParam(params.get('color')).map(slugify),
    styles: listParam(params.get('style')).map(slugify),
    min: parseNum(params.get('min')),
    max: parseNum(params.get('max')),
    inStock: params.get('inStock') === '1',
    isNew: params.get('new') === '1',
    sort,
  };
}

function matchesText(p, q) {
  if (!q) return true;
  const hay = [p.name, p.style, p.description, ...(p.details ?? []), ...p.colors.map((c) => c.name)]
    .filter(Boolean).join(' ').toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

export function filterProducts(products, query) {
  const out = products.filter((p) => {
    if (!matchesText(p, query.q)) return false;
    if (query.styles.length && !query.styles.includes(slugify(p.style))) return false;
    if (query.colors.length && !p.colors.some((c) => query.colors.includes(slugify(c.name)))) return false;
    if (query.sizes.length && !p.sizes.some((s) => query.sizes.includes(s))) return false;
    if (query.min !== null && (p.price === null || p.price < query.min)) return false;
    if (query.max !== null && (p.price === null || p.price > query.max)) return false;
    if (query.isNew && !p.isNew) return false;
    if (query.inStock) {
      const colors = query.colors.length ? p.colors.filter((c) => query.colors.includes(slugify(c.name))) : p.colors;
      const sizes = query.sizes.length ? p.sizes.filter((s) => query.sizes.includes(s)) : p.sizes;
      const any = colors.some((c) => sizes.some((s) => {
        const n = stockOf(p, c.name, s);
        return n === null || n > 0;
      }));
      if (!any) return false;
    }
    return true;
  });
  return sortProducts(out, query.sort);
}

export function sortProducts(list, sort) {
  const byPrice = (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity);
  const sorters = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || Number(b.isNew) - Number(a.isNew) || a.name.localeCompare(b.name),
    newest: (a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
    'price-asc': byPrice,
    'price-desc': (a, b) => byPrice(b, a),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return [...list].sort(sorters[sort] ?? sorters.featured);
}

/** Filter options derived from the real catalog (never hard-coded). */
export function facets(products) {
  const order = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  const sizes = [...new Set(products.flatMap((p) => p.sizes))]
    .sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
  const colorMap = new Map();
  for (const p of products) for (const c of p.colors) if (!colorMap.has(slugify(c.name))) colorMap.set(slugify(c.name), { id: slugify(c.name), name: c.name, hex: c.hex });
  const styleMap = new Map(products.map((p) => [slugify(p.style), { id: slugify(p.style), name: p.style }]));
  const prices = products.map((p) => p.price).filter((n) => typeof n === 'number');
  return {
    sizes,
    colors: [...colorMap.values()],
    styles: [...styleMap.values()],
    price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
  };
}

// Input validation for every API boundary (customer, cart, admin).

export class ValidationError extends Error {
  constructor(fields) {
    super('Validation failed');
    this.fields = fields; // { fieldName: message }
  }
}

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Trim + strip control chars. Returns null when empty, undefined when invalid/too long. */
export function cleanText(value, { max = 200, multiline = false } = {}) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return undefined;
  let v = value.replace(CONTROL_CHARS, '');
  if (!multiline) v = v.replace(/[\r\n\t]+/g, ' ');
  v = v.trim();
  if (!v) return null;
  return v.length > max ? undefined : v;
}

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SIZE_RE = /^(?:XXS|XS|S|M|L|XL|XXL|XXXL|[0-9]XL|ONE SIZE)$/;
export const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export const UAE_EMIRATES = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah',
];

/** Collects field errors so one response reports everything wrong at once. */
export class Checker {
  constructor() { this.errors = {}; }
  fail(key, msg) { if (!this.errors[key]) this.errors[key] = msg; return undefined; }
  text(key, value, label, { max = 200, required = false, pattern, multiline } = {}) {
    const v = cleanText(value, { max, multiline });
    if (v === undefined) return this.fail(key, `${label} is too long or invalid (max ${max} characters).`);
    if (v === null) return required ? this.fail(key, `${label} is required.`) : null;
    if (pattern && !pattern.test(v)) return this.fail(key, `Enter a valid ${label.toLowerCase()}.`);
    return v;
  }
  money(key, value, label, { required = false, max = 1_000_000 } = {}) {
    if (value === null || value === undefined || value === '') return required ? this.fail(key, `${label} is required.`) : null;
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > max) return this.fail(key, `${label} must be a number between 0 and ${max}.`);
    if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return this.fail(key, `${label} can have at most 2 decimals.`);
    return Math.round(n * 100) / 100;
  }
  int(key, value, label, { min = 0, max = 1_000_000 } = {}) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (!Number.isInteger(n) || n < min || n > max) return this.fail(key, `${label} must be a whole number between ${min} and ${max}.`);
    return n;
  }
  bool(value) { return value === true || value === 'true' || value === 1; }
  url(key, value, label, { https = true, allowRelative = false } = {}) {
    const v = cleanText(value, { max: 500 });
    if (v === undefined) return this.fail(key, `${label} is too long.`);
    if (v === null) return null;
    if (allowRelative && /^\/(?!\/)[\w\-./%]*$/.test(v)) return v;
    try {
      const u = new URL(v);
      if (https ? u.protocol !== 'https:' : !/^https?:$/.test(u.protocol)) throw new Error();
      return u.toString();
    } catch {
      return this.fail(key, `${label} must be a full ${https ? 'https://' : ''} link.`);
    }
  }
  done(value) {
    if (Object.keys(this.errors).length) throw new ValidationError(this.errors);
    return value;
  }
}

/** Customer details at checkout. `regions` maps country -> allowed region list ([] = free text). */
export function validateCustomer(input, { regions }) {
  const c = input && typeof input === 'object' ? input : {};
  const ck = new Checker();
  const out = {
    name: ck.text('name', c.name, 'Full name', { max: 100, required: true }),
    email: ck.text('email', c.email, 'Email', { max: 254, required: true, pattern: EMAIL_RE })?.toLowerCase(),
    phone: ck.text('phone', c.phone, 'Phone number', { max: 20, required: true, pattern: PHONE_RE }),
    address1: ck.text('address1', c.address1, 'Address', { max: 150, required: true }),
    address2: ck.text('address2', c.address2, 'Address line 2', { max: 150 }),
    city: ck.text('city', c.city, 'City / area', { max: 80, required: true }),
    notes: ck.text('notes', c.notes, 'Delivery notes', { max: 500, multiline: true }),
  };
  const country = cleanText(c.country, { max: 80 });
  if (!country || !Object.hasOwn(regions, country)) ck.fail('country', 'Choose a country we deliver to.');
  else {
    out.country = country;
    const allowed = regions[country];
    if (allowed.length) {
      if (!allowed.includes(c.region)) ck.fail('region', 'Choose your emirate / region.');
      else out.region = c.region;
    } else {
      out.region = ck.text('region', c.region, 'Region', { max: 80 });
    }
  }
  return ck.done(out);
}

/** Cart lines: shape only. Prices and stock come from the catalog on the server. */
export function validateCartItems(items) {
  if (!Array.isArray(items)) throw new ValidationError({ items: 'Cart must be a list.' });
  if (items.length > 30) throw new ValidationError({ items: 'Too many items in cart.' });
  return items.map((it, i) => {
    const ok = it && typeof it === 'object'
      && typeof it.slug === 'string' && SLUG_RE.test(it.slug) && it.slug.length <= 80
      && typeof it.color === 'string' && it.color.length > 0 && it.color.length <= 40
      && typeof it.size === 'string' && SIZE_RE.test(it.size)
      && Number.isInteger(it.qty) && it.qty >= 1 && it.qty <= 10;
    if (!ok) throw new ValidationError({ [`items.${i}`]: 'Invalid cart item.' });
    return { slug: it.slug, color: it.color, size: it.size, qty: it.qty };
  });
}

/** Admin product create/update. Returns a normalised product object. */
export function validateProduct(input) {
  const p = input && typeof input === 'object' ? input : {};
  const ck = new Checker();
  const sizes = Array.isArray(p.sizes) ? [...new Set(p.sizes.map((s) => String(s).trim().toUpperCase()))] : [];
  // An empty list means "sizes not confirmed yet": the product shows but can't be ordered.
  if (sizes.length > 12 || !sizes.every((s) => SIZE_RE.test(s))) ck.fail('sizes', 'Use valid sizes (e.g. S, M, L, XL).');
  const colors = Array.isArray(p.colors) ? p.colors.slice(0, 20) : [];
  if (!colors.length) ck.fail('colors', 'Add at least one colour.');
  const outColors = colors.map((c, i) => {
    const name = ck.text(`colors.${i}.name`, c?.name, 'Colour name', { max: 40, required: true });
    if (!HEX_RE.test(c?.hex ?? '')) ck.fail(`colors.${i}.hex`, 'Colour swatch must be a hex value like #151515.');
    let stock = null;
    if (c?.stock !== null && c?.stock !== undefined) {
      stock = {};
      for (const s of sizes) stock[s] = ck.int(`colors.${i}.stock.${s}`, c.stock[s] ?? 0, `Stock for ${name ?? 'colour'} ${s}`, { max: 100000 });
    }
    return { name, hex: c?.hex, stock };
  });
  if (new Set(outColors.map((c) => c.name)).size !== outColors.length) ck.fail('colors', 'Colour names must be unique.');
  const images = (Array.isArray(p.images) ? p.images : []).slice(0, 12).map((img, i) => ({
    src: ck.url(`images.${i}.src`, img?.src, 'Image', { allowRelative: true }),
    alt: ck.text(`images.${i}.alt`, img?.alt, 'Image description', { max: 160 }) ?? '',
    ...(img?.color ? { color: ck.text(`images.${i}.color`, img.color, 'Image colour', { max: 40 }) } : {}),
  }));
  const details = (Array.isArray(p.details) ? p.details : []).slice(0, 15)
    .map((d, i) => ck.text(`details.${i}`, d, 'Detail', { max: 160 })).filter(Boolean);
  const out = {
    slug: ck.text('slug', p.slug, 'URL slug', { max: 80, required: true, pattern: SLUG_RE }),
    name: ck.text('name', p.name, 'Name', { max: 100, required: true }),
    style: ck.text('style', p.style, 'Style', { max: 40, required: true }),
    description: ck.text('description', p.description, 'Description', { max: 2000, multiline: true }),
    details,
    material: ck.text('material', p.material, 'Material', { max: 200 }),
    fit: ck.text('fit', p.fit, 'Fit', { max: 200 }),
    price: ck.money('price', p.price, 'Price', { required: true }),
    sizes,
    colors: outColors,
    images,
    featured: ck.bool(p.featured),
    isNew: ck.bool(p.isNew),
    published: p.published === undefined ? true : ck.bool(p.published),
    sample: ck.bool(p.sample),
    createdAt: /^\d{4}-\d{2}-\d{2}$/.test(p.createdAt ?? '') ? p.createdAt : new Date().toISOString().slice(0, 10),
  };
  return ck.done(out);
}

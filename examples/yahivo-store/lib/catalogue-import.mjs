// Admin "Import Shopify catalogue": loads data/seed/products.yahivo.json into a running store.
// Adds new products and refreshes existing ones (name, photos, sizes, text, price, visibility) while
// keeping stock already recorded for the same colour and size. Products not in the catalogue are
// hidden, never deleted, so past orders and links keep working.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { SEED_DIR } from './db.mjs';
import { validateProduct } from './validate.mjs';

export function catalogueProducts() {
  return JSON.parse(readFileSync(path.join(SEED_DIR, 'products.yahivo.json'), 'utf8')).products;
}

export function importCatalogue(store, products = catalogueProducts()) {
  const existing = new Map(store.listProducts({ includeUnpublished: true }).map((p) => [p.slug, p]));
  const incoming = products.map((raw) => validateProduct(raw));
  const result = { added: 0, updated: 0, hidden: 0, published: 0 };
  // Every product is validated above, so the writes below don't fail half-way.
  {
    for (const p of incoming) {
      const cur = existing.get(p.slug);
      if (cur) {
        for (const c of p.colors) {
          const old = cur.colors.find((x) => x.name === c.name);
          if (old?.stock && c.stock) for (const s of Object.keys(c.stock)) if (old.stock[s] !== undefined) c.stock[s] = old.stock[s];
        }
        result.updated += 1;
      } else result.added += 1;
      if (p.published) result.published += 1;
      store.upsertProduct(p, p.slug);
    }
    const slugs = new Set(incoming.map((p) => p.slug));
    for (const [slug, p] of existing) {
      if (!slugs.has(slug) && p.published) { store.upsertProduct({ ...p, published: false }, slug); result.hidden += 1; }
    }
  }
  return result;
}

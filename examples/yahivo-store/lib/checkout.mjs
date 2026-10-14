// Cart quotes and order placement. The browser only sends slug/colour/size/qty;
// prices, stock, fees and tax always come from the server-side catalog and settings.
import { randomBytes } from 'node:crypto';
import { stockOf } from './catalog.mjs';
import { computeTotals, toMinor, totalsToMajor } from './money.mjs';
import { deliveryRegions, zoneFor } from './settings.mjs';
import { validateCartItems, validateCustomer, ValidationError } from './validate.mjs';

export class CheckoutConflict extends Error {
  constructor(message, quote) { super(message); this.quote = quote; }
}

/** Payment methods are only listed once actually configured. */
export function paymentMethods(settings, { stripe = false, ngenius = false, ziina = false } = {}) {
  const out = [];
  if (ziina) out.push({ id: 'ziina', label: 'Pay with Ziina', description: 'You will be redirected to Ziina’s secure payment page. Card details never touch this site.' });
  if (ngenius) out.push({ id: 'ngenius', label: ziina ? 'Card payment (Network International)' : 'Card payment', description: 'You will be redirected to Network International’s secure payment page. Card details never touch this site.' });
  if (stripe) out.push({ id: 'stripe', label: ngenius || ziina ? 'Card payment (Stripe)' : 'Card payment', description: 'You will be redirected to Stripe’s secure checkout. Card details never touch this site.' });
  if (settings.payments.manualOrderRequests) {
    out.push({ id: 'manual', label: 'Order request — pay later', description: 'No payment is taken online. The store will contact you to confirm the order and arrange payment.' });
  }
  return out;
}

function priceLines(items, products) {
  const lines = [];
  const issues = [];
  const merged = new Map();
  for (const it of items) {
    const key = `${it.slug}|${it.color}|${it.size}`;
    merged.set(key, { ...it, qty: (merged.get(key)?.qty ?? 0) + it.qty });
  }
  for (const [key, it] of merged) {
    const p = products.find((x) => x.slug === it.slug);
    if (!p || !p.colors.some((c) => c.name === it.color) || !p.sizes.includes(it.size)) {
      issues.push({ key, type: 'unavailable', message: 'An item in your cart is no longer available and was removed.' });
      continue;
    }
    const stock = stockOf(p, it.color, it.size);
    if (stock === 0) {
      issues.push({ key, type: 'sold_out', message: `${p.name} (${it.color}, ${it.size}) is sold out.` });
      continue;
    }
    let qty = Math.min(it.qty, 10);
    if (stock !== null && qty > stock) {
      qty = stock;
      issues.push({ key, type: 'qty_reduced', qty, message: `Only ${stock} left of ${p.name} (${it.color}, ${it.size}). Quantity updated.` });
    }
    lines.push({
      key, slug: p.slug, name: p.name, color: it.color, hex: p.colors.find((c) => c.name === it.color).hex,
      size: it.size, qty, unitPrice: p.price, lineTotal: Math.round(p.price * 100 * qty) / 100,
      image: p.images[0] ?? null, sample: Boolean(p.sample),
    });
  }
  return { lines, issues };
}

/**
 * Full price breakdown. `country`/`region` select the delivery zone, `packingId` the
 * packing option. Missing selections are reported, never guessed.
 */
export function quote(input, { settings, products, methods }) {
  const items = validateCartItems(input?.items ?? []);
  const { lines, issues } = priceLines(items, products);
  const itemsMinor = lines.reduce((s, l) => s + toMinor(l.lineTotal), 0);

  let delivery = null;
  const zone = input?.country ? zoneFor(settings, input.country, input.region) : null;
  if (zone) {
    const free = zone.freeOver !== null && itemsMinor >= toMinor(zone.freeOver);
    delivery = { zoneId: zone.id, zoneName: zone.name, fee: free ? 0 : zone.fee, freeApplied: free, freeOver: zone.freeOver, estimate: zone.estimate };
  }
  const options = settings.packing.options;
  const packingOpt = options.find((o) => o.id === input?.packingId) ?? options.find((o) => o.isDefault) ?? null;
  const packing = packingOpt ? { id: packingOpt.id, name: packingOpt.name, fee: packingOpt.fee } : null;

  const t = computeTotals({
    itemsMinor,
    packingMinor: packing ? toMinor(packing.fee) : 0,
    deliveryMinor: delivery ? toMinor(delivery.fee) : 0,
    tax: settings.tax,
  });
  return {
    currency: settings.currency,
    lines, issues,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    delivery,
    deliveryConfigured: settings.delivery.zones.some((z) => z.enabled),
    packing,
    packingOptions: options,
    totals: totalsToMajor(t, settings.tax),
    totalIsFinal: Boolean(delivery) && lines.length > 0,
    paymentMethods: methods,
  };
}

/**
 * Validate, reserve stock and create the order in one transaction.
 * `expectedTotal` must match the server total so the customer always saw the real total.
 */
export function placeOrder(body, { store, settings, methods }) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = {};
  let customer = null;
  try {
    customer = validateCustomer(b.customer, { regions: deliveryRegions(settings) });
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    Object.assign(errors, e.fields);
  }
  if (!methods.length) errors.paymentMethod = 'Online ordering is not available yet.';
  else if (!methods.some((m) => m.id === b.paymentMethod)) errors.paymentMethod = 'Choose a payment method.';
  if (settings.packing.options.length && !settings.packing.options.some((o) => o.id === b.packingId)) errors.packingId = 'Choose a packing option.';

  const products = store.listProducts();
  const q = quote({ items: b.items, country: customer?.country, region: customer?.region, packingId: b.packingId }, { settings, products, methods });
  if (!q.lines.length) errors.items = 'Your cart is empty.';
  if (customer && !q.delivery) errors.region = 'We do not deliver to this area yet.';
  if (Object.keys(errors).length) throw new ValidationError(errors);
  if (q.issues.length) throw new CheckoutConflict('Some items in your cart changed. Please review your order.', q);
  if (typeof b.expectedTotal !== 'number' || Math.abs(b.expectedTotal - q.totals.total) > 0.001) {
    throw new CheckoutConflict('The order total changed. Please review the updated total before placing your order.', q);
  }

  const method = methods.find((m) => m.id === b.paymentMethod);
  return store.transaction(() => {
    for (const l of q.lines) {
      if (!store.adjustStock(l.slug, l.color, l.size, -l.qty)) {
        throw new CheckoutConflict(`${l.name} (${l.color}, ${l.size}) just sold out.`, q);
      }
    }
    const tax = settings.tax.enabled
      ? { name: settings.tax.name, rate: settings.tax.rate, pricesIncludeTax: settings.tax.pricesIncludeTax, registrationNumber: settings.tax.registrationNumber }
      : null;
    const number = store.nextOrderNumber();
    const token = randomBytes(24).toString('base64url');
    const data = {
      currency: q.currency, lines: q.lines, customer, delivery: q.delivery, packing: q.packing,
      totals: q.totals, tax,
      payment: { method: method.id, label: method.label },
      fulfilment: { courierId: null, courierName: null, trackingNumber: null, trackingUrl: null, packingNotes: null },
      internalNotes: null,
      stockReserved: true,
    };
    const id = store.insertOrder({ number, token, email: customer.email, status: 'received', paymentStatus: 'awaiting_payment', data });
    store.addEvent(id, { type: 'status', status: 'received', note: `Order placed (${method.label}).`, actor: 'customer' });
    return { id, number, token, method: method.id };
  });
}

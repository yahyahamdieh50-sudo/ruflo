// Fulfilment helpers: courier/packing CSV export and customer-data removal.
import { STATUS_LABELS } from './orders.mjs';

const PAYMENT_LABELS = { awaiting_payment: 'Awaiting payment', paid: 'Paid', refunded: 'Refunded', failed: 'Failed', expired: 'Expired' };

/** CSV cell: quoted, and neutralised against spreadsheet formula injection. */
function cell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export const CSV_COLUMNS = [
  ['Order', (o) => o.number],
  ['Placed', (o) => o.createdAt],
  ['Status', (o) => STATUS_LABELS[o.status]],
  ['Payment', (o) => PAYMENT_LABELS[o.paymentStatus] ?? o.paymentStatus],
  ['Payment method', (o) => o.payment.label],
  ['Customer', (o) => o.customer.name],
  ['Phone', (o) => o.customer.phone],
  ['Email', (o) => o.email],
  ['Address', (o) => o.customer.address1],
  ['Address 2', (o) => o.customer.address2],
  ['City / area', (o) => o.customer.city],
  ['Emirate / region', (o) => o.customer.region],
  ['Country', (o) => o.customer.country],
  ['Delivery notes', (o) => o.customer.notes],
  ['Delivery zone', (o) => o.delivery?.zoneName],
  ['Items', (o) => o.lines.map((l) => `${l.qty} x ${l.name} (${l.color}, ${l.size})`).join('; ')],
  ['Item count', (o) => o.lines.reduce((s, l) => s + l.qty, 0)],
  ['Packing', (o) => o.packing?.name],
  ['Packing notes', (o) => o.fulfilment.packingNotes],
  ['Courier', (o) => o.fulfilment.courierName],
  ['Tracking number', (o) => o.fulfilment.trackingNumber],
  [`Total`, (o) => o.totals.total.toFixed(2)],
  ['Currency', (o) => o.currency],
];

export function ordersCsv(orders) {
  const rows = [CSV_COLUMNS.map(([h]) => cell(h)).join(',')];
  for (const o of orders) rows.push(CSV_COLUMNS.map(([, get]) => cell(get(o))).join(','));
  // BOM so Excel opens UTF-8 (Arabic names, emoji) correctly.
  return `﻿${rows.join('\r\n')}\r\n`;
}

const REMOVED = '[removed]';
export const ANONYMISABLE = ['delivered', 'cancelled'];

/**
 * Remove a customer's personal data from a finished order (privacy request).
 * Keeps items, totals and tax for your records. Irreversible.
 */
export function anonymiseOrder(store, id, actor = 'admin') {
  return store.transaction(() => {
    const order = store.getOrder(id);
    if (!order) return null;
    if (order.customerRemoved) return order;
    if (!ANONYMISABLE.includes(order.status)) {
      throw Object.assign(new Error('Only delivered or cancelled orders can have customer data removed.'), { code: 'not_final' });
    }
    order.customer = {
      name: REMOVED, phone: REMOVED, address1: REMOVED, address2: null, city: REMOVED,
      region: order.customer.region ?? null, country: order.customer.country, notes: null,
    };
    order.fulfilment = { ...order.fulfilment, packingNotes: null };
    order.internalNotes = null;
    order.customerRemoved = true;
    store.saveOrder(order);
    store.setOrderEmail(id, `removed-${id}@invalid`);
    store.addEvent(id, { type: 'privacy', note: 'Customer personal data removed.', actor });
    return store.getOrder(id);
  });
}

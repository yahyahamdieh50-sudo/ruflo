// Order lifecycle: status workflow, manual courier/tracking, packing notes,
// payment status, and the customer-safe order view.
import { Checker, cleanText, EMAIL_RE } from './validate.mjs';

export const ORDER_STATUSES = ['received', 'preparing', 'packed', 'handed_to_courier', 'delivered', 'cancelled'];
export const STATUS_LABELS = {
  received: 'Received', preparing: 'Preparing', packed: 'Packed',
  handed_to_courier: 'Handed to courier', delivered: 'Delivered', cancelled: 'Cancelled',
};
export const PAYMENT_STATUSES = ['awaiting_payment', 'paid', 'refunded', 'failed', 'expired'];
const FLOW = ORDER_STATUSES.slice(0, 5);

/** Allowed next statuses: forward through the flow, or cancel before delivery. */
export function nextStatuses(status) {
  if (status === 'cancelled' || status === 'delivered') return [];
  const i = FLOW.indexOf(status);
  return [...FLOW.slice(i + 1), 'cancelled'];
}

export function trackingUrl(courier, trackingNumber) {
  if (!courier?.trackingUrlTemplate || !trackingNumber) return null;
  return courier.trackingUrlTemplate.replace('{tracking}', encodeURIComponent(trackingNumber));
}

/** Release reserved stock (used on cancel / expired payment). Idempotent. */
export function releaseStock(store, order) {
  if (!order.stockReserved) return;
  for (const l of order.lines) store.adjustStock(l.slug, l.color, l.size, l.qty);
  order.stockReserved = false;
}

/**
 * Apply an admin update. Every change is recorded as an order event.
 * @returns the updated order
 */
export function updateOrder(store, settings, id, patch, actor = 'admin') {
  return store.transaction(() => {
    const order = store.getOrder(id);
    if (!order) return null;
    const p = patch && typeof patch === 'object' ? patch : {};
    const ck = new Checker();
    const events = [];

    // Courier + tracking (manual workflow — no courier API is connected).
    if ('courierId' in p || 'trackingNumber' in p) {
      const courierId = 'courierId' in p ? p.courierId || null : order.fulfilment.courierId;
      const courier = courierId ? settings.delivery.couriers.find((c) => c.id === courierId) : null;
      if (courierId && !courier) ck.fail('courierId', 'Choose a courier from Delivery settings.');
      const tn = 'trackingNumber' in p ? ck.text('trackingNumber', p.trackingNumber, 'Tracking number', { max: 60, pattern: /^[A-Za-z0-9\- ]+$/ }) : order.fulfilment.trackingNumber;
      if (courier !== undefined && tn !== undefined) {
        const changed = courierId !== order.fulfilment.courierId || tn !== order.fulfilment.trackingNumber;
        order.fulfilment = { ...order.fulfilment, courierId, courierName: courier?.name ?? null, trackingNumber: tn, trackingUrl: trackingUrl(courier, tn) };
        if (changed) events.push({ type: 'courier', note: courier ? `Courier: ${courier.name}${tn ? `, tracking ${tn}` : ''}` : 'Courier cleared' });
      }
    }
    if ('packingNotes' in p) {
      const v = ck.text('packingNotes', p.packingNotes, 'Packing notes', { max: 1000, multiline: true });
      if (v !== undefined && v !== order.fulfilment.packingNotes) {
        order.fulfilment.packingNotes = v;
        events.push({ type: 'packing', note: 'Packing notes updated' });
      }
    }
    if ('internalNotes' in p) {
      const v = ck.text('internalNotes', p.internalNotes, 'Internal notes', { max: 2000, multiline: true });
      if (v !== undefined) order.internalNotes = v;
    }
    if ('paymentStatus' in p && p.paymentStatus !== order.paymentStatus) {
      if (!PAYMENT_STATUSES.includes(p.paymentStatus)) ck.fail('paymentStatus', 'Unknown payment status.');
      else {
        events.push({ type: 'payment', note: `Payment: ${p.paymentStatus.replace('_', ' ')}` });
        order.paymentStatus = p.paymentStatus;
      }
    }
    if ('status' in p && p.status !== order.status) {
      if (!nextStatuses(order.status).includes(p.status)) ck.fail('status', `Cannot move from ${STATUS_LABELS[order.status]} to ${STATUS_LABELS[p.status] ?? p.status}.`);
      else if (p.status === 'handed_to_courier' && !order.fulfilment.courierId) ck.fail('status', 'Record the courier before marking the order as handed to courier.');
      else {
        if (p.status === 'cancelled') releaseStock(store, order);
        order.status = p.status;
        events.push({ type: 'status', status: p.status, note: cleanText(p.note, { max: 300 }) || null });
      }
    }
    ck.done();
    store.saveOrder(order);
    for (const e of events) store.addEvent(id, { ...e, actor });
    return store.getOrder(id);
  });
}

/** Order as shown to the customer (token-gated page). No internal notes. */
export function publicOrder(store, order) {
  return {
    number: order.number,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status],
    paymentStatus: order.paymentStatus,
    createdAt: order.createdAt,
    currency: order.currency,
    lines: order.lines.map(({ name, slug, color, hex, size, qty, unitPrice, lineTotal, image }) => ({ name, slug, color, hex, size, qty, unitPrice, lineTotal, image })),
    customer: { name: order.customer.name, address1: order.customer.address1, address2: order.customer.address2, city: order.customer.city, region: order.customer.region, country: order.customer.country },
    delivery: order.delivery,
    packing: order.packing,
    totals: order.totals,
    tax: order.tax,
    payment: { method: order.payment.method, label: order.payment.label },
    fulfilment: { courierName: order.fulfilment.courierName, trackingNumber: order.fulfilment.trackingNumber, trackingUrl: order.fulfilment.trackingUrl },
    history: store.events(order.id).filter((e) => e.type === 'status').map((e) => ({ at: e.at, status: e.status, label: STATUS_LABELS[e.status] })),
  };
}

/** Order tracking needs both the order number and the email used. */
export function findForTracking(store, number, email) {
  const n = cleanText(number, { max: 20 })?.toUpperCase();
  const e = cleanText(email, { max: 254 })?.toLowerCase();
  if (!n || !e || !EMAIL_RE.test(e)) return null;
  const order = store.getOrderByNumber(n);
  return order && order.email === e ? order : null;
}

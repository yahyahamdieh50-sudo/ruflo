// Stripe Checkout adapter (hosted payment page — card data never reaches this server).
// Active only when STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { toMinor } from './money.mjs';

export function stripeConfigured(env = process.env) {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
}

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/**
 * Build the Checkout Session request. Products, packing, delivery and (exclusive) tax
 * are sent as separate line items so the Stripe page matches our order summary.
 */
export function sessionParams(order, siteUrl) {
  const cur = order.currency.toLowerCase();
  const items = order.lines.map((l) => ({
    price_data: { currency: cur, unit_amount: toMinor(l.unitPrice), product_data: { name: `${l.name} — ${l.color} / ${l.size}` } },
    quantity: l.qty,
  }));
  const extra = (name, amount) => amount > 0 && items.push({ price_data: { currency: cur, unit_amount: toMinor(amount), product_data: { name } }, quantity: 1 });
  if (order.packing) extra(`Packing: ${order.packing.name}`, order.totals.packing);
  if (order.delivery) extra(`Delivery: ${order.delivery.zoneName}`, order.totals.delivery);
  if (order.totals.taxApplied && !order.totals.taxIncluded) extra(order.totals.taxLabel, order.totals.tax);
  return {
    mode: 'payment',
    customer_email: order.email,
    client_reference_id: order.number,
    metadata: { order_id: String(order.id), order_number: order.number },
    line_items: Object.fromEntries(items.map((it, i) => [i, it])),
    success_url: `${siteUrl}/order/${order.token}?payment=success`,
    cancel_url: `${siteUrl}/order/${order.token}?payment=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  };
}

export async function createCheckoutSession(order, { siteUrl, env = process.env, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Idempotency-Key': `order-${order.number}-${order.token.slice(0, 8)}`,
    },
    body: form(sessionParams(order, siteUrl)).toString(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url) throw new Error(`Stripe session failed (${res.status}): ${body.error?.message ?? 'unknown error'}`);
  return { id: body.id, url: body.url };
}

/** Verify a Stripe-Signature header (v1 scheme, 5-minute tolerance). Returns the parsed event or null. */
export function verifyWebhook(rawBody, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return null;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=')).filter((p) => p.length === 2 && p[0] === 't'));
  const sigs = header.split(',').filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowSec - t) > 300 || !sigs.length) return null;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  const ok = sigs.some((s) => {
    const buf = Buffer.from(s, 'hex');
    return buf.length === expected.length && timingSafeEqual(buf, expected);
  });
  if (!ok) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}

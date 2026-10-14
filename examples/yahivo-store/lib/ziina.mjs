// Ziina payment adapter (hosted payment page — card data never reaches this server).
// Active only when ZIINA_API_TOKEN is set. Runs in Ziina TEST mode unless ZIINA_LIVE=1.
//
// Built from the public Ziina API docs: POST /payment_intent → redirect customer to
// redirect_url → GET /payment_intent/{id} for the status. NOT yet tested against a
// real Ziina account: make a test payment before going live (see README).
import { toMinor } from './money.mjs';

export const ZIINA_BASE = 'https://api-v2.ziina.com/api';

export function ziinaConfigured(env = process.env) {
  return Boolean(env.ZIINA_API_TOKEN);
}
export const ziinaLive = (env = process.env) => env.ZIINA_LIVE === '1';

const headers = (env) => ({ Authorization: `Bearer ${env.ZIINA_API_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' });

/** Create a payment intent for the full order total. Returns { reference, url }. */
export async function createZiinaPayment(order, { siteUrl, env = process.env, fetchImpl = fetch }) {
  const back = (outcome) => `${siteUrl}/order/${order.token}?payment=${outcome}`;
  const res = await fetchImpl(`${ZIINA_BASE}/payment_intent`, {
    method: 'POST',
    headers: headers(env),
    body: JSON.stringify({
      amount: toMinor(order.totals.total),
      currency_code: order.currency,
      message: `YAHIVO order ${order.number}`,
      success_url: back('return'),
      cancel_url: back('cancelled'),
      failure_url: back('return'),
      test: !ziinaLive(env),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id || !body.redirect_url) throw new Error(`Ziina payment intent failed (${res.status})`);
  if (!/^https:\/\//.test(body.redirect_url)) throw new Error('Ziina returned an unexpected payment link');
  return { reference: body.id, url: body.redirect_url };
}

/**
 * Ask Ziina for the payment state. Never trusts the redirect: paid only when Ziina
 * reports "completed" AND the amount and currency match the order.
 */
export async function ziinaStatus(order, { env = process.env, fetchImpl = fetch } = {}) {
  const ref = order.payment.providerRef;
  if (!ref) return { status: 'unknown', states: [] };
  const res = await fetchImpl(`${ZIINA_BASE}/payment_intent/${encodeURIComponent(ref)}`, { headers: headers(env) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Ziina status failed (${res.status})`);
  const state = String(body.status ?? '').toLowerCase();
  const amountOk = Number(body.amount) === toMinor(order.totals.total) && String(body.currency_code).toUpperCase() === order.currency;
  if (state === 'completed') return { status: amountOk ? 'paid' : 'mismatch', states: [state] };
  if (state === 'failed' || state === 'canceled') return { status: 'failed', states: [state] };
  return { status: 'pending', states: [state || 'unknown'] };
}

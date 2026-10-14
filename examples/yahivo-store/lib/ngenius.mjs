// Network International N-Genius Online adapter (hosted payment page — card data never
// reaches this server). Active only when NGENIUS_API_KEY and NGENIUS_OUTLET_REF are set.
//
// Built from the public N-Genius docs (access token → create order → redirect to
// _links.payment.href → retrieve order status). NOT yet tested against a sandbox
// account: run a sandbox payment before going live (see README).
import { toMinor } from './money.mjs';

export const SANDBOX_BASE = 'https://api-gateway.sandbox.ngenius-payments.com';
const PAID_STATES = new Set(['PURCHASED', 'CAPTURED']);
const FAILED_STATES = new Set(['FAILED', 'DECLINED', 'CANCELLED', 'REVERSED']);

export function ngeniusConfigured(env = process.env) {
  return Boolean(env.NGENIUS_API_KEY && env.NGENIUS_OUTLET_REF);
}

const base = (env) => (env.NGENIUS_API_BASE || SANDBOX_BASE).replace(/\/$/, '');
const outlet = (env) => encodeURIComponent(env.NGENIUS_OUTLET_REF);

async function accessToken(env, fetchImpl) {
  const res = await fetchImpl(`${base(env)}/identity/auth/access-token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${env.NGENIUS_API_KEY}`,
      'Content-Type': 'application/vnd.ni-identity.v1+json',
      Accept: 'application/vnd.ni-identity.v1+json',
    },
    body: env.NGENIUS_REALM ? JSON.stringify({ realmName: env.NGENIUS_REALM }) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`N-Genius token request failed (${res.status})`);
  return body.access_token;
}

const PAYMENT_TYPE = 'application/vnd.ni-payment.v2+json';

/** Create a hosted-payment order for the full total. Returns { reference, url }. */
export async function createNgeniusOrder(order, { siteUrl, env = process.env, fetchImpl = fetch }) {
  const token = await accessToken(env, fetchImpl);
  const res = await fetchImpl(`${base(env)}/transactions/outlets/${outlet(env)}/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': PAYMENT_TYPE, Accept: PAYMENT_TYPE },
    body: JSON.stringify({
      action: 'PURCHASE',
      amount: { currencyCode: order.currency, value: toMinor(order.totals.total) },
      emailAddress: order.email,
      merchantOrderReference: order.number,
      merchantAttributes: {
        redirectUrl: `${siteUrl}/order/${order.token}?payment=return`,
        cancelUrl: `${siteUrl}/order/${order.token}?payment=cancelled`,
        skipConfirmationPage: true,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  const url = body?._links?.payment?.href;
  if (!res.ok || !body.reference || !url) throw new Error(`N-Genius order failed (${res.status})`);
  if (!/^https:\/\//.test(url)) throw new Error('N-Genius returned an unexpected payment link');
  return { reference: body.reference, url };
}

/**
 * Ask N-Genius for the order's payment state. Never trusts redirect parameters:
 * paid only when the provider reports a paid state AND the amount matches.
 */
export async function ngeniusStatus(order, { env = process.env, fetchImpl = fetch } = {}) {
  const ref = order.payment.providerRef;
  if (!ref) return { status: 'unknown' };
  const token = await accessToken(env, fetchImpl);
  const res = await fetchImpl(`${base(env)}/transactions/outlets/${outlet(env)}/orders/${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: PAYMENT_TYPE },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`N-Genius status failed (${res.status})`);
  const payments = body?._embedded?.payment ?? [];
  const states = payments.map((p) => p?.state).filter(Boolean);
  const amountOk = body?.amount?.value === toMinor(order.totals.total) && body?.amount?.currencyCode === order.currency;
  if (states.some((s) => PAID_STATES.has(s))) return { status: amountOk ? 'paid' : 'mismatch', states };
  if (states.length && states.every((s) => FAILED_STATES.has(s))) return { status: 'failed', states };
  return { status: 'pending', states };
}

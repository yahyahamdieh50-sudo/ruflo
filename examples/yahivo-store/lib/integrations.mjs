// n8n integration: lets an n8n workflow answer WhatsApp / Messenger / Instagram messages with the
// store's AI assistant (POST /api/integrations/chat, bearer token), and sends order events to an
// n8n webhook so n8n can message customers (order placed, status changes, return requests).
// Nothing here talks to Meta directly; the owner's n8n workflows do that with their own credentials.
import { timingSafeEqual, createHash } from 'node:crypto';
import { cleanText } from './validate.mjs';

export const CHANNELS = ['whatsapp', 'messenger', 'instagram', 'other'];
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_CONVERSATIONS = 5000;

/** The chat endpoint is enabled only with a long random N8N_API_TOKEN. */
export function integrationTokenOk(env, header) {
  const token = env.N8N_API_TOKEN;
  if (typeof token !== 'string' || token.length < 24) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!m) return false;
  const digest = (s) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(m[1].trim()), digest(token));
}

/** Short per-customer chat memory (in memory only; forgotten after 24 h or a restart). */
export class Conversations {
  #map = new Map();

  history(key, now = Date.now()) {
    const c = this.#map.get(key);
    if (!c || now - c.at > TTL_MS) { this.#map.delete(key); return []; }
    return c.messages;
  }

  add(key, role, content, now = Date.now()) {
    const messages = [...this.history(key, now), { role, content }].slice(-MAX_MESSAGES);
    this.#map.delete(key);
    this.#map.set(key, { at: now, messages });
    if (this.#map.size > MAX_CONVERSATIONS) this.#map.delete(this.#map.keys().next().value);
  }
}

/** Validate an n8n chat request body. */
export function parseChatRequest(b) {
  const channel = CHANNELS.includes(b?.channel) ? b.channel : null;
  const userId = cleanText(b?.userId, { max: 100 });
  const text = cleanText(b?.text, { max: 1000, multiline: true });
  if (!channel || !userId || !text) return null;
  return { channel, userId, text };
}

/** Assistant answer → plain text for chat apps (links become full URLs). */
export function plainReply(out, siteUrl, currency) {
  const parts = [out.reply];
  for (const p of out.products ?? []) parts.push(`• ${p.name} — ${currency} ${Number(p.price).toFixed(2)}: ${siteUrl}/product/${p.slug}`);
  for (const l of out.links ?? []) parts.push(`${l.label}: ${l.href.startsWith('/') ? siteUrl + l.href : l.href}`);
  return parts.filter(Boolean).join('\n');
}

/** What n8n receives for an order event. Contact details are included so n8n can message the customer. */
export function orderEventPayload(type, order, { siteUrl, statusLabel }) {
  return {
    event: type,
    at: new Date().toISOString(),
    order: {
      number: order.number,
      status: order.status,
      statusLabel,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.payment?.label ?? null,
      total: order.totals.total,
      currency: order.currency,
      items: order.lines.map((l) => ({ name: l.name, color: l.color, size: l.size, qty: l.qty })),
      orderUrl: `${siteUrl}/order/${order.token}`,
      courierName: order.fulfilment?.courierName ?? null,
      trackingNumber: order.fulfilment?.trackingNumber ?? null,
      trackingUrl: order.fulfilment?.trackingUrl ?? null,
      returnRequest: order.returnRequest ? { reason: order.returnRequest.reason, at: order.returnRequest.at } : null,
      customer: order.customerRemoved ? null : { name: order.customer.name, email: order.customer.email ?? order.email, phone: order.customer.phone, city: order.customer.city, region: order.customer.region },
    },
  };
}

/**
 * Sends order events to N8N_WEBHOOK_URL (with the X-YAHIVO-Token header = N8N_WEBHOOK_SECRET).
 * Fire-and-forget: never throws and never delays the customer; failures are logged.
 */
export function createNotifier({ env, fetchImpl = fetch, siteUrl, statusLabels }) {
  const pending = new Set();
  const url = env.N8N_WEBHOOK_URL;
  const enabled = typeof url === 'string' && /^https?:\/\//.test(url);
  function send(type, order) {
    if (!enabled || !order) return Promise.resolve(false);
    const body = JSON.stringify(orderEventPayload(type, order, { siteUrl, statusLabel: statusLabels[order.status] }));
    const p = fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env.N8N_WEBHOOK_SECRET ? { 'X-YAHIVO-Token': env.N8N_WEBHOOK_SECRET } : {}) },
      body,
      signal: AbortSignal.timeout(10_000),
    }).then((res) => {
      if (!res.ok) console.error(`[n8n] ${type} ${order.number}: HTTP ${res.status}`);
      return res.ok;
    }).catch((e) => { console.error(`[n8n] ${type} ${order.number}:`, e.message); return false; })
      .finally(() => pending.delete(p));
    pending.add(p);
    return p;
  }
  return { enabled, send, flush: () => Promise.allSettled([...pending]) };
}

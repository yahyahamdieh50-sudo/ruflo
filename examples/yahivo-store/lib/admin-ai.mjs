// Owner's AI admin assistant: a daily summary, plus plain-language commands
// ("mark YH-1003 packed", "set Crown black M stock to 5") turned into proposed actions.
// Nothing changes until the owner presses Confirm; every action is re-validated and applied
// through the same functions the admin pages use.
import { STATUS_LABELS, updateOrder } from './orders.mjs';
import { validateProduct } from './validate.mjs';
import { DEFAULT_MODEL, loadSdk } from './assistant.mjs';

const fmtMoney = (n, cur) => `${cur} ${Number(n).toFixed(2)}`;
// Store days follow UAE time (UTC+4, no daylight saving).
const dubaiDay = (iso) => new Date(new Date(iso).getTime() + 4 * 3600_000).toISOString().slice(0, 10);
const LOW_STOCK = 2;

/** Facts for today's to-do list. Computed from data only; never guessed. */
export function dailySummary(store, now = new Date()) {
  const today = dubaiDay(now.toISOString());
  const { orders } = store.listOrders({ limit: 1000 });
  const brief = (o) => ({ number: o.number, status: STATUS_LABELS[o.status], items: o.lines.map((l) => `${l.qty}× ${l.name} (${l.color}, ${l.size})`).join('; '), total: fmtMoney(o.totals.total, o.currency), region: o.customer.region ?? '' });
  const lowStock = [];
  const soldOut = [];
  for (const p of store.listProducts()) {
    for (const c of p.colors) {
      if (!c.stock) continue;
      for (const s of p.sizes) {
        const n = c.stock[s] ?? 0;
        if (n === 0) soldOut.push(`${p.name} ${c.name} ${s}`);
        else if (n <= LOW_STOCK) lowStock.push(`${p.name} ${c.name} ${s}: ${n} left`);
      }
    }
  }
  return {
    date: today,
    newToday: orders.filter((o) => dubaiDay(o.createdAt) === today && o.status !== 'cancelled').map(brief),
    toPrepare: orders.filter((o) => o.status === 'received' || o.status === 'preparing').map(brief),
    readyForCourier: orders.filter((o) => o.status === 'packed').map(brief),
    withCourier: orders.filter((o) => o.status === 'handed_to_courier').map(brief),
    cashToCollect: orders.filter((o) => o.status === 'delivered' && o.paymentStatus === 'awaiting_payment').map(brief),
    lowStock,
    soldOut,
  };
}

export function summaryText(s) {
  const list = (arr) => arr.map((o) => `  • ${o.number} — ${o.items} — ${o.total}${o.region ? ` — ${o.region}` : ''}`).join('\n');
  const out = [`Summary for ${s.date}:`];
  out.push(s.newToday.length ? `${s.newToday.length} new order${s.newToday.length === 1 ? '' : 's'} today.` : 'No new orders today yet.');
  if (s.toPrepare.length) out.push(`To prepare and pack (${s.toPrepare.length}):\n${list(s.toPrepare)}`);
  if (s.readyForCourier.length) out.push(`Packed, waiting for iMile pickup (${s.readyForCourier.length}):\n${list(s.readyForCourier)}`);
  if (s.withCourier.length) out.push(`With the courier (${s.withCourier.length}):\n${list(s.withCourier)}`);
  if (s.cashToCollect.length) out.push(`Delivered but cash not marked paid (${s.cashToCollect.length}) — mark paid when iMile pays you:\n${list(s.cashToCollect)}`);
  if (s.lowStock.length) out.push(`Low stock:\n${s.lowStock.map((x) => `  • ${x}`).join('\n')}`);
  if (s.soldOut.length) out.push(`Sold out: ${s.soldOut.length} size${s.soldOut.length === 1 ? '' : 's'} (${s.soldOut.slice(0, 6).join(', ')}${s.soldOut.length > 6 ? ', …' : ''}).`);
  if (!s.toPrepare.length && !s.readyForCourier.length && !s.cashToCollect.length) out.push('Nothing waiting on you right now.');
  return out.join('\n\n');
}

// ---------- commands → proposed actions

const STATUS_WORDS = [
  [/\b(prepar(e|ing)|start(ed)?)\b/i, 'preparing'],
  [/\bpack(ed)?\b/i, 'packed'],
  [/\b(shipped|handed|sent|picked up|dispatched|courier)\b/i, 'handed_to_courier'],
  [/\bdeliver(ed)?\b/i, 'delivered'],
  [/\bcancel(led)?\b/i, 'cancelled'],
];
const ORDER_NUM = /\bYH[-\s]?(\d{4,7})\b/gi;
const SIZE_RE = /\b(XXS|XS|S|M|L|XL|XXL|2XL|3XL)\b/i;
const STOP = new Set(['set', 'stock', 'to', 'the', 'of', 'for', 'size', 'colour', 'color', 'hoodie', 'yahivo', 'oversized', 'make', 'change', 'update', 'qty', 'quantity', 'in', 'is']);

function findProduct(text, products) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  let best = null;
  for (const p of products) {
    const name = p.name.toLowerCase();
    const score = words.filter((w) => name.includes(w)).length;
    if (score && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

/** Deterministic parser (works without an API key). Returns { reply, actions }. */
export function parseCommand(text, { store, settings }) {
  const t = String(text ?? '').trim();
  if (!t) return { reply: 'Type a request, for example “mark YH-1003 packed”.', actions: [] };
  if (/\b(summary|today|to ?do|what.*(pack|do)|overview)\b/i.test(t) && !ORDER_NUM.test(t)) {
    return { reply: summaryText(dailySummary(store)), actions: [] };
  }
  ORDER_NUM.lastIndex = 0;
  const numbers = [...t.matchAll(ORDER_NUM)].map((m) => `YH-${m[1]}`);
  if (numbers.length) {
    const actions = [];
    const paid = /\b(paid|cash (received|collected))\b/i.test(t);
    const status = STATUS_WORDS.find(([re]) => re.test(t.replace(/\bpaid\b/i, '')))?.[1] ?? null;
    const tracking = t.match(/\b(\d{8,20}|[A-Z]{2}\d{6,18}[A-Z]{0,2})\b/)?.[1] ?? null;
    const courier = settings.delivery.couriers.find((c) => new RegExp(`\\b${c.name.replace(/[^a-z0-9]/gi, '')}\\b`, 'i').test(t)) ?? (settings.delivery.couriers.length === 1 ? settings.delivery.couriers[0] : null);
    for (const number of numbers) {
      if (status === 'handed_to_courier') actions.push({ type: 'ship', number, courierId: courier?.id ?? null, trackingNumber: tracking });
      else if (status) actions.push({ type: 'status', number, status });
      if (paid) actions.push({ type: 'paid', number });
    }
    if (!actions.length) {
      const o = store.getOrderByNumber(numbers[0]);
      return { reply: o ? `${o.number}: ${STATUS_LABELS[o.status]}, payment ${o.paymentStatus.replace('_', ' ')}, total ${fmtMoney(o.totals.total, o.currency)}. Items: ${o.lines.map((l) => `${l.qty}× ${l.name} (${l.color}, ${l.size})`).join('; ')}.` : `I can’t find order ${numbers[0]}.`, actions: [] };
    }
    return { reply: 'Here is what I’ll do. Check it and press Confirm:', actions };
  }
  if (/\bstock\b/i.test(t)) {
    const products = store.listProducts({ includeUnpublished: true });
    const p = findProduct(t, products);
    const qty = t.match(/\b(?:to|=|at)\s*(\d{1,4})\b/i)?.[1] ?? t.match(/\b(\d{1,4})\s*(?:pcs|pieces|units)?\s*$/i)?.[1];
    if (!p) return { reply: 'Which product? For example: “set Crown black M stock to 5”.', actions: [] };
    const color = [...p.colors].sort((a, b) => b.name.length - a.name.length).find((c) => t.toLowerCase().includes(c.name.toLowerCase())) ?? (p.colors.length === 1 ? p.colors[0] : null);
    const size = t.match(SIZE_RE)?.[1]?.toUpperCase();
    if (!color || !size || qty === undefined) return { reply: `For ${p.name}, tell me the colour (${p.colors.map((c) => c.name).join(', ')}), the size (${p.sizes.join(', ')}) and the new quantity.`, actions: [] };
    return { reply: 'Here is what I’ll do. Check it and press Confirm:', actions: [{ type: 'stock', slug: p.slug, color: color.name, size, qty: Number(qty) }] };
  }
  if (/\blow stock|sold out\b/i.test(t)) {
    const s = dailySummary(store);
    return { reply: [s.lowStock.length ? `Low stock:\n${s.lowStock.join('\n')}` : 'Nothing is low on stock.', s.soldOut.length ? `Sold out: ${s.soldOut.join(', ')}` : ''].filter(Boolean).join('\n\n'), actions: [] };
  }
  return { reply: 'I can show today’s summary, check an order (“YH-1003”), update orders (“mark YH-1003 packed”, “YH-1003 shipped with iMile 6031225370927”, “YH-1003 paid”, “cancel YH-1003”) and stock (“set Crown black M stock to 5”).', actions: [] };
}

/** Validate an action against live data; returns { ok, description, error }. */
export function checkAction(a, { store, settings }) {
  if (!a || typeof a !== 'object') return { ok: false, description: 'Unknown action', error: 'Unknown action.' };
  if (a.type === 'stock') {
    const p = store.getProduct(a.slug, { includeUnpublished: true });
    const c = p?.colors.find((x) => x.name === a.color);
    const description = `Set stock of ${p?.name ?? a.slug} — ${a.color}, size ${a.size} to ${a.qty}`;
    if (!p || !c || !p.sizes.includes(a.size)) return { ok: false, description, error: 'That product, colour or size doesn’t exist.' };
    if (!Number.isInteger(a.qty) || a.qty < 0 || a.qty > 9999) return { ok: false, description, error: 'Quantity must be a whole number from 0 to 9999.' };
    return { ok: true, description: `${description} (now ${c.stock?.[a.size] ?? 'not tracked'})` };
  }
  const o = typeof a.number === 'string' ? store.getOrderByNumber(a.number.toUpperCase()) : null;
  if (!o) return { ok: false, description: `Order ${a.number ?? '?'}`, error: 'Order not found.' };
  if (a.type === 'paid') return o.paymentStatus === 'paid' ? { ok: false, description: `Mark ${o.number} as paid`, error: 'Already paid.' } : { ok: true, description: `Mark ${o.number} as paid (cash received)` };
  if (a.type === 'status') {
    if (!STATUS_LABELS[a.status]) return { ok: false, description: `Update ${o.number}`, error: 'Unknown status.' };
    return { ok: true, description: `Move ${o.number} from ${STATUS_LABELS[o.status]} to ${STATUS_LABELS[a.status]}${a.status === 'cancelled' ? ' (stock goes back)' : ''}` };
  }
  if (a.type === 'ship') {
    const courier = settings.delivery.couriers.find((c) => c.id === a.courierId);
    const description = `Mark ${o.number} handed to ${courier?.name ?? 'courier'}${a.trackingNumber ? `, tracking ${a.trackingNumber}` : ''}`;
    if (!courier) return { ok: false, description, error: 'Add the courier in Delivery settings first, or name it (e.g. “with iMile”).' };
    if (!a.trackingNumber) return { ok: false, description, error: 'Include the tracking number.' };
    return { ok: true, description };
  }
  return { ok: false, description: 'Unknown action', error: 'Unknown action.' };
}

/** Apply one confirmed action through the normal admin code paths. Throws on invalid transitions. */
export function applyAction(a, { store, settings }) {
  if (a.type === 'stock') {
    const p = store.getProduct(a.slug, { includeUnpublished: true });
    const next = { ...p, colors: p.colors.map((c) => (c.name === a.color ? { ...c, stock: { ...(c.stock ?? {}), [a.size]: a.qty } } : c)) };
    store.upsertProduct(validateProduct(next));
    return;
  }
  const o = store.getOrderByNumber(a.number.toUpperCase());
  const actor = 'admin (via AI assistant)';
  if (a.type === 'paid') updateOrder(store, settings, o.id, { paymentStatus: 'paid' }, actor);
  else if (a.type === 'status') updateOrder(store, settings, o.id, { status: a.status }, actor);
  else if (a.type === 'ship') updateOrder(store, settings, o.id, { courierId: a.courierId, trackingNumber: a.trackingNumber, status: 'handed_to_courier' }, actor);
}

// ---------- full AI mode (ANTHROPIC_API_KEY): Claude maps the request to the same proposed actions

const NULLABLE = (type) => ({ type: [type, 'null'] });
const ACTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions'],
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'number', 'status', 'courierId', 'trackingNumber', 'slug', 'color', 'size', 'qty'],
        properties: {
          type: { type: 'string', enum: ['status', 'paid', 'ship', 'stock'] },
          number: NULLABLE('string'), status: NULLABLE('string'), courierId: NULLABLE('string'), trackingNumber: NULLABLE('string'),
          slug: NULLABLE('string'), color: NULLABLE('string'), size: NULLABLE('string'), qty: NULLABLE('integer'),
        },
      },
    },
  },
};

const ADMIN_SYSTEM = `You are the AI admin assistant for the owner of the YAHIVO hoodie store (UAE, cash on delivery, courier iMile).
Answer the owner's questions from the STORE DATA only, and turn requests to change orders or stock into actions:
- status: move an order (number) to status preparing | packed | delivered | cancelled.
- ship: order handed to the courier; needs courierId (from couriers) and trackingNumber.
- paid: cash received for an order.
- stock: set stock for a product (slug), colour (exact colour name), size, to qty.
Use only order numbers, slugs, colour names, sizes and courier ids that exist in the data. Never invent them; if something is missing, ask in "reply" and return no actions.
Actions are proposals: the owner reviews and confirms them before anything changes. Keep "reply" short and plain.`;

function adminKnowledge(store, settings) {
  const { orders } = store.listOrders({ limit: 60 });
  return {
    summary: dailySummary(store),
    couriers: settings.delivery.couriers.map((c) => ({ id: c.id, name: c.name })),
    orders: orders.map((o) => ({ number: o.number, status: o.status, payment: o.paymentStatus, placed: o.createdAt.slice(0, 10), total: o.totals.total, items: o.lines.map((l) => `${l.qty}× ${l.name} (${l.color}, ${l.size})`), courier: o.fulfilment.courierName, tracking: o.fulfilment.trackingNumber })),
    products: store.listProducts({ includeUnpublished: true }).map((p) => ({ slug: p.slug, name: p.name, published: p.published, sizes: p.sizes, colors: p.colors.map((c) => ({ name: c.name, stock: c.stock })) })),
  };
}

/** Live mode. Returns null on any failure so the caller can fall back to parseCommand. */
export async function liveCommand(text, { store, settings }, env) {
  const Anthropic = await loadSdk();
  if (!env.ANTHROPIC_API_KEY || !Anthropic) return null;
  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.beta.messages.create({
      model: env.YAHIVO_AI_MODEL || DEFAULT_MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ACTIONS_SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `${ADMIN_SYSTEM}\n\nSTORE DATA:\n${JSON.stringify(adminKnowledge(store, settings))}`,
      messages: [{ role: 'user', content: String(text).slice(0, 1000) }],
    });
    if (response.stop_reason !== 'end_turn') return null;
    const out = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
    const actions = (out.actions ?? []).slice(0, 20).map((a) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== null)));
    return { reply: String(out.reply ?? ''), actions };
  } catch (e) {
    console.error('[admin-ai] live request failed, using basic parser:', e?.status ?? '', e?.message);
    return null;
  }
}

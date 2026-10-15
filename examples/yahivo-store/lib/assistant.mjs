// AI shopping assistant. Answers only from store data. Live mode uses Claude via the
// official SDK when ANTHROPIC_API_KEY is set (server-side only); otherwise a clearly
// labelled demo mode answers with deterministic rules over the same data.
import { publicProduct, stockOf } from './catalog.mjs';
import { cleanText } from './validate.mjs';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const fmt = (n, cur) => (n === null || n === undefined ? 'not set' : `${cur} ${Number(n).toFixed(2)}`);

export function contactLine(settings) {
  const c = settings.contact;
  const ways = [c.email && `email ${c.email}`, c.whatsapp && `WhatsApp ${c.whatsapp}`, c.phone && `phone ${c.phone}`].filter(Boolean);
  return ways.length ? `Please contact the YAHIVO team (${ways.join(', ')}) or use the Contact page.` : 'Please use the Contact page — the store’s contact details will be listed there.';
}

/** Compact, verified knowledge sent to the live model. */
export function knowledge(settings, products) {
  const cur = settings.currency;
  return {
    currency: cur,
    products: products.map((p) => ({
      slug: p.slug, name: p.name, style: p.style, price: p.price, description: p.description,
      material: p.material ?? 'not provided', fit: p.fit ?? 'not provided', details: p.details,
      sizes: p.sizes, sample: p.sample,
      colors: p.colors.map((c) => ({ name: c.name, stockBySize: c.stock ?? 'not tracked' })),
    })),
    delivery: settings.delivery.zones.filter((z) => z.enabled).map((z) => ({ zone: z.name, country: z.country, areas: z.areas, fee: z.fee, freeOver: z.freeOver, estimate: z.estimate ?? 'not provided' })),
    packing: settings.packing.options.map((o) => ({ name: o.name, fee: o.fee, description: o.description })),
    tax: settings.tax.enabled ? { name: settings.tax.name, rate: settings.tax.rate, pricesIncludeTax: settings.tax.pricesIncludeTax } : 'no tax is configured; tax is shown at checkout if it applies',
    returnsPolicy: settings.policies.returns ?? 'not published',
    shippingPolicy: settings.policies.shipping ?? 'not published',
    sizeGuide: settings.sizeGuide.rows.length ? settings.sizeGuide : 'measurements not published',
    faqs: settings.faqs,
    cashOnDelivery: settings.payments.manualOrderRequests === true,
    contact: contactLine(settings),
  };
}

const SIZE_TOKENS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Extract shopping preferences from free text. */
export function parsePrefs(text, products) {
  const lower = text.toLowerCase();
  const colors = [...new Set(products.flatMap((p) => p.colors.map((c) => c.name)))]
    .filter((name) => lower.includes(name.toLowerCase()) || (name.toLowerCase().includes('grey') && /\bgray\b/.test(lower)));
  const styles = [...new Set(products.map((p) => p.style))]
    .filter((s) => lower.includes(s.toLowerCase()) || (s.toLowerCase().startsWith('zip') && /\bzip/.test(lower)));
  const sizeMatch = text.match(/\bsize\s*(xxs|xs|s|m|l|xl|xxl|xxxl)\b/i) || text.match(/\b(XXS|XS|XXL|XXXL|XL|S|M|L)\b/);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;
  const budgetMatch = lower.match(/(?:under|below|less than|max(?:imum)?|up to|budget(?: of| is)?|<)\s*(?:aed|dhs?|dirhams?)?\s*(\d{2,5})/) || lower.match(/(\d{2,5})\s*(?:aed|dhs?|dirhams?)/);
  const budget = budgetMatch ? Number(budgetMatch[1]) : null;
  return { colors, styles, size: SIZE_TOKENS.includes(size) ? size : null, budget };
}

export function recommend(products, prefs, limit = 3) {
  return products.filter((p) => {
    if (prefs.budget !== null && (p.price === null || p.price > prefs.budget)) return false;
    if (prefs.styles.length && !prefs.styles.includes(p.style)) return false;
    const colors = prefs.colors.length ? p.colors.filter((c) => prefs.colors.includes(c.name)) : p.colors;
    if (!colors.length) return false;
    // Sizes not confirmed yet: only suggest it when no size was requested and it isn't sold out.
    if (!p.sizes.length) return !prefs.size && colors.some((c) => !c.stock);
    const sizes = prefs.size ? [prefs.size] : p.sizes;
    return colors.some((c) => sizes.some((s) => { const n = stockOf(p, c.name, s); return n === null || n > 0; }));
  }).sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, limit);
}

const ORDER_RE = /\bYH[-\s]?(\d{4,7})\b/i;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Order number + checkout email the customer typed in this chat (latest of each), or null. */
export function orderRefFrom(history) {
  let number = null;
  let email = null;
  for (const m of history) {
    if (m.role !== 'user') continue;
    const n = m.content.match(ORDER_RE);
    if (n) number = `YH-${n[1]}`;
    const e = m.content.match(EMAIL_IN_TEXT);
    if (e) email = e[0];
  }
  return number && email ? { number, email } : null;
}

const PAYMENT_TEXT = { paid: 'paid', awaiting_payment: 'not paid yet', refunded: 'refunded', failed: 'payment failed', expired: 'payment expired' };

/** What the assistant may tell a customer about their own (verified) order. No address or internal notes. */
export function orderFacts(o) {
  return {
    number: o.number,
    status: o.statusLabel,
    placedOn: String(o.createdAt).slice(0, 10),
    lastUpdate: String(o.history.at(-1)?.at ?? o.createdAt).slice(0, 10),
    items: o.lines.map((l) => `${l.qty} × ${l.name} (${l.color}, size ${l.size})`),
    total: fmt(o.totals.total, o.currency),
    payment: `${o.payment.label} (${PAYMENT_TEXT[o.paymentStatus] ?? o.paymentStatus})`,
    courier: o.fulfilment.courierName ?? null,
    trackingNumber: o.fulfilment.trackingNumber ?? null,
    trackingLink: o.fulfilment.trackingUrl ?? null,
  };
}

function orderStatusReply(lookup, settings) {
  const contact = contactLine(settings);
  if (lookup.status === 'limited') return { reply: `Too many order checks from this device. Please wait 10 minutes, or use the Track order page. ${contact}`, links: [{ href: '/track', label: 'Track an order' }] };
  if (lookup.status === 'not_found') return { reply: `I couldn’t find order ${lookup.number} with that email. Please check both match your order confirmation (the email must be the one used at checkout).`, links: [{ href: '/track', label: 'Track an order' }] };
  const f = orderFacts(lookup.order);
  const lines = [
    `Order ${f.number}: ${f.status} (last update ${f.lastUpdate}).`,
    `Items: ${f.items.join('; ')}.`,
    `Total: ${f.total}. Payment: ${f.payment}.`,
    f.courier ? `Courier: ${f.courier}${f.trackingNumber ? `, tracking number ${f.trackingNumber}` : ''}.${f.trackingLink ? `\nTrack it here: ${f.trackingLink}` : ''}` : 'It hasn’t been handed to the courier yet.',
    lookup.order.status === CANCELLABLE && lookup.order.paymentStatus !== 'paid'
      ? `Want to cancel it? Reply exactly: CANCEL ${f.number}. For other changes, ${contact.charAt(0).toLowerCase()}${contact.slice(1)}`
      : `For changes, ${contact.charAt(0).toLowerCase()}${contact.slice(1)}`,
  ];
  return { reply: lines.join('\n') };
}

// "CANCEL YH-1001" (optionally "yes, cancel order YH-1001") — the only message that actually cancels.
const CANCEL_CONFIRM_RE = /^\s*(?:yes[,\s]+)?cancel\s+(?:order\s+)?YH[-\s]?(\d{4,7})\s*[.!]?\s*$/i;
const CANCEL_INTENT_RE = /\bcancel/i;
const CANCELLABLE = 'received';

/**
 * Customer self-service cancellation. Deterministic in both modes: the model never cancels anything.
 * Returns a reply, or null when the message isn't about cancelling this verified order.
 */
export function cancellationReply(message, orderLookup, ctx) {
  if (!orderLookup || orderLookup.status !== 'found' || !CANCEL_INTENT_RE.test(message)) return null;
  const o = orderLookup.order;
  const contact = contactLine(ctx.settings);
  if (o.status === 'cancelled') return { reply: `Order ${o.number} is already cancelled.` };
  if (o.status !== CANCELLABLE || o.paymentStatus === 'paid') {
    return { reply: `Order ${o.number} is already ${o.statusLabel.toLowerCase()}, so I can’t cancel it automatically. ${contact}` };
  }
  const confirm = message.match(CANCEL_CONFIRM_RE);
  if (confirm && `YH-${confirm[1]}` === o.number && ctx.cancelOrder) {
    const done = ctx.cancelOrder();
    return done
      ? { reply: `Done. Order ${o.number} is cancelled and nothing will be charged. If you want different sizes or colours, you can place a new order any time.`, links: [{ href: '/shop', label: 'Shop hoodies' }] }
      : { reply: `I couldn’t cancel order ${o.number} automatically. ${contact}` };
  }
  return { reply: `I can cancel order ${o.number} for you (${orderFacts(o).items.join('; ')}, ${orderFacts(o).total}). It hasn’t been prepared yet. To confirm, reply exactly:\nCANCEL ${o.number}` };
}

const has = (text, words) => words.some((w) => new RegExp(`\\b${w}`, 'i').test(text));

/** Deterministic, data-grounded replies (demo mode). */
export function demoReply(message, { settings, products }, orderLookup = null) {
  const cur = settings.currency;
  const contact = contactLine(settings);
  const sampleNote = products.some((p) => p.sample) ? ' (Note: the catalogue is currently sample data.)' : '';

  const givesOrderDetails = ORDER_RE.test(message) || EMAIL_IN_TEXT.test(message);
  if (has(message, ['order', 'track', 'tracking', 'where is my', 'status', 'parcel', 'cancel', 'deliver(ed|y) yet']) || givesOrderDetails) {
    if (orderLookup) return orderStatusReply(orderLookup, settings);
    return { reply: `I can check your order for you. Please send your order number (it looks like YH-1001) and the email you used at checkout. I can’t change or cancel orders myself; for that, ${contact.charAt(0).toLowerCase()}${contact.slice(1)}`, links: [{ href: '/track', label: 'Track an order' }] };
  }
  if (has(message, ['return', 'refund', 'exchange'])) {
    const p = settings.policies.returns;
    return { reply: p ? `Here is the store’s returns policy:\n\n${p}` : `The returns policy hasn’t been published yet, so I can’t confirm returns or exchanges. ${contact}`, links: [{ href: '/shipping-returns', label: 'Shipping & returns' }] };
  }
  if (has(message, ['tax', 'vat'])) {
    const t = settings.tax;
    return { reply: t.enabled ? `${t.name} at ${t.rate}% is applied; prices ${t.pricesIncludeTax ? 'already include' : 'exclude'} it. The exact amount is shown at checkout before you order.` : 'No tax is currently configured for this store. Any tax that applies will be shown at checkout before you place an order.' };
  }
  if (has(message, ['pack', 'gift', 'box', 'wrap'])) {
    const o = settings.packing.options;
    return { reply: o.length ? `Packing options:\n${o.map((x) => `• ${x.name} — ${x.fee ? fmt(x.fee, cur) : 'no charge'}${x.description ? ` (${x.description})` : ''}`).join('\n')}` : `Packing options haven’t been set up yet. ${contact}` };
  }
  if (has(message, ['ship', 'deliver', 'courier', 'how long', 'arrive', 'shipping cost'])) {
    const zones = settings.delivery.zones.filter((z) => z.enabled);
    if (!zones.length) return { reply: `Delivery areas and fees haven’t been published yet, so I can’t quote delivery. ${contact}` };
    return {
      reply: `Delivery fees:\n${zones.map((z) => `• ${z.name}${z.areas.length && z.areas.join() !== z.name ? ` (${z.areas.join(', ')})` : ''} — ${fmt(z.fee, cur)}${z.freeOver !== null ? `, free over ${fmt(z.freeOver, cur)}` : ''}${z.estimate ? `, estimate: ${z.estimate}` : ''}`).join('\n')}\nYour exact fee is shown at checkout once you choose your area. I can’t promise a specific delivery date.`,
      links: [{ href: '/shipping-returns', label: 'Shipping & returns' }],
    };
  }
  if (has(message, ['pay', 'card', 'cash', 'apple pay'])) {
    return { reply: settings.payments.manualOrderRequests ? 'You can pay cash on delivery: nothing is charged online, and you pay the total shown at checkout when your order arrives. All available payment options are listed at checkout.' : 'Available payment options are shown at checkout. Only methods that are actually set up are listed there.' };
  }
  if (has(message, ['contact', 'email', 'phone', 'whatsapp', 'call', 'human', 'someone'])) {
    return { reply: contact, links: [{ href: '/contact', label: 'Contact page' }] };
  }
  const named = products.find((p) => message.toLowerCase().includes(p.name.toLowerCase()));
  if (named && !has(message, ['recommend', 'suggest'])) {
    const stockText = named.sizes.length
      ? named.colors.map((c) => `${c.name}: ${named.sizes.map((s) => { const n = stockOf(named, c.name, s); return `${s} ${n === null ? '(ask)' : n > 0 ? '✓' : 'sold out'}`; }).join(', ')}`).join('\n')
      : `Colours: ${named.colors.map((c) => `${c.name}${c.stock ? ' (sold out)' : ''}`).join(', ')}. Sizes haven’t been confirmed yet. ${contact}`;
    return {
      reply: `${named.name} — ${named.style}, ${fmt(named.price, cur)}.\nMaterial: ${named.material ?? 'not provided yet'}. Fit: ${named.fit ?? 'not provided yet'}.\n${stockText}${sampleNote}`,
      products: [publicProduct(named)],
    };
  }
  // Sizing questions ("which size should I get?") — not "black hoodie size M", which is a product search.
  if (has(message, ['sizing', 'measure', 'fit', 'tall', 'chest', 'height', 'weight']) || /\b(what|which|my) size\b|size (guide|chart)/i.test(message)) {
    const g = settings.sizeGuide;
    if (!g.rows.length) return { reply: `Size measurements haven’t been published yet, so I can’t recommend a size reliably. ${contact}`, links: [{ href: '/size-guide', label: 'Size guide' }] };
    return { reply: `Size guide (${g.unit}): ${g.columns.join(' / ')}\n${g.rows.map((r) => `• ${r.size}: ${r.values.join(' / ')}`).join('\n')}${g.fitNotes ? `\n${g.fitNotes}` : ''}\nCompare these with a hoodie you already own.`, links: [{ href: '/size-guide', label: 'Size guide' }] };
  }
  const prefs = parsePrefs(message, products);
  const wantsRec = prefs.colors.length || prefs.styles.length || prefs.size || prefs.budget !== null || has(message, ['recommend', 'suggest', 'looking for', 'want', 'hoodie', 'best']);
  if (wantsRec) {
    const recs = recommend(products, prefs);
    const crit = [prefs.styles.join('/'), prefs.colors.join('/'), prefs.size && `size ${prefs.size}`, prefs.budget !== null && `under ${fmt(prefs.budget, cur)}`].filter(Boolean).join(', ');
    if (!recs.length) return { reply: `I couldn’t find an in-stock hoodie matching ${crit || 'that'}. Try widening your filters in the shop.`, links: [{ href: '/shop', label: 'Browse all hoodies' }] };
    return { reply: `Here ${recs.length === 1 ? 'is a hoodie' : 'are hoodies'} in stock${crit ? ` matching ${crit}` : ''}:${sampleNote}`, products: recs.map(publicProduct) };
  }
  return { reply: `I’m not confident I can answer that from the store’s information. ${contact}`, links: [{ href: '/contact', label: 'Contact page' }] };
}

let sdkPromise;
export async function loadSdk() {
  sdkPromise ??= import('@anthropic-ai/sdk').then((m) => m.default).catch(() => null);
  return sdkPromise;
}

export async function assistantMode(env = process.env) {
  return env.ANTHROPIC_API_KEY && (await loadSdk()) ? 'live' : 'demo';
}

const SYSTEM = `You are YAHIVO's AI assistant: the first point of customer support for the YAHIVO hoodie store (UAE). If asked, say clearly that you are an AI assistant.
Rules:
- Use ONLY the JSON store data provided. Never invent product details, materials, prices, stock, delivery dates, tax treatment, policies, discounts or order status.
- If a value is "not provided", "not published" or missing, say so and give the contact instructions from the data.
- Orders: you can only see an order when an ORDER LOOKUP block is present, which means the customer gave a matching order number and checkout email. For order questions without it, ask for the order number (looks like YH-1001) and the email used at checkout. Never guess an order's status.
- Cancelling: the website handles it. If a customer wants to cancel, tell them to reply exactly "CANCEL <order number>" (only possible while the order is "Received"). Never say an order is cancelled yourself.
- Changing size, colour or address: if the order is still "Received", suggest cancelling (as above) and placing a new order; otherwise give the contact instructions. You cannot refund, exchange or promise delivery dates; for those, give the contact instructions.
- If the catalogue items have "sample": true, mention that the catalogue is sample data.
- Recommend at most 3 hoodies that are in stock for the requested colour/size and within budget. Refer to a product by writing [[product:SLUG]] using its exact slug; the website turns that into a link.
- Prices are in the store currency. Keep answers short and friendly. Plain text, no markdown headings.`;

/** Live reply via Claude. Falls back to demo mode on any error. */
export async function liveReply(history, ctx, env = process.env, orderLookup = null) {
  const Anthropic = await loadSdk();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: env.YAHIVO_AI_MODEL || DEFAULT_MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      { type: 'text', text: `${SYSTEM}\n\nSTORE DATA:\n${JSON.stringify(knowledge(ctx.settings, ctx.products))}`, cache_control: { type: 'ephemeral' } },
      // After the cached block so the store-data prefix stays cacheable.
      ...(orderLookup ? [{ type: 'text', text: `ORDER LOOKUP (${orderLookup.number}): ${orderLookup.status === 'found' ? JSON.stringify(orderFacts(orderLookup.order)) : orderLookup.status === 'limited' ? 'too many checks; ask the customer to wait 10 minutes or use /track' : 'no order matches that number and email'}` }] : []),
    ],
    messages: history,
  });
  if (response.stop_reason === 'refusal') return { reply: `I can’t help with that. ${contactLine(ctx.settings)}` };
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  const slugs = [...text.matchAll(/\[\[product:([a-z0-9-]+)\]\]/g)].map((m) => m[1]);
  const products = [...new Set(slugs)].map((s) => ctx.products.find((p) => p.slug === s)).filter(Boolean).slice(0, 3);
  const reply = text.replace(/\[\[product:([a-z0-9-]+)\]\]/g, (_, s) => ctx.products.find((p) => p.slug === s)?.name ?? '').trim();
  return { reply: reply || contactLine(ctx.settings), products: products.map(publicProduct) };
}

/** Validate chat history from the browser: alternating roles, bounded size. */
export function validateHistory(messages) {
  if (!Array.isArray(messages) || !messages.length) return null;
  const out = messages.slice(-10).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: cleanText(m?.content, { max: 1000, multiline: true }),
  })).filter((m) => m.content);
  while (out.length && out[0].role !== 'user') out.shift();
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  return out;
}

export async function answer(messages, ctx, env = process.env) {
  const history = validateHistory(messages);
  if (!history) return { error: 'Please type a question (max 1000 characters).' };
  const last = history[history.length - 1].content;
  // Order status only for a matching order number + checkout email (same check as the Track order page).
  const ref = orderRefFrom(history);
  const orderLookup = ref && ctx.lookupOrder ? { number: ref.number, ...ctx.lookupOrder(ref.number, ref.email) } : null;
  const cancel = cancellationReply(last, orderLookup, { ...ctx, cancelOrder: ref && ctx.cancelOrder ? () => ctx.cancelOrder(ref.number, ref.email) : null });
  if (cancel) return { mode: (await assistantMode(env)) === 'live' ? 'live' : 'demo', ...cancel };
  if ((await assistantMode(env)) === 'live') {
    try {
      return { mode: 'live', ...(await liveReply(history, ctx, env, orderLookup)) };
    } catch (e) {
      console.error('[assistant] live request failed, using demo answer:', e?.status ?? '', e?.message);
      return { mode: 'demo', notice: 'Live assistant unavailable — showing a basic answer.', ...demoReply(last, ctx, orderLookup) };
    }
  }
  return { mode: 'demo', ...demoReply(last, ctx, orderLookup) };
}


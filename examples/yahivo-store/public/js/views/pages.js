// Info pages built only from store settings — missing information is shown as missing.
import { esc, money, socialLinks } from '../ui.js';
import { deliveryTable, sizeTable } from './shared.js';

const contactLink = '<a href="/contact" data-link>contact us</a>';
const missing = (what) => `<div class="notice notice-warn"><p>${what} hasn’t been published yet. Please ${contactLink} with any questions.</p></div>`;

function trackerText(a) {
  const used = [a.ga4MeasurementId && 'Google Analytics (to see how the site is used)', a.metaPixelId && 'the Meta Pixel (Facebook / Instagram ads)', a.tiktokPixelId && 'the TikTok Pixel (TikTok ads)'].filter(Boolean);
  if (!used.length) return 'No third-party analytics or advertising trackers are currently enabled.';
  const ads = a.metaPixelId || a.tiktokPixelId ? ' Advertising pixels let those platforms measure our ads and show them to people likely to be interested; they may set cookies and share this data with Meta or TikTok under their own privacy policies.' : '';
  return `We use ${used.join(', ')}. They receive pages viewed, products viewed or added to the cart, checkouts started and completed orders (order value and product IDs — not your name, address or payment details).${ads}`;
}

function generatedFaqs(s) {
  const out = [];
  out.push({ q: 'Who answers the chat?', a: `YAHIVO’s AI assistant answers instantly, any time. It uses the store’s own information and can check your order status with your order number and checkout email. It can’t change or cancel orders; the YAHIVO team handles those through the Contact page.`, link: ['/contact', 'Contact'] });
  out.push({ q: 'How do I choose my size?', a: s.sizeGuide.rows.length ? 'Use the size guide to compare the measurements with a hoodie you already own.' : 'Size measurements haven’t been published yet — please contact us for sizing help.', link: ['/size-guide', 'Size guide'] });
  const zones = s.delivery.zones;
  out.push({ q: 'Where do you deliver and how much does it cost?', a: zones.length ? zones.map((z) => `${z.name}: ${z.fee ? money(z.fee) : 'free'}${z.freeOver !== null ? ` (free over ${money(z.freeOver)})` : ''}${z.estimate ? ` — ${z.estimate}` : ''}`).join('\n') : 'Delivery areas and fees haven’t been published yet.', link: ['/shipping-returns', 'Shipping & returns'] });
  if (s.packing.options.length) out.push({ q: 'What packing options are there?', a: s.packing.options.map((o) => `${o.name}: ${o.fee ? money(o.fee) : 'no charge'}${o.description ? ` — ${o.description}` : ''}`).join('\n') });
  out.push({ q: 'Which payment methods can I use?', a: s.paymentMethods.length ? s.paymentMethods.map((m) => `${m.label}: ${m.description}`).join('\n') : 'Online payment isn’t set up yet.' });
  out.push({ q: 'Is tax included in prices?', a: s.tax.enabled ? `${s.tax.name} (${s.tax.rate}%) is ${s.tax.pricesIncludeTax ? 'included in' : 'added to'} prices. The exact amount is shown at checkout.` : 'No tax is currently applied. If that changes, it will be shown clearly at checkout.' });
  out.push({ q: 'Can I return or exchange a hoodie?', a: s.policies.returns ?? 'The returns policy hasn’t been published yet — please contact us before ordering if this matters to you.', link: ['/shipping-returns', 'Shipping & returns'] });
  out.push({ q: 'How do I check my order?', a: 'Use Track order with your order number and the email used at checkout.', link: ['/track', 'Track an order'] });
  return out;
}

const pages = {
  'size-guide': (s) => ['Size guide', `${sizeTable(s)}
    <h2>How to measure</h2><p>Lay a hoodie that fits you well flat and measure it: chest width from armpit to armpit, body length from the highest point of the shoulder to the hem, and sleeve length from the shoulder seam to the cuff. Compare with the table above.</p>`],
  faq: (s) => ['FAQs', `<div class="faq">${[...generatedFaqs(s), ...s.faqs].map((f) => `<details><summary>${esc(f.q)}</summary><div class="ans">${esc(f.a)}${f.link ? `\n<a href="${f.link[0]}" data-link>${esc(f.link[1])}</a>` : ''}</div></details>`).join('')}</div>
    <p>Still stuck? <button type="button" class="link-btn" data-open-chat>Ask our AI assistant</button> or ${contactLink}.</p>`],
  'shipping-returns': (s) => ['Shipping & returns', `<h2>Delivery</h2>${deliveryTable(s)}
    ${s.policies.shipping ? `<h2>Shipping policy</h2><p class="pre">${esc(s.policies.shipping)}</p>` : missing('The shipping policy')}
    <h2>Returns &amp; exchanges</h2>${s.policies.returns ? `<p class="pre">${esc(s.policies.returns)}</p>` : missing('The returns policy')}`],
  contact: (s) => {
    const c = s.contact;
    const cards = [
      c.whatsapp && `<a class="contact-card" href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer"><strong>WhatsApp</strong><span>${esc(c.whatsapp)}</span></a>`,
      c.email && `<a class="contact-card" href="mailto:${esc(c.email)}"><strong>Email</strong><span>${esc(c.email)}</span></a>`,
      c.phone && `<a class="contact-card" href="tel:${esc(c.phone.replace(/\s/g, ''))}"><strong>Phone</strong><span>${esc(c.phone)}</span></a>`,
      c.address && `<div class="contact-card"><strong>Address</strong><span class="pre">${esc(c.address)}</span></div>`,
    ].filter(Boolean);
    return ['Contact', `<div class="notice"><h3>Fastest help: our AI assistant</h3><p>Get instant answers about sizes, delivery, payment and returns, any time. It can also check your order status: send your order number and the email you used at checkout. For changes, cancellations or anything it can’t solve, contact the team below.</p><button type="button" class="btn btn-accent" data-open-chat>Chat with the AI assistant</button></div>
      ${cards.length ? `<div class="contact-cards">${cards.join('')}</div>` : '<div class="notice notice-warn"><p>Contact details haven’t been added yet.</p></div>'}
      ${c.hours ? `<p><strong>Hours:</strong> ${esc(c.hours)}</p>` : ''}
      <p>For order questions, include your order number. You can also <a href="/track" data-link>track your order</a>.</p>
      ${socialLinks(s.social) ? `<h2>Follow us</h2><div class="social">${socialLinks(s.social)}</div>` : ''}`];
  },
  privacy: (s) => ['Privacy policy', `
    <div class="notice notice-warn"><p><strong>Template — needs review.</strong> This page describes what this website actually does. Have it reviewed against the laws that apply to your business before launch.</p></div>
    ${s.policies.lastUpdated ? `<p class="muted">Last updated ${esc(s.policies.lastUpdated)}</p>` : ''}
    <h2>What we collect</h2><p>When you place an order we collect your name, email, phone number and delivery address, the items you ordered and any notes you add. We use this to process, deliver and support your order.</p>
    <h2>Payments</h2><p>${s.paymentMethods.some((m) => m.id === 'stripe') ? 'Card payments are processed by Stripe on Stripe’s secure page. We never see or store your full card number.' : 'This website does not collect or store card details.'}</p>
    <h2>Your cart and preferences</h2><p>Your cart is stored in your own browser (local storage) so it survives page reloads. It is not sent to us until you check out.</p>
    <h2>Shopping assistant</h2><p>Questions you type into the assistant are sent to our server to generate an answer${s.aiMode === 'live' ? ', and to our AI provider (Anthropic) to produce the reply' : ''}. Please don’t type card numbers or passwords into the chat.</p>
    <h2>Analytics and advertising</h2><p>${trackerText(s.analytics)}</p>
    <h2>Couriers</h2><p>We share your name, phone number and address with the courier delivering your order.</p>
    <h2>Your choices</h2><p>To ask about, correct or delete your information, contact ${s.policies.privacyContactEmail ? `<a href="mailto:${esc(s.policies.privacyContactEmail)}">${esc(s.policies.privacyContactEmail)}</a>` : 'us via the Contact page'}.</p>`],
};

export default async function infoPage(main, { settings, params }) {
  const [title, html] = pages[params[0]](settings);
  document.title = `${title} — ${settings.brand}`;
  main.innerHTML = `<div class="wrap prose"><div class="page-head"><h1>${esc(title)}</h1></div>${html}</div>`;
}

export function notFound(main, { settings }) {
  document.title = `Page not found — ${settings.brand}`;
  main.innerHTML = '<div class="wrap empty"><h1>Page not found</h1><p class="muted">That page doesn’t exist or was moved.</p><a class="btn btn-accent" href="/shop" data-link>Shop hoodies</a></div>';
}

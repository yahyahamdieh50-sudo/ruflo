// Order confirmation / status (/order/:token) and order lookup (/track).
import { api, ApiError } from '../api.js';
import { contactButtons, esc, money, showFieldErrors } from '../ui.js';
import { lineMedia, summaryRows } from './shared.js';

const FLOW = [['received', 'Received'], ['preparing', 'Preparing'], ['packed', 'Packed'], ['handed_to_courier', 'Handed to courier'], ['delivered', 'Delivered']];

export default async function order(main, ctx) {
  if (ctx.variant === 'track') return track(main, ctx);
  const { settings, params, query, isCurrent } = ctx;
  let o;
  try {
    ({ order: o } = await api(`/api/orders/${params[0]}`));
    // Card payment still pending (e.g. just back from the payment page): the server
    // confirms with the provider — the redirect itself is never trusted.
    if (o.paymentStatus === 'awaiting_payment' && ['ngenius', 'ziina'].includes(o.payment.method)) {
      ({ order: o } = await api(`/api/orders/${params[0]}/verify-payment`, { method: 'POST', body: {} }).catch(() => ({ order: o })));
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      main.innerHTML = '<div class="wrap empty"><h1>Order not found</h1><p class="muted">Check the link in your confirmation, or look up your order.</p><a class="btn" href="/track" data-link>Track an order</a></div>';
      return undefined;
    }
    throw e;
  }
  if (!isCurrent()) return undefined;
  document.title = `Order ${o.number} — ${settings.brand}`;
  const placed = query.get('placed') === '1';
  const paymentNote = query.get('payment') === 'cancelled'
    ? '<div class="notice notice-warn">Payment was not completed. Your order is reserved for a short time — contact us if you need help.</div>'
    : '';
  const idx = FLOW.findIndex(([s]) => s === o.status);
  const timeline = o.status === 'cancelled'
    ? '<p class="notice notice-err"><strong>This order was cancelled.</strong></p>'
    : `<ol class="timeline">${FLOW.map(([s, label], i) => `<li class="${i < idx ? 'done' : i === idx ? 'done current' : ''}">${esc(label)}</li>`).join('')}</ol>`;
  const manual = o.payment.method === 'manual';
  const paid = o.paymentStatus === 'paid';
  const c = o.customer;

  main.innerHTML = `
    <div class="wrap page-head">
      ${placed ? '<p class="eyebrow">Thank you</p>' : ''}
      <h1>${placed ? 'Order received' : `Order ${esc(o.number)}`}</h1>
      <p>Order number <strong>${esc(o.number)}</strong> · placed ${esc(new Date(o.createdAt).toLocaleString())}</p>
      ${placed ? '<p class="muted small">Save this page’s link to check your order status later, or use Track order with your order number and email.</p>' : ''}
      ${paymentNote}
      ${manual && !paid ? `<div class="notice"><h3>Pay cash on delivery</h3><p>Please have <strong>${esc(money(o.totals.total))}</strong> ready in cash when your order arrives. No payment has been taken online. ${esc(settings.brand)} will contact you to confirm your order.</p></div>` : ''}
      ${paid ? '<div class="notice"><strong>Payment received.</strong></div>' : ''}
      ${!manual && o.paymentStatus === 'awaiting_payment' ? '<div class="notice notice-warn"><strong>Payment not confirmed yet.</strong> If you just paid, refresh this page in a minute. Please don’t pay again — contact us if this message stays.</div>' : ''}
      ${o.paymentStatus === 'failed' ? '<div class="notice notice-err"><strong>Payment failed.</strong> You have not been charged. Please contact us to complete your order.</div>' : ''}
    </div>
    <div class="wrap cart-layout">
      <section>
        <h2>Status</h2>
        ${timeline}
        ${o.fulfilment.courierName ? `<div class="notice"><strong>Courier:</strong> ${esc(o.fulfilment.courierName)}${o.fulfilment.trackingNumber ? `<br><strong>Tracking number:</strong> ${esc(o.fulfilment.trackingNumber)}` : ''}${o.fulfilment.trackingUrl ? `<br><a href="${esc(o.fulfilment.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track with courier</a>` : ''}</div>` : ''}
        <h2>Items</h2>
        ${o.lines.map((l) => `<div class="line"><div class="line-media">${lineMedia(l)}</div><div><div class="line-top"><span>${esc(l.name)}</span><span>${esc(money(l.lineTotal))}</span></div><p class="muted small">${esc(l.color)} · Size ${esc(l.size)} · Qty ${l.qty}</p></div></div>`).join('')}
        <h2>Delivery to</h2>
        <p>${esc(c.name)}<br>${esc(c.address1)}${c.address2 ? `<br>${esc(c.address2)}` : ''}<br>${esc(c.city)}${c.region ? `, ${esc(c.region)}` : ''}<br>${esc(c.country)}</p>
      </section>
      <aside class="summary">
        <h2>Summary</h2>
        ${summaryRows(o, { final: true })}
        <p class="sum-note">Payment: ${esc(o.payment.label)}</p>
        ${o.tax?.registrationNumber ? `<p class="sum-note">Tax registration no. ${esc(o.tax.registrationNumber)}</p>` : ''}
        ${contactButtons(settings.contact) ? `<p class="sum-note">Questions about this order?</p><div class="social order-contact">${contactButtons(settings.contact, { message: `Hi YAHIVO, about my order ${o.number}` })}</div>` : '<a class="btn btn-ghost btn-block" href="/contact" data-link>Questions? Contact us</a>'}
      </aside>
    </div>`;
  return undefined;
}

function track(main, { settings, navigate }) {
  document.title = `Track your order — ${settings.brand}`;
  main.innerHTML = `<div class="wrap prose page-head"><h1>Track your order</h1>
    <p>Enter your order number and the email you used at checkout.</p>
    <form id="track-form" novalidate>
      <div class="field"><label for="number">Order number</label><input id="number" name="number" type="text" required maxlength="20" placeholder="YH-1001" autocomplete="off"></div>
      <div class="field"><label for="temail">Email</label><input id="temail" name="email" type="email" required maxlength="254" autocomplete="email"></div>
      <div id="track-error" role="alert"></div>
      <button class="btn" type="submit">Find order</button>
    </form></div>`;
  const form = main.querySelector('#track-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const number = form.number.value.trim();
    const email = form.email.value.trim();
    if (showFieldErrors(form, { ...(number ? {} : { number: 'Enter your order number.' }), ...(email ? {} : { email: 'Enter your email.' }) })) return;
    try {
      const { token } = await api('/api/track', { method: 'POST', body: { number, email } });
      navigate(`/order/${token}`);
    } catch (err) {
      main.querySelector('#track-error').innerHTML = `<p class="field-error">${esc(err.message)}</p>`;
    }
  });
  return undefined;
}

// Cart: server-priced lines, quantity updates, totals so far.
import { api, cart } from '../api.js';
import { errorState, esc, loading, money } from '../ui.js';
import { lineMedia, summaryRows } from './shared.js';

export default async function cartView(main, ctx) {
  const { settings, isCurrent } = ctx;
  document.title = `Your cart — ${settings.brand}`;
  main.innerHTML = `<div class="wrap page-head"><h1>Your cart</h1></div><div class="wrap" id="cart-body">${loading('Updating your cart…')}</div>`;
  const body = main.querySelector('#cart-body');
  let busy = false;

  async function refresh(notices = []) {
    const items = cart.items();
    if (!items.length) {
      body.innerHTML = `<div class="empty"><h2>Your cart is empty</h2><p class="muted">Find a hoodie you like and add it here.</p><a class="btn btn-accent" href="/shop" data-link>Shop hoodies</a></div>`;
      return;
    }
    let q;
    try {
      q = await api('/api/quote', { method: 'POST', body: { items } });
    } catch (e) {
      body.innerHTML = errorState(e.message);
      body.querySelector('[data-retry]').addEventListener('click', () => refresh());
      return;
    }
    if (!isCurrent()) return;
    if (q.issues.length) cart.reconcile(q);
    const allNotices = [...notices, ...q.issues.map((i) => i.message)];
    if (!q.lines.length) {
      body.innerHTML = `${allNotices.map((n) => `<div class="notice notice-warn" role="alert">${esc(n)}</div>`).join('')}<div class="empty"><h2>Your cart is empty</h2><a class="btn btn-accent" href="/shop" data-link>Shop hoodies</a></div>`;
      return;
    }
    const canOrder = settings.ordering;
    body.innerHTML = `
      ${allNotices.map((n) => `<div class="notice notice-warn" role="alert">${esc(n)}</div>`).join('')}
      <div class="cart-layout">
        <section aria-label="Items in your cart">
          ${q.lines.map((l) => `<article class="line" data-key="${esc(l.key)}">
            <a class="line-media" href="/product/${esc(l.slug)}" data-link tabindex="-1" aria-hidden="true">${lineMedia(l)}</a>
            <div>
              <div class="line-top"><a href="/product/${esc(l.slug)}" data-link>${esc(l.name)}</a><span>${esc(money(l.lineTotal))}</span></div>
              <p class="muted small">${esc(l.color)} · Size ${esc(l.size)} · ${esc(money(l.unitPrice))} each${l.sample ? ' · <span class="badge badge-sample">Sample</span>' : ''}</p>
              <div class="line-actions">
                <div class="qty" role="group" aria-label="Quantity for ${esc(l.name)}">
                  <button type="button" data-act="dec" aria-label="Decrease quantity" ${l.qty <= 1 ? 'disabled' : ''}>−</button><output>${l.qty}</output><button type="button" data-act="inc" aria-label="Increase quantity" ${l.qty >= 10 ? 'disabled' : ''}>+</button>
                </div>
                <button type="button" class="link-btn" data-act="remove">Remove</button>
              </div>
            </div>
          </article>`).join('')}
        </section>
        <aside class="summary" aria-label="Order summary">
          <h2>Summary</h2>
          ${summaryRows(q)}
          ${canOrder ? '<a class="btn btn-accent btn-block" href="/checkout" data-link>Checkout</a>' : `<div class="notice notice-warn"><strong>Online ordering isn’t open yet.</strong><br>${settings.paymentMethods.length ? '' : 'No payment method is set up. '}${settings.delivery.zones.length ? '' : 'Delivery areas aren’t set up. '}<a href="/contact" data-link>Contact us</a> to order.</div>`}
          <a class="btn btn-ghost btn-block" href="/shop" data-link>Continue shopping</a>
          ${settings.delivery.zones.length ? `<p class="sum-note">Delivery from ${esc(money(Math.min(...settings.delivery.zones.map((z) => z.fee))))} depending on your area.</p>` : ''}
        </aside>
      </div>`;
  }

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || busy) return;
    const key = btn.closest('[data-key]').dataset.key;
    const current = cart.items().find((i) => `${i.slug}|${i.color}|${i.size}` === key);
    if (!current) return;
    busy = true;
    if (btn.dataset.act === 'remove') cart.remove(key);
    else cart.setQty(key, Math.min(10, Math.max(1, current.qty + (btn.dataset.act === 'inc' ? 1 : -1))));
    await refresh();
    busy = false;
  });

  await refresh();
  return undefined;
}

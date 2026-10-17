// Checkout: contact, address/delivery area, packing, payment — with a live, server-computed total.
import { api, ApiError, cart } from '../api.js';
import { track } from '../analytics.js';
import { esc, loading, money, showFieldErrors, toast } from '../ui.js';
import { summaryRows } from './shared.js';

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,18}$/;

export default async function checkout(main, ctx) {
  const { settings, navigate, isCurrent } = ctx;
  document.title = `Checkout — ${settings.brand}`;
  const items = cart.items();
  if (!items.length) {
    main.innerHTML = '<div class="wrap empty"><h1>Checkout</h1><p class="muted">Your cart is empty.</p><a class="btn btn-accent" href="/shop" data-link>Shop hoodies</a></div>';
    return undefined;
  }
  if (!settings.ordering) {
    main.innerHTML = `<div class="wrap prose page-head"><h1>Checkout</h1><div class="notice notice-warn"><h3>Online ordering isn’t open yet</h3>
      <p>${settings.paymentMethods.length ? '' : 'No payment method has been set up. '}${settings.delivery.zones.length ? '' : 'Delivery areas haven’t been set up. '}Nothing has been charged.</p>
      <a class="btn" href="/contact" data-link>Contact us to order</a></div></div>`;
    return undefined;
  }
  main.innerHTML = loading('Preparing checkout…');

  const regions = settings.delivery.regions;
  const countries = Object.keys(regions);
  const packing = settings.packing.options;
  const methods = settings.paymentMethods;
  const state = { country: countries.length === 1 ? countries[0] : '', region: '', packingId: packing.find((o) => o.isDefault)?.id ?? '', paymentMethod: methods.length === 1 ? methods[0].id : '', quote: null, submitting: false };

  const regionField = () => {
    const list = regions[state.country] ?? [];
    if (!state.country) return '';
    return list.length
      ? `<div class="field"><label for="region">${state.country === 'United Arab Emirates' ? 'Emirate' : 'Region'}</label><select id="region" name="region" required autocomplete="address-level1"><option value="">Choose…</option>${list.map((r) => `<option ${state.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>`
      : `<div class="field"><label for="region">Region / state <span class="hint">(optional)</span></label><input id="region" name="region" type="text" maxlength="80" autocomplete="address-level1" value="${esc(state.region)}"></div>`;
  };

  main.innerHTML = `
    <div class="wrap page-head"><h1>Checkout</h1></div>
    <div class="wrap checkout-layout">
      <form id="checkout-form" novalidate>
        <section class="checkout-step"><h2><span class="step-num">1</span>Contact</h2>
          <div class="field"><label for="name">Full name</label><input id="name" name="name" type="text" required maxlength="100" autocomplete="name"></div>
          <div class="field-row">
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required maxlength="254" autocomplete="email" inputmode="email"></div>
            <div class="field"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="+971 50 123 4567"></div>
          </div>
        </section>
        <section class="checkout-step"><h2><span class="step-num">2</span>Delivery address</h2>
          <div class="field"><label for="country">Country</label><select id="country" name="country" required autocomplete="country-name">${countries.length > 1 ? '<option value="">Choose…</option>' : ''}${countries.map((c) => `<option ${state.country === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
          <div id="region-slot">${regionField()}</div>
          <div class="field"><label for="city">City / area</label><input id="city" name="city" type="text" required maxlength="80" autocomplete="address-level2"></div>
          <div class="field"><label for="address1">Street, building, flat / villa</label><input id="address1" name="address1" type="text" required maxlength="150" autocomplete="address-line1"></div>
          <div class="field"><label for="address2">Landmark / extra details <span class="hint">(optional)</span></label><input id="address2" name="address2" type="text" maxlength="150" autocomplete="address-line2"></div>
          <div class="field"><label for="notes">Delivery notes <span class="hint">(optional)</span></label><textarea id="notes" name="notes" maxlength="500"></textarea></div>
          <p class="muted small" id="zone-info" aria-live="polite"></p>
        </section>
        ${packing.length ? `<section class="checkout-step"><h2><span class="step-num">3</span>Packing</h2>
          <fieldset class="field"><legend class="sr-only">Packing option</legend>
          ${packing.map((o) => `<label class="radio-card"><input type="radio" name="packingId" value="${esc(o.id)}" ${state.packingId === o.id ? 'checked' : ''}><span class="rc-body"><span class="rc-title"><span>${esc(o.name)}</span><span>${o.fee ? esc(money(o.fee)) : 'Free'}</span></span>${o.description ? `<span class="muted small">${esc(o.description)}</span>` : ''}</span></label>`).join('')}
          </fieldset></section>` : ''}
        <section class="checkout-step"><h2><span class="step-num">${packing.length ? 4 : 3}</span>Payment</h2>
          <fieldset class="field"><legend class="sr-only">Payment method</legend>
          ${methods.map((m) => `<label class="radio-card"><input type="radio" name="paymentMethod" value="${esc(m.id)}" ${state.paymentMethod === m.id ? 'checked' : ''}><span class="rc-body"><span class="rc-title"><span>${esc(m.label)}</span></span><span class="muted small">${esc(m.description)}</span></span></label>`).join('')}
          </fieldset>
          <p class="muted small">This store never asks for or stores card numbers.</p>
        </section>
        <div id="form-error" role="alert"></div>
        <button class="btn btn-accent btn-block" id="place" type="submit">Place order</button>
      </form>
      <aside class="summary" aria-label="Order summary" id="summary"></aside>
    </div>`;

  const form = main.querySelector('#checkout-form');
  const summary = main.querySelector('#summary');

  async function requote() {
    let q;
    try {
      q = await api('/api/quote', { method: 'POST', body: { items: cart.items(), country: state.country || undefined, region: state.region || undefined, packingId: state.packingId || undefined } });
    } catch (e) {
      summary.innerHTML = `<p class="field-error">${esc(e.message)}</p>`;
      return;
    }
    if (!isCurrent()) return;
    if (q.issues.length) {
      cart.reconcile(q);
      main.querySelector('#form-error').innerHTML = q.issues.map((i) => `<div class="notice notice-warn">${esc(i.message)}</div>`).join('');
    }
    if (!q.lines.length) { navigate('/cart', { replace: true }); return; }
    state.quote = q;
    summary.innerHTML = `<h2>Your order</h2>
      <div class="mini-lines">${q.lines.map((l) => `<div class="mini-line"><span>${l.qty} × ${esc(l.name)} <span class="muted">(${esc(l.color)}, ${esc(l.size)})</span></span><span>${esc(money(l.lineTotal))}</span></div>`).join('')}</div>
      ${summaryRows(q, { final: Boolean(q.delivery) })}
      <a class="link-btn small" href="/cart" data-link>Edit cart</a>`;
    const zoneInfo = main.querySelector('#zone-info');
    zoneInfo.textContent = q.delivery
      ? `Delivery to ${q.delivery.zoneName}: ${q.delivery.fee ? money(q.delivery.fee) : 'free'}${q.delivery.estimate ? ` · ${q.delivery.estimate}` : ''}.`
      : state.country && state.region ? 'We don’t deliver to this area yet.' : '';
    const place = main.querySelector('#place');
    place.textContent = q.delivery ? `Place order — ${money(q.totals.total)}` : 'Place order';
  }

  form.addEventListener('change', async (e) => {
    const { name, value } = e.target;
    if (name === 'country') { state.country = value; state.region = ''; main.querySelector('#region-slot').innerHTML = regionField(); }
    else if (name === 'region') state.region = value;
    else if (name === 'packingId') state.packingId = value;
    else if (name === 'paymentMethod') { state.paymentMethod = value; return; }
    else return;
    await requote();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.submitting) return;
    const f = Object.fromEntries(new FormData(form));
    const errors = {};
    if (!f.name?.trim()) errors.name = 'Full name is required.';
    if (!EMAIL_RE.test(f.email?.trim() ?? '')) errors.email = 'Enter a valid email address.';
    if (!PHONE_RE.test(f.phone?.trim() ?? '')) errors.phone = 'Enter a valid phone number, e.g. +971 50 123 4567.';
    if (!f.country) errors.country = 'Choose a country.';
    if ((regions[f.country] ?? []).length && !f.region) errors.region = 'Choose your emirate / region.';
    if (!f.city?.trim()) errors.city = 'City / area is required.';
    if (!f.address1?.trim()) errors.address1 = 'Address is required.';
    if (packing.length && !f.packingId) errors.packingId = 'Choose a packing option.';
    if (!f.paymentMethod) errors.paymentMethod = 'Choose a payment method.';
    if (!errors.region && state.quote && !state.quote.delivery && f.country) errors.region = 'We don’t deliver to this area yet.';
    if (showFieldErrors(form, errors)) return;

    state.submitting = true;
    const place = main.querySelector('#place');
    place.disabled = true;
    place.textContent = 'Placing order…';
    main.querySelector('#form-error').innerHTML = '';
    const tracked = cart.items().map((i) => ({ item_id: i.slug, item_variant: `${i.color}/${i.size}`, quantity: i.qty }));
    track('begin_checkout', { currency: settings.currency, value: state.quote?.totals.total, items: tracked });
    try {
      const res = await api('/api/orders', {
        method: 'POST',
        body: {
          items: cart.items(),
          customer: { name: f.name, email: f.email, phone: f.phone, country: f.country, region: f.region, city: f.city, address1: f.address1, address2: f.address2, notes: f.notes },
          packingId: f.packingId || undefined,
          paymentMethod: f.paymentMethod,
          expectedTotal: state.quote?.totals.total,
        },
      });
      track('purchase', { transaction_id: res.number, currency: settings.currency, value: state.quote?.totals.total, items: tracked });
      cart.clear();
      if (res.redirectUrl) { location.href = res.redirectUrl; return; }
      navigate(`/order/${res.token}?placed=1`, { replace: true });
    } catch (err) {
      state.submitting = false;
      place.disabled = false;
      if (err instanceof ApiError && err.status === 422) {
        showFieldErrors(form, err.body.fields ?? {});
        if (err.body.fields?.items) toast(err.body.fields.items, { error: true });
      } else if (err instanceof ApiError && err.status === 409) {
        main.querySelector('#form-error').innerHTML = `<div class="notice notice-warn"><strong>${esc(err.message)}</strong></div>`;
        if (err.body.quote) cart.reconcile(err.body.quote);
      } else {
        main.querySelector('#form-error').innerHTML = `<div class="notice notice-err">${esc(err.message)} Your order was not placed.</div>`;
      }
      await requote();
    }
  });

  await requote();
  return undefined;
}

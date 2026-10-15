// Admin orders: list/filter, detail, status workflow, courier + tracking, packing notes.
import { adminApi, ApiError, esc, money, showErrors, STATUS, statusPill, toast } from './core.js';
import { summaryRows } from '../views/shared.js';
import { packingSlip } from './slip.js';

const FLOW = ['received', 'preparing', 'packed', 'handed_to_courier', 'delivered'];
const PAYMENT = { awaiting_payment: 'Awaiting payment', paid: 'Paid', refunded: 'Refunded', failed: 'Failed', expired: 'Expired' };

function nextStatuses(s) {
  if (s === 'cancelled' || s === 'delivered') return [];
  return [...FLOW.slice(FLOW.indexOf(s) + 1), 'cancelled'];
}

export default async function orders(el, id) {
  if (id) return detail(el, Number(id));
  const qs = new URLSearchParams(location.hash.split('?')[1] ?? '');
  const data = await adminApi(`/api/admin/orders?${qs}`);
  el.innerHTML = `<h1>Orders</h1>
    <form class="filters-bar" id="of">
      <label class="sr-only" for="ofs">Status</label>
      <select id="ofs" name="status"><option value="">All statuses</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${qs.get('status') === k ? 'selected' : ''}>${esc(l)} (${data.counts[k] ?? 0})</option>`).join('')}</select>
      <label class="sr-only" for="ofq">Search</label>
      <input id="ofq" name="q" type="search" placeholder="Order number or email" value="${esc(qs.get('q') ?? '')}">
      <button class="btn btn-small">Filter</button>
      <a class="btn btn-ghost btn-small" id="export-csv" href="/api/admin/orders.csv?${esc(qs.toString())}" download>Export CSV (courier / packing)</a>
    </form>
    <p class="hint">The export includes customer names, phones and addresses — share it only with your courier and keep it private.</p>
    ${data.orders.length ? `<div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Area</th><th>Total</th><th>Payment</th><th>Status</th></tr></thead>
      <tbody>${data.orders.map((o) => `<tr data-href="#/orders/${o.id}" tabindex="0">
        <td><a href="#/orders/${o.id}"><strong>${esc(o.number)}</strong></a></td>
        <td>${esc(new Date(o.createdAt).toLocaleString())}</td>
        <td>${esc(o.customer.name)}<br><span class="muted small">${esc(o.email)}</span></td>
        <td>${esc(o.delivery?.zoneName ?? '—')}</td>
        <td>${esc(money(o.totals.total))}</td>
        <td>${esc(PAYMENT[o.paymentStatus] ?? o.paymentStatus)}<br><span class="muted small">${esc(o.payment.label)}</span></td>
        <td>${statusPill(o.status)}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="panel empty"><h2>No orders yet</h2><p class="muted">Orders placed on the storefront will appear here.</p></div>'}`;
  el.querySelector('#of').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (e.target.status.value) p.set('status', e.target.status.value);
    if (e.target.q.value.trim()) p.set('q', e.target.q.value.trim());
    location.hash = `#/orders${p.toString() ? `?${p}` : ''}`;
  });
  el.querySelectorAll('tr[data-href]').forEach((tr) => {
    tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; });
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = tr.dataset.href; });
  });
  return undefined;
}

async function detail(el, id) {
  const [{ order: o, events }, { settings }] = await Promise.all([adminApi(`/api/admin/orders/${id}`), adminApi('/api/admin/settings')]);
  const couriers = settings.delivery.couriers;
  const c = o.customer;
  const next = nextStatuses(o.status);
  el.innerHTML = `
    <p><a href="#/orders">← All orders</a></p>
    <h1>${esc(o.number)} ${statusPill(o.status)}</h1>
    <p class="muted">Placed ${esc(new Date(o.createdAt).toLocaleString())} · Payment: ${esc(o.payment.label)} — <strong>${esc(PAYMENT[o.paymentStatus])}</strong></p>
    <div class="actions"><button type="button" class="btn btn-ghost btn-small" id="print-slip">Print packing slip</button>${['ngenius', 'ziina'].includes(o.payment.method) && o.paymentStatus === 'awaiting_payment' ? `<button type="button" class="btn btn-ghost btn-small" id="verify-pay">Check payment with ${o.payment.method === 'ziina' ? 'Ziina' : 'Network International'}</button>` : ''}</div><br>
    ${o.lines.some((l) => l.sample) ? '<div class="panel-note">This order contains SAMPLE products (test data).</div>' : ''}
    ${o.returnRequest ? `<div class="panel-note"><strong>Return requested</strong> ${esc(new Date(o.returnRequest.at).toLocaleString())} (${esc(o.returnRequest.channel ?? 'website')}): ${esc(o.returnRequest.reason)}. Contact the customer to arrange it; record any refund under Payment status.</div>` : ''}
    <div class="two-col">
      <div>
        <section class="panel"><h2>Update order</h2>
          <form id="status-form" novalidate>
            <div class="field"><label for="st">Status</label>
              <select id="st" name="status" ${next.length ? '' : 'disabled'}><option value="">${next.length ? 'Keep current status' : 'Final status — no further changes'}</option>${next.map((s) => `<option value="${s}">${esc(STATUS[s])}</option>`).join('')}</select>
              <span class="hint">Cancelling returns reserved stock to inventory. “Handed to courier” needs a courier recorded below.</span></div>
            <div class="field"><label for="stn">Note for this status change <span class="hint">(optional, internal)</span></label><input id="stn" name="note" type="text" maxlength="300"></div>
            <h3>Courier &amp; tracking <span class="hint">(manual — no courier API connected)</span></h3>
            ${couriers.length ? `<div class="field"><label for="cr">Courier</label><select id="cr" name="courierId"><option value="">— None —</option>${couriers.map((k) => `<option value="${esc(k.id)}" ${o.fulfilment.courierId === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></div>` : '<p class="muted">Add couriers in <a href="#/delivery">Delivery &amp; couriers</a> first.</p>'}
            <div class="field"><label for="tn">Tracking number</label><input id="tn" name="trackingNumber" type="text" maxlength="60" value="${esc(o.fulfilment.trackingNumber ?? '')}"></div>
            ${o.fulfilment.trackingUrl ? `<p><a href="${esc(o.fulfilment.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open courier tracking page</a></p>` : ''}
            <h3>Packing</h3>
            <p>Customer chose: <strong>${o.packing ? `${esc(o.packing.name)} (${esc(money(o.packing.fee))})` : 'No packing option'}</strong></p>
            <div class="field"><label for="pn">Packing notes</label><textarea id="pn" name="packingNotes" maxlength="1000" placeholder="e.g. materials used, gift note, fragile">${esc(o.fulfilment.packingNotes ?? '')}</textarea></div>
            <h3>Payment</h3>
            <div class="field"><label for="ps">Payment status</label><select id="ps" name="paymentStatus">${Object.entries(PAYMENT).map(([k, l]) => `<option value="${k}" ${o.paymentStatus === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
              <span class="hint">For cash on delivery, mark “Paid” only after the cash has actually been collected.</span></div>
            <div class="field"><label for="inn">Internal notes <span class="hint">(never shown to the customer)</span></label><textarea id="inn" name="internalNotes" maxlength="2000">${esc(o.internalNotes ?? '')}</textarea></div>
            <button class="btn" type="submit">Save changes</button>
          </form>
        </section>
      </div>
      <div>
        <section class="panel"><h2>Customer</h2>
          <p><strong>${esc(c.name)}</strong><br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a><br><a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a></p>
          <p>${esc(c.address1)}${c.address2 ? `<br>${esc(c.address2)}` : ''}<br>${esc(c.city)}${c.region ? `, ${esc(c.region)}` : ''}<br>${esc(c.country)}</p>
          ${c.notes ? `<p><strong>Delivery notes:</strong> ${esc(c.notes)}</p>` : ''}
          <p><strong>Delivery zone:</strong> ${esc(o.delivery?.zoneName ?? '—')}${o.delivery?.estimate ? ` (${esc(o.delivery.estimate)})` : ''}</p>
        </section>
        <section class="panel"><h2>Items &amp; totals</h2>
          <div class="mini-lines">${o.lines.map((l) => `<div class="mini-line"><span>${l.qty} × ${esc(l.name)} <span class="muted">(${esc(l.color)}, ${esc(l.size)})</span></span><span>${esc(money(l.lineTotal))}</span></div>`).join('')}</div>
          ${summaryRows(o, { final: true })}
          ${o.tax ? `<p class="sum-note">Tax snapshot: ${esc(o.tax.name)} ${esc(o.tax.rate)}% ${o.tax.pricesIncludeTax ? '(included in prices)' : '(added)'}</p>` : '<p class="sum-note">No tax was configured when this order was placed.</p>'}
        </section>
        <section class="panel"><h2>Customer privacy</h2>
          ${o.customerRemoved ? '<p>Customer personal data has been removed from this order.</p>'
            : ['delivered', 'cancelled'].includes(o.status)
              ? '<p class="hint">If the customer asks you to delete their data, remove their name, contact details, address and notes. Items, totals and tax stay for your records. This cannot be undone.</p><button type="button" class="btn btn-danger btn-small" id="anonymise">Remove customer data</button>'
              : '<p class="hint">Customer data can be removed once the order is delivered or cancelled.</p>'}
        </section>
        <section class="panel"><h2>History</h2>
          <ul class="events">${events.map((e) => `<li><strong>${esc(new Date(e.at).toLocaleString())}</strong> — ${e.status ? statusPill(e.status) : ''} ${esc(e.note ?? '')} <span class="muted small">(${esc(e.actor)})</span></li>`).join('')}</ul>
        </section>
      </div>
    </div>`;

  el.querySelector('#print-slip').addEventListener('click', () => {
    el.innerHTML = `<div class="actions no-print"><button type="button" class="btn btn-small" id="do-print">Print</button><button type="button" class="btn btn-ghost btn-small" id="slip-back">Back to order</button></div>${packingSlip(o, settings)}`;
    el.querySelector('#do-print').addEventListener('click', () => window.print());
    el.querySelector('#slip-back').addEventListener('click', () => detail(el, id));
  });
  el.querySelector('#verify-pay')?.addEventListener('click', async () => {
    try {
      const { order } = await adminApi(`/api/orders/${o.token}/verify-payment`, { method: 'POST', body: {} });
      toast(`Payment status: ${PAYMENT[order.paymentStatus] ?? order.paymentStatus}`);
      detail(el, id);
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
  el.querySelector('#anonymise')?.addEventListener('click', async () => {
    if (!confirm(`Permanently remove ${c.name}'s personal data from ${o.number}? This cannot be undone.`)) return;
    try {
      await adminApi(`/api/admin/orders/${id}/anonymise`, { method: 'POST', body: {} });
      toast('Customer data removed');
      detail(el, id);
    } catch (err) {
      toast(err.message, { error: true });
    }
  });
  const form = el.querySelector('#status-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = form;
    const patch = {
      packingNotes: f.packingNotes.value,
      internalNotes: f.internalNotes.value,
      trackingNumber: f.trackingNumber.value,
      paymentStatus: f.paymentStatus.value,
    };
    if (f.courierId) patch.courierId = f.courierId.value || null;
    if (f.status.value) { patch.status = f.status.value; patch.note = f.note.value; }
    if (patch.status === 'cancelled' && !confirm(`Cancel order ${o.number}? Reserved stock will be returned to inventory.`)) return;
    try {
      await adminApi(`/api/admin/orders/${id}`, { method: 'PATCH', body: patch });
      toast('Order updated');
      detail(el, id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) showErrors(form, err.body.fields);
      else showErrors(form, {}, { message: err.message });
    }
  });
}

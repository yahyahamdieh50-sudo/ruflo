// Printable packing slip (no prices — it goes inside the parcel / to the packer).
import { esc } from './core.js';

export function packingSlip(o, settings) {
  const c = o.customer;
  return `<article class="slip">
    <header class="slip-head">
      <div><p class="slip-brand">${esc(settings.brand)}</p><p class="muted small">Packing slip</p></div>
      <div class="slip-meta"><p><strong>${esc(o.number)}</strong></p><p class="small">${esc(new Date(o.createdAt).toLocaleDateString())}</p></div>
    </header>
    <section class="slip-cols">
      <div><h2>Deliver to</h2>
        <p>${esc(c.name)}<br>${esc(c.phone)}<br>${esc(c.address1)}${c.address2 ? `<br>${esc(c.address2)}` : ''}<br>${esc(c.city)}${c.region ? `, ${esc(c.region)}` : ''}<br>${esc(c.country)}</p>
        ${c.notes ? `<p><strong>Delivery notes:</strong> ${esc(c.notes)}</p>` : ''}
      </div>
      <div><h2>Shipping</h2>
        <p>Zone: ${esc(o.delivery?.zoneName ?? '—')}<br>Courier: ${esc(o.fulfilment.courierName ?? '—')}<br>Tracking: ${esc(o.fulfilment.trackingNumber ?? '—')}</p>
        <h2>Packing</h2>
        <p>${esc(o.packing?.name ?? 'No packing option')}${o.fulfilment.packingNotes ? `<br><span class="pre">${esc(o.fulfilment.packingNotes)}</span>` : ''}</p>
      </div>
    </section>
    <table class="slip-table">
      <thead><tr><th>✓</th><th>Qty</th><th>Item</th><th>Colour</th><th>Size</th></tr></thead>
      <tbody>${o.lines.map((l) => `<tr><td class="tick"></td><td><strong>${l.qty}</strong></td><td>${esc(l.name)}</td><td>${esc(l.color)}</td><td><strong>${esc(l.size)}</strong></td></tr>`).join('')}</tbody>
    </table>
    <p class="small">Items: ${o.lines.reduce((s, l) => s + l.qty, 0)} · Packed by: ____________ · Checked by: ____________</p>
  </article>`;
}

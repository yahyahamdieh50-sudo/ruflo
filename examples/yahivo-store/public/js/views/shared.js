// Renderers shared by product, cart, checkout, order and info pages.
import { esc, money } from '../ui.js';

const contactLink = '<a href="/contact" data-link>contact us</a>';

export function sizeTable(settings) {
  const g = settings.sizeGuide;
  if (!g.rows.length) return `<p class="muted">Size measurements haven’t been published yet. Please ${contactLink} if you need help choosing a size.</p>`;
  return `<div class="table-wrap"><table>
    <caption class="sr-only">Size guide in ${esc(g.unit)}</caption>
    <thead><tr><th scope="col">Size</th>${g.columns.map((c) => `<th scope="col">${esc(c)} (${esc(g.unit)})</th>`).join('')}</tr></thead>
    <tbody>${g.rows.map((r) => `<tr><th scope="row">${esc(r.size)}</th>${r.values.map((v) => `<td>${esc(v || '—')}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>${g.fitNotes ? `<p class="pre">${esc(g.fitNotes)}</p>` : ''}`;
}

export function deliveryTable(settings) {
  const zones = settings.delivery.zones;
  const packing = settings.packing.options;
  const zoneHtml = zones.length ? `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Area</th><th scope="col">Fee</th><th scope="col">Estimate</th></tr></thead>
      <tbody>${zones.map((z) => `<tr><td><strong>${esc(z.name)}</strong><br><span class="muted small">${esc(z.areas.length ? z.areas.join(', ') : z.country)}</span></td>
        <td>${z.fee === 0 ? 'Free' : esc(money(z.fee))}${z.freeOver !== null ? `<br><span class="muted small">Free over ${esc(money(z.freeOver))}</span>` : ''}</td>
        <td>${z.estimate ? esc(z.estimate) : '<span class="muted">Not specified</span>'}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="muted">Delivery areas and fees haven’t been published yet, so online ordering isn’t open. Please ${contactLink}.</p>`;
  const packHtml = packing.length ? `<h3>Packing options</h3><ul>${packing.map((o) => `<li><strong>${esc(o.name)}</strong> — ${o.fee ? esc(money(o.fee)) : 'no charge'}${o.description ? `. ${esc(o.description)}` : ''}</li>`).join('')}</ul>` : '';
  return `${zoneHtml}${packHtml}<p class="muted small">Your exact delivery${packing.length ? ' and packing' : ''} charges are shown at checkout before you place your order.</p>`;
}

/** Order / quote price breakdown. */
export function summaryRows(q, { final = false } = {}) {
  const t = q.totals;
  const rows = [`<div class="sum-row"><span>Items (${q.itemCount ?? q.lines.reduce((s, l) => s + l.qty, 0)})</span><span>${esc(money(t.items))}</span></div>`];
  if (q.packing) rows.push(`<div class="sum-row"><span>Packing: ${esc(q.packing.name)}</span><span>${t.packing ? esc(money(t.packing)) : 'Free'}</span></div>`);
  if (q.delivery) rows.push(`<div class="sum-row"><span>Delivery: ${esc(q.delivery.zoneName)}</span><span>${q.delivery.freeApplied ? 'Free' : t.delivery ? esc(money(t.delivery)) : 'Free'}</span></div>`);
  else rows.push('<div class="sum-row"><span>Delivery</span><span class="muted">Choose area at checkout</span></div>');
  if (t.taxApplied) {
    rows.push(t.taxIncluded
      ? `<div class="sum-row muted"><span>Includes ${esc(t.taxLabel)}</span><span>${esc(money(t.tax))}</span></div>`
      : `<div class="sum-row"><span>${esc(t.taxLabel)}</span><span>${esc(money(t.tax))}</span></div>`);
  }
  rows.push(`<div class="sum-row total"><span>${final || q.delivery ? 'Total' : 'Total so far'}</span><span data-total>${esc(money(t.total))}</span></div>`);
  if (!final && !q.delivery) rows.push('<p class="sum-note">Delivery is added once you choose your area at checkout.</p>');
  if (q.delivery?.estimate) rows.push(`<p class="sum-note">Delivery estimate: ${esc(q.delivery.estimate)}</p>`);
  return rows.join('');
}

export function lineMedia(line) {
  return line.image
    ? `<img src="${esc(line.image.src)}" alt="" loading="lazy">`
    : `<svg class="hoodie-svg" viewBox="0 0 200 220" aria-hidden="true"><path d="M70 58C60 60 46 64 40 70C30 92 22 124 18 150L38 158C44 132 50 112 56 100L56 196C56 200 60 203 64 203L136 203C140 203 144 200 144 196L144 100C150 112 156 132 162 158L182 150C178 124 170 92 160 70C154 64 140 60 130 58Z M66 62C62 34 80 16 100 16C120 16 138 34 134 62C126 70 112 74 100 74C88 74 74 70 66 62Z" fill="${esc(line.hex)}" stroke="rgba(0,0,0,.25)"/></svg>`;
}

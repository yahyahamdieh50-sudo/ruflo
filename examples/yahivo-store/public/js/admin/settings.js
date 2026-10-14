// Admin settings screens. Each form saves one settings section via PUT /api/admin/settings/:section.
import { adminApi, ApiError, bindRepeaters, esc, readRepeater, repeater, showErrors, toast } from './core.js';

const UAE = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

async function save(form, section, body) {
  try {
    await adminApi(`/api/admin/settings/${section}`, { method: 'PUT', body });
    showErrors(form, {});
    toast('Saved');
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) showErrors(form, err.body.fields);
    else showErrors(form, {}, { message: err.message });
    return false;
  }
}

const v = (form, name) => { const x = form.elements[name]?.value?.trim(); return x === '' || x === undefined ? null : x; };

const screens = {
  delivery: (s) => ({
    title: 'Delivery & couriers',
    note: 'Customers see each enabled zone’s fee before ordering. Only enter estimates you can keep. No courier API is connected: record the courier and tracking number on each order (Orders → order → Courier & tracking).',
    html: `<section class="panel"><h2>Delivery zones</h2>
        <p class="hint">Each area (e.g. an emirate) may belong to only one enabled zone. Leave “Areas” empty to cover a whole country. UAE emirates: ${UAE.join(', ')}.</p>
        ${repeater('zones', [
          { key: 'id', label: 'Zone ID', hint: 'e.g. dubai', required: true },
          { key: 'name', label: 'Zone name', hint: 'shown to customers', required: true },
          { key: 'country', label: 'Country', required: true },
          { key: 'areas', label: 'Areas', type: 'list', hint: 'comma separated' },
          { key: 'fee', label: 'Delivery fee (AED)', type: 'number', required: true },
          { key: 'freeOver', label: 'Free delivery over (AED)', type: 'number', hint: 'optional' },
          { key: 'estimate', label: 'Delivery estimate', hint: 'e.g. 1–3 working days (optional)' },
          { key: 'enabled', label: 'Enabled', type: 'checkbox', default: true },
        ], s.delivery.zones, { addLabel: 'Add zone', empty: 'No delivery zones yet — checkout stays closed until you add one.' })}
      </section>
      <section class="panel"><h2>Couriers</h2>
        <p class="hint">Used for the manual tracking workflow. Tracking link example: https://courier.example/track?no={tracking}</p>
        ${repeater('couriers', [
          { key: 'id', label: 'Courier ID', required: true },
          { key: 'name', label: 'Courier name', required: true },
          { key: 'trackingUrlTemplate', label: 'Tracking link', hint: 'must contain {tracking}' },
          { key: 'phone', label: 'Courier phone' },
          { key: 'notes', label: 'Internal notes (pickup times, account no.)', type: 'textarea' },
        ], s.delivery.couriers, { addLabel: 'Add courier' })}
      </section>`,
    read: (f) => ({ zones: readRepeater(f, 'zones'), couriers: readRepeater(f, 'couriers') }),
  }),
  packing: (s) => ({
    title: 'Packing',
    note: 'Packing options are shown at checkout with their fee. If none are set, no packing choice or charge is shown. Per-order packing notes are recorded on each order.',
    html: `<section class="panel">${repeater('options', [
      { key: 'id', label: 'Option ID', required: true },
      { key: 'name', label: 'Name', hint: 'shown to customers', required: true },
      { key: 'fee', label: 'Fee (AED)', type: 'number', required: true, hint: '0 for no charge' },
      { key: 'description', label: 'Customer description' },
      { key: 'materials', label: 'Materials (internal)' },
      { key: 'isDefault', label: 'Default option', type: 'checkbox' },
    ], s.packing.options, { addLabel: 'Add packing option' })}</section>`,
    read: (f) => ({ options: readRepeater(f, 'options') }),
  }),
  tax: (s) => ({
    title: 'Tax',
    note: 'Nothing is assumed: tax is off until you enable it. Rates, whether prices include tax, and whether delivery/packing are taxable must be confirmed by you or your accountant. This store does not certify tax compliance.',
    html: `<section class="panel">
      <label class="check"><input type="checkbox" name="enabled" ${s.tax.enabled ? 'checked' : ''}> Charge / show tax</label>
      <div class="field-row">
        <div class="field"><label for="tname">Tax name <span class="hint">(as on your invoices)</span></label><input id="tname" name="name" type="text" maxlength="30" value="${esc(s.tax.name)}"></div>
        <div class="field"><label for="trate">Rate (%)</label><input id="trate" name="rate" type="number" min="0" max="50" step="0.01" value="${esc(s.tax.rate ?? '')}"></div>
      </div>
      <label class="check"><input type="checkbox" name="pricesIncludeTax" ${s.tax.pricesIncludeTax ? 'checked' : ''}> Product prices already include tax</label>
      <label class="check"><input type="checkbox" name="appliesToDelivery" ${s.tax.appliesToDelivery ? 'checked' : ''}> Tax applies to delivery fees</label>
      <label class="check"><input type="checkbox" name="appliesToPacking" ${s.tax.appliesToPacking ? 'checked' : ''}> Tax applies to packing fees</label>
      <div class="field"><label for="trn">Tax registration number <span class="hint">(optional, shown on order summaries)</span></label><input id="trn" name="registrationNumber" type="text" maxlength="40" value="${esc(s.tax.registrationNumber ?? '')}"></div>
      <label class="check"><input type="checkbox" name="confirmed" ${s.tax.confirmed ? 'checked' : ''}> I (or my accountant) have confirmed these tax settings</label>
      <p class="hint">Example: with a 5% rate and prices excluding tax, an order of AED 200 + AED 20 delivery (taxable) shows tax AED 11.00 and total AED 231.00.</p>
    </section>`,
    read: (f) => ({
      enabled: f.enabled.checked, name: v(f, 'name') ?? '', rate: v(f, 'rate') === null ? null : Number(v(f, 'rate')),
      pricesIncludeTax: f.pricesIncludeTax.checked, appliesToDelivery: f.appliesToDelivery.checked, appliesToPacking: f.appliesToPacking.checked,
      registrationNumber: v(f, 'registrationNumber'), confirmed: f.confirmed.checked,
    }),
  }),
  payments: (s, env) => ({
    title: 'Payments',
    note: 'Card details are never collected or stored by this site. Card payments run through Stripe Checkout only when STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set on the server (see README).',
    html: `<section class="panel"><h2>Payment provider</h2><p><strong>${esc(env.payments)}</strong></p></section>
      <section class="panel"><h2>Cash on delivery</h2>
        <p>When enabled, customers order without paying online and pay in cash when the order is delivered. Confirm each order with the customer, make sure whoever delivers collects the exact total, and mark the order “Paid” once you have the cash.</p>
        <label class="check"><input type="checkbox" name="manualOrderRequests" ${s.payments.manualOrderRequests ? 'checked' : ''}> Offer cash on delivery</label>
      </section>`,
    read: (f) => ({ manualOrderRequests: f.manualOrderRequests.checked }),
  }),
  store: (s) => ({
    title: 'Store info & social',
    note: 'Social links must point to your profile pages (not the Facebook/Instagram home or settings pages). Leave blank until you have them — blank links are simply not shown.',
    html: `<section class="panel"><h2>Brand</h2>
        <div class="field-row"><div class="field"><label for="brand">Brand name</label><input id="brand" name="brand" type="text" maxlength="40" value="${esc(s.brand)}"></div>
        <div class="field"><label for="logo">Logo URL <span class="hint">(dark, for the header)</span></label><input id="logo" name="logo" type="text" value="${esc(s.logo ?? '')}"></div></div>
        <div class="field"><label for="logoLight">Logo for dark backgrounds <span class="hint">(white, for the footer)</span></label><input id="logoLight" name="logoLight" type="text" value="${esc(s.logoLight ?? '')}"></div>
        <div class="field"><label for="ogImage">Social share image <span class="hint">1200×630 recommended</span></label><input id="ogImage" name="ogImage" type="text" value="${esc(s.ogImage ?? '')}"></div>
        <div class="field"><label for="eyebrow">Homepage eyebrow</label><input id="eyebrow" name="eyebrow" type="text" maxlength="60" value="${esc(s.hero.eyebrow ?? '')}"></div>
        <div class="field"><label for="headline">Homepage headline</label><input id="headline" name="headline" type="text" maxlength="80" value="${esc(s.hero.headline)}"></div>
        <div class="field"><label for="subhead">Homepage subheading</label><input id="subhead" name="subhead" type="text" maxlength="200" value="${esc(s.hero.subhead ?? '')}"></div>
      </section>
      <section class="panel"><h2>Contact</h2>
        <div class="field-row">
          <div class="field"><label for="cemail">Email</label><input id="cemail" name="email" type="email" value="${esc(s.contact.email ?? '')}"></div>
          <div class="field"><label for="cwa">WhatsApp</label><input id="cwa" name="whatsapp" type="tel" placeholder="+971…" value="${esc(s.contact.whatsapp ?? '')}"></div>
          <div class="field"><label for="cph">Phone</label><input id="cph" name="phone" type="tel" value="${esc(s.contact.phone ?? '')}"></div>
          <div class="field"><label for="chr">Hours</label><input id="chr" name="hours" type="text" value="${esc(s.contact.hours ?? '')}"></div>
        </div>
        <div class="field"><label for="cad">Address</label><textarea id="cad" name="address">${esc(s.contact.address ?? '')}</textarea></div>
      </section>
      <section class="panel"><h2>Social profiles</h2>
        <div class="field"><label for="sfb">Facebook profile URL</label><input id="sfb" name="facebook" type="url" placeholder="https://www.facebook.com/yourpage" value="${esc(s.social.facebook ?? '')}"></div>
        <div class="field"><label for="sig">Instagram profile URL</label><input id="sig" name="instagram" type="url" placeholder="https://www.instagram.com/yourhandle" value="${esc(s.social.instagram ?? '')}"></div>
        <div class="field"><label for="stt">TikTok profile URL</label><input id="stt" name="tiktok" type="url" placeholder="https://www.tiktok.com/@yourhandle" value="${esc(s.social.tiktok ?? '')}"></div>
      </section>`,
    read: (f) => ({
      brand: v(f, 'brand'), logo: v(f, 'logo'), logoLight: v(f, 'logoLight'), ogImage: v(f, 'ogImage'),
      hero: { eyebrow: v(f, 'eyebrow'), headline: v(f, 'headline'), subhead: v(f, 'subhead') },
      contact: { email: v(f, 'email'), whatsapp: v(f, 'whatsapp'), phone: v(f, 'phone'), hours: v(f, 'hours'), address: v(f, 'address') },
      social: { facebook: v(f, 'facebook'), instagram: v(f, 'instagram'), tiktok: v(f, 'tiktok') },
    }),
  }),
  policies: (s) => ({
    title: 'Policies & FAQs',
    note: 'Write only policies you will honour. Empty policies are shown to customers as “not published yet”. Have the privacy page reviewed before launch.',
    html: `<section class="panel">
        <div class="field"><label for="psh">Shipping policy</label><textarea id="psh" name="shipping" rows="6">${esc(s.policies.shipping ?? '')}</textarea></div>
        <div class="field"><label for="pre">Returns &amp; exchanges policy</label><textarea id="pre" name="returns" rows="6">${esc(s.policies.returns ?? '')}</textarea></div>
        <div class="field-row"><div class="field"><label for="ppe">Privacy contact email</label><input id="ppe" name="privacyContactEmail" type="email" value="${esc(s.policies.privacyContactEmail ?? '')}"></div>
        <div class="field"><label for="plu">Policies last updated</label><input id="plu" name="lastUpdated" type="text" placeholder="YYYY-MM-DD" value="${esc(s.policies.lastUpdated ?? '')}"></div></div>
      </section>
      <section class="panel"><h2>Extra FAQs</h2><p class="hint">Delivery, packing, payment, tax and returns FAQs are generated automatically from your settings.</p>
        ${repeater('faqs', [{ key: 'q', label: 'Question', required: true }, { key: 'a', label: 'Answer', type: 'textarea', required: true }], s.faqs, { addLabel: 'Add FAQ' })}
      </section>`,
    sections: ['policies', 'faqs'],
    read: (f) => ({
      policies: { shipping: v(f, 'shipping'), returns: v(f, 'returns'), privacyContactEmail: v(f, 'privacyContactEmail'), lastUpdated: v(f, 'lastUpdated') },
      faqs: readRepeater(f, 'faqs'),
    }),
  }),
  sizeGuide: (s) => ({
    title: 'Size guide',
    note: 'Enter measurements from your real garments. Until rows are added, customers see “measurements not published”.',
    html: `<section class="panel">
      <div class="field-row"><div class="field"><label for="sgu">Unit</label><select id="sgu" name="unit"><option value="cm" ${s.sizeGuide.unit === 'cm' ? 'selected' : ''}>cm</option><option value="in" ${s.sizeGuide.unit === 'in' ? 'selected' : ''}>inches</option></select></div>
      <div class="field"><label for="sgc">Columns <span class="hint">(comma separated)</span></label><input id="sgc" name="columns" type="text" value="${esc(s.sizeGuide.columns.join(', '))}"></div></div>
      ${repeater('rows', [{ key: 'size', label: 'Size', required: true }, { key: 'values', label: 'Measurements', type: 'list', hint: 'comma separated, same order as columns' }], s.sizeGuide.rows, { addLabel: 'Add size row' })}
      <div class="field"><label for="sgn">Fit notes</label><textarea id="sgn" name="fitNotes">${esc(s.sizeGuide.fitNotes ?? '')}</textarea></div>
    </section>`,
    read: (f) => ({ unit: f.unit.value, columns: f.columns.value.split(',').map((c) => c.trim()).filter(Boolean), rows: readRepeater(f, 'rows'), fitNotes: v(f, 'fitNotes') }),
  }),
  analytics: (s) => ({
    title: 'Analytics',
    note: 'Optional. When set, Google Analytics 4 loads on the storefront and receives view_item, add_to_cart, begin_checkout and purchase events. Update the privacy policy and cookie consent to match before launch.',
    html: `<section class="panel"><div class="field"><label for="ga">GA4 Measurement ID</label><input id="ga" name="ga4MeasurementId" type="text" placeholder="G-XXXXXXX" value="${esc(s.analytics.ga4MeasurementId ?? '')}"></div></section>`,
    read: (f) => ({ ga4MeasurementId: v(f, 'ga4MeasurementId') }),
  }),
};

export default async function settingsView(el, name) {
  const [{ settings }, overview] = await Promise.all([adminApi('/api/admin/settings'), name === 'payments' ? adminApi('/api/admin/overview') : null]);
  const screen = screens[name](settings, overview?.integrations ?? {});
  el.innerHTML = `<h1>${esc(screen.title)}</h1><div class="panel-note">${esc(screen.note)}</div>
    <form id="sf" novalidate>${screen.html}<div class="actions"><button class="btn" type="submit">Save</button></div></form>`;
  const form = el.querySelector('#sf');
  bindRepeaters(form);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = screen.read(form);
    if (screen.sections) {
      for (const sec of screen.sections) if (!(await save(form, sec, data[sec]))) return;
    } else {
      await save(form, name, data);
    }
  });
}

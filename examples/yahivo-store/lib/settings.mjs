// Store settings: per-section validation (admin), public projection (storefront)
// and the launch checklist of everything still missing.
import { Checker, EMAIL_RE, ID_RE, PHONE_RE, UAE_EMIRATES } from './validate.mjs';

export const SECTIONS = ['store', 'delivery', 'packing', 'tax', 'payments', 'policies', 'sizeGuide', 'faqs', 'analytics'];

const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

function uniqueIds(ck, list, key) {
  const ids = list.map((x) => x.id);
  if (new Set(ids).size !== ids.length) ck.fail(key, 'IDs must be unique.');
}

const validators = {
  store(v, ck) {
    const social = v.social ?? {};
    // Exact profile hosts only — account-centre / settings / login pages are not profiles.
    const host = (url, hosts, key, label) => {
      const u = ck.url(key, url, label);
      if (!u) return u;
      const { hostname, pathname } = new URL(u);
      if (!hosts.includes(hostname)) return ck.fail(key, `${label} must be a link on ${hosts[0]}.`);
      if (/^\/?$/.test(pathname) || /^\/(settings|login|accounts|home\.php|manage)\b/i.test(pathname)) return ck.fail(key, `${label} must link to your public profile page.`);
      return u;
    };
    return {
      brand: ck.text('brand', v.brand, 'Brand name', { max: 40, required: true }),
      logo: ck.url('logo', v.logo, 'Logo', { allowRelative: true }),
      ogImage: ck.url('ogImage', v.ogImage, 'Social share image', { allowRelative: true }),
      hero: {
        eyebrow: ck.text('hero.eyebrow', v.hero?.eyebrow, 'Eyebrow', { max: 60 }),
        headline: ck.text('hero.headline', v.hero?.headline, 'Headline', { max: 80, required: true }),
        subhead: ck.text('hero.subhead', v.hero?.subhead, 'Subheading', { max: 200 }),
      },
      contact: {
        email: ck.text('contact.email', v.contact?.email, 'Email', { max: 254, pattern: EMAIL_RE }),
        phone: ck.text('contact.phone', v.contact?.phone, 'Phone', { max: 20, pattern: PHONE_RE }),
        whatsapp: ck.text('contact.whatsapp', v.contact?.whatsapp, 'WhatsApp number', { max: 20, pattern: PHONE_RE }),
        address: ck.text('contact.address', v.contact?.address, 'Address', { max: 300, multiline: true }),
        hours: ck.text('contact.hours', v.contact?.hours, 'Hours', { max: 120 }),
      },
      social: {
        facebook: host(social.facebook, ['www.facebook.com', 'facebook.com', 'm.facebook.com', 'fb.com'], 'social.facebook', 'Facebook'),
        instagram: host(social.instagram, ['www.instagram.com', 'instagram.com'], 'social.instagram', 'Instagram'),
        tiktok: host(social.tiktok, ['www.tiktok.com', 'tiktok.com'], 'social.tiktok', 'TikTok'),
      },
    };
  },
  delivery(v, ck) {
    const zones = arr(v.zones, 30).map((z, i) => ({
      id: ck.text(`zones.${i}.id`, z?.id, 'Zone ID', { max: 40, required: true, pattern: ID_RE }),
      name: ck.text(`zones.${i}.name`, z?.name, 'Zone name', { max: 60, required: true }),
      country: ck.text(`zones.${i}.country`, z?.country, 'Country', { max: 60, required: true }),
      areas: arr(z?.areas, 50).map((a, j) => ck.text(`zones.${i}.areas.${j}`, a, 'Area', { max: 60, required: true })),
      fee: ck.money(`zones.${i}.fee`, z?.fee, 'Delivery fee', { required: true }),
      freeOver: ck.money(`zones.${i}.freeOver`, z?.freeOver, 'Free delivery threshold'),
      estimate: ck.text(`zones.${i}.estimate`, z?.estimate, 'Delivery estimate', { max: 80 }),
      enabled: z?.enabled !== false,
    }));
    uniqueIds(ck, zones, 'zones');
    // An area may only belong to one enabled zone so the fee is unambiguous.
    const seen = new Set();
    zones.filter((z) => z.enabled).forEach((z, i) => {
      for (const a of z.areas.length ? z.areas : ['*']) {
        const k = `${z.country}|${a}`;
        if (seen.has(k)) ck.fail(`zones.${i}.areas`, `${a === '*' ? z.country : a} is already covered by another enabled zone.`);
        seen.add(k);
      }
    });
    const couriers = arr(v.couriers, 20).map((c, i) => ({
      id: ck.text(`couriers.${i}.id`, c?.id, 'Courier ID', { max: 40, required: true, pattern: ID_RE }),
      name: ck.text(`couriers.${i}.name`, c?.name, 'Courier name', { max: 60, required: true }),
      trackingUrlTemplate: (() => {
        const t = ck.url(`couriers.${i}.trackingUrlTemplate`, c?.trackingUrlTemplate?.replace('{tracking}', 'TRACKING'), 'Tracking link');
        if (t && !c.trackingUrlTemplate.includes('{tracking}')) return ck.fail(`couriers.${i}.trackingUrlTemplate`, 'Tracking link must contain {tracking}.');
        return t ? c.trackingUrlTemplate.trim() : null;
      })(),
      phone: ck.text(`couriers.${i}.phone`, c?.phone, 'Courier phone', { max: 20, pattern: PHONE_RE }),
      notes: ck.text(`couriers.${i}.notes`, c?.notes, 'Courier notes', { max: 300, multiline: true }),
    }));
    uniqueIds(ck, couriers, 'couriers');
    return { zones, couriers };
  },
  packing(v, ck) {
    const options = arr(v.options, 10).map((o, i) => ({
      id: ck.text(`options.${i}.id`, o?.id, 'Option ID', { max: 40, required: true, pattern: ID_RE }),
      name: ck.text(`options.${i}.name`, o?.name, 'Option name', { max: 60, required: true }),
      description: ck.text(`options.${i}.description`, o?.description, 'Description', { max: 200 }),
      materials: ck.text(`options.${i}.materials`, o?.materials, 'Materials', { max: 200 }),
      fee: ck.money(`options.${i}.fee`, o?.fee, 'Packing fee', { required: true }),
      isDefault: o?.isDefault === true,
    }));
    uniqueIds(ck, options, 'options');
    if (options.filter((o) => o.isDefault).length > 1) ck.fail('options', 'Only one packing option can be the default.');
    if (options.length && !options.some((o) => o.isDefault)) options[0].isDefault = true;
    return { options };
  },
  tax(v, ck) {
    const enabled = v.enabled === true;
    const rate = v.rate === null || v.rate === '' || v.rate === undefined ? null : Number(v.rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 50)) ck.fail('rate', 'Tax rate must be between 0 and 50 (%).');
    const name = ck.text('name', v.name, 'Tax name', { max: 30 });
    if (enabled && rate === null) ck.fail('rate', 'Enter a tax rate before enabling tax.');
    if (enabled && !name) ck.fail('name', 'Enter a tax name (e.g. the name on your invoices) before enabling tax.');
    return {
      enabled,
      name: name ?? '',
      rate,
      pricesIncludeTax: v.pricesIncludeTax === true,
      appliesToDelivery: v.appliesToDelivery === true,
      appliesToPacking: v.appliesToPacking === true,
      registrationNumber: ck.text('registrationNumber', v.registrationNumber, 'Tax registration number', { max: 40 }),
      confirmed: v.confirmed === true,
    };
  },
  payments(v) {
    return { manualOrderRequests: v.manualOrderRequests === true };
  },
  policies(v, ck) {
    return {
      shipping: ck.text('shipping', v.shipping, 'Shipping policy', { max: 8000, multiline: true }),
      returns: ck.text('returns', v.returns, 'Returns policy', { max: 8000, multiline: true }),
      privacyContactEmail: ck.text('privacyContactEmail', v.privacyContactEmail, 'Privacy contact email', { max: 254, pattern: EMAIL_RE }),
      lastUpdated: /^\d{4}-\d{2}-\d{2}$/.test(v.lastUpdated ?? '') ? v.lastUpdated : null,
    };
  },
  sizeGuide(v, ck) {
    const columns = arr(v.columns, 6).map((c, i) => ck.text(`columns.${i}`, c, 'Column', { max: 30, required: true }));
    const rows = arr(v.rows, 12).map((r, i) => ({
      size: ck.text(`rows.${i}.size`, r?.size, 'Size', { max: 10, required: true }),
      values: columns.map((_, j) => ck.text(`rows.${i}.values.${j}`, r?.values?.[j] == null ? '' : String(r.values[j]), 'Measurement', { max: 20 }) ?? ''),
    }));
    return {
      unit: ['cm', 'in'].includes(v.unit) ? v.unit : 'cm',
      columns, rows,
      fitNotes: ck.text('fitNotes', v.fitNotes, 'Fit notes', { max: 1000, multiline: true }),
    };
  },
  faqs(v, ck) {
    return arr(v, 30).map((f, i) => ({
      q: ck.text(`${i}.q`, f?.q, 'Question', { max: 200, required: true }),
      a: ck.text(`${i}.a`, f?.a, 'Answer', { max: 2000, required: true, multiline: true }),
    }));
  },
  analytics(v, ck) {
    return { ga4MeasurementId: ck.text('ga4MeasurementId', v.ga4MeasurementId, 'GA4 Measurement ID', { max: 20, pattern: /^G-[A-Z0-9]{4,15}$/ }) };
  },
};

/** Validate one settings section and return the merged settings object. */
export function applySection(settings, section, value) {
  if (!SECTIONS.includes(section)) throw new Error('Unknown settings section');
  const ck = new Checker();
  const input = value && typeof value === 'object' ? value : {};
  const clean = ck.done(validators[section](input, ck));
  if (section === 'store') return { ...settings, ...clean };
  return { ...settings, [section]: clean };
}

/** Countries -> regions customers can pick at checkout (from enabled delivery zones). */
export function deliveryRegions(settings) {
  const out = {};
  for (const z of settings.delivery.zones.filter((zz) => zz.enabled)) {
    out[z.country] ??= [];
    if (z.areas.length) out[z.country].push(...z.areas);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

export function zoneFor(settings, country, region) {
  const zones = settings.delivery.zones.filter((z) => z.enabled && z.country === country);
  return zones.find((z) => z.areas.includes(region)) ?? zones.find((z) => !z.areas.length) ?? null;
}

/** What the storefront may see. No internal notes, no courier contacts, no secrets. */
export function publicSettings(settings, { paymentMethods, aiMode, sampleData }) {
  const { tax } = settings;
  return {
    brand: settings.brand, currency: settings.currency, locale: settings.locale,
    logo: settings.logo, hero: settings.hero, contact: settings.contact, social: settings.social,
    delivery: {
      regions: deliveryRegions(settings),
      zones: settings.delivery.zones.filter((z) => z.enabled)
        .map(({ id, name, country, areas, fee, freeOver, estimate }) => ({ id, name, country, areas, fee, freeOver, estimate })),
    },
    packing: settings.packing,
    tax: tax.enabled ? { enabled: true, name: tax.name, rate: tax.rate, pricesIncludeTax: tax.pricesIncludeTax, appliesToDelivery: tax.appliesToDelivery, appliesToPacking: tax.appliesToPacking, registrationNumber: tax.registrationNumber } : { enabled: false },
    paymentMethods,
    policies: settings.policies, sizeGuide: settings.sizeGuide, faqs: settings.faqs,
    analytics: settings.analytics, aiMode, sampleData,
    ordering: paymentMethods.length > 0 && settings.delivery.zones.some((z) => z.enabled),
  };
}

export const UAE_DEFAULT_AREAS = UAE_EMIRATES;

/** Launch checklist. `ok: false` items are shown on the admin dashboard. */
export function launchChecklist(settings, products, { stripe, aiLive, adminPasswordSet }) {
  const item = (ok, label, how, severity = 'required') => ({ ok: Boolean(ok), label, how, severity });
  const real = products.filter((p) => !p.sample);
  return [
    item(real.length && !products.some((p) => p.sample && p.published), 'Real products (sample catalog still published)', 'Admin → Products: add real hoodies, then unpublish or delete the SAMPLE items.'),
    item(real.length && real.every((p) => p.images.length), 'Product photos for every product', 'Admin → Products → Images (upload or paste URLs).'),
    item(real.length && real.every((p) => p.colors.every((c) => c.stock)), 'Stock quantities confirmed', 'Admin → Products → stock per colour/size.'),
    item(settings.logo, 'YAHIVO logo', 'Admin → Store info → Logo.'),
    item(settings.contact.email || settings.contact.phone || settings.contact.whatsapp, 'Customer contact channel', 'Admin → Store info → Contact.'),
    item(settings.social.facebook, 'Facebook profile URL', 'Admin → Store info → Social.', 'recommended'),
    item(settings.social.instagram, 'Instagram profile URL', 'Admin → Store info → Social.', 'recommended'),
    item(settings.social.tiktok, 'TikTok profile URL', 'Admin → Store info → Social.', 'recommended'),
    item(settings.delivery.zones.some((z) => z.enabled), 'Delivery zones and fees', 'Admin → Delivery → Zones.'),
    item(settings.delivery.zones.filter((z) => z.enabled).every((z) => z.estimate), 'Delivery estimates for each zone', 'Admin → Delivery → Zones → Estimate (only what you can promise).'),
    item(settings.delivery.couriers.length, 'Courier details (manual tracking workflow)', 'Admin → Delivery → Couriers.'),
    item(settings.packing.options.length, 'Packing options and fees', 'Admin → Packing.'),
    item(settings.tax.confirmed, 'Tax settings confirmed by you or your accountant', 'Admin → Tax: set name, rate, inclusive/exclusive, then tick "confirmed".'),
    item(stripe, 'Payment provider (Stripe keys)', 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars (see README).'),
    item(!settings.payments.manualOrderRequests || stripe, 'Pay-later order requests are a placeholder', 'Admin → Payments: turn off once a payment provider is live.', 'recommended'),
    item(settings.policies.shipping, 'Shipping policy text', 'Admin → Policies.'),
    item(settings.policies.returns, 'Returns / exchanges policy text', 'Admin → Policies.'),
    item(settings.policies.privacyContactEmail, 'Privacy contact + legal review of privacy policy', 'Admin → Policies.'),
    item(settings.sizeGuide.rows.length, 'Size guide measurements', 'Admin → Size guide.'),
    item(aiLive, 'Live AI assistant (currently demo mode)', 'Set ANTHROPIC_API_KEY env var (see README).', 'recommended'),
    item(settings.analytics.ga4MeasurementId, 'Analytics measurement ID', 'Admin → Analytics.', 'optional'),
    item(adminPasswordSet, 'Strong admin password', 'Set ADMIN_PASSWORD (12+ characters).'),
  ];
}

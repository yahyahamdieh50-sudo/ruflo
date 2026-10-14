// Order totals in minor units (fils) to avoid floating-point drift.
// Tax handling follows the admin's tax settings exactly; nothing is assumed.

export const toMinor = (major) => Math.round(Number(major) * 100);
export const toMajor = (minor) => Math.round(minor) / 100;

/**
 * @param {object} p
 * @param {number} p.itemsMinor   sum of line totals (as entered in the catalog)
 * @param {number} p.packingMinor packing fee
 * @param {number} p.deliveryMinor delivery fee (after any free-delivery threshold)
 * @param {object} p.tax          settings.tax
 */
export function computeTotals({ itemsMinor, packingMinor = 0, deliveryMinor = 0, tax }) {
  const base = { items: itemsMinor, packing: packingMinor, delivery: deliveryMinor };
  const charges = itemsMinor + packingMinor + deliveryMinor;
  if (!tax?.enabled || tax.rate === null || tax.rate === undefined) {
    return { ...base, taxable: 0, tax: 0, taxIncluded: false, taxApplied: false, total: charges };
  }
  const taxable = itemsMinor
    + (tax.appliesToPacking ? packingMinor : 0)
    + (tax.appliesToDelivery ? deliveryMinor : 0);
  const r = Number(tax.rate);
  if (tax.pricesIncludeTax) {
    // Prices already contain tax: report the tax portion, total is unchanged.
    const portion = Math.round((taxable * r) / (100 + r));
    return { ...base, taxable, tax: portion, taxIncluded: true, taxApplied: true, total: charges };
  }
  const added = Math.round((taxable * r) / 100);
  return { ...base, taxable, tax: added, taxIncluded: false, taxApplied: true, total: charges + added };
}

/** Totals converted to major units for API responses. */
export function totalsToMajor(t, tax) {
  return {
    items: toMajor(t.items),
    packing: toMajor(t.packing),
    delivery: toMajor(t.delivery),
    tax: toMajor(t.tax),
    taxIncluded: t.taxIncluded,
    taxApplied: t.taxApplied,
    taxLabel: t.taxApplied ? `${tax.name} (${tax.rate}%)` : null,
    total: toMajor(t.total),
  };
}

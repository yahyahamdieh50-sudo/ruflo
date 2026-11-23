import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { listPlans, formatAed } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminPricing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; await requireRole("admin"); const { t } = await getT();
  const plans = await listPlans();
  return (
    <div><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.pricing")}</h1><p className="mt-1 text-sm text-steel-600">{t("admin.pricing_note")}</p>
      {sp.saved && <p role="status" className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}{sp.synced && <p role="status" className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.synced")}</p>}
      {sp.error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{t(`err.${sp.error}`)}</p>}
      {!stripeConfigured() && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{t("pricing.stripe_off")}</p>}
      <div className="mt-6 space-y-3">{plans.map((p) => (
        <div key={p.id} className="card flex flex-wrap items-center gap-4 p-4"><div className="w-40"><p className="font-bold">{p.name}</p><p className="text-xs text-steel-500">{p.code} · {p.interval}</p></div>
          <form action={A.updatePlanAction} className="flex flex-wrap items-center gap-3"><input type="hidden" name="id" value={p.id} />
            <label className="text-sm">USD <input name="price_usd" type="number" step="0.01" min={0} defaultValue={(p.price_usd_cents / 100).toFixed(2)} className="input ms-1 inline w-28" /></label>
            <span className="text-xs text-steel-500">≈ {formatAed(p.price_usd_cents)}</span>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} />{t("admin.active")}</label><button className="btn-navy btn-sm">{t("admin.save")}</button></form>
          <form action={A.syncPlanAction} className="ms-auto"><input type="hidden" name="id" value={p.id} /><button className="btn-outline btn-sm" disabled={!stripeConfigured()}>{p.stripe_price_id ? `✓ ${t("admin.resync")}` : t("admin.sync")}</button></form></div>))}</div></div>
  );
}

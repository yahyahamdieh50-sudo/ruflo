import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { query } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function Promos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; await requireRole("admin"); const { t } = await getT();
  const promos = await query<any>("SELECT * FROM promo_codes ORDER BY created_at DESC");
  return (
    <div><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.promos")}</h1>
      {sp.saved && <p role="status" className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}{sp.error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{t(`err.${sp.error}`)}</p>}
      {!stripeConfigured() && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">{t("pricing.stripe_off")}</p>}
      <form action={A.createPromoAction} className="card mt-6 grid gap-3 p-5 md:grid-cols-3"><div><label className="label">{t("admin.promo_code")}</label><input name="code" required pattern="[A-Za-z0-9_-]{3,32}" className="input uppercase" /></div>
        <div><label className="label">{t("admin.percent_off")}</label><input name="percent_off" type="number" min={1} max={100} className="input" /></div><div><label className="label">{t("admin.amount_off")} (USD)</label><input name="amount_off" type="number" step="0.01" min={0} className="input" /></div>
        <div><label className="label">{t("admin.max_redemptions")}</label><input name="max_redemptions" type="number" min={1} className="input" /></div><div><label className="label">{t("admin.expires")}</label><input name="expires_at" type="date" className="input" /></div>
        <div className="flex items-end"><button className="btn-primary w-full" disabled={!stripeConfigured()}>{t("admin.create")}</button></div><p className="text-xs text-steel-500 md:col-span-3">{t("admin.promo_note")}</p></form>
      <div className="card mt-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-steel-50 text-xs uppercase text-steel-500"><th className="p-3 text-start">{t("admin.promo_code")}</th><th>{t("admin.discount")}</th><th>{t("admin.expires")}</th><th>{t("admin.status")}</th><th /></tr></thead>
        <tbody>{promos.map((p: any) => <tr key={p.id} className="border-t border-steel-100 text-center"><td className="p-3 text-start font-mono font-bold">{p.code}</td><td>{p.percent_off ? `${p.percent_off}%` : `$${(p.amount_off_cents / 100).toFixed(2)}`}</td><td>{p.expires_at ? new Date(p.expires_at).toLocaleDateString("en-GB") : "—"}</td>
          <td><span className={`tag ${p.active ? "bg-emerald-100 text-emerald-800" : "bg-steel-200"}`}>{p.active ? t("admin.active") : t("admin.disabled")}</span></td>
          <td><form action={A.togglePromoAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} /><button className="btn-outline btn-sm">{p.active ? t("admin.disable") : t("admin.enable")}</button></form></td></tr>)}</tbody></table></div></div>
  );
}

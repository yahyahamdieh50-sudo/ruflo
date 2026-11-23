import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { query } from "@/lib/db";
import { getLiveSubscription } from "@/lib/billing";
import { listPlans, formatUsd } from "@/lib/plans";
import { stripeConfigured } from "@/lib/stripe";
import { cancelAction, changePlanAction, portalAction, refreshBillingAction } from "@/app/actions/billing";
import { Alert } from "@/components/AuthForm";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing" };

export default async function Billing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await requireViewer("/dashboard/billing");
  const { t, locale } = await getT();
  const live = await getLiveSubscription(v.user.id);
  const last = await query<{ stripe_subscription_id: string; plan_code: string; status: string; current_period_end: string | null }>(
    "SELECT stripe_subscription_id,plan_code,status,current_period_end FROM subscriptions WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1", [v.user.id]);
  const payments = await query<{ id: string; amount_cents: number; currency: string; status: string; hosted_invoice_url: string | null; created_at: string }>(
    "SELECT id,amount_cents,currency,status,hosted_invoice_url,created_at FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50", [v.user.id]);
  const plans = (await listPlans(true)).filter((p) => !live || p.code !== live.plan_code || p.interval !== live.interval);
  const ready = stripeConfigured();
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-GB") : "—");
  const lastFailed = payments[0]?.status === "failed";

  return (
    <div className="container-x max-w-4xl py-10">
      <h1 className="text-3xl font-extrabold text-navy-900">{t("billing.title")}</h1>
      {sp.checkout === "success" && <div className="mt-4"><Alert kind="ok">{t("billing.success")}</Alert></div>}
      {sp.changed && <div className="mt-4"><Alert kind="ok">{t(`billing.changed_${sp.changed}`)}</Alert></div>}
      {sp.updated && <div className="mt-4"><Alert kind="ok">{t("billing.updated")}</Alert></div>}
      {sp.error && <div className="mt-4"><Alert>{t(`err.${sp.error}`)}</Alert></div>}
      {(live?.status === "past_due" || lastFailed) && <div className="mt-4"><Alert>{t("billing.failed_banner")}</Alert></div>}
      {!live && last[0] && ["canceled", "unpaid", "incomplete_expired"].includes(last[0].status) && <div className="mt-4"><Alert kind="info">{t("billing.expired", { date: date(last[0].current_period_end) })}</Alert></div>}

      <section className="card mt-6 p-6">
        <h2 className="text-lg font-bold text-navy-900">{t("dash.subscription")}</h2>
        {live ? (<>
          <p className="mt-2 text-sm"><b>{t(`tier.${live.plan_code}`)}</b> · {live.interval === "year" ? t("pricing.year") : t("pricing.month")} · <span className="tag bg-emerald-100 text-emerald-800">{t(`sub.${live.status}`)}</span></p>
          <p className="mt-1 text-sm text-steel-600">{live.cancel_at_period_end ? t("sub.ends") : t("sub.renews")}: {date(live.current_period_end)}{live.pending_plan_code ? ` · ${t("sub.pending", { plan: t(`tier.${live.pending_plan_code}`) })}` : ""}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <form action={portalAction}><button className="btn-navy btn-sm" disabled={!ready}>{t("billing.portal")}</button></form>
            <form action={cancelAction}>{live.cancel_at_period_end && <input type="hidden" name="resume" value="1" />}<button className={live.cancel_at_period_end ? "btn-primary btn-sm" : "btn-outline btn-sm"} disabled={!ready}>{live.cancel_at_period_end ? t("billing.resume") : t("billing.cancel")}</button></form>
            <form action={refreshBillingAction}><button className="btn-outline btn-sm" disabled={!ready}>{t("billing.refresh")}</button></form>
          </div>
          {plans.length > 0 && <div className="mt-6 border-t border-steel-100 pt-4"><h3 className="font-bold text-navy-900">{t("billing.change")}</h3><p className="text-xs text-steel-500">{t("billing.change_note")}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">{plans.map((p) => (<form key={p.id} action={changePlanAction} className="rounded border border-steel-200 p-3 text-sm"><input type="hidden" name="plan" value={p.code} /><input type="hidden" name="interval" value={p.interval} />
              <p className="font-semibold">{t(`tier.${p.code}`)} · {formatUsd(p.price_usd_cents)}/{p.interval === "year" ? t("pricing.year") : t("pricing.month")}</p><button className="btn-navy btn-sm mt-2" disabled={!ready || !p.stripe_price_id}>{p.code === "pro" && live.plan_code === "basic" ? t("billing.upgrade") : t("billing.switch")}</button></form>))}</div></div>}
        </>) : (<><p className="mt-2 text-sm text-steel-600">{v.plan === "free" ? t("sub.none") : t("sub.comp")}</p><div className="mt-4 flex gap-3"><Link href="/pricing" className="btn-primary btn-sm">{t("cta.see_plans")}</Link>{v.user.stripe_customer_id && <form action={refreshBillingAction}><button className="btn-outline btn-sm" disabled={!ready}>{t("billing.refresh")}</button></form>}</div></>)}
        {!ready && <p className="mt-4 text-xs text-amber-700">{t("pricing.stripe_off")}</p>}
      </section>

      <section className="card mt-6 overflow-x-auto p-6"><h2 className="text-lg font-bold text-navy-900">{t("billing.history")}</h2>
        {payments.length === 0 ? <p className="mt-3 text-sm text-steel-600">{t("billing.no_history")}</p> : (
          <table className="mt-3 w-full text-sm"><thead><tr className="text-start text-xs uppercase text-steel-500"><th className="py-2 text-start">{t("billing.date")}</th><th className="text-start">{t("billing.amount")}</th><th className="text-start">{t("billing.status")}</th><th /></tr></thead>
            <tbody>{payments.map((p) => (<tr key={p.id} className="border-t border-steel-100"><td className="py-2">{date(p.created_at)}</td><td>{formatUsd(p.amount_cents)}</td><td><span className={`tag ${p.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"}`}>{t(`pay.${p.status}`)}</span></td><td className="text-end">{p.hosted_invoice_url && <a href={p.hosted_invoice_url} className="font-bold text-accent-dark" rel="noopener noreferrer" target="_blank">{t("billing.invoice")}</a>}</td></tr>))}</tbody></table>)}
      </section>
    </div>
  );
}

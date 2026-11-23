import { getT } from "@/lib/i18n-server";
import { getViewer } from "@/lib/auth";
import { listPlans } from "@/lib/plans";
import { env } from "@/lib/env";
import { stripeConfigured } from "@/lib/stripe";
import { getLiveSubscription } from "@/lib/billing";
import { PricingTable } from "@/components/PricingTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing" };

export default async function Pricing({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t } = await getT();
  const [viewer, plans] = await Promise.all([getViewer(), listPlans(true)]);
  const sub = viewer ? await getLiveSubscription(viewer.user.id) : null;
  const feats = (p: string) => [1, 2, 3, 4, 5, 6].map((n) => t(`plan.${p}.f${n}`)).filter((s) => !/^plan\./.test(s));
  const L = Object.fromEntries(["free", "basic", "pro", "popular", "month", "year", "monthly", "yearly", "billing", "current", "included", "signup", "unavailable", "manage", "promo", "subscribe", "stripe_off", "billed_usd", "aed_note"].map((k) => [k, t(`pricing.${k}`)]));
  return (
    <div className="container-x py-12">
      <div className="mx-auto max-w-2xl text-center"><h1 className="text-4xl font-extrabold text-navy-900">{t("pricing.title")}</h1><p className="mt-3 text-steel-600">{t("pricing.sub")}</p></div>
      {sp.error && <p role="alert" className="mx-auto mt-6 max-w-xl rounded bg-red-50 p-3 text-center text-sm font-semibold text-red-700">{t(`err.${sp.error}`)}</p>}
      {sp.checkout === "cancelled" && <p className="mx-auto mt-6 max-w-xl rounded bg-amber-50 p-3 text-center text-sm text-amber-800">{t("pricing.cancelled")}</p>}
      {viewer && !viewer.user.email_verified_at && <p className="mx-auto mt-6 max-w-xl rounded bg-amber-50 p-3 text-center text-sm text-amber-800">{t("err.email_unverified")}</p>}
      <div className="mt-10"><PricingTable
        plans={plans.map((p) => ({ code: p.code, interval: p.interval, cents: p.price_usd_cents }))}
        aedRate={env.aedPerUsd} stripeReady={stripeConfigured()} loggedIn={!!viewer} hasSubscription={!!sub} current={viewer?.plan ?? "free"}
        features={{ free: feats("free"), basic: feats("basic"), pro: feats("pro") }} labels={L} /></div>
      <section className="mx-auto mt-14 max-w-3xl text-sm text-steel-600"><h2 className="text-lg font-bold text-navy-900">{t("pricing.faq")}</h2>
        <ul className="mt-3 space-y-3">{[1, 2, 3, 4].map((n) => <li key={n}><b className="text-navy-900">{t(`pricing.q${n}`)}</b><br />{t(`pricing.a${n}`)}</li>)}</ul></section>
    </div>
  );
}

import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getDashboard } from "@/lib/learning";
import { pick } from "@/lib/courses";
import { resendVerificationAction } from "@/app/actions/auth";
import { TierTag } from "@/components/Badges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dashboard" };

const statusStyle: Record<string, string> = { active: "bg-emerald-100 text-emerald-800", trialing: "bg-emerald-100 text-emerald-800", past_due: "bg-amber-100 text-amber-800", canceled: "bg-red-100 text-red-700", unpaid: "bg-red-100 text-red-700" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const v = await requireViewer("/dashboard");
  const { t, locale } = await getT();
  const d = await getDashboard(v.user.id, v.plan);
  const sub = d.subscription as any;
  return (
    <div className="container-x py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold text-navy-900">{t("dash.hello", { name: v.user.name.split(" ")[0] })}</h1><p className="text-steel-600">{t("dash.sub")}</p></div>
        <div className="flex items-center gap-2"><span className="text-sm text-steel-600">{t("dash.plan")}:</span><TierTag tier={v.plan} t={t} /></div>
      </div>
      {sp.welcome && <p className="mt-4 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("dash.welcome")}</p>}
      {sp.verify_sent && <p className="mt-4 rounded bg-navy-50 p-3 text-sm text-navy-800">{t("dash.verify_sent")}</p>}
      {!v.user.email_verified_at && (
        <form action={resendVerificationAction} className="mt-4 flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><span>{t("dash.unverified")}</span><button className="btn-outline btn-sm">{t("dash.resend")}</button></form>)}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="card p-6 lg:col-span-2" aria-labelledby="cont">
          <h2 id="cont" className="text-lg font-bold text-navy-900">{t("dash.continue")}</h2>
          {d.continueItem?.next ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded bg-navy-50 p-4"><div><p className="text-xs uppercase tracking-wide text-steel-500">{pick(d.continueItem, "title", locale)}</p><p className="font-bold text-navy-900">{pick(d.continueItem.next, "title", locale)}</p></div>
              <Link href={`/courses/${d.continueItem.slug}/learn/${d.continueItem.next.id}`} className="btn-primary btn-sm">{t("dash.resume")}</Link></div>
          ) : <p className="mt-3 text-sm text-steel-600">{t("dash.nothing")} <Link href="/courses" className="font-bold text-accent-dark">{t("nav.courses")}</Link></p>}
        </section>

        <section className="card p-6" aria-labelledby="subs">
          <h2 id="subs" className="text-lg font-bold text-navy-900">{t("dash.subscription")}</h2>
          {sub ? (<div className="mt-3 space-y-2 text-sm"><p><span className={`tag ${statusStyle[sub.status] ?? "bg-steel-200"}`}>{t(`sub.${sub.status}`)}</span> <b className="ms-1">{t(`tier.${sub.plan_code}`)}</b> · {sub.interval === "year" ? t("pricing.year") : t("pricing.month")}</p>
            {sub.current_period_end && <p className="text-steel-600">{sub.cancel_at_period_end ? t("sub.ends") : t("sub.renews")}: {new Date(sub.current_period_end).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-GB")}</p>}
            {sub.pending_plan_code && <p className="text-steel-600">{t("sub.pending", { plan: t(`tier.${sub.pending_plan_code}`) })}</p>}
            {sub.status === "past_due" && <p className="rounded bg-amber-50 p-2 text-amber-800">{t("sub.past_due_note")}</p>}
            {["canceled", "unpaid"].includes(sub.status) && <p className="rounded bg-red-50 p-2 text-red-700">{t("sub.expired_note")}</p>}</div>)
            : <p className="mt-3 text-sm text-steel-600">{v.plan === "free" ? t("sub.none") : t("sub.comp")}</p>}
          <Link href={v.plan === "free" || !sub ? "/pricing" : "/dashboard/billing"} className="btn-navy btn-sm mt-4">{sub ? t("dash.manage_billing") : t("cta.see_plans")}</Link>
        </section>

        <section className="card p-6 lg:col-span-2" aria-labelledby="mine">
          <h2 id="mine" className="text-lg font-bold text-navy-900">{t("dash.courses")}</h2>
          {d.courses.length === 0 ? <p className="mt-3 text-sm text-steel-600">{t("dash.no_courses")}</p> :
            <ul className="mt-4 space-y-4">{d.courses.map((c) => (
              <li key={c.id}><div className="flex items-center justify-between gap-3"><Link href={`/courses/${c.slug}`} className="font-semibold text-navy-900 hover:underline">{pick(c, "title", locale)}</Link><span className="text-sm font-bold">{c.progress.percent}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-steel-200" role="progressbar" aria-valuenow={c.progress.percent} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent" style={{ width: `${c.progress.percent}%` }} /></div>
                <p className="mt-1 text-xs text-steel-500">{c.progress.done}/{c.progress.total} {t("course.lessons")}</p></li>))}</ul>}
        </section>

        <section className="card p-6" aria-labelledby="saved">
          <h2 id="saved" className="text-lg font-bold text-navy-900">{t("dash.saved")}</h2>
          {d.saved.length === 0 ? <p className="mt-3 text-sm text-steel-600">{t("dash.no_saved")}</p> :
            <ul className="mt-3 space-y-2 text-sm">{d.saved.map((s) => <li key={s.id}><Link href={`/courses/${s.course_slug}/learn/${s.id}`} className="font-semibold text-accent-dark hover:underline">{pick(s, "title", locale)}</Link></li>)}</ul>}
        </section>

        <section className="card p-6" aria-labelledby="scores">
          <h2 id="scores" className="text-lg font-bold text-navy-900">{t("dash.scores")}</h2>
          {d.quizScores.length === 0 ? <p className="mt-3 text-sm text-steel-600">{t("dash.no_scores")}</p> :
            <ul className="mt-3 space-y-2 text-sm">{d.quizScores.map((q, i) => <li key={i} className="flex items-center justify-between gap-2"><span>{q.quiz_title_en}</span><span className={`tag ${q.passed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{q.best}% · {q.attempts}×</span></li>)}</ul>}
        </section>

        <section className="card p-6" aria-labelledby="res">
          <h2 id="res" className="text-lg font-bold text-navy-900">{t("dash.resources")}</h2>
          {v.plan !== "pro" ? <p className="mt-3 text-sm text-steel-600">🔒 {t("dash.resources_locked")} <Link href="/pricing" className="font-bold text-accent-dark">{t("cta.see_plans")}</Link></p> :
            d.resources.length === 0 ? <p className="mt-3 text-sm text-steel-600">{t("dash.no_resources")}</p> :
            <ul className="mt-3 space-y-2 text-sm">{d.resources.map((r) => <li key={r.id}><Link href={`/resources/${r.id}`} className="font-semibold text-accent-dark hover:underline">📄 {pick(r, "title", locale)}</Link></li>)}</ul>}
        </section>

        <section className="card p-6" aria-labelledby="certs">
          <h2 id="certs" className="text-lg font-bold text-navy-900">{t("dash.certificates")}</h2>
          {d.certificates.length === 0 ? <p className="mt-3 text-sm text-steel-600">{t("dash.no_certs")}</p> :
            <ul className="mt-3 space-y-3 text-sm">{d.certificates.map((c) => <li key={c.number}><Link href={`/certificates/${c.number}`} className="font-semibold text-accent-dark hover:underline">🎓 {pick(c, "title", locale)}</Link><br /><span className="font-mono text-xs text-steel-500">{c.number} · {new Date(c.issued_at).toLocaleDateString("en-GB")}</span></li>)}</ul>}
        </section>
      </div>
      <p className="mt-8 text-sm"><Link href="/dashboard/profile" className="font-semibold text-accent-dark hover:underline">{t("dash.profile")}</Link></p>
    </div>
  );
}

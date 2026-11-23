import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getAnalytics } from "@/lib/admin-data";
import { formatUsd } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const v = await requireViewer("/admin");
  if (v.user.role !== "admin") redirect("/admin/courses");
  const { t } = await getT();
  const a = await getAnalytics();
  const kpi = [
    [t("admin.kpi.rev30"), formatUsd(a.revenue30dCents)], [t("admin.kpi.revtotal"), formatUsd(a.revenueTotalCents)], [t("admin.kpi.mrr"), formatUsd(a.mrrCents)],
    [t("admin.kpi.subs"), String(a.activeSubscribers)], [t("admin.kpi.students"), String(a.students)], [t("admin.kpi.conv"), `${a.conversionRate}%`], [t("admin.kpi.failed"), String(a.failedPayments30d)],
  ];
  return (
    <div><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.overview")}</h1>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{kpi.map(([l, n]) => <div key={l} className="card p-4"><dt className="text-xs uppercase tracking-wide text-steel-500">{l}</dt><dd className="mt-1 text-2xl font-extrabold text-navy-900">{n}</dd></div>)}</dl>
      <section className="card mt-6 p-5"><h2 className="font-bold text-navy-900">{t("admin.subs_by_plan")}</h2>
        {a.subscribersByPlan.length === 0 ? <p className="mt-2 text-sm text-steel-500">{t("admin.none")}</p> : <ul className="mt-2 text-sm">{a.subscribersByPlan.map((s, i) => <li key={i}>{t(`tier.${s.plan_code}`)} · {s.interval}: <b>{s.n}</b></li>)}</ul>}</section>
      <section className="card mt-6 overflow-x-auto p-5"><h2 className="font-bold text-navy-900">{t("admin.engagement")}</h2>
        <table className="mt-3 w-full text-sm"><thead><tr className="text-xs uppercase text-steel-500"><th className="py-2 text-start">{t("admin.course")}</th><th>{t("admin.enrollments")}</th><th>{t("admin.lessons_done")}</th><th>{t("admin.certs")}</th><th>{t("admin.rating")}</th></tr></thead>
          <tbody>{a.engagement.map((e) => <tr key={e.id} className="border-t border-steel-100 text-center"><td className="py-2 text-start">{e.title_en}</td><td>{e.enrollments}</td><td>{e.lessons_done}</td><td>{e.certificates}</td><td>{e.rating ? e.rating.toFixed(1) : "—"}</td></tr>)}</tbody></table></section>
    </div>
  );
}

import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { listCourses } from "@/lib/courses";
import { CATEGORIES } from "@/lib/categories";
import { createCourseAction } from "@/app/actions/admin";

export const dynamic = "force-dynamic";
const statusCls: Record<string, string> = { published: "bg-emerald-100 text-emerald-800", in_review: "bg-amber-100 text-amber-800", draft: "bg-steel-200 text-steel-700", coming_soon: "bg-navy-100 text-navy-800" };

export default async function AdminCourses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const v = await requireViewer("/admin/courses"); const { t } = await getT();
  const all = await listCourses({ statuses: ["draft", "in_review", "published", "coming_soon"] });
  const mine = v.user.role === "admin" ? all : (await import("@/lib/db")).query<{ id: string }>("SELECT id FROM courses WHERE author_id=$1", [v.user.id]).then((r) => all.filter((c) => r.some((x) => x.id === c.id)));
  const rows = await mine;
  return (
    <div><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.courses")}</h1>
      {sp.error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{t("err.invalid")}</p>}
      <form action={createCourseAction} className="card mt-6 grid gap-3 p-5 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
        <div><label className="label" htmlFor="title_en">{t("admin.title_en")}</label><input id="title_en" name="title_en" required minLength={3} className="input" /></div>
        <div><label className="label" htmlFor="category">{t("courses.category")}</label><select id="category" name="category" className="input">{CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.en}</option>)}</select></div>
        <div><label className="label" htmlFor="level">{t("courses.level")}</label><select id="level" name="level" className="input">{["beginner", "intermediate", "advanced"].map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}</select></div>
        <div><label className="label" htmlFor="tier">{t("courses.tier")}</label><select id="tier" name="tier" className="input"><option value="basic">{t("tier.basic")}</option><option value="pro">{t("tier.pro")}</option></select></div>
        <div className="flex items-end"><button className="btn-primary w-full">{t("admin.create")}</button></div></form>
      <div className="card mt-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-steel-50 text-xs uppercase text-steel-500"><th className="p-3 text-start">{t("admin.course")}</th><th>{t("courses.tier")}</th><th>{t("admin.status")}</th><th>{t("course.lessons")}</th><th /></tr></thead>
        <tbody>{rows.map((c) => <tr key={c.id} className="border-t border-steel-100 text-center"><td className="p-3 text-start font-semibold">{c.title_en}</td><td>{t(`tier.${c.tier}`)}</td><td><span className={`tag ${statusCls[c.status]}`}>{t(`status.${c.status}`)}</span></td><td>{c.lesson_count}</td><td className="pe-3 text-end"><Link href={`/admin/courses/${c.id}`} className="font-bold text-accent-dark">{t("admin.edit")}</Link></td></tr>)}</tbody></table></div>
    </div>
  );
}

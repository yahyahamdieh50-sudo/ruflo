import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { listCourses, searchModels } from "@/lib/courses";
import { CATEGORIES, categoryBySlug } from "@/lib/categories";
import { CourseCard } from "@/components/CourseCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Courses" };

export default async function Courses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { t, locale } = await getT();
  const q = sp.q?.slice(0, 80);
  const [courses, models] = await Promise.all([
    listCourses({ q, category: sp.category, level: sp.level, tier: sp.tier }),
    q ? searchModels(q) : Promise.resolve([]),
  ]);
  return (
    <div className="container-x py-10">
      <h1 className="text-3xl font-extrabold text-navy-900">{t("courses.title")}</h1>
      <p className="mt-1 text-steel-600">{t("courses.sub")}</p>
      <form className="card mt-6 grid gap-3 p-4 md:grid-cols-[2fr_2fr_1fr_1fr_auto]" role="search">
        <div><label className="label" htmlFor="q">{t("courses.search")}</label><input id="q" name="q" defaultValue={q} className="input" placeholder={t("courses.search_ph")} /></div>
        <div><label className="label" htmlFor="category">{t("courses.category")}</label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="input"><option value="">{t("courses.all")}</option>{CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{locale === "ar" ? c.ar : c.en}</option>)}</select></div>
        <div><label className="label" htmlFor="level">{t("courses.level")}</label>
          <select id="level" name="level" defaultValue={sp.level ?? ""} className="input"><option value="">{t("courses.all")}</option>{["beginner", "intermediate", "advanced"].map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}</select></div>
        <div><label className="label" htmlFor="tier">{t("courses.tier")}</label>
          <select id="tier" name="tier" defaultValue={sp.tier ?? ""} className="input"><option value="">{t("courses.all")}</option><option value="basic">{t("tier.basic")}</option><option value="pro">{t("tier.pro")}</option></select></div>
        <div className="flex items-end"><button className="btn-navy w-full">{t("courses.filter")}</button></div>
      </form>

      {models.length > 0 && (
        <div className="card mt-6 p-4"><h2 className="font-bold text-navy-900">{t("courses.models_found")}</h2>
          <ul className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{models.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded bg-steel-50 px-3 py-2"><span className="font-mono font-semibold">{m.model_number}</span>
              <span className="text-xs text-steel-600">{(categoryBySlug(m.category)?.[locale] ?? m.category)}{m.is_placeholder ? ` · ${t("tag.placeholder")}` : m.verified ? ` · ✓ ${t("tag.verified")}` : ""}</span></li>))}</ul></div>)}

      {courses.length === 0 ? (
        <p className="mt-10 text-center text-steel-600">{t("courses.none")} <Link href="/courses" className="font-bold text-accent-dark">{t("courses.reset")}</Link></p>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c) => <CourseCard key={c.id} c={c} t={t} locale={locale} />)}</div>
      )}
    </div>
  );
}

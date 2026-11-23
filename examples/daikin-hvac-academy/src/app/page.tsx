import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { listCourses } from "@/lib/courses";
import { CATEGORIES } from "@/lib/categories";
import { EquipmentArt } from "@/components/EquipmentArt";
import { CourseCard } from "@/components/CourseCard";
import { STANDARD_CHAPTERS } from "@/content/standard-chapters";
import { DISCLAIMER_AR, DISCLAIMER_EN } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { t, locale } = await getT();
  const courses = (await listCourses()).slice(0, 6);
  return (
    <>
      <p className="bg-navy-950 px-4 py-2 text-center text-xs font-semibold text-steel-200" role="note">{locale === "ar" ? DISCLAIMER_AR : DISCLAIMER_EN}</p>
      <section className="hero-bg relative overflow-hidden text-white">
        <div className="container-x grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="mb-3 inline-block rounded border border-accent/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent">{t("home.eyebrow")}</p>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">{t("home.title")}</h1>
            <p className="mt-5 max-w-xl text-lg text-steel-200">{t("home.subtitle")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/trailer" className="btn-primary">▶ {t("cta.trailer")}</Link>
              <Link href="/pricing" className="btn-ghost-light">{t("cta.unlock")}</Link>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 text-center">
              {[["10", t("home.stat.categories")], ["13", t("home.stat.parts")], ["EN · AR", t("home.stat.lang")]].map(([n, l]) => (
                <div key={l} className="rounded border border-white/15 bg-white/5 px-3 py-3"><dt className="text-xl font-extrabold text-accent">{n}</dt><dd className="text-xs text-steel-300">{l}</dd></div>))}
            </dl>
          </div>
          <div className="relative">
            <EquipmentArt slug="air-cooled-chillers" className="w-full rounded-lg border border-white/10 shadow-2xl" />
            <p className="mt-2 text-center text-xs text-steel-400">{t("home.art_note")}</p>
          </div>
        </div>
      </section>

      <section className="container-x py-16" aria-labelledby="cats">
        <h2 id="cats" className="text-3xl font-extrabold text-navy-900">{t("home.categories")}</h2>
        <p className="mt-2 max-w-2xl text-steel-600">{t("home.categories_sub")}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {CATEGORIES.map((c) => (
            <Link key={c.slug} href={`/courses?category=${c.slug}`} className="card group overflow-hidden transition hover:shadow-lg">
              <EquipmentArt slug={c.slug} className="aspect-[5/3] w-full" />
              <p className="p-3 text-sm font-bold text-navy-900 group-hover:text-accent-dark">{locale === "ar" ? c.ar : c.en}</p>
            </Link>))}
        </div>
      </section>

      <section className="bg-white py-16"><div className="container-x">
        <div className="flex items-end justify-between"><h2 className="text-3xl font-extrabold text-navy-900">{t("home.featured")}</h2><Link href="/courses" className="text-sm font-bold text-accent-dark hover:underline">{t("home.all_courses")} →</Link></div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{courses.map((c) => <CourseCard key={c.id} c={c} t={t} locale={locale} />)}</div>
      </div></section>

      <section className="container-x py-16">
        <h2 className="text-3xl font-extrabold text-navy-900">{t("home.structure")}</h2>
        <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STANDARD_CHAPTERS.map((c, i) => (
            <li key={i} className="card flex items-start gap-3 p-4"><span className="grid h-8 w-8 shrink-0 place-items-center rounded bg-navy-800 text-sm font-bold text-white">{i + 1}</span><span className="text-sm font-semibold text-navy-900">{locale === "ar" ? c.ar : c.en}</span></li>))}
        </ol>
      </section>

      <section className="bg-navy-900 py-16 text-white"><div className="container-x">
        <h2 className="text-3xl font-extrabold">{t("home.accuracy")}</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[1, 2, 3].map((n) => (<div key={n} className="rounded-lg border border-white/15 bg-white/5 p-6"><h3 className="text-lg font-bold text-accent">{t(`home.acc${n}.title`)}</h3><p className="mt-2 text-sm text-steel-300">{t(`home.acc${n}.body`)}</p></div>))}
        </div>
      </div></section>

      <section className="container-x py-16">
        <h2 className="text-3xl font-extrabold text-navy-900">{t("home.access")}</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {(["free", "basic", "pro"] as const).map((p) => (
            <div key={p} className={`card p-6 ${p === "pro" ? "border-accent ring-1 ring-accent" : ""}`}>
              <h3 className="text-xl font-extrabold text-navy-900">{t(`tier.${p}`)}</h3>
              <ul className="mt-3 space-y-1.5 text-sm text-steel-700">{[1, 2, 3, 4].map((n) => t(`plan.${p}.f${n}`) !== `plan.${p}.f${n}` && <li key={n}>✓ {t(`plan.${p}.f${n}`)}</li>)}</ul>
            </div>))}
        </div>
        <div className="mt-8 text-center"><Link href="/pricing" className="btn-primary">{t("cta.unlock")}</Link></div>
      </section>

      <section className="bg-steel-100 py-14"><div className="container-x grid items-center gap-6 md:grid-cols-2">
        <div><h2 className="text-2xl font-extrabold text-navy-900">{t("home.uae.title")}</h2><p className="mt-3 text-steel-700">{t("home.uae.body")}</p></div>
        <ul className="grid gap-2 text-sm font-semibold text-navy-800 sm:grid-cols-2">{[1, 2, 3, 4, 5, 6].map((n) => <li key={n} className="rounded bg-white px-4 py-3 shadow-sm">✓ {t(`home.uae.p${n}`)}</li>)}</ul>
      </div></section>
    </>
  );
}

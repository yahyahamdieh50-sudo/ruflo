import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getCourseDetailBySlug, hasArabic, pick } from "@/lib/courses";
import { canAccessLesson, canDownloadResources, canTakeQuiz } from "@/lib/entitlements";
import { getCourseProgress } from "@/lib/learning";
import { categoryBySlug } from "@/lib/categories";
import { query } from "@/lib/db";
import { EquipmentArt } from "@/components/EquipmentArt";
import { FreePreviewTag, LevelTag, SampleTag, Stars, TierTag } from "@/components/Badges";
import { MediaPlayer } from "@/components/MediaPlayer";
import { startCourseAction, submitReviewAction } from "@/app/actions/learning";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await getCourseDetailBySlug(slug);
  return { title: d?.course.title_en ?? "Course" };
}

export default async function CoursePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params; const sp = await searchParams;
  const [{ t, locale }, viewer, d] = await Promise.all([getT(), getViewer(), getCourseDetailBySlug(slug)]);
  const staff = viewer && viewer.user.role !== "student";
  if (!d || (!["published", "coming_soon"].includes(d.course.status) && !staff)) notFound();
  const c = d.course, plan = viewer?.plan ?? "free", soon = c.status === "coming_soon";
  const lessons = d.chapters.flatMap((ch) => ch.lessons);
  const progress = viewer && plan !== "free" ? await getCourseProgress(viewer.user.id, c.id) : null;
  const reviews = await query<{ rating: number; comment: string | null; name: string; created_at: string }>(
    "SELECT r.rating,r.comment,split_part(u.name,' ',1) AS name,r.created_at FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.course_id=$1 AND r.comment IS NOT NULL ORDER BY r.created_at DESC LIMIT 5", [c.id]);
  const canStart = viewer && (plan === "pro" || (plan === "basic" && c.tier === "basic"));
  const firstPreview = lessons.find((l) => l.is_free_preview);
  const cat = categoryBySlug(c.category);
  const arMissing = locale === "ar" && !hasArabic(c, "summary");

  return (
    <>
      <section className="bg-navy-900 text-white"><div className="container-x grid gap-8 py-10 lg:grid-cols-[3fr_2fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent">{locale === "ar" ? cat?.ar : cat?.en}</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight sm:text-4xl">{pick(c, "title", locale)}</h1>
          <p className="mt-4 max-w-2xl text-steel-200">{pick(c, "summary", locale)}</p>
          {arMissing && <p className="mt-2 text-xs text-amber-300">{t("i18n.pending")}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {!soon && <FreePreviewTag t={t} />}<LevelTag level={c.level} t={t} /><TierTag tier={c.tier} t={t} />{c.is_sample && <SampleTag t={t} />}
            <span className="ms-2"><Stars value={c.rating_avg} count={c.rating_count} /></span>
          </div>
          <p className="mt-4 text-sm text-steel-300">{soon ? t("course.syllabus_only") : `${c.lesson_count} ${t("course.lessons")} · ${c.duration_min} ${t("course.min")}`}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {soon ? <span className="tag bg-steel-700 px-4 py-3 text-white">{t("course.in_development")}</span>
              : canStart ? <form action={startCourseAction}><input type="hidden" name="courseId" value={c.id} /><input type="hidden" name="slug" value={c.slug} /><button className="btn-primary">{progress && progress.done > 0 ? t("course.continue") : t("course.start")}</button></form>
              : <>
                  {firstPreview && <Link href={`/courses/${c.slug}/learn/${firstPreview.id}`} className="btn-primary">▶ {t("course.watch_preview")}</Link>}
                  {!viewer && <Link href="/signup" className="btn-ghost-light">{t("cta.free_account")}</Link>}
                  <Link href="/pricing" className="btn-ghost-light">{t("cta.unlock")}</Link>
                </>}
          </div>
          {progress && <div className="mt-5 max-w-sm" aria-label={t("course.progress")}><div className="h-2 overflow-hidden rounded bg-white/20"><div className="h-full bg-accent" style={{ width: `${progress.percent}%` }} /></div><p className="mt-1 text-xs text-steel-300">{progress.percent}% · {progress.done}/{progress.total}</p></div>}
        </div>
        <div>{soon || !c.trailer_key
          ? (c.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.image_url} alt="" className="w-full rounded-lg" /> : <EquipmentArt slug={c.category} className="w-full rounded-lg border border-white/10" />)
          : <MediaPlayer src={`/api/trailer/${c.id}`} hasVideo t={t} label={t("course.trailer")} />}
          {!soon && !c.trailer_key && <p className="mt-2 text-xs text-steel-400">{t("course.trailer_missing")}</p>}</div>
      </div></section>

      <div className="container-x grid gap-8 py-10 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 className="text-2xl font-extrabold text-navy-900">{t("course.syllabus")}</h2>
          <div className="mt-4 space-y-3">
            {d.chapters.map((ch) => (
              <details key={ch.id} className="card" open={ch.position <= 2}>
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 font-bold text-navy-900"><span>{ch.position}. {pick(ch, "title", locale)}</span><span className="text-xs font-normal text-steel-500">{ch.lessons.length ? `${ch.lessons.length} ${t("course.lessons")}` : ""}</span></summary>
                {ch.lessons.length > 0 && <ul className="divide-y divide-steel-100 border-t border-steel-100">
                  {ch.lessons.map((l) => {
                    const ok = canAccessLesson(plan, c, l);
                    return (<li key={l.id}><Link href={`/courses/${c.slug}/learn/${l.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-steel-50">
                      <span aria-hidden className="w-5 text-center">{progress?.doneIds.has(l.id) ? "✅" : ok ? "▶" : "🔒"}</span>
                      <span className="flex-1">{pick(l, "title", locale)}</span>
                      {l.is_free_preview ? <FreePreviewTag t={t} /> : <TierTag tier={l.tier === "pro" || c.tier === "pro" ? "pro" : "basic"} t={t} />}
                      <span className="text-xs text-steel-500">{l.duration_min} {t("course.min")}</span></Link></li>);
                  })}</ul>}
              </details>))}
          </div>

          {d.quizzes.length > 0 && <section className="mt-10"><h2 className="text-2xl font-extrabold text-navy-900">{t("course.assessments")}</h2>
            <ul className="mt-4 space-y-2">{d.quizzes.map((q) => { const ok = canTakeQuiz(plan, c, q); return (
              <li key={q.id} className="card flex items-center justify-between gap-3 px-5 py-3 text-sm"><span>{ok ? "📝" : "🔒"} {pick(q, "title", locale)} <span className="text-xs text-steel-500">· {q.question_count} Q · ≥{q.pass_mark}%</span></span>
                {ok ? <Link className="btn-navy btn-sm" href={`/courses/${c.slug}/quiz/${q.id}`}>{t("quiz.start")}</Link> : <TierTag tier={q.kind === "final" ? "pro" : c.tier} t={t} />}</li>); })}</ul></section>}

          {d.resources.length > 0 && <section className="mt-10"><h2 className="text-2xl font-extrabold text-navy-900">{t("course.resources")}</h2>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">{d.resources.map((r) => (<li key={r.id} className="card flex items-center justify-between gap-2 px-4 py-3 text-sm"><span>{canDownloadResources(plan) ? "📄" : "🔒"} {pick(r, "title", locale)}</span>{canDownloadResources(plan) ? <Link href={`/resources/${r.id}`} className="font-bold text-accent-dark">{t("resource.open")}</Link> : <TierTag tier="pro" t={t} />}</li>))}</ul></section>}

          {!soon && <section id="reviews" className="mt-10"><h2 className="text-2xl font-extrabold text-navy-900">{t("reviews.title")}</h2>
            {sp.review === "saved" && <p className="mt-2 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("reviews.saved")}</p>}
            {sp.review === "not_allowed" && <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-800">{t("reviews.not_allowed")}</p>}
            <ul className="mt-4 space-y-3">{reviews.length === 0 && <li className="text-sm text-steel-500">{t("reviews.none")}</li>}{reviews.map((r, i) => (<li key={i} className="card p-4 text-sm"><Stars value={r.rating} count={0} /> <b className="ms-2">{r.name}</b><p className="mt-1 text-steel-700">{r.comment}</p></li>))}</ul>
            {viewer && progress && progress.done > 0 && (
              <form action={submitReviewAction} className="card mt-4 grid gap-3 p-5"><input type="hidden" name="courseId" value={c.id} /><input type="hidden" name="slug" value={c.slug} />
                <div><label className="label" htmlFor="rating">{t("reviews.rating")}</label><select id="rating" name="rating" className="input max-w-[10rem]" defaultValue="5">{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select></div>
                <div><label className="label" htmlFor="comment">{t("reviews.comment")}</label><textarea id="comment" name="comment" rows={3} maxLength={1000} className="input" /></div>
                <button className="btn-navy btn-sm w-fit">{t("reviews.submit")}</button></form>)}
          </section>}
        </div>

        <aside className="space-y-6">
          <div className="card p-5"><h3 className="font-bold text-navy-900">{t("course.access")}</h3>
            <ul className="mt-3 space-y-2 text-sm text-steel-700"><li>🟢 {t("course.access.free")}</li><li>🔵 {t("course.access.basic", { tier: t(`tier.${c.tier}`) })}</li><li>⚫ {t("course.access.pro")}</li></ul>
            <Link href="/pricing" className="btn-primary btn-sm mt-4 w-full">{t("cta.see_plans")}</Link></div>
          <div className="card p-5"><h3 className="font-bold text-navy-900">{t("course.models")}</h3>
            {d.models.length === 0 ? <p className="mt-2 text-sm text-steel-500">{t("course.models_none")}</p> :
              <ul className="mt-3 space-y-2 text-sm">{d.models.map((m) => (<li key={m.id} className="flex items-center justify-between"><span className="font-mono font-semibold">{m.model_number}</span><span className={`tag ${m.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{m.is_placeholder ? t("tag.placeholder") : m.verified ? t("tag.verified") : t("tag.unverified")}</span></li>))}</ul>}
            <p className="mt-3 text-xs text-steel-500">{t("course.models_note")}</p></div>
          <div className="rounded border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900"><b>{t("course.safety_title")}</b> {t("course.safety_body")}</div>
        </aside>
      </div>
    </>
  );
}

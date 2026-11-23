import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getCourseDetailBySlug, getLesson, getLessonSources, getLessonSpecs, getLessonSubtitles, hasArabic, pick } from "@/lib/courses";
import { canAccessLesson, canTakeQuiz, canTrackProgress, requiredPlan } from "@/lib/entitlements";
import { getCourseProgress } from "@/lib/learning";
import { queryOne } from "@/lib/db";
import { Markdown } from "@/components/Markdown";
import { Locked } from "@/components/Locked";
import { MediaPlayer } from "@/components/MediaPlayer";
import { FlowChart } from "@/components/FlowChart";
import { DiagramViewer } from "@/components/DiagramViewer";
import { SpecsPanel } from "@/components/SpecsPanel";
import { FreePreviewTag, TierTag } from "@/components/Badges";
import { completeLessonAction, toggleSavedAction } from "@/app/actions/learning";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params, searchParams }: { params: Promise<{ slug: string; lessonId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug, lessonId } = await params; const sp = await searchParams;
  const [{ t, locale }, viewer, d, lesson] = await Promise.all([getT(), getViewer(), getCourseDetailBySlug(slug), getLesson(lessonId)]);
  if (!d || !lesson || lesson.course_id !== d.course.id) notFound();
  const staff = !!viewer && viewer.user.role !== "student";
  if (d.course.status !== "published" && !staff) notFound();

  const c = d.course, plan = viewer?.plan ?? "free";
  const all = d.chapters.flatMap((ch) => ch.lessons);
  const idx = all.findIndex((l) => l.id === lesson.id);
  const prev = all[idx - 1], next = all[idx + 1];
  const allowed = canAccessLesson(plan, c, lesson);
  const progress = viewer && canTrackProgress(plan) ? await getCourseProgress(viewer.user.id, c.id) : null;
  const done = !!progress?.doneIds.has(lesson.id);
  const saved = viewer ? !!(await queryOne("SELECT 1 AS x FROM saved_lessons WHERE user_id=$1 AND lesson_id=$2", [viewer.user.id, lesson.id])) : false;
  const here = `/courses/${slug}/learn/${lesson.id}`;
  const lessonQuizzes = d.quizzes.filter((q) => q.lesson_id === lesson.id || (q.kind === "final" && idx === all.length - 1));

  const body = locale === "ar" && lesson.body_ar ? lesson.body_ar : lesson.body_en;
  const [specs, sources, subs] = allowed ? await Promise.all([getLessonSpecs(lesson.id), getLessonSources(lesson.id), getLessonSubtitles(lesson.id)]) : [[], [], []];
  const dg = lesson.diagram;

  return (
    <div className="container-x grid gap-8 py-8 lg:grid-cols-[1fr_20rem]">
      <article>
        <nav className="text-sm text-steel-500" aria-label="Breadcrumb"><Link href="/courses" className="hover:underline">{t("nav.courses")}</Link> / <Link href={`/courses/${slug}`} className="hover:underline">{pick(c, "title", locale)}</Link></nav>
        <h1 className="mt-2 text-2xl font-extrabold text-navy-900 sm:text-3xl">{pick(lesson, "title", locale)}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-steel-500">{lesson.is_free_preview ? <FreePreviewTag t={t} /> : <TierTag tier={requiredPlan(c, lesson) as "basic" | "pro"} t={t} />}<span>{lesson.duration_min} {t("course.min")}</span>
          {locale === "ar" && !lesson.body_ar && <span className="text-amber-700">· {t("i18n.pending")}</span>}</div>
        {sp.error === "not_allowed" && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{t("locked.title")}</p>}

        {!allowed ? <Locked needed={requiredPlan(c, lesson)} loggedIn={!!viewer} t={t} what={t("locked.lesson")} /> : (
          <>
            <div className="mt-5"><MediaPlayer src={`/api/media/${lesson.id}`} hasVideo={!!lesson.video_key} subtitles={subs.map((s) => s.lang)} t={t} label={pick(lesson, "title", locale)} /></div>
            <Markdown source={body} className="mt-6" />
            {dg && <DiagramViewer verified={dg.verified} title={t("lesson.diagram")} badge={dg.verified ? t("tag.verified") : t("tag.generic_illustration")} hint={t("lesson.diagram_hint")}
              caption={(locale === "ar" && dg.caption_ar) || dg.caption_en}
              hotspots={dg.hotspots.map((h) => ({ id: h.id, x: h.x, y: h.y, label: (locale === "ar" && h.label_ar) || h.label_en, detail: (locale === "ar" && h.detail_ar) || h.detail_en }))} />}
            {lesson.flow && <FlowChart steps={lesson.flow} locale={locale} t={t} />}
            <SpecsPanel specs={specs} sources={sources} t={t} />

            {lessonQuizzes.length > 0 && <div className="card my-6 p-5"><h2 className="font-bold text-navy-900">{t("quiz.title")}</h2><ul className="mt-3 space-y-2">{lessonQuizzes.map((q) => {
              const ok = canTakeQuiz(plan, c, q);
              return <li key={q.id} className="flex items-center justify-between gap-3 text-sm"><span>{ok ? "📝" : "🔒"} {pick(q, "title", locale)}</span>{ok ? <Link href={`/courses/${slug}/quiz/${q.id}`} className="btn-navy btn-sm">{t("quiz.start")}</Link> : <Link href="/pricing" className="btn-outline btn-sm">{t(`tier.${q.kind === "final" ? "pro" : c.tier}`)}</Link>}</li>; })}</ul></div>}

            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-steel-200 pt-5">
              {canTrackProgress(plan) ? (done ? <span className="tag bg-emerald-100 px-3 py-2 text-emerald-800">✓ {t("lesson.completed")}</span> :
                <form action={completeLessonAction}><input type="hidden" name="lessonId" value={lesson.id} /><input type="hidden" name="back" value={here} />{next && <input type="hidden" name="next" value={`/courses/${slug}/learn/${next.id}`} />}<button className="btn-primary">{t(next ? "lesson.complete_next" : "lesson.complete")}</button></form>)
                : <p className="text-sm text-steel-600">{t("lesson.progress_needs_plan")} <Link href="/pricing" className="font-bold text-accent-dark">{t("cta.see_plans")}</Link></p>}
              {viewer && <form action={toggleSavedAction}><input type="hidden" name="lessonId" value={lesson.id} /><input type="hidden" name="back" value={here} /><button className="btn-outline">{saved ? `★ ${t("lesson.saved")}` : `☆ ${t("lesson.save")}`}</button></form>}
            </div>
          </>)}

        <div className="mt-8 flex justify-between gap-3 text-sm font-semibold">
          {prev ? <Link href={`/courses/${slug}/learn/${prev.id}`} className="btn-outline btn-sm">← {t("lesson.prev")}</Link> : <span />}
          {next ? <Link href={`/courses/${slug}/learn/${next.id}`} className="btn-outline btn-sm">{t("lesson.next")} →</Link> : <span />}
        </div>
      </article>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <details open className="card" id="outline"><summary className="cursor-pointer px-4 py-3 font-bold text-navy-900">{t("course.syllabus")}{progress ? ` · ${progress.percent}%` : ""}</summary>
          <div className="max-h-[70vh] overflow-y-auto border-t border-steel-100 text-sm">
            {d.chapters.map((ch) => <div key={ch.id}><p className="bg-steel-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-steel-600">{ch.position}. {pick(ch, "title", locale)}</p>
              {ch.lessons.map((l) => <Link key={l.id} href={`/courses/${slug}/learn/${l.id}`} className={`flex items-center gap-2 px-4 py-2 hover:bg-steel-50 ${l.id === lesson.id ? "bg-navy-50 font-bold text-navy-900" : ""}`}>
                <span aria-hidden>{progress?.doneIds.has(l.id) ? "✅" : canAccessLesson(plan, c, l) ? "▶" : "🔒"}</span><span>{pick(l, "title", locale)}</span></Link>)}</div>)}
          </div></details>
        <p className="mt-3 text-xs text-steel-500">{hasArabic(lesson, "body") || locale === "en" ? "" : t("i18n.pending")}</p>
      </aside>
    </div>
  );
}

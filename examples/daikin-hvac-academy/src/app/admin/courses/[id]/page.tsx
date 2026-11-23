import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getCourseDetail } from "@/lib/courses";
import { gatherPublishInput } from "@/lib/admin-data";
import { checkPublishable } from "@/lib/content-rules";
import { query } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";
import { FileUpload } from "@/components/FileUpload";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function CourseEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params; const sp = await searchParams;
  const v = await requireViewer("/admin/courses"); const { t } = await getT();
  const d = await getCourseDetail(id); if (!d) notFound();
  const c = d.course;
  if (v.user.role !== "admin" && c.author_id !== v.user.id) redirect("/admin/courses");
  const admin = v.user.role === "admin";
  const input = await gatherPublishInput(id);
  const check = input ? checkPublishable(input) : { ok: false, problems: [] as string[] };
  const allModels = await query<{ id: string; model_number: string }>("SELECT id,model_number FROM equipment_models ORDER BY model_number");
  const reviewer = c.technical_reviewed_by ? (await query<{ name: string }>("SELECT name FROM users WHERE id=$1", [c.technical_reviewed_by]))[0]?.name : null;
  const lessons = d.chapters.flatMap((ch) => ch.lessons);
  const resources = await query<{ id: string; title_en: string; kind: string; storage_key: string | null }>("SELECT id,title_en,kind,storage_key FROM resources WHERE course_id=$1", [id]);
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 text-lg font-bold text-navy-900">{children}</h2>;

  return (
    <div className="space-y-6">
      <div><Link href="/admin/courses" className="text-sm text-steel-500 hover:underline">← {t("admin.courses")}</Link><h1 className="mt-1 text-3xl font-extrabold text-navy-900">{c.title_en}</h1>
        <p className="text-sm text-steel-500">{t(`status.${c.status}`)} · <Link className="text-accent-dark" href={`/courses/${c.slug}`}>{t("admin.view_public")}</Link></p></div>
      {sp.saved && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}
      {sp.published && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.published_ok")}</p>}
      {sp.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{t(`err.${sp.error}`)}</p>}
      {sp.problems && <ul role="alert" className="list-disc rounded bg-red-50 p-3 ps-8 text-sm text-red-700">{sp.problems.split("|").map((p) => <li key={p}>{p}</li>)}</ul>}

      <section className="card p-5"><H>{t("admin.publish_gate")}</H>
        <p className="text-sm text-steel-600">{t("admin.publish_gate_sub")}</p>
        {check.ok ? <p className="mt-3 rounded bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">✓ {t("admin.ready_publish")}</p> : <ul className="mt-3 list-disc rounded bg-amber-50 p-3 ps-8 text-sm text-amber-900">{check.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        <p className="mt-3 text-sm">{t("admin.reviewed_by")}: <b>{reviewer ?? "—"}</b> {c.technical_reviewed_at ? `· ${new Date(c.technical_reviewed_at).toLocaleString("en-GB")}` : ""}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <form action={A.recordReviewAction} className="space-y-2 rounded border border-steel-200 p-3"><input type="hidden" name="id" value={id} />
            <label className="label" htmlFor="notes">{t("admin.review_notes")}</label><textarea id="notes" name="notes" rows={3} minLength={10} required className="input" />
            <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="attest" required className="mt-0.5" />{t("admin.review_attest")}</label><button className="btn-navy btn-sm">{t("admin.record_review")}</button></form>
          <div className="flex flex-col gap-2">
            {c.status === "draft" && <form action={A.requestReviewAction}><input type="hidden" name="id" value={id} /><button className="btn-outline btn-sm">{t("admin.request_review")}</button></form>}
            {admin && c.status !== "published" && <form action={A.publishCourseAction}><input type="hidden" name="id" value={id} /><button className="btn-primary btn-sm" disabled={!check.ok}>{t("admin.publish")}</button></form>}
            {admin && c.status === "published" && <form action={A.unpublishCourseAction}><input type="hidden" name="id" value={id} /><button className="btn-danger btn-sm">{t("admin.unpublish")}</button></form>}
            {!admin && <p className="text-xs text-steel-500">{t("admin.admin_publishes")}</p>}</div></div></section>

      <form action={A.updateCourseAction} className="card grid gap-3 p-5 md:grid-cols-2"><input type="hidden" name="id" value={id} /><div className="md:col-span-2"><H>{t("admin.details")}</H></div>
        <div><label className="label">{t("admin.title_en")}</label><input name="title_en" defaultValue={c.title_en} required className="input" /></div>
        <div><label className="label">{t("admin.title_ar")}</label><input name="title_ar" defaultValue={c.title_ar ?? ""} dir="rtl" className="input" /></div>
        <div><label className="label">{t("admin.summary_en")}</label><textarea name="summary_en" rows={3} defaultValue={c.summary_en} className="input" /></div>
        <div><label className="label">{t("admin.summary_ar")}</label><textarea name="summary_ar" rows={3} dir="rtl" defaultValue={c.summary_ar ?? ""} className="input" /></div>
        <div><label className="label">{t("courses.category")}</label><select name="category" defaultValue={c.category} className="input">{CATEGORIES.map((x) => <option key={x.slug} value={x.slug}>{x.en}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3"><div><label className="label">{t("courses.level")}</label><select name="level" defaultValue={c.level} className="input">{["beginner", "intermediate", "advanced"].map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}</select></div>
          <div><label className="label">{t("admin.access_tier")}</label><select name="tier" defaultValue={c.tier} className="input"><option value="basic">{t("tier.basic")}</option><option value="pro">{t("tier.pro")}</option></select></div></div>
        <div className="md:col-span-2"><label className="label">{t("admin.image_url")}</label><input name="image_url" defaultValue={c.image_url ?? ""} placeholder="https://…" className="input" /><p className="mt-1 text-xs text-steel-500">{t("admin.image_note")}</p></div>
        <div className="md:col-span-2"><button className="btn-primary">{t("admin.save")}</button></div></form>

      <section className="card p-5"><H>{t("admin.trailer")}</H>
        <FileUpload purpose="trailer" ownerId={id} courseId={id} accept="video/mp4,video/webm" label={t("admin.upload_trailer")} done={t("admin.uploaded")} />
        <p className="mt-2 text-xs text-steel-500">{c.trailer_key ? t("admin.trailer_set") : t("admin.trailer_none")}</p></section>

      <section className="card p-5"><H>{t("admin.models")}</H>
        <ul className="mb-3 flex flex-wrap gap-2">{d.models.map((m) => <li key={m.id}><form action={A.unlinkModelAction} className="inline"><input type="hidden" name="id" value={id} /><input type="hidden" name="model_id" value={m.id} /><button className="tag bg-steel-200 text-steel-800" title={t("admin.remove")}>{m.model_number} {m.verified ? "✓" : m.is_placeholder ? "⚑" : ""} ✕</button></form></li>)}</ul>
        <form action={A.linkModelAction} className="flex gap-2"><input type="hidden" name="id" value={id} /><select name="model_id" className="input max-w-xs"><option value="">—</option>{allModels.map((m) => <option key={m.id} value={m.id}>{m.model_number}</option>)}</select><button className="btn-navy btn-sm">{t("admin.link_model")}</button></form></section>

      <section className="card p-5"><H>{t("admin.structure")}</H>
        {d.chapters.map((ch) => (<div key={ch.id} className="mb-4 rounded border border-steel-200"><form action={A.updateChapterAction} className="grid gap-2 bg-steel-50 p-3 md:grid-cols-[4rem_1fr_1fr_auto_auto]"><input type="hidden" name="id" value={id} /><input type="hidden" name="chapter_id" value={ch.id} />
          <input name="position" type="number" defaultValue={ch.position} className="input" aria-label="#" /><input name="title_en" defaultValue={ch.title_en} className="input" /><input name="title_ar" dir="rtl" defaultValue={ch.title_ar ?? ""} className="input" />
          <button className="btn-outline btn-sm">{t("admin.save")}</button><button formAction={A.deleteChapterAction} className="btn-danger btn-sm">✕</button></form>
          <ul className="divide-y divide-steel-100 text-sm">{ch.lessons.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 px-3 py-2"><span>{l.position}. {l.title_en} {l.is_free_preview && <span className="tag bg-emerald-100 text-emerald-800">{t("tag.free_preview")}</span>} <span className="tag bg-steel-200">{t(`tier.${l.tier}`)}</span> {l.has_video ? "🎞" : ""}</span><Link className="font-bold text-accent-dark" href={`/admin/courses/${id}/lessons/${l.id}`}>{t("admin.edit")}</Link></li>)}</ul>
          <form action={A.addLessonAction} className="flex gap-2 border-t border-steel-100 p-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="chapter_id" value={ch.id} /><input name="title_en" placeholder={t("admin.new_lesson")} className="input" /><button className="btn-navy btn-sm whitespace-nowrap">+ {t("admin.add_lesson")}</button></form></div>))}
        <form action={A.addChapterAction} className="flex gap-2"><input type="hidden" name="id" value={id} /><input name="title_en" placeholder={t("admin.new_chapter")} className="input" /><button className="btn-navy btn-sm whitespace-nowrap">+ {t("admin.add_chapter")}</button></form></section>

      <section className="card p-5"><H>{t("course.assessments")}</H>
        <ul className="mb-3 divide-y divide-steel-100 text-sm">{d.quizzes.map((q) => <li key={q.id} className="flex items-center justify-between py-2"><span>{q.kind === "final" ? "🎓" : "📝"} {q.title_en} <span className="text-xs text-steel-500">· {q.question_count} Q · ≥{q.pass_mark}%</span></span><span className="flex gap-3"><Link className="font-bold text-accent-dark" href={`/admin/courses/${id}/quizzes/${q.id}`}>{t("admin.edit")}</Link>
          <form action={A.deleteQuizAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="quiz_id" value={q.id} /><button className="text-red-600">✕</button></form></span></li>)}</ul>
        <form action={A.createQuizAction} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]"><input type="hidden" name="id" value={id} /><input name="title_en" required placeholder={t("admin.quiz_title")} className="input" />
          <select name="kind" className="input"><option value="lesson">{t("admin.quiz_lesson")}</option><option value="final">{t("admin.quiz_final")}</option></select>
          <select name="lesson_id" className="input"><option value="">{t("admin.no_lesson")}</option>{lessons.map((l) => <option key={l.id} value={l.id}>{l.title_en.slice(0, 40)}</option>)}</select>
          <input name="pass_mark" type="number" min={1} max={100} defaultValue={80} className="input" aria-label={t("quiz.passmark")} /><button className="btn-navy btn-sm">+ {t("admin.add")}</button></form></section>

      <section className="card p-5"><H>{t("course.resources")}</H>
        <ul className="mb-3 divide-y divide-steel-100 text-sm">{resources.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span>📄 {r.title_en} <span className="tag bg-steel-200">{r.kind}</span> {r.storage_key ? "⬆" : ""}</span>
          <span className="flex items-center gap-3"><div className="w-48"><FileUpload purpose="resource" ownerId={r.id} courseId={id} accept=".pdf,.docx,.xlsx" label="" done={t("admin.uploaded")} /></div><form action={A.deleteResourceAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="resource_id" value={r.id} /><button className="text-red-600">✕</button></form></span></li>)}</ul>
        <form action={A.addResourceAction} className="grid gap-2"><input type="hidden" name="id" value={id} /><div className="grid gap-2 md:grid-cols-3"><input name="title_en" required placeholder={t("admin.title_en")} className="input" /><input name="title_ar" dir="rtl" placeholder={t("admin.title_ar")} className="input" />
          <select name="kind" className="input"><option value="checklist">checklist</option><option value="template">template</option><option value="reference">reference</option></select></div>
          <textarea name="inline_markdown" rows={4} placeholder={t("admin.resource_md")} className="input font-mono" /><button className="btn-navy btn-sm w-fit">+ {t("admin.add")}</button></form></section>
    </div>
  );
}

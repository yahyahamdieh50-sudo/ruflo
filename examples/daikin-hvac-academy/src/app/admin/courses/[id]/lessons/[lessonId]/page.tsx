import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getLesson, getCourseDetail, getLessonSubtitles } from "@/lib/courses";
import { query } from "@/lib/db";
import { FileUpload } from "@/components/FileUpload";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function LessonEditor({ params, searchParams }: { params: Promise<{ id: string; lessonId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id, lessonId } = await params; const sp = await searchParams;
  const v = await requireViewer("/admin/courses"); const { t } = await getT();
  const [d, l] = await Promise.all([getCourseDetail(id), getLesson(lessonId)]);
  if (!d || !l || l.course_id !== id) notFound();
  if (v.user.role !== "admin" && d.course.author_id !== v.user.id) redirect("/admin/courses");
  const admin = v.user.role === "admin";
  const [sources, attached, specs, models, subs] = await Promise.all([
    query<{ id: string; title: string; revision: string | null; approved: boolean }>("SELECT id,title,revision,approved FROM technical_sources ORDER BY title"),
    query<{ source_id: string; title: string; revision: string | null; approved: boolean; page_ref: string | null }>("SELECT ls.source_id,t.title,t.revision,t.approved,ls.page_ref FROM lesson_sources ls JOIN technical_sources t ON t.id=ls.source_id WHERE ls.lesson_id=$1", [lessonId]),
    query<{ id: string; label: string; value: string | null; unit: string | null; verified: boolean; page_ref: string | null }>("SELECT id,label,value,unit,verified,page_ref FROM lesson_specs WHERE lesson_id=$1", [lessonId]),
    query<{ id: string; model_number: string }>("SELECT id,model_number FROM equipment_models ORDER BY model_number"),
    getLessonSubtitles(lessonId),
  ]);
  return (
    <div className="space-y-6">
      <Link href={`/admin/courses/${id}`} className="text-sm text-steel-500 hover:underline">← {d.course.title_en}</Link>
      <h1 className="text-2xl font-extrabold text-navy-900">{l.title_en}</h1>
      {sp.saved && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}
      {sp.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{t(`err.${sp.error}`)}</p>}

      <form action={A.updateLessonAction} className="card grid gap-3 p-5 md:grid-cols-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} />
        <div><label className="label">{t("admin.title_en")}</label><input name="title_en" defaultValue={l.title_en} required className="input" /></div>
        <div><label className="label">{t("admin.title_ar")}</label><input name="title_ar" dir="rtl" defaultValue={l.title_ar ?? ""} className="input" /></div>
        <div className="md:col-span-2"><label className="label">{t("admin.body_en")}</label><textarea name="body_en" rows={14} defaultValue={l.body_en} className="input font-mono text-xs" /></div>
        <div className="md:col-span-2"><label className="label">{t("admin.body_ar")}</label><textarea name="body_ar" rows={8} dir="rtl" defaultValue={l.body_ar ?? ""} className="input text-sm" /></div>
        <div className="grid grid-cols-3 gap-3 md:col-span-2">
          <div><label className="label">{t("admin.chapter")}</label><select name="chapter_id" defaultValue={l.chapter_id} className="input">{d.chapters.map((c) => <option key={c.id} value={c.id}>{c.position}. {c.title_en.slice(0, 28)}</option>)}</select></div>
          <div><label className="label">#</label><input name="position" type="number" defaultValue={l.position} className="input" /></div>
          <div><label className="label">{t("admin.minutes")}</label><input name="duration_min" type="number" min={1} defaultValue={l.duration_min} className="input" /></div>
          <div><label className="label">{t("admin.access_tier")}</label><select name="tier" defaultValue={l.tier} className="input"><option value="basic">{t("tier.basic")}</option><option value="pro">{t("tier.pro")}</option></select></div>
          <div><label className="label">{t("admin.spec_status")}</label><select name="spec_status" defaultValue={l.spec_status} className="input"><option value="generic">{t("tag.generic")}</option><option value="model_specific">{t("admin.model_specific")}</option></select></div>
          <label className="flex items-end gap-2 pb-2 text-sm font-semibold"><input type="checkbox" name="is_free_preview" defaultChecked={l.is_free_preview} />{t("tag.free_preview")}</label></div>
        <div className="md:col-span-2"><label className="label">{t("admin.flow_json")}</label><textarea name="flow" rows={5} defaultValue={l.flow ? JSON.stringify(l.flow, null, 1) : ""} className="input font-mono text-xs" placeholder='[{"title":"Step","detail":"…","holdpoint":true}]' /></div>
        <div className="md:col-span-2"><button className="btn-primary">{t("admin.save")}</button></div></form>

      <section className="card grid gap-4 p-5 md:grid-cols-3"><h2 className="text-lg font-bold text-navy-900 md:col-span-3">{t("admin.media")}</h2>
        <FileUpload purpose="lesson_video" ownerId={lessonId} courseId={id} accept="video/mp4,video/webm" label={t("admin.upload_video")} done={t("admin.uploaded")} />
        <FileUpload purpose="subtitle" ownerId={lessonId} courseId={id} lang="en" accept=".vtt" label={`${t("admin.subtitles")} EN (.vtt)`} done={t("admin.uploaded")} />
        <FileUpload purpose="subtitle" ownerId={lessonId} courseId={id} lang="ar" accept=".vtt" label={`${t("admin.subtitles")} AR (.vtt)`} done={t("admin.uploaded")} />
        <p className="text-xs text-steel-500 md:col-span-3">{l.video_key ? t("admin.video_set") : t("admin.video_none")} · {subs.map((s) => s.lang.toUpperCase()).join(", ") || "—"}</p></section>

      <section className="card p-5"><h2 className="text-lg font-bold text-navy-900">{t("specs.sources")}</h2>
        <ul className="my-3 divide-y divide-steel-100 text-sm">{attached.map((s) => <li key={s.source_id} className="flex items-center justify-between py-2"><span>{s.title} {s.revision ? `(${t("specs.rev")} ${s.revision})` : ""} · {s.page_ref ?? <em className="text-red-600">{t("admin.no_page")}</em>} {s.approved ? "✓" : `(${t("specs.not_approved")})`}</span>
          <form action={A.detachSourceAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} /><input type="hidden" name="source_id" value={s.source_id} /><button className="text-red-600">✕</button></form></li>)}</ul>
        <form action={A.attachSourceAction} className="grid gap-2 md:grid-cols-[2fr_2fr_auto]"><input type="hidden" name="id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} />
          <select name="source_id" required className="input"><option value="">—</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title} {s.revision ? `· ${s.revision}` : ""} {s.approved ? "✓" : ""}</option>)}</select>
          <input name="page_ref" placeholder={t("admin.page_ref")} className="input" /><button className="btn-navy btn-sm">+ {t("admin.add")}</button></form></section>

      <section className="card p-5"><h2 className="text-lg font-bold text-navy-900">{t("specs.title")}</h2><p className="text-xs text-steel-500">{t("admin.specs_note")}</p>
        <ul className="my-3 divide-y divide-steel-100 text-sm">{specs.map((s) => <li key={s.id} className="flex items-center justify-between py-2"><span>{s.label}: <b>{s.value ?? "—"} {s.unit ?? ""}</b> {s.verified ? <span className="tag bg-emerald-100 text-emerald-800">{t("tag.verified")}</span> : <span className="tag bg-amber-100 text-amber-800">{t("specs.withheld")}</span>}</span>
          <form action={A.deleteSpecAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} /><input type="hidden" name="spec_id" value={s.id} /><button className="text-red-600">✕</button></form></li>)}</ul>
        <form action={A.saveSpecAction} className="grid gap-2 md:grid-cols-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} />
          <input name="label" required placeholder={t("admin.spec_label")} className="input" /><input name="value" placeholder={t("admin.spec_value")} className="input" /><input name="unit" placeholder={t("admin.spec_unit")} className="input" />
          <input name="condition_note" placeholder={t("admin.spec_condition")} className="input" />
          <select name="model_id" className="input"><option value="">{t("admin.spec_model")}</option>{models.map((m) => <option key={m.id} value={m.id}>{m.model_number}</option>)}</select>
          <select name="source_id" className="input"><option value="">{t("admin.spec_source")}</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>
          <input name="page_ref" placeholder={t("admin.page_ref")} className="input" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="verified" disabled={!admin} />{t("admin.spec_verified")}{!admin && ` (${t("admin.admin_only")})`}</label><button className="btn-navy btn-sm w-fit">+ {t("admin.add")}</button></form></section>

      <form action={A.deleteLessonAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="lesson_id" value={lessonId} /><button className="btn-danger btn-sm">{t("admin.delete_lesson")}</button></form>
    </div>
  );
}

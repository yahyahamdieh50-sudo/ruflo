import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { query, queryOne } from "@/lib/db";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function QuizEditor({ params, searchParams }: { params: Promise<{ id: string; quizId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id, quizId } = await params; const sp = await searchParams;
  const v = await requireViewer("/admin/courses"); const { t } = await getT();
  const quiz = await queryOne<{ id: string; title_en: string; kind: string; pass_mark: number; author_id: string | null }>("SELECT q.id,q.title_en,q.kind,q.pass_mark,c.author_id FROM quizzes q JOIN courses c ON c.id=q.course_id WHERE q.id=$1 AND q.course_id=$2", [quizId, id]);
  if (!quiz) notFound();
  if (v.user.role !== "admin" && quiz.author_id !== v.user.id) redirect("/admin/courses");
  const qs = await query<{ id: string; position: number; prompt_en: string; options_en: string[]; correct_index: number; explanation_en: string | null }>("SELECT id,position,prompt_en,options_en,correct_index,explanation_en FROM quiz_questions WHERE quiz_id=$1 ORDER BY position", [quizId]);
  return (
    <div className="space-y-6"><Link href={`/admin/courses/${id}`} className="text-sm text-steel-500 hover:underline">← {t("admin.courses")}</Link>
      <h1 className="text-2xl font-extrabold text-navy-900">{quiz.title_en} <span className="tag bg-steel-200">{quiz.kind}</span></h1>
      {sp.saved && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}{sp.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{t("admin.quiz_invalid")}</p>}
      <ol className="space-y-3">{qs.map((q) => <li key={q.id} className="card p-4 text-sm"><p className="font-semibold">{q.position}. {q.prompt_en}</p><ul className="mt-2 list-disc ps-6">{q.options_en.map((o, i) => <li key={i} className={i === q.correct_index ? "font-bold text-emerald-700" : ""}>{o}</li>)}</ul>{q.explanation_en && <p className="mt-2 text-xs text-steel-500">{q.explanation_en}</p>}
        <form action={A.deleteQuestionAction} className="mt-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="quiz_id" value={quizId} /><input type="hidden" name="question_id" value={q.id} /><button className="text-xs text-red-600">✕ {t("admin.remove")}</button></form></li>)}</ol>
      <form action={A.addQuestionAction} className="card grid gap-3 p-5"><input type="hidden" name="id" value={id} /><input type="hidden" name="quiz_id" value={quizId} /><h2 className="font-bold text-navy-900">{t("admin.add_question")}</h2>
        <textarea name="prompt_en" required rows={2} placeholder={t("admin.question")} className="input" /><textarea name="prompt_ar" dir="rtl" rows={2} placeholder={t("admin.question_ar")} className="input" />
        <textarea name="options" required rows={5} placeholder={t("admin.options_hint")} className="input" /><div className="grid gap-3 md:grid-cols-[8rem_1fr]"><input name="correct" type="number" min={1} max={8} required placeholder={t("admin.correct_no")} className="input" /><input name="explanation_en" placeholder={t("admin.explanation")} className="input" /></div>
        <button className="btn-navy btn-sm w-fit">+ {t("admin.add")}</button></form></div>
  );
}

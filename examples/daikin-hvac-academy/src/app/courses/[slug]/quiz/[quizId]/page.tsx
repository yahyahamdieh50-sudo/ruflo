import { notFound } from "next/navigation";
import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { getCourseDetailBySlug, pick } from "@/lib/courses";
import { getQuizForTaking } from "@/lib/learning";
import { canTakeQuiz } from "@/lib/entitlements";
import { Locked } from "@/components/Locked";
import { QuizRunner } from "@/components/QuizRunner";

export const dynamic = "force-dynamic";

export default async function QuizPage({ params }: { params: Promise<{ slug: string; quizId: string }> }) {
  const { slug, quizId } = await params;
  const [{ t, locale }, viewer, d, quiz] = await Promise.all([getT(), getViewer(), getCourseDetailBySlug(slug), getQuizForTaking(quizId)]);
  if (!d || !quiz || quiz.course_id !== d.course.id) notFound();
  const plan = viewer?.plan ?? "free";
  const allowed = canTakeQuiz(plan, d.course, quiz);
  return (
    <div className="container-x max-w-3xl py-10">
      <Link href={`/courses/${slug}`} className="text-sm text-steel-500 hover:underline">← {pick(d.course, "title", locale)}</Link>
      <h1 className="mt-2 text-3xl font-extrabold text-navy-900">{pick(quiz, "title", locale)}</h1>
      <p className="mt-1 text-sm text-steel-600">{quiz.questions.length} Q · {t("quiz.passmark")}: {quiz.pass_mark}%{quiz.kind === "final" ? ` · ${t("quiz.final_note")}` : ""}</p>
      {!allowed ? <Locked needed={quiz.kind === "final" ? "pro" : d.course.tier} loggedIn={!!viewer} t={t} what={t("locked.quiz")} /> : (
        <div className="mt-6"><QuizRunner quizId={quiz.id} certBase="/certificates" explanations={undefined}
          questions={quiz.questions.map((q) => ({ id: q.id, prompt: (locale === "ar" && q.prompt_ar) || q.prompt_en, options: (locale === "ar" && q.options_ar) || q.options_en }))}
          labels={{ submit: t("quiz.submit"), retake: t("quiz.retake"), passed: t("quiz.passed"), failed: t("quiz.failed"), score: t("quiz.score"), passmark: t("quiz.passmark"), correct: t("quiz.correct"), incorrect: t("quiz.incorrect"), answerAll: t("quiz.answer_all"), why: t("quiz.why"), cert: t("quiz.cert"), error: t("quiz.error") }} /></div>)}
    </div>
  );
}

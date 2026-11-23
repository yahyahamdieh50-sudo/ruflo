"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer, requireViewer } from "@/lib/auth";
import { completeLesson, enroll, submitQuiz, submitReview, toggleSaved, type QuizOutcome } from "@/lib/learning";
import { queryOne } from "@/lib/db";

export async function completeLessonAction(formData: FormData) {
  const v = await requireViewer();
  const lessonId = String(formData.get("lessonId") ?? "");
  const back = String(formData.get("back") ?? "/dashboard");
  const r = await completeLesson(v.user.id, v.plan, lessonId);
  revalidatePath("/dashboard");
  if (r.ok && r.certificateNumber) redirect(`/certificates/${r.certificateNumber}?new=1`);
  const next = String(formData.get("next") ?? "");
  redirect(r.ok ? (next || back) : `${back}?error=not_allowed`);
}

export async function toggleSavedAction(formData: FormData) {
  const v = await requireViewer();
  await toggleSaved(v.user.id, String(formData.get("lessonId") ?? ""));
  revalidatePath("/dashboard");
  redirect(String(formData.get("back") ?? "/dashboard"));
}

export async function startCourseAction(formData: FormData) {
  const v = await requireViewer();
  const courseId = String(formData.get("courseId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const course = await queryOne<{ id: string; tier: "basic" | "pro"; status: string }>("SELECT id,tier,status FROM courses WHERE id=$1", [courseId]);
  if (!course || course.status !== "published") redirect(`/courses/${slug}`);
  const ok = v.plan === "pro" || (v.plan === "basic" && course.tier === "basic");
  if (!ok) redirect("/pricing");
  await enroll(v.user.id, courseId);
  const first = await queryOne<{ id: string }>(
    "SELECT id FROM lessons WHERE course_id=$1 AND id NOT IN (SELECT lesson_id FROM lesson_progress WHERE user_id=$2) ORDER BY position LIMIT 1", [courseId, v.user.id]);
  redirect(first ? `/courses/${slug}/learn/${first.id}` : `/courses/${slug}`);
}

export async function submitQuizAction(quizId: string, answers: Record<string, number>): Promise<QuizOutcome | { error: string }> {
  const v = await getViewer();
  if (!v) return { error: "auth" };
  const clean: Record<string, number> = {};
  for (const [k, val] of Object.entries(answers ?? {})) if (Number.isInteger(val) && val >= 0 && val < 20) clean[String(k).slice(0, 64)] = val;
  const r = await submitQuiz(v.user.id, v.plan, quizId, clean);
  revalidatePath("/dashboard");
  return r;
}

export async function submitReviewAction(formData: FormData) {
  const v = await requireViewer();
  const slug = String(formData.get("slug") ?? "");
  const ok = await submitReview(v.user.id, String(formData.get("courseId") ?? ""), Number(formData.get("rating")), String(formData.get("comment") ?? ""));
  redirect(`/courses/${slug}?review=${ok ? "saved" : "not_allowed"}#reviews`);
}

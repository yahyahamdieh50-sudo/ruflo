import { query, queryOne, uuid, tx } from "./db";
import { canEarnCertificate, canTakeQuiz, canTrackProgress, canAccessLesson, type PlanCode, type Tier } from "./entitlements";
import { gradeQuiz } from "./quiz";
import { generateCertificateNumber } from "./certificate-number";
import { percent } from "./content-rules";
import { sendCompletionEmail } from "./emails";

export async function enroll(userId: string, courseId: string) {
  await query("INSERT INTO enrollments (user_id,course_id) VALUES ($1,$2) ON CONFLICT (user_id,course_id) DO UPDATE SET last_activity_at=now()", [userId, courseId]);
}

export async function getCourseProgress(userId: string, courseId: string) {
  const lessons = await query<{ id: string }>("SELECT id FROM lessons WHERE course_id=$1", [courseId]);
  const done = await query<{ lesson_id: string }>(
    "SELECT p.lesson_id FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=$1 AND l.course_id=$2", [userId, courseId]);
  const doneIds = new Set(done.map((d) => d.lesson_id));
  return { total: lessons.length, done: doneIds.size, percent: percent(doneIds.size, lessons.length), doneIds };
}

export type CompleteResult = { ok: true; certificateNumber?: string } | { ok: false; error: "not_allowed" | "not_found" };

export async function completeLesson(userId: string, plan: PlanCode, lessonId: string): Promise<CompleteResult> {
  const lesson = await queryOne<{ id: string; course_id: string; tier: Tier; is_free_preview: boolean; course_tier: Tier }>(
    "SELECT l.id,l.course_id,l.tier,l.is_free_preview,c.tier AS course_tier FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1", [lessonId]);
  if (!lesson) return { ok: false, error: "not_found" };
  if (!canTrackProgress(plan) || !canAccessLesson(plan, { tier: lesson.course_tier }, lesson)) return { ok: false, error: "not_allowed" };
  await enroll(userId, lesson.course_id);
  await query("INSERT INTO lesson_progress (user_id,lesson_id) VALUES ($1,$2) ON CONFLICT (user_id,lesson_id) DO NOTHING", [userId, lessonId]);
  const cert = await maybeIssueCertificate(userId, plan, lesson.course_id);
  return { ok: true, certificateNumber: cert?.number };
}

export async function toggleSaved(userId: string, lessonId: string): Promise<boolean> {
  const del = await query("DELETE FROM saved_lessons WHERE user_id=$1 AND lesson_id=$2 RETURNING lesson_id", [userId, lessonId]);
  if (del.length) return false;
  await query("INSERT INTO saved_lessons (user_id,lesson_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [userId, lessonId]);
  return true;
}

// ── Quizzes ─────────────────────────────────────────────────────────────
export interface QuizForTaking {
  id: string; kind: "lesson" | "final"; title_en: string; title_ar: string | null; pass_mark: number; course_id: string;
  questions: { id: string; prompt_en: string; prompt_ar: string | null; options_en: string[]; options_ar: string[] | null }[];
}

/** Never includes correct answers or explanations. */
export async function getQuizForTaking(quizId: string): Promise<QuizForTaking | null> {
  const q = await queryOne<Omit<QuizForTaking, "questions">>("SELECT id,kind,title_en,title_ar,pass_mark,course_id FROM quizzes WHERE id=$1", [quizId]);
  if (!q) return null;
  const questions = await query("SELECT id,prompt_en,prompt_ar,options_en,options_ar FROM quiz_questions WHERE quiz_id=$1 ORDER BY position", [quizId]);
  return { ...q, questions };
}

export interface QuizOutcome {
  scorePct: number; passed: boolean; passMark: number; certificateNumber?: string;
  review: { id: string; correct: boolean; chosen: number | null; correctIndex: number; explanation_en: string | null; explanation_ar: string | null }[];
}

export async function submitQuiz(userId: string, plan: PlanCode, quizId: string, answers: Record<string, number>): Promise<QuizOutcome | { error: "not_allowed" | "not_found" | "empty" }> {
  const quiz = await queryOne<{ id: string; kind: "lesson" | "final"; pass_mark: number; course_id: string; course_tier: Tier }>(
    "SELECT q.id,q.kind,q.pass_mark,q.course_id,c.tier AS course_tier FROM quizzes q JOIN courses c ON c.id=q.course_id WHERE q.id=$1", [quizId]);
  if (!quiz) return { error: "not_found" };
  if (!canTakeQuiz(plan, { tier: quiz.course_tier }, quiz)) return { error: "not_allowed" };
  const questions = await query<{ id: string; correct_index: number; explanation_en: string | null; explanation_ar: string | null }>(
    "SELECT id,correct_index,explanation_en,explanation_ar FROM quiz_questions WHERE quiz_id=$1 ORDER BY position", [quizId]);
  if (questions.length === 0) return { error: "empty" };

  const g = gradeQuiz(questions, answers, quiz.pass_mark);
  await query("INSERT INTO quiz_attempts (id,user_id,quiz_id,score_pct,passed,answers) VALUES ($1,$2,$3,$4,$5,$6)",
    [uuid(), userId, quizId, g.scorePct, g.passed, JSON.stringify(answers)]);
  await enroll(userId, quiz.course_id);

  let certificateNumber: string | undefined;
  if (quiz.kind === "final" && g.passed) certificateNumber = (await maybeIssueCertificate(userId, plan, quiz.course_id))?.number;
  return {
    scorePct: g.scorePct, passed: g.passed, passMark: quiz.pass_mark, certificateNumber,
    review: g.perQuestion.map((p) => {
      const q = questions.find((x) => x.id === p.id)!;
      return { id: p.id, correct: p.correct, chosen: p.chosen, correctIndex: q.correct_index, explanation_en: q.explanation_en, explanation_ar: q.explanation_ar };
    }),
  };
}

// ── Certificates ────────────────────────────────────────────────────────
/** Pro plan + every lesson completed + final assessment passed + verified email. Idempotent. */
export async function maybeIssueCertificate(userId: string, plan: PlanCode, courseId: string): Promise<{ number: string } | null> {
  if (!canEarnCertificate(plan)) return null;
  const existing = await queryOne<{ number: string }>("SELECT number FROM certificates WHERE user_id=$1 AND course_id=$2 AND revoked_at IS NULL", [userId, courseId]);
  if (existing) return existing;
  const finals = await query<{ id: string }>("SELECT id FROM quizzes WHERE course_id=$1 AND kind='final'", [courseId]);
  if (finals.length === 0) return null;
  const progress = await getCourseProgress(userId, courseId);
  if (progress.total === 0 || progress.done < progress.total) return null;
  const best = await queryOne<{ score: number }>(
    "SELECT max(score_pct)::int AS score FROM quiz_attempts WHERE user_id=$1 AND passed=true AND quiz_id = ANY($2)", [userId, finals.map((f) => f.id)]);
  if (!best || best.score == null) return null;
  const user = await queryOne<{ email: string; name: string; email_verified_at: string | null }>("SELECT email,name,email_verified_at FROM users WHERE id=$1", [userId]);
  if (!user?.email_verified_at) return null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const number = generateCertificateNumber();
    try {
      const rows = await query("INSERT INTO certificates (id,number,user_id,course_id,score_pct) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,course_id) DO NOTHING RETURNING number",
        [uuid(), number, userId, courseId, best.score]);
      if (rows.length === 0) return queryOne<{ number: string }>("SELECT number FROM certificates WHERE user_id=$1 AND course_id=$2", [userId, courseId]);
      const course = await queryOne<{ title_en: string }>("SELECT title_en FROM courses WHERE id=$1", [courseId]);
      await sendCompletionEmail(user.email, user.name, course?.title_en ?? "your course", number);
      return { number };
    } catch (e: any) {
      if (e?.code !== "23505") throw e; // number collision → retry
    }
  }
  return null;
}

export const getCertificateByNumber = (number: string) =>
  queryOne<{ number: string; score_pct: number; issued_at: string; revoked_at: string | null; student_name: string; course_title_en: string; course_title_ar: string | null; course_id: string }>(
    `SELECT ce.number,ce.score_pct,ce.issued_at,ce.revoked_at,u.name AS student_name,c.title_en AS course_title_en,c.title_ar AS course_title_ar,c.id AS course_id
     FROM certificates ce JOIN users u ON u.id=ce.user_id JOIN courses c ON c.id=ce.course_id WHERE ce.number=$1`, [number.trim().toUpperCase()]);

// ── Reviews ─────────────────────────────────────────────────────────────
export async function submitReview(userId: string, courseId: string, rating: number, comment: string): Promise<boolean> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return false;
  const started = await queryOne("SELECT 1 AS x FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE p.user_id=$1 AND l.course_id=$2 LIMIT 1", [userId, courseId]);
  if (!started) return false;
  await query("INSERT INTO reviews (user_id,course_id,rating,comment) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,course_id) DO UPDATE SET rating=$3, comment=$4",
    [userId, courseId, rating, comment.trim().slice(0, 1000) || null]);
  return true;
}

// ── Dashboard ───────────────────────────────────────────────────────────
export async function getDashboard(userId: string, plan: PlanCode) {
  const enrolled = await query<{ id: string; slug: string; title_en: string; title_ar: string | null; category: string; tier: Tier; last_activity_at: string }>(
    `SELECT c.id,c.slug,c.title_en,c.title_ar,c.category,c.tier,e.last_activity_at FROM enrollments e JOIN courses c ON c.id=e.course_id
     WHERE e.user_id=$1 ORDER BY e.last_activity_at DESC`, [userId]);
  const courses = [];
  for (const c of enrolled) {
    const p = await getCourseProgress(userId, c.id);
    const next = await queryOne<{ id: string; title_en: string; title_ar: string | null }>(
      `SELECT l.id,l.title_en,l.title_ar FROM lessons l WHERE l.course_id=$1 AND l.id NOT IN (SELECT lesson_id FROM lesson_progress WHERE user_id=$2) ORDER BY l.position LIMIT 1`, [c.id, userId]);
    courses.push({ ...c, progress: { total: p.total, done: p.done, percent: p.percent }, next });
  }
  const saved = await query<{ id: string; title_en: string; title_ar: string | null; course_slug: string; course_title_en: string }>(
    `SELECT l.id,l.title_en,l.title_ar,c.slug AS course_slug,c.title_en AS course_title_en FROM saved_lessons s JOIN lessons l ON l.id=s.lesson_id JOIN courses c ON c.id=l.course_id WHERE s.user_id=$1 ORDER BY s.created_at DESC`, [userId]);
  const quizScores = await query<{ quiz_title_en: string; kind: string; best: number; attempts: number; passed: boolean; course_title_en: string }>(
    `SELECT q.title_en AS quiz_title_en,q.kind,max(a.score_pct)::int AS best,count(*)::int AS attempts,bool_or(a.passed) AS passed,c.title_en AS course_title_en
     FROM quiz_attempts a JOIN quizzes q ON q.id=a.quiz_id JOIN courses c ON c.id=q.course_id WHERE a.user_id=$1 GROUP BY q.id,q.title_en,q.kind,c.title_en`, [userId]);
  const certificates = await query<{ number: string; issued_at: string; score_pct: number; title_en: string; title_ar: string | null }>(
    `SELECT ce.number,ce.issued_at,ce.score_pct,c.title_en,c.title_ar FROM certificates ce JOIN courses c ON c.id=ce.course_id WHERE ce.user_id=$1 AND ce.revoked_at IS NULL ORDER BY ce.issued_at DESC`, [userId]);
  const resources = plan === "pro"
    ? await query<{ id: string; title_en: string; title_ar: string | null; kind: string; course_title_en: string }>(
        `SELECT r.id,r.title_en,r.title_ar,r.kind,c.title_en AS course_title_en FROM resources r JOIN courses c ON c.id=r.course_id
         WHERE c.id IN (SELECT course_id FROM enrollments WHERE user_id=$1) ORDER BY c.title_en,r.title_en`, [userId])
    : [];
  const subscription = await queryOne("SELECT plan_code,interval,status,current_period_end,cancel_at_period_end,pending_plan_code FROM subscriptions WHERE user_id=$1 ORDER BY (status IN ('active','trialing','past_due')) DESC, updated_at DESC LIMIT 1", [userId]);
  const continueItem = courses.find((c) => c.next);
  return { courses, continueItem, saved, quizScores, certificates, resources, subscription };
}

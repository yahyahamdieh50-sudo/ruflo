import { query, queryOne, audit } from "./db";
import { checkPublishable } from "./content-rules";

export async function gatherPublishInput(courseId: string) {
  const course = await queryOne<any>(
    "SELECT status,author_id,technical_reviewed_by,technical_reviewed_at,content_updated_at FROM courses WHERE id=$1", [courseId]);
  if (!course) return null;
  const lessons = await query<{ id: string; title: string; spec_status: "generic" | "model_specific"; srcs: number }>(
    `SELECT l.id,l.title_en AS title,l.spec_status,COALESCE(s.n,0)::int AS srcs
     FROM lessons l
     LEFT JOIN (SELECT ls.lesson_id, count(*) AS n FROM lesson_sources ls JOIN technical_sources t ON t.id=ls.source_id
                WHERE t.approved=true AND ls.page_ref IS NOT NULL AND ls.page_ref<>'' GROUP BY ls.lesson_id) s ON s.lesson_id=l.id
     WHERE l.course_id=$1 ORDER BY l.position`, [courseId]);
  const vm = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM course_models cm JOIN equipment_models m ON m.id=cm.model_id WHERE cm.course_id=$1 AND m.verified=true", [courseId]);
  const fq = await queryOne<{ n: number }>(
    "SELECT count(*)::int AS n FROM quiz_questions qq JOIN quizzes q ON q.id=qq.quiz_id WHERE q.course_id=$1 AND q.kind='final'", [courseId]);
  return {
    course,
    lessons: lessons.map((l) => ({ id: l.id, title: l.title, spec_status: l.spec_status, has_approved_source_with_page: l.srcs > 0 })),
    verifiedModelCount: vm?.n ?? 0,
    finalQuizQuestionCount: fq?.n ?? 0,
  };
}

export async function publishCourse(courseId: string, actorId: string): Promise<{ ok: boolean; problems: string[] }> {
  const input = await gatherPublishInput(courseId);
  if (!input) return { ok: false, problems: ["Course not found."] };
  const r = checkPublishable(input);
  if (!r.ok) return r;
  await query("UPDATE courses SET status='published' WHERE id=$1", [courseId]);
  await audit(actorId, "course.publish", courseId);
  return r;
}

/** Any content edit invalidates a prior technical review (re-review required before publishing). */
export const touchContent = (courseId: string) => query("UPDATE courses SET content_updated_at=now() WHERE id=$1", [courseId]);

export async function recordTechnicalReview(courseId: string, reviewerId: string, notes: string) {
  await query("UPDATE courses SET technical_reviewed_by=$1, technical_reviewed_at=now(), technical_review_notes=$2, status=CASE WHEN status='draft' THEN 'in_review' ELSE status END WHERE id=$3",
    [reviewerId, notes.slice(0, 2000), courseId]);
  await audit(reviewerId, "course.technical_review", courseId, { notes });
}

export async function getAnalytics() {
  const day = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const rev30 = await queryOne<{ s: string | null }>("SELECT sum(amount_cents) AS s FROM payments WHERE status='paid' AND created_at>=$1", [day]);
  const revTotal = await queryOne<{ s: string | null }>("SELECT sum(amount_cents) AS s FROM payments WHERE status='paid'");
  const subs = await query<{ plan_code: string; interval: string; n: number; cents: number }>(
    `SELECT s.plan_code,s.interval,count(*)::int AS n,COALESCE(max(p.price_usd_cents),0)::int AS cents
     FROM subscriptions s LEFT JOIN plans p ON p.code=s.plan_code AND p.interval=s.interval
     WHERE s.status IN ('active','trialing','past_due') GROUP BY s.plan_code,s.interval`);
  const mrrCents = subs.reduce((a, r) => a + (r.interval === "year" ? Math.round(r.cents / 12) : r.cents) * r.n, 0);
  const students = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE role='student'");
  const paying = await queryOne<{ n: number }>("SELECT count(DISTINCT user_id)::int AS n FROM subscriptions WHERE status IN ('active','trialing','past_due')");
  const everPaid = await queryOne<{ n: number }>("SELECT count(DISTINCT user_id)::int AS n FROM payments WHERE status='paid'");
  const engagement = await query<{ id: string; title_en: string; enrollments: number; lessons_done: number; certificates: number; rating: string | null }>(
    `SELECT c.id,c.title_en,COALESCE(e.n,0)::int AS enrollments,COALESCE(p.n,0)::int AS lessons_done,COALESCE(ce.n,0)::int AS certificates,r.avg AS rating
     FROM courses c
     LEFT JOIN (SELECT course_id, count(*) AS n FROM enrollments GROUP BY course_id) e ON e.course_id=c.id
     LEFT JOIN (SELECT l.course_id, count(*) AS n FROM lesson_progress lp JOIN lessons l ON l.id=lp.lesson_id GROUP BY l.course_id) p ON p.course_id=c.id
     LEFT JOIN (SELECT course_id, count(*) AS n FROM certificates GROUP BY course_id) ce ON ce.course_id=c.id
     LEFT JOIN (SELECT course_id, avg(rating) AS avg FROM reviews GROUP BY course_id) r ON r.course_id=c.id
     WHERE c.status='published' ORDER BY enrollments DESC`);
  const failed = await queryOne<{ n: number }>("SELECT count(*)::int AS n FROM payments WHERE status='failed' AND created_at>=$1", [day]);
  const n = students?.n ?? 0;
  return {
    revenue30dCents: Number(rev30?.s ?? 0), revenueTotalCents: Number(revTotal?.s ?? 0), mrrCents,
    subscribersByPlan: subs, activeSubscribers: paying?.n ?? 0, students: n,
    conversionRate: n ? Math.round(((everPaid?.n ?? 0) / n) * 1000) / 10 : 0,
    failedPayments30d: failed?.n ?? 0,
    engagement: engagement.map((e) => ({ ...e, rating: e.rating == null ? null : Number(e.rating) })),
  };
}

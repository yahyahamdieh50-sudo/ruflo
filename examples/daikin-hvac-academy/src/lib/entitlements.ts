/**
 * Pure access-control rules. All premium gating flows through this file so that the
 * server (pages, route handlers, media streaming) and the tests share one source of truth.
 */
export type PlanCode = "free" | "basic" | "pro";
export type Tier = "basic" | "pro";
export type Role = "student" | "instructor" | "admin";

const RANK: Record<PlanCode, number> = { free: 0, basic: 1, pro: 2 };
export const planRank = (p: PlanCode) => RANK[p];
export const atLeast = (plan: PlanCode, needed: PlanCode) => RANK[plan] >= RANK[needed];

export interface SubscriptionLike {
  plan_code: Tier;
  status: string;
  current_period_end: Date | string | null;
}

export interface EffectivePlanInput {
  role: Role;
  subscriptions: SubscriptionLike[];
  compPlan?: Tier | null;
  compUntil?: Date | string | null;
  now?: Date;
  /** Days of access retained after a failed renewal (past_due) before locking. */
  graceDays?: number;
}

export function effectivePlan(i: EffectivePlanInput): PlanCode {
  if (i.role === "admin" || i.role === "instructor") return "pro"; // staff preview/authoring access
  const now = i.now ?? new Date();
  const grace = (i.graceDays ?? 3) * 86_400_000;
  let best: PlanCode = "free";

  for (const s of i.subscriptions) {
    const end = s.current_period_end ? new Date(s.current_period_end).getTime() : 0;
    const live =
      s.status === "active" || s.status === "trialing" ||
      (s.status === "past_due" && end + grace > now.getTime());
    if (live && RANK[s.plan_code] > RANK[best]) best = s.plan_code;
  }
  if (i.compPlan && (!i.compUntil || new Date(i.compUntil).getTime() > now.getTime())) {
    if (RANK[i.compPlan] > RANK[best]) best = i.compPlan;
  }
  return best;
}

export interface CourseAccess { tier: Tier }
export interface LessonAccess { tier: Tier; is_free_preview: boolean }

export function canAccessLesson(plan: PlanCode, course: CourseAccess, lesson: LessonAccess): boolean {
  if (lesson.is_free_preview) return true;
  const needed = Math.max(RANK[course.tier], RANK[lesson.tier]);
  return RANK[plan] >= needed;
}

/** Lesson quizzes need Basic+ (and course tier); final assessments need Pro. */
export function canTakeQuiz(plan: PlanCode, course: CourseAccess, quiz: { kind: "lesson" | "final" }): boolean {
  if (quiz.kind === "final") return plan === "pro";
  return RANK[plan] >= Math.max(RANK.basic, RANK[course.tier]);
}

export const canDownloadResources = (plan: PlanCode) => plan === "pro";
export const canEarnCertificate = (plan: PlanCode) => plan === "pro";
export const canTrackProgress = (plan: PlanCode) => RANK[plan] >= RANK.basic;
export const canUseFullAssistant = (plan: PlanCode) => RANK[plan] >= RANK.basic;

/** Which plan unlocks a given lesson (for upsell copy). */
export function requiredPlan(course: CourseAccess, lesson: LessonAccess): PlanCode {
  if (lesson.is_free_preview) return "free";
  return RANK[course.tier] >= RANK[lesson.tier] ? course.tier : lesson.tier;
}

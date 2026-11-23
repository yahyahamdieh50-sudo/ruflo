import { describe, expect, it } from "vitest";
import { canAccessLesson, canDownloadResources, canEarnCertificate, canTakeQuiz, effectivePlan, requiredPlan } from "@/lib/entitlements";

const future = new Date(Date.now() + 10 * 86_400_000);
const past = new Date(Date.now() - 10 * 86_400_000);

describe("effectivePlan", () => {
  it("is free with no subscription", () => {
    expect(effectivePlan({ role: "student", subscriptions: [] })).toBe("free");
  });
  it("grants the plan for active and trialing subscriptions", () => {
    expect(effectivePlan({ role: "student", subscriptions: [{ plan_code: "basic", status: "active", current_period_end: future }] })).toBe("basic");
    expect(effectivePlan({ role: "student", subscriptions: [{ plan_code: "pro", status: "trialing", current_period_end: future }] })).toBe("pro");
  });
  it("takes the highest of several subscriptions", () => {
    expect(effectivePlan({ role: "student", subscriptions: [
      { plan_code: "basic", status: "active", current_period_end: future },
      { plan_code: "pro", status: "active", current_period_end: future }] })).toBe("pro");
  });
  it.each(["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"])("revokes access when status is %s", (status) => {
    expect(effectivePlan({ role: "student", subscriptions: [{ plan_code: "pro", status, current_period_end: future }] })).toBe("free");
  });
  it("keeps access during the past_due grace window only", () => {
    const recent = new Date(Date.now() - 1 * 86_400_000);
    expect(effectivePlan({ role: "student", subscriptions: [{ plan_code: "pro", status: "past_due", current_period_end: recent }] })).toBe("pro");
    expect(effectivePlan({ role: "student", subscriptions: [{ plan_code: "pro", status: "past_due", current_period_end: past }] })).toBe("free");
  });
  it("honours complimentary plans until they expire", () => {
    expect(effectivePlan({ role: "student", subscriptions: [], compPlan: "pro", compUntil: future })).toBe("pro");
    expect(effectivePlan({ role: "student", subscriptions: [], compPlan: "pro", compUntil: past })).toBe("free");
    expect(effectivePlan({ role: "student", subscriptions: [], compPlan: "basic", compUntil: null })).toBe("basic");
  });
  it("gives staff full content access", () => {
    expect(effectivePlan({ role: "admin", subscriptions: [] })).toBe("pro");
    expect(effectivePlan({ role: "instructor", subscriptions: [] })).toBe("pro");
  });
});

describe("access rules", () => {
  const basicCourse = { tier: "basic" as const };
  const proCourse = { tier: "pro" as const };
  const lesson = (tier: "basic" | "pro", is_free_preview = false) => ({ tier, is_free_preview });

  it("free users only see preview lessons", () => {
    expect(canAccessLesson("free", basicCourse, lesson("basic", true))).toBe(true);
    expect(canAccessLesson("free", basicCourse, lesson("basic"))).toBe(false);
  });
  it("basic users access basic lessons in basic courses but not pro lessons or pro courses", () => {
    expect(canAccessLesson("basic", basicCourse, lesson("basic"))).toBe(true);
    expect(canAccessLesson("basic", basicCourse, lesson("pro"))).toBe(false);
    expect(canAccessLesson("basic", proCourse, lesson("basic"))).toBe(false);
  });
  it("pro users access everything", () => {
    expect(canAccessLesson("pro", proCourse, lesson("pro"))).toBe(true);
  });
  it("gates quizzes: lesson quizzes Basic+, final assessments Pro only", () => {
    expect(canTakeQuiz("free", basicCourse, { kind: "lesson" })).toBe(false);
    expect(canTakeQuiz("basic", basicCourse, { kind: "lesson" })).toBe(true);
    expect(canTakeQuiz("basic", proCourse, { kind: "lesson" })).toBe(false);
    expect(canTakeQuiz("basic", basicCourse, { kind: "final" })).toBe(false);
    expect(canTakeQuiz("pro", basicCourse, { kind: "final" })).toBe(true);
  });
  it("downloads and certificates are Pro only", () => {
    expect(canDownloadResources("basic")).toBe(false);
    expect(canDownloadResources("pro")).toBe(true);
    expect(canEarnCertificate("basic")).toBe(false);
    expect(canEarnCertificate("pro")).toBe(true);
  });
  it("reports which plan unlocks a lesson", () => {
    expect(requiredPlan(basicCourse, lesson("basic", true))).toBe("free");
    expect(requiredPlan(basicCourse, lesson("pro"))).toBe("pro");
    expect(requiredPlan(proCourse, lesson("basic"))).toBe("pro");
  });
});

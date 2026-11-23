import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDb } from "./helpers/db";
import { query, queryOne } from "@/lib/db";
import { seedAll } from "@/lib/seed";
import { listCourses, getCourseDetailBySlug, getLessonSpecs } from "@/lib/courses";
import { SAMPLE_SLUG } from "@/content/sample-course";
import { registerUser, verifyEmail, authenticate, createSessionRecord, getViewerBySessionToken, requestPasswordReset, resetPassword, createEmailToken } from "@/lib/auth-core";
import { outbox } from "@/lib/email";
import { _resetRateLimits } from "@/lib/security";
import { getQuizForTaking, completeLesson, getCourseProgress, maybeIssueCertificate, submitQuiz, getCertificateByNumber, getDashboard } from "@/lib/learning";
import { handleStripeEvent, upsertSubscription } from "@/lib/billing";
import { publishCourse, recordTechnicalReview, getAnalytics } from "@/lib/admin-data";

beforeEach(async () => {
  await makeTestDb();
  await seedAll({ adminEmail: "admin@test.dev", adminPassword: "AdminPass-12345" });
  outbox.length = 0;
  _resetRateLimits();
});

async function newStudent(email = "stu@test.dev") {
  const r = await registerUser({ email, password: "StrongPass-123", name: "Stu Dent" });
  expect(r.ok).toBe(true);
  const u = await queryOne<{ id: string }>("SELECT id FROM users WHERE email=$1", [email]);
  return u!.id;
}
const giveSub = (userId: string, plan: "basic" | "pro") =>
  query("INSERT INTO subscriptions (id,user_id,stripe_subscription_id,plan_code,interval,status,current_period_end) VALUES ($1,$2,$3,$4,'month','active',$5)",
    [crypto.randomUUID(), userId, "sub_" + crypto.randomUUID(), plan, new Date(Date.now() + 86_400_000 * 20).toISOString()]);

describe("seed & catalog", () => {
  it("seeds plans, a published sample course, and 9 coming-soon syllabi", async () => {
    const plans = await query("SELECT * FROM plans");
    expect(plans).toHaveLength(4);
    expect(plans.find((p: any) => p.code === "basic" && p.interval === "month").price_usd_cents).toBe(999);
    expect(plans.find((p: any) => p.code === "pro" && p.interval === "month").price_usd_cents).toBe(2500);
    expect(plans.filter((p: any) => p.interval === "year").every((p: any) => !p.active)).toBe(true);
    const all = await listCourses();
    expect(all).toHaveLength(10);
    expect(all.filter((c) => c.status === "published")).toHaveLength(1);
    expect(all.filter((c) => c.status === "coming_soon")).toHaveLength(9);
  });
  it("is idempotent", async () => {
    await seedAll({ adminEmail: "admin@test.dev", adminPassword: "AdminPass-12345" });
    expect(await listCourses()).toHaveLength(10);
  });
  it("searches by title, category and model number", async () => {
    expect((await listCourses({ q: "chiller" })).length).toBeGreaterThan(0);
    expect((await listCourses({ q: "SAMPLE-MODEL" })).map((c) => c.slug)).toEqual([SAMPLE_SLUG]);
    expect((await listCourses({ category: "vrv-vrf" })).map((c) => c.status)).toEqual(["coming_soon"]);
    expect(await listCourses({ q: "zzzz-no-match" })).toHaveLength(0);
  });
  it("sample course has the full structure, preview lesson, quizzes and resources", async () => {
    const d = (await getCourseDetailBySlug(SAMPLE_SLUG))!;
    expect(d.chapters).toHaveLength(13);
    const lessons = d.chapters.flatMap((c) => c.lessons);
    expect(lessons.filter((l) => l.is_free_preview)).toHaveLength(1);
    expect(lessons.some((l) => l.tier === "pro")).toBe(true);
    expect(d.quizzes.filter((q) => q.kind === "final")).toHaveLength(1);
    expect(d.quizzes.filter((q) => q.kind === "lesson").length).toBeGreaterThanOrEqual(3);
    expect(d.resources.length).toBeGreaterThanOrEqual(3);
  });
  it("withholds every model-specific value in the sample course", async () => {
    const d = (await getCourseDetailBySlug(SAMPLE_SLUG))!;
    const lessons = d.chapters.flatMap((c) => c.lessons);
    let seen = 0;
    for (const l of lessons) for (const s of await getLessonSpecs(l.id)) { seen++; expect(s.kind).toBe("withheld"); }
    expect(seen).toBeGreaterThan(5);
  });
  it("never exposes correct answers to quiz takers", async () => {
    const d = (await getCourseDetailBySlug(SAMPLE_SLUG))!;
    const q = (await getQuizForTaking(d.quizzes[0].id))!;
    expect(JSON.stringify(q)).not.toMatch(/correct_index|explanation/);
  });
});

describe("authentication", () => {
  it("registers, verifies email, logs in, and resolves a viewer from a session", async () => {
    await registerUser({ email: "New@Test.dev ", password: "StrongPass-123", name: "New" });
    const mail = outbox.find((m) => m.subject.startsWith("Verify"))!;
    const token = decodeURIComponent(/token=([^"&]+)/.exec(mail.html)![1]);
    expect(await verifyEmail(token)).toBe(true);
    expect(await verifyEmail(token)).toBe(false); // single use
    const u = await authenticate("new@test.dev", "StrongPass-123");
    expect(u?.email_verified_at).toBeTruthy();
    const { token: st } = await createSessionRecord(u!.id);
    const v = await getViewerBySessionToken(st);
    expect(v?.user.email).toBe("new@test.dev");
    expect(v?.plan).toBe("free");
    expect(await getViewerBySessionToken("garbage")).toBeNull();
  });
  it("stores only a hash of the password and session token", async () => {
    await newStudent();
    const row = await queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE email='stu@test.dev'");
    expect(row!.password_hash).toMatch(/^\$2[aby]\$/);
    const u = await authenticate("stu@test.dev", "StrongPass-123");
    const { token } = await createSessionRecord(u!.id);
    const s = await queryOne<{ token_hash: string }>("SELECT token_hash FROM sessions");
    expect(s!.token_hash).not.toBe(token);
  });
  it("rejects weak passwords, bad emails and wrong credentials", async () => {
    expect((await registerUser({ email: "a@b.co", password: "short1", name: "x" })).ok).toBe(false);
    expect((await registerUser({ email: "a@b.co", password: "alllettersnodigits", name: "x" })).ok).toBe(false);
    expect((await registerUser({ email: "not-an-email", password: "StrongPass-123", name: "x" })).ok).toBe(false);
    await newStudent();
    expect(await authenticate("stu@test.dev", "wrong-password-1")).toBeNull();
    expect(await authenticate("nobody@test.dev", "StrongPass-123")).toBeNull();
  });
  it("does not reveal whether an email is already registered", async () => {
    await newStudent();
    outbox.length = 0;
    const r = await registerUser({ email: "stu@test.dev", password: "StrongPass-123", name: "Again" });
    expect(r.ok).toBe(true);
    expect(outbox[0].subject).toMatch(/Sign-up attempt/);
    expect(await query("SELECT 1 FROM users WHERE email='stu@test.dev'")).toHaveLength(1);
  });
  it("blocks disabled accounts", async () => {
    const id = await newStudent();
    await query("UPDATE users SET disabled_at=now() WHERE id=$1", [id]);
    expect(await authenticate("stu@test.dev", "StrongPass-123")).toBeNull();
  });
  it("rate-limits repeated failed logins", async () => {
    await newStudent();
    for (let i = 0; i < 8; i++) await authenticate("stu@test.dev", "bad-password-1");
    expect(await authenticate("stu@test.dev", "StrongPass-123")).toBeNull();
  });
  it("resets a password with a single-use token and signs out all sessions", async () => {
    const id = await newStudent();
    const { token: st } = await createSessionRecord(id);
    await requestPasswordReset("stu@test.dev");
    const mail = outbox.find((m) => m.subject.startsWith("Reset"))!;
    const t = decodeURIComponent(/token=([^"&]+)/.exec(mail.html)![1]);
    expect((await resetPassword(t, "NewStrongPass-456")).ok).toBe(true);
    expect((await resetPassword(t, "AnotherPass-789")).ok).toBe(false);
    expect(await getViewerBySessionToken(st)).toBeNull();
    _resetRateLimits();
    expect(await authenticate("stu@test.dev", "NewStrongPass-456")).not.toBeNull();
  });
  it("rejects expired tokens", async () => {
    const id = await newStudent();
    const t = await createEmailToken(id, "reset", -60);
    expect((await resetPassword(t, "NewStrongPass-456")).ok).toBe(false);
  });
});

describe("learning flow and entitlements", () => {
  async function courseCtx() {
    const d = (await getCourseDetailBySlug(SAMPLE_SLUG))!;
    const lessons = d.chapters.flatMap((c) => c.lessons);
    return { d, lessons, final: d.quizzes.find((q) => q.kind === "final")!, firstQuiz: d.quizzes.find((q) => q.kind === "lesson")! };
  }
  async function correctAnswers(quizId: string) {
    const qs = await query<{ id: string; correct_index: number }>("SELECT id,correct_index FROM quiz_questions WHERE quiz_id=$1", [quizId]);
    return Object.fromEntries(qs.map((q) => [q.id, q.correct_index]));
  }

  it("free users cannot record progress or take quizzes", async () => {
    const uid = await newStudent();
    const { lessons, firstQuiz } = await courseCtx();
    expect(await completeLesson(uid, "free", lessons[0].id)).toEqual({ ok: false, error: "not_allowed" });
    expect(await submitQuiz(uid, "free", firstQuiz.id, {})).toEqual({ error: "not_allowed" });
  });
  it("basic users progress through basic lessons but not pro lessons or final", async () => {
    const uid = await newStudent();
    await giveSub(uid, "basic");
    const { lessons, final, firstQuiz } = await courseCtx();
    const basicL = lessons.find((l) => l.tier === "basic" && !l.is_free_preview)!;
    const proL = lessons.find((l) => l.tier === "pro")!;
    expect((await completeLesson(uid, "basic", basicL.id)).ok).toBe(true);
    expect((await completeLesson(uid, "basic", proL.id)).ok).toBe(false);
    const r = await submitQuiz(uid, "basic", firstQuiz.id, await correctAnswers(firstQuiz.id));
    expect(r).toMatchObject({ scorePct: 100, passed: true });
    expect(await submitQuiz(uid, "basic", final.id, await correctAnswers(final.id))).toEqual({ error: "not_allowed" });
    const p = await getCourseProgress(uid, lessons[0] ? (await courseCtx()).d.course.id : "");
    expect(p.done).toBe(1);
  });
  it("pro users earn a certificate only after ALL lessons and the final are done", async () => {
    const uid = await newStudent();
    await query("UPDATE users SET email_verified_at=now() WHERE id=$1", [uid]);
    await giveSub(uid, "pro");
    const { d, lessons, final } = await courseCtx();

    // Pass final first → still no certificate (lessons incomplete)
    const fin = await submitQuiz(uid, "pro", final.id, await correctAnswers(final.id));
    expect(fin).toMatchObject({ passed: true });
    expect((fin as any).certificateNumber).toBeUndefined();

    // Complete all but one lesson → none yet
    for (const l of lessons.slice(0, -1)) expect((await completeLesson(uid, "pro", l.id)).ok).toBe(true);
    expect(await maybeIssueCertificate(uid, "pro", d.course.id)).toBeNull();

    // Last lesson → certificate issued
    const last = await completeLesson(uid, "pro", lessons[lessons.length - 1].id);
    expect(last.ok && last.certificateNumber).toMatch(/^DHIA-\d{4}-/);
    const num = (last as any).certificateNumber as string;
    const cert = await getCertificateByNumber(num);
    expect(cert).toMatchObject({ student_name: "Stu Dent", score_pct: 100 });
    // idempotent
    expect((await maybeIssueCertificate(uid, "pro", d.course.id))!.number).toBe(num);
    expect(outbox.some((m) => m.subject.startsWith("Course completed"))).toBe(true);

    const dash = await getDashboard(uid, "pro");
    expect(dash.certificates).toHaveLength(1);
    expect(dash.courses[0].progress.percent).toBe(100);
    expect(dash.quizScores.length).toBeGreaterThan(0);
    expect(dash.resources.length).toBeGreaterThan(0);
  });
  it("does not issue certificates to unverified emails or to a lapsed plan", async () => {
    const uid = await newStudent(); // unverified
    await giveSub(uid, "pro");
    const { d, lessons, final } = await courseCtx();
    await submitQuiz(uid, "pro", final.id, await correctAnswers(final.id));
    for (const l of lessons) await completeLesson(uid, "pro", l.id);
    expect(await query("SELECT 1 FROM certificates")).toHaveLength(0);
    await query("UPDATE users SET email_verified_at=now() WHERE id=$1", [uid]);
    expect(await maybeIssueCertificate(uid, "basic", d.course.id)).toBeNull();
    expect(await maybeIssueCertificate(uid, "pro", d.course.id)).not.toBeNull();
  });
  it("a failing score does not pass", async () => {
    const uid = await newStudent(); await giveSub(uid, "pro");
    const { final } = await courseCtx();
    const r = await submitQuiz(uid, "pro", final.id, {});
    expect(r).toMatchObject({ scorePct: 0, passed: false });
  });
});

describe("Stripe webhooks", () => {
  const subEvent = (id: string, type: string, status: string, plan: "basic" | "pro", customer: string, extra: any = {}) => ({
    id, type, data: { object: {
      id: "sub_1", object: "subscription", status, customer, metadata: { user_id: extra.userId ?? "" }, cancel_at_period_end: !!extra.cancel,
      items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 86_400 * 30, price: { id: "price_" + plan, metadata: { plan_code: plan }, recurring: { interval: "month" } } }] },
    } },
  }) as any;
  const deps = { retrieveSubscription: async () => subEvent("x", "x", "active", "pro", "cus_1").data.object };

  async function user() {
    const uid = await newStudent();
    await query("UPDATE users SET stripe_customer_id='cus_1', email_verified_at=now() WHERE id=$1", [uid]);
    return uid;
  }
  const plan = async (uid: string) => (await import("@/lib/auth-core")).loadViewerByUserId(uid).then((v) => v!.plan);

  it("grants entitlement on checkout completion, then revokes on cancellation", async () => {
    const uid = await user();
    expect(await plan(uid)).toBe("free");
    await handleStripeEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription", customer: "cus_1", client_reference_id: uid, subscription: "sub_1" } } } as any, deps);
    expect(await plan(uid)).toBe("pro");
    await handleStripeEvent(subEvent("evt_2", "customer.subscription.deleted", "canceled", "pro", "cus_1"), deps);
    expect(await plan(uid)).toBe("free");
  });
  it("is idempotent for duplicate events", async () => {
    const uid = await user();
    const ev = subEvent("evt_dup", "customer.subscription.created", "active", "basic", "cus_1");
    expect(await handleStripeEvent(ev, deps)).toBe(true);
    expect(await handleStripeEvent(ev, deps)).toBe(false);
    expect(await query("SELECT 1 FROM subscriptions")).toHaveLength(1);
    expect(await plan(uid)).toBe("basic");
  });
  it("handles upgrade, cancel-at-period-end and past_due → unpaid states", async () => {
    const uid = await user();
    await handleStripeEvent(subEvent("e1", "customer.subscription.created", "active", "basic", "cus_1"), deps);
    await handleStripeEvent(subEvent("e2", "customer.subscription.updated", "active", "pro", "cus_1"), deps);
    expect(await plan(uid)).toBe("pro");
    await handleStripeEvent(subEvent("e3", "customer.subscription.updated", "active", "pro", "cus_1", { cancel: true }), deps);
    expect((await queryOne<any>("SELECT cancel_at_period_end FROM subscriptions"))!.cancel_at_period_end).toBe(true);
    expect(await plan(uid)).toBe("pro"); // access until period end
    await handleStripeEvent(subEvent("e4", "customer.subscription.updated", "past_due", "pro", "cus_1"), deps);
    expect(await plan(uid)).toBe("pro"); // inside grace
    await handleStripeEvent(subEvent("e5", "customer.subscription.updated", "unpaid", "pro", "cus_1"), deps);
    expect(await plan(uid)).toBe("free");
  });
  it("records successful and failed payments and emails the student", async () => {
    await user();
    await handleStripeEvent({ id: "i1", type: "invoice.paid", data: { object: { id: "in_1", customer: "cus_1", amount_paid: 2500, currency: "usd", hosted_invoice_url: "https://x/inv" } } } as any, deps);
    await handleStripeEvent({ id: "i2", type: "invoice.payment_failed", data: { object: { id: "in_2", customer: "cus_1", amount_due: 2500, currency: "usd" } } } as any, deps);
    const pay = await query("SELECT stripe_invoice_id,status,amount_cents FROM payments ORDER BY stripe_invoice_id");
    expect(pay.map((p: any) => p.status)).toEqual(["paid", "failed"]);
    expect(outbox.map((m) => m.subject)).toEqual(expect.arrayContaining([expect.stringMatching(/Payment received/), expect.stringMatching(/Payment failed/)]));
    const a = await getAnalytics();
    expect(a.revenue30dCents).toBe(2500);
    expect(a.failedPayments30d).toBe(1);
  });
  it("releases the event for retry when processing fails", async () => {
    await expect(handleStripeEvent(subEvent("bad", "customer.subscription.created", "active", "pro", "cus_unknown"), deps)).rejects.toThrow();
    expect(await query("SELECT 1 FROM stripe_events WHERE id='bad'")).toHaveLength(0);
  });
  it("clears a scheduled downgrade once it takes effect", async () => {
    const uid = await user();
    await handleStripeEvent(subEvent("p1", "customer.subscription.created", "active", "pro", "cus_1"), deps);
    await query("UPDATE subscriptions SET pending_plan_code='basic'");
    await handleStripeEvent(subEvent("p2", "customer.subscription.updated", "active", "basic", "cus_1"), deps);
    expect((await queryOne<any>("SELECT pending_plan_code,plan_code FROM subscriptions"))).toMatchObject({ pending_plan_code: null, plan_code: "basic" });
    expect(await plan(uid)).toBe("basic");
  });
  void upsertSubscription;
});

describe("publish gate", () => {
  it("blocks publishing until an independent technical review is recorded", async () => {
    const admin = (await queryOne<{ id: string }>("SELECT id FROM users WHERE email='admin@test.dev'"))!.id;
    const reviewer = await newStudent("rev@test.dev");
    const d = (await getCourseDetailBySlug(SAMPLE_SLUG))!;
    await query("UPDATE courses SET status='draft' WHERE id=$1", [d.course.id]);
    let r = await publishCourse(d.course.id, admin);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/review has not been recorded/);
    await recordTechnicalReview(d.course.id, admin, "self"); // author is admin → self-review rejected
    r = await publishCourse(d.course.id, admin);
    expect(r.problems.join()).toMatch(/someone other than/);
    await recordTechnicalReview(d.course.id, reviewer, "Reviewed against approved manual rev 3");
    r = await publishCourse(d.course.id, admin);
    expect(r).toEqual({ ok: true, problems: [] });
    expect((await queryOne<any>("SELECT status FROM courses WHERE id=$1", [d.course.id]))!.status).toBe("published");
  });
});

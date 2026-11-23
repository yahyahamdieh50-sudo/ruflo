"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { audit, query, queryOne, uuid } from "@/lib/db";
import { publishCourse, recordTechnicalReview, touchContent } from "@/lib/admin-data";
import { BillingError, createPromo, syncPlanToStripe } from "@/lib/billing";
import { getStripe } from "@/lib/stripe";
import { CATEGORIES } from "@/lib/categories";
import type { Viewer } from "@/lib/auth-core";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const opt = (fd: FormData, k: string) => str(fd, k) || null;
const bool = (fd: FormData, k: string) => fd.get(k) === "on";

async function staff(): Promise<Viewer> {
  const v = await requireViewer("/admin");
  if (v.user.role === "student") redirect("/dashboard");
  return v;
}
async function adminOnly(): Promise<Viewer> {
  const v = await staff();
  if (v.user.role !== "admin") redirect("/admin/courses");
  return v;
}
/** Instructors may only modify courses they authored. */
async function courseGuard(courseId: string): Promise<Viewer> {
  const v = await staff();
  const c = await queryOne<{ author_id: string | null }>("SELECT author_id FROM courses WHERE id=$1", [courseId]);
  if (!c) redirect("/admin/courses");
  if (v.user.role !== "admin" && c.author_id !== v.user.id) redirect("/admin/courses");
  return v;
}
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "course";
const back = (courseId: string, extra = "") => redirect(`/admin/courses/${courseId}${extra}`);

// ── Courses ────────────────────────────────────────────────────────────
export async function createCourseAction(fd: FormData) {
  const v = await staff();
  const d = z.object({ title_en: z.string().min(3).max(200), category: z.enum(CATEGORIES.map((c) => c.slug) as [string, ...string[]]), level: z.enum(["beginner", "intermediate", "advanced"]), tier: z.enum(["basic", "pro"]) })
    .safeParse(Object.fromEntries(fd));
  if (!d.success) redirect("/admin/courses?error=invalid");
  const id = uuid();
  await query("INSERT INTO courses (id,slug,category,title_en,level,tier,status,author_id) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7)",
    [id, `${slugify(d.data.title_en)}-${id.slice(0, 6)}`, d.data.category, d.data.title_en, d.data.level, d.data.tier, v.user.id]);
  await audit(v.user.id, "course.create", id);
  redirect(`/admin/courses/${id}`);
}

export async function updateCourseAction(fd: FormData) {
  const id = str(fd, "id"); const v = await courseGuard(id);
  const d = z.object({ title_en: z.string().min(3).max(200), title_ar: z.string().max(200).optional(), summary_en: z.string().max(2000), summary_ar: z.string().max(2000).optional(),
    category: z.enum(CATEGORIES.map((c) => c.slug) as [string, ...string[]]), level: z.enum(["beginner", "intermediate", "advanced"]), tier: z.enum(["basic", "pro"]), image_url: z.string().max(500).optional() }).safeParse(Object.fromEntries(fd));
  if (!d.success) back(id, "?error=invalid");
  const x = d.data!;
  if (x.image_url && !/^https:\/\//.test(x.image_url)) back(id, "?error=image_https");
  await query("UPDATE courses SET title_en=$1,title_ar=$2,summary_en=$3,summary_ar=$4,category=$5,level=$6,tier=$7,image_url=$8 WHERE id=$9",
    [x.title_en, x.title_ar || null, x.summary_en, x.summary_ar || null, x.category, x.level, x.tier, x.image_url || null, id]);
  await touchContent(id); await audit(v.user.id, "course.update", id);
  back(id, "?saved=1");
}

export async function requestReviewAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("UPDATE courses SET status='in_review' WHERE id=$1 AND status='draft'", [id]);
  back(id, "?saved=1");
}

export async function recordReviewAction(fd: FormData) {
  const id = str(fd, "id"); const v = await staff();
  const notes = str(fd, "notes");
  if (notes.length < 10 || !bool(fd, "attest")) back(id, "?error=review_incomplete");
  await recordTechnicalReview(id, v.user.id, notes);
  back(id, "?saved=1");
}

export async function publishCourseAction(fd: FormData) {
  const id = str(fd, "id"); const v = await adminOnly();
  const r = await publishCourse(id, v.user.id);
  back(id, r.ok ? "?published=1" : `?problems=${encodeURIComponent(r.problems.slice(0, 6).join("|"))}`);
}

export async function unpublishCourseAction(fd: FormData) {
  const id = str(fd, "id"); const v = await adminOnly();
  await query("UPDATE courses SET status='draft' WHERE id=$1", [id]); await audit(v.user.id, "course.unpublish", id);
  back(id, "?saved=1");
}

export async function linkModelAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  const model = str(fd, "model_id");
  if (model) await query("INSERT INTO course_models (course_id,model_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, model]);
  await touchContent(id); back(id);
}
export async function unlinkModelAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("DELETE FROM course_models WHERE course_id=$1 AND model_id=$2", [id, str(fd, "model_id")]);
  await touchContent(id); back(id);
}

// ── Chapters & lessons ────────────────────────────────────────────────
export async function addChapterAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  const pos = await queryOne<{ n: number }>("SELECT COALESCE(max(position),0)::int+1 AS n FROM chapters WHERE course_id=$1", [id]);
  await query("INSERT INTO chapters (id,course_id,position,title_en,title_ar) VALUES ($1,$2,$3,$4,$5)", [uuid(), id, pos!.n, str(fd, "title_en") || "New chapter", opt(fd, "title_ar")]);
  await touchContent(id); back(id);
}
export async function updateChapterAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("UPDATE chapters SET title_en=$1,title_ar=$2,position=$3 WHERE id=$4 AND course_id=$5", [str(fd, "title_en"), opt(fd, "title_ar"), Number(fd.get("position")) || 1, str(fd, "chapter_id"), id]);
  await touchContent(id); back(id);
}
export async function deleteChapterAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("DELETE FROM chapters WHERE id=$1 AND course_id=$2", [str(fd, "chapter_id"), id]);
  await touchContent(id); back(id);
}
export async function addLessonAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  const lid = uuid();
  const pos = await queryOne<{ n: number }>("SELECT COALESCE(max(position),0)::int+1 AS n FROM lessons WHERE course_id=$1", [id]);
  await query("INSERT INTO lessons (id,course_id,chapter_id,position,title_en) VALUES ($1,$2,$3,$4,$5)", [lid, id, str(fd, "chapter_id"), pos!.n, str(fd, "title_en") || "New lesson"]);
  await touchContent(id);
  redirect(`/admin/courses/${id}/lessons/${lid}`);
}

export async function updateLessonAction(fd: FormData) {
  const id = str(fd, "id"), lid = str(fd, "lesson_id"); await courseGuard(id);
  let flow: unknown = null;
  const rawFlow = str(fd, "flow");
  if (rawFlow) {
    const p = z.array(z.object({ title: z.string().max(200), title_ar: z.string().max(200).optional(), detail: z.string().max(500).optional(), detail_ar: z.string().max(500).optional(), decision: z.boolean().optional(), holdpoint: z.boolean().optional() })).max(40);
    try { const r = p.safeParse(JSON.parse(rawFlow)); if (!r.success) throw 0; flow = r.data; } catch { redirect(`/admin/courses/${id}/lessons/${lid}?error=flow_json`); }
  }
  await query(`UPDATE lessons SET title_en=$1,title_ar=$2,body_en=$3,body_ar=$4,duration_min=$5,is_free_preview=$6,tier=$7,spec_status=$8,position=$9,chapter_id=$10,flow=$11 WHERE id=$12 AND course_id=$13`,
    [str(fd, "title_en"), opt(fd, "title_ar"), String(fd.get("body_en") ?? ""), opt(fd, "body_ar"), Math.max(1, Number(fd.get("duration_min")) || 5), bool(fd, "is_free_preview"),
      fd.get("tier") === "pro" ? "pro" : "basic", fd.get("spec_status") === "model_specific" ? "model_specific" : "generic", Number(fd.get("position")) || 1, str(fd, "chapter_id"),
      flow ? JSON.stringify(flow) : null, lid, id]);
  await touchContent(id);
  redirect(`/admin/courses/${id}/lessons/${lid}?saved=1`);
}
export async function deleteLessonAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("DELETE FROM lessons WHERE id=$1 AND course_id=$2", [str(fd, "lesson_id"), id]);
  await touchContent(id); back(id);
}

// ── Sources & specs (technical accuracy) ──────────────────────────────
export async function attachSourceAction(fd: FormData) {
  const id = str(fd, "id"), lid = str(fd, "lesson_id"); await courseGuard(id);
  await query("INSERT INTO lesson_sources (lesson_id,source_id,page_ref) VALUES ($1,$2,$3) ON CONFLICT (lesson_id,source_id) DO UPDATE SET page_ref=$3", [lid, str(fd, "source_id"), opt(fd, "page_ref")]);
  await touchContent(id); redirect(`/admin/courses/${id}/lessons/${lid}?saved=1`);
}
export async function detachSourceAction(fd: FormData) {
  const id = str(fd, "id"), lid = str(fd, "lesson_id"); await courseGuard(id);
  await query("DELETE FROM lesson_sources WHERE lesson_id=$1 AND source_id=$2", [lid, str(fd, "source_id")]);
  await touchContent(id); redirect(`/admin/courses/${id}/lessons/${lid}`);
}
export async function saveSpecAction(fd: FormData) {
  const id = str(fd, "id"), lid = str(fd, "lesson_id"); const v = await courseGuard(id);
  // Only a technical reviewer (admin) may mark a value as verified.
  const verified = bool(fd, "verified") && v.user.role === "admin";
  await query("INSERT INTO lesson_specs (id,lesson_id,label,value,unit,condition_note,model_id,source_id,page_ref,verified) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [uuid(), lid, str(fd, "label"), opt(fd, "value"), opt(fd, "unit"), opt(fd, "condition_note"), opt(fd, "model_id"), opt(fd, "source_id"), opt(fd, "page_ref"), verified]);
  await touchContent(id); redirect(`/admin/courses/${id}/lessons/${lid}?saved=1`);
}
export async function deleteSpecAction(fd: FormData) {
  const id = str(fd, "id"), lid = str(fd, "lesson_id"); await courseGuard(id);
  await query("DELETE FROM lesson_specs WHERE id=$1 AND lesson_id=$2", [str(fd, "spec_id"), lid]);
  await touchContent(id); redirect(`/admin/courses/${id}/lessons/${lid}`);
}

// ── Assets (direct-to-storage upload, then attach) ────────────────────
const PREFIX = { lesson_video: "videos", trailer: "trailers", subtitle: "subtitles", resource: "resources" } as const;
export async function attachAssetAction(input: { purpose: keyof typeof PREFIX; ownerId: string; key: string; courseId?: string; lang?: "en" | "ar" }) {
  const p = z.object({ purpose: z.enum(["lesson_video", "trailer", "subtitle", "resource"]), ownerId: z.string().uuid().or(z.literal("site")), key: z.string().max(300), courseId: z.string().uuid().optional(), lang: z.enum(["en", "ar"]).optional() }).safeParse(input);
  if (!p.success) return { ok: false };
  const { purpose, ownerId, key, courseId, lang } = p.data;
  if (!key.startsWith(`${PREFIX[purpose]}/${ownerId}/`) || key.includes("..")) return { ok: false };
  if (purpose === "trailer" && ownerId === "site") { await adminOnly(); await query("INSERT INTO settings (key,value) VALUES ('site_trailer_key',$1) ON CONFLICT (key) DO UPDATE SET value=$1", [JSON.stringify(key)]); revalidatePath("/trailer"); return { ok: true }; }
  const cid = courseId ?? (purpose === "trailer" ? ownerId : (await queryOne<{ course_id: string }>("SELECT course_id FROM lessons WHERE id=$1", [ownerId]))?.course_id);
  if (!cid) return { ok: false };
  await courseGuard(cid);
  if (purpose === "trailer") await query("UPDATE courses SET trailer_key=$1 WHERE id=$2", [key, cid]);
  else if (purpose === "lesson_video") await query("UPDATE lessons SET video_key=$1 WHERE id=$2", [key, ownerId]);
  else if (purpose === "subtitle" && lang) await query("INSERT INTO lesson_subtitles (lesson_id,lang,storage_key) VALUES ($1,$2,$3) ON CONFLICT (lesson_id,lang) DO UPDATE SET storage_key=$3", [ownerId, lang, key]);
  else if (purpose === "resource") await query("UPDATE resources SET storage_key=$1 WHERE id=$2 AND course_id=$3", [key, ownerId, cid]);
  await touchContent(cid); revalidatePath(`/admin/courses/${cid}`);
  return { ok: true };
}
export async function addResourceAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("INSERT INTO resources (id,course_id,title_en,title_ar,kind,inline_markdown) VALUES ($1,$2,$3,$4,$5,$6)", [uuid(), id, str(fd, "title_en") || "Resource", opt(fd, "title_ar"), ["checklist", "template", "reference"].includes(str(fd, "kind")) ? str(fd, "kind") : "checklist", opt(fd, "inline_markdown")]);
  await touchContent(id); back(id);
}
export async function deleteResourceAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("DELETE FROM resources WHERE id=$1 AND course_id=$2", [str(fd, "resource_id"), id]); back(id);
}

// ── Quizzes ────────────────────────────────────────────────────────────
export async function createQuizAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  const qid = uuid();
  await query("INSERT INTO quizzes (id,course_id,lesson_id,kind,title_en,title_ar,pass_mark) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [qid, id, opt(fd, "lesson_id"), fd.get("kind") === "final" ? "final" : "lesson", str(fd, "title_en") || "Quiz", opt(fd, "title_ar"), Math.min(100, Math.max(1, Number(fd.get("pass_mark")) || 80))]);
  await touchContent(id); redirect(`/admin/courses/${id}/quizzes/${qid}`);
}
export async function deleteQuizAction(fd: FormData) {
  const id = str(fd, "id"); await courseGuard(id);
  await query("DELETE FROM quizzes WHERE id=$1 AND course_id=$2", [str(fd, "quiz_id"), id]); await touchContent(id); back(id);
}
export async function addQuestionAction(fd: FormData) {
  const id = str(fd, "id"), qid = str(fd, "quiz_id"); await courseGuard(id);
  const options = str(fd, "options").split("\n").map((s) => s.trim()).filter(Boolean);
  const correct = Number(fd.get("correct")) - 1;
  if (options.length < 2 || options.length > 8 || !(correct >= 0 && correct < options.length) || !str(fd, "prompt_en")) redirect(`/admin/courses/${id}/quizzes/${qid}?error=invalid`);
  const pos = await queryOne<{ n: number }>("SELECT COALESCE(max(position),0)::int+1 AS n FROM quiz_questions WHERE quiz_id=$1", [qid]);
  await query("INSERT INTO quiz_questions (id,quiz_id,position,prompt_en,prompt_ar,options_en,correct_index,explanation_en) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [uuid(), qid, pos!.n, str(fd, "prompt_en"), opt(fd, "prompt_ar"), JSON.stringify(options), correct, opt(fd, "explanation_en")]);
  await touchContent(id); redirect(`/admin/courses/${id}/quizzes/${qid}?saved=1`);
}
export async function deleteQuestionAction(fd: FormData) {
  const id = str(fd, "id"), qid = str(fd, "quiz_id"); await courseGuard(id);
  await query("DELETE FROM quiz_questions WHERE id=$1 AND quiz_id=$2", [str(fd, "question_id"), qid]); await touchContent(id);
  redirect(`/admin/courses/${id}/quizzes/${qid}`);
}

// ── Students ──────────────────────────────────────────────────────────
export async function setRoleAction(fd: FormData) {
  const v = await adminOnly(); const uid = str(fd, "user_id"); const role = str(fd, "role");
  if (uid === v.user.id || !["student", "instructor", "admin"].includes(role)) redirect("/admin/students?error=invalid");
  await query("UPDATE users SET role=$1 WHERE id=$2", [role, uid]); await audit(v.user.id, "user.role", uid, { role });
  redirect("/admin/students?saved=1");
}
export async function toggleDisabledAction(fd: FormData) {
  const v = await adminOnly(); const uid = str(fd, "user_id");
  if (uid === v.user.id) redirect("/admin/students?error=invalid");
  const disable = fd.get("disable") === "1";
  await query("UPDATE users SET disabled_at=$1 WHERE id=$2", [disable ? new Date().toISOString() : null, uid]);
  if (disable) await query("DELETE FROM sessions WHERE user_id=$1", [uid]);
  await audit(v.user.id, disable ? "user.disable" : "user.enable", uid); redirect("/admin/students?saved=1");
}
export async function grantCompAction(fd: FormData) {
  const v = await adminOnly(); const uid = str(fd, "user_id"); const plan = str(fd, "plan");
  if (plan === "none") await query("UPDATE users SET comp_plan=NULL, comp_until=NULL WHERE id=$1", [uid]);
  else if (plan === "basic" || plan === "pro") {
    const days = Math.min(3650, Math.max(1, Number(fd.get("days")) || 30));
    await query("UPDATE users SET comp_plan=$1, comp_until=$2 WHERE id=$3", [plan, new Date(Date.now() + days * 86_400_000).toISOString(), uid]);
  }
  await audit(v.user.id, "user.comp", uid, { plan }); redirect("/admin/students?saved=1");
}

// ── Pricing & promos ──────────────────────────────────────────────────
export async function updatePlanAction(fd: FormData) {
  const v = await adminOnly();
  const cents = Math.round(Number(fd.get("price_usd")) * 100);
  if (!(cents >= 0 && cents < 1_000_000)) redirect("/admin/pricing?error=invalid");
  const before = await queryOne<{ price_usd_cents: number }>("SELECT price_usd_cents FROM plans WHERE id=$1", [str(fd, "id")]);
  // Stripe prices are immutable: a changed amount invalidates the synced price until "Sync to Stripe" is run again.
  await query("UPDATE plans SET price_usd_cents=$1, active=$2, stripe_price_id=CASE WHEN price_usd_cents<>$1 THEN NULL ELSE stripe_price_id END WHERE id=$3", [cents, bool(fd, "active"), str(fd, "id")]);
  await audit(v.user.id, "plan.update", str(fd, "id"), { from: before?.price_usd_cents, to: cents });
  redirect("/admin/pricing?saved=1");
}
export async function syncPlanAction(fd: FormData) {
  await adminOnly();
  let err = "";
  try { await syncPlanToStripe(str(fd, "id")); } catch (e) { err = e instanceof BillingError ? e.code : (e as Error).message === "STRIPE_NOT_CONFIGURED" ? "stripe_not_configured" : "billing_error"; }
  redirect(err ? `/admin/pricing?error=${err}` : "/admin/pricing?synced=1");
}
export async function createPromoAction(fd: FormData) {
  const v = await adminOnly(); let err = "";
  const pct = Number(fd.get("percent_off")) || undefined, amt = Math.round(Number(fd.get("amount_off")) * 100) || undefined;
  const exp = str(fd, "expires_at");
  try {
    await createPromo({ code: str(fd, "code"), percentOff: pct, amountOffCents: amt, maxRedemptions: Number(fd.get("max_redemptions")) || undefined, expiresAt: exp ? new Date(exp) : undefined }, v.user.id);
  } catch (e) { err = e instanceof BillingError ? e.code : (e as Error).message === "STRIPE_NOT_CONFIGURED" ? "stripe_not_configured" : "billing_error"; if (err === "billing_error") console.error("[promo]", e); }
  redirect(err ? `/admin/promos?error=${err}` : "/admin/promos?saved=1");
}
export async function togglePromoAction(fd: FormData) {
  const v = await adminOnly(); const id = str(fd, "id"); const active = fd.get("active") === "1";
  const p = await queryOne<{ stripe_promotion_code_id: string | null }>("SELECT stripe_promotion_code_id FROM promo_codes WHERE id=$1", [id]);
  if (p?.stripe_promotion_code_id) { try { await getStripe().promotionCodes.update(p.stripe_promotion_code_id, { active }); } catch { redirect("/admin/promos?error=billing_error"); } }
  await query("UPDATE promo_codes SET active=$1 WHERE id=$2", [active, id]); await audit(v.user.id, "promo.toggle", id, { active });
  redirect("/admin/promos?saved=1");
}

// ── Equipment models, approved sources, knowledge ─────────────────────
export async function createSourceAction(fd: FormData) {
  const v = await staff();
  await query("INSERT INTO technical_sources (id,title,doc_type,manufacturer,revision,reference,rights_note) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [uuid(), str(fd, "title"), str(fd, "doc_type") || "installation_manual", str(fd, "manufacturer") || "Daikin", opt(fd, "revision"), opt(fd, "reference"), opt(fd, "rights_note")]);
  await audit(v.user.id, "source.create", str(fd, "title")); redirect("/admin/models?saved=1");
}
export async function approveSourceAction(fd: FormData) {
  const v = await adminOnly(); const id = str(fd, "id"); const approve = fd.get("approve") === "1";
  const s = await queryOne<{ revision: string | null; reference: string | null; rights_note: string | null }>("SELECT revision,reference,rights_note FROM technical_sources WHERE id=$1", [id]);
  if (approve && (!s?.revision || !s.reference || !s.rights_note)) redirect("/admin/models?error=source_incomplete");
  await query("UPDATE technical_sources SET approved=$1, approved_by=$2, approved_at=$3 WHERE id=$4", [approve, approve ? v.user.id : null, approve ? new Date().toISOString() : null, id]);
  await audit(v.user.id, approve ? "source.approve" : "source.revoke", id); redirect("/admin/models?saved=1");
}
export async function createModelAction(fd: FormData) {
  await staff();
  const model = str(fd, "model_number").slice(0, 80);
  if (!model || !CATEGORIES.some((c) => c.slug === str(fd, "category"))) redirect("/admin/models?error=invalid");
  await query("INSERT INTO equipment_models (id,category,series,model_number,refrigerant,source_id) VALUES ($1,$2,$3,$4,$5,$6)", [uuid(), str(fd, "category"), opt(fd, "series"), model, opt(fd, "refrigerant"), opt(fd, "source_id")]);
  redirect("/admin/models?saved=1");
}
export async function verifyModelAction(fd: FormData) {
  const v = await adminOnly(); const id = str(fd, "id"); const verify = fd.get("verify") === "1";
  if (verify) {
    const m = await queryOne<{ is_placeholder: boolean; approved: boolean | null }>("SELECT m.is_placeholder,t.approved FROM equipment_models m LEFT JOIN technical_sources t ON t.id=m.source_id WHERE m.id=$1", [id]);
    if (!m || m.is_placeholder || !m.approved) redirect("/admin/models?error=model_needs_approved_source");
  }
  await query("UPDATE equipment_models SET verified=$1 WHERE id=$2", [verify, id]); await audit(v.user.id, "model.verify", id, { verify }); redirect("/admin/models?saved=1");
}
export async function addKnowledgeAction(fd: FormData) {
  const v = await adminOnly(); const sid = str(fd, "source_id");
  const s = await queryOne<{ approved: boolean }>("SELECT approved FROM technical_sources WHERE id=$1", [sid]);
  if (!s?.approved || !str(fd, "content")) redirect("/admin/models?error=source_not_approved");
  await query("INSERT INTO knowledge_chunks (id,source_id,page_ref,content,model_specific) VALUES ($1,$2,$3,$4,$5)", [uuid(), sid, opt(fd, "page_ref"), str(fd, "content").slice(0, 4000), bool(fd, "model_specific")]);
  await audit(v.user.id, "knowledge.add", sid); redirect("/admin/models?saved=1");
}

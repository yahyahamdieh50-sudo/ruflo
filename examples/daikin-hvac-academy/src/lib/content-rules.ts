/**
 * Technical-accuracy rules (pure functions).
 *  - Model-specific values are DISPLAYED only when fully traceable to an approved manual.
 *  - Courses are PUBLISHED only after an independent technical review.
 */
export interface SpecInput {
  label: string;
  value: string | null;
  unit: string | null;
  condition_note: string | null;
  verified: boolean;
  model_number: string | null;
  model_verified: boolean;
  source_title: string | null;
  source_revision: string | null;
  source_approved: boolean;
  page_ref: string | null;
}

export type SpecDisplay =
  | { kind: "confirmed"; label: string; value: string; unit: string | null; condition: string | null; model: string; source: string; revision: string; page: string }
  | { kind: "withheld"; label: string; model: string | null; missing: string[] };

export function evaluateSpec(s: SpecInput): SpecDisplay {
  const missing: string[] = [];
  if (!s.value) missing.push("value");
  if (!s.model_number) missing.push("exact_model");
  else if (!s.model_verified) missing.push("verified_model");
  if (!s.source_title || !s.source_approved) missing.push("approved_manual");
  if (!s.source_revision) missing.push("manual_revision");
  if (!s.page_ref) missing.push("page_reference");
  if (!s.verified) missing.push("technical_verification");
  if (missing.length) return { kind: "withheld", label: s.label, model: s.model_number, missing };
  return {
    kind: "confirmed", label: s.label, value: s.value!, unit: s.unit, condition: s.condition_note,
    model: s.model_number!, source: s.source_title!, revision: s.source_revision!, page: s.page_ref!,
  };
}

export interface PublishCheckInput {
  course: {
    status: string; author_id: string | null;
    technical_reviewed_by: string | null; technical_reviewed_at: string | Date | null;
    content_updated_at: string | Date;
  };
  lessons: { id: string; title: string; spec_status: "generic" | "model_specific"; has_approved_source_with_page: boolean }[];
  verifiedModelCount: number;
  finalQuizQuestionCount: number;
}

export function checkPublishable(i: PublishCheckInput): { ok: boolean; problems: string[] } {
  const p: string[] = [];
  if (i.lessons.length === 0) p.push("Course has no lessons.");
  if (!i.course.technical_reviewed_by || !i.course.technical_reviewed_at) p.push("Technical review has not been recorded.");
  else {
    if (i.course.author_id && i.course.technical_reviewed_by === i.course.author_id) p.push("Technical review must be performed by someone other than the course author.");
    if (new Date(i.course.technical_reviewed_at) < new Date(i.course.content_updated_at)) p.push("Content changed after the technical review; re-review required.");
  }
  const modelSpecific = i.lessons.filter((l) => l.spec_status === "model_specific");
  for (const l of modelSpecific) {
    if (!l.has_approved_source_with_page) p.push(`Lesson "${l.title}" is model-specific but has no approved manual source with page/section reference.`);
  }
  if (modelSpecific.length && i.verifiedModelCount === 0) p.push("Model-specific lessons require at least one verified equipment model on the course.");
  if (i.finalQuizQuestionCount === 0) p.push("A final assessment with at least one question is required.");
  return { ok: p.length === 0, problems: p };
}

export const percent = (done: number, total: number) => (total <= 0 ? 0 : Math.min(100, Math.round((done / total) * 100)));

/** Words that signal a model-specific numeric requirement; used by the assistant for uncertainty warnings. */
export const MODEL_SPECIFIC_TERMS = /\b(torque|pressure|charge|refrigerant charge|clearance|clearances|amp|amps|ampere|fuse|breaker|mca|mocp|wire size|cable size|setpoint|threshold|superheat|subcooling|kpa|bar|psi|kg|n\.?m)\b/i;

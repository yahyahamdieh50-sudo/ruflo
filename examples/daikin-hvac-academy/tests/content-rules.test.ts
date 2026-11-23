import { describe, expect, it } from "vitest";
import { checkPublishable, evaluateSpec, percent, type SpecInput } from "@/lib/content-rules";
import { gradeQuiz } from "@/lib/quiz";
import { generateCertificateNumber, isWellFormedCertificateNumber } from "@/lib/certificate-number";

const fullSpec: SpecInput = {
  label: "Terminal torque", value: "X", unit: "N·m", condition_note: "Per manual", verified: true,
  model_number: "M-1", model_verified: true, source_title: "Manual", source_revision: "Rev 3", source_approved: true, page_ref: "p.12 §4.2",
};

describe("evaluateSpec — never show unverified model-specific values", () => {
  it("shows a value only when fully traceable", () => {
    const r = evaluateSpec(fullSpec);
    expect(r.kind).toBe("confirmed");
  });
  it.each([
    ["value", { value: null }], ["exact_model", { model_number: null }], ["verified_model", { model_verified: false }],
    ["approved_manual", { source_approved: false }], ["manual_revision", { source_revision: null }],
    ["page_reference", { page_ref: null }], ["technical_verification", { verified: false }],
  ])("withholds when %s is missing", (missing, patch) => {
    const r = evaluateSpec({ ...fullSpec, ...(patch as Partial<SpecInput>) });
    expect(r.kind).toBe("withheld");
    if (r.kind === "withheld") { expect(r.missing).toContain(missing); expect(r).not.toHaveProperty("value"); }
  });
});

describe("checkPublishable — publish only after technical review", () => {
  const base = () => ({
    course: { status: "in_review", author_id: "a", technical_reviewed_by: "b", technical_reviewed_at: "2026-02-01T00:00:00Z", content_updated_at: "2026-01-01T00:00:00Z" },
    lessons: [{ id: "1", title: "L1", spec_status: "generic" as const, has_approved_source_with_page: false }],
    verifiedModelCount: 0, finalQuizQuestionCount: 5,
  });
  it("passes a reviewed course", () => expect(checkPublishable(base()).ok).toBe(true));
  it("blocks when no review recorded", () => {
    const i = base(); (i.course as any).technical_reviewed_by = null; (i.course as any).technical_reviewed_at = null;
    expect(checkPublishable(i).problems.join()).toMatch(/review has not been recorded/);
  });
  it("blocks self-review by the author", () => {
    const i = base(); i.course.technical_reviewed_by = "a";
    expect(checkPublishable(i).problems.join()).toMatch(/someone other than/);
  });
  it("requires re-review after content changes", () => {
    const i = base(); i.course.content_updated_at = "2026-03-01T00:00:00Z";
    expect(checkPublishable(i).problems.join()).toMatch(/re-review/);
  });
  it("requires approved sources and a verified model for model-specific lessons", () => {
    const i = base(); i.lessons[0].spec_status = "model_specific" as any;
    const r = checkPublishable(i);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/approved manual source/);
    expect(r.problems.join()).toMatch(/verified equipment model/);
  });
  it("requires lessons and a final assessment", () => {
    const i = base(); i.lessons = []; i.finalQuizQuestionCount = 0;
    expect(checkPublishable(i).problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe("quiz grading", () => {
  const qs = [{ id: "a", correct_index: 1 }, { id: "b", correct_index: 0 }, { id: "c", correct_index: 2 }, { id: "d", correct_index: 3 }];
  it("scores and applies the pass mark", () => {
    expect(gradeQuiz(qs, { a: 1, b: 0, c: 2, d: 3 }, 80)).toMatchObject({ scorePct: 100, passed: true });
    expect(gradeQuiz(qs, { a: 1, b: 0, c: 0, d: 0 }, 80)).toMatchObject({ scorePct: 50, passed: false });
  });
  it("treats missing or invalid answers as wrong and never passes an empty quiz", () => {
    expect(gradeQuiz(qs, { a: 1 }, 20).scorePct).toBe(25);
    expect(gradeQuiz([], {}, 1).passed).toBe(false);
  });
});

describe("certificate numbers", () => {
  it("are unique-ish, well formed and typo-detecting", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateCertificateNumber()));
    expect(set.size).toBe(200);
    const n = [...set][0];
    expect(isWellFormedCertificateNumber(n)).toBe(true);
    const bad = n.slice(0, 10) + (n[10] === "2" ? "3" : "2") + n.slice(11);
    expect(isWellFormedCertificateNumber(bad)).toBe(false);
  });
});

describe("percent", () => {
  it("handles zero and rounding", () => { expect(percent(0, 0)).toBe(0); expect(percent(1, 3)).toBe(33); expect(percent(5, 5)).toBe(100); });
});

import { describe, expect, it } from "vitest";
import { dictEn, dictAr } from "@/lib/i18n-dict";
import { translate } from "@/lib/i18n";
// @ts-expect-error plain ESM script without types
import { extract } from "../scripts/extract-keys.mjs";

describe("i18n dictionary", () => {
  const { keys } = extract("src") as { keys: string[] };

  it("has Arabic for every English key and vice versa", () => {
    expect(Object.keys(dictAr).sort()).toEqual(Object.keys(dictEn).sort());
    for (const [k, v] of Object.entries(dictAr)) expect(v.trim(), k).not.toBe("");
  });
  it("covers every static t('key') used in source", () => {
    const missing = keys.filter((k) => !(k in dictEn));
    expect(missing).toEqual([]);
  });
  it("covers the dynamic key families", () => {
    const fams: Record<string, string[]> = {
      tier: ["free", "basic", "pro"], level: ["beginner", "intermediate", "advanced"],
      status: ["draft", "in_review", "published", "coming_soon"],
      sub: ["active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"],
      pay: ["paid", "failed", "refunded"], resource: ["checklist", "template", "reference"],
      "specs.m": ["value", "exact_model", "verified_model", "approved_manual", "manual_revision", "page_reference", "technical_verification"],
      billing: ["changed_immediate", "changed_scheduled", "changed_noop"],
      err: ["email_invalid", "name_required", "password_short", "password_weak", "password_long", "token_invalid", "rate_limited", "accept_terms", "invalid", "email_unverified", "already_subscribed", "plan_unavailable", "plan_not_synced", "promo_invalid", "promo_needs_one_discount", "promo_code_invalid", "no_subscription", "stripe_not_configured", "billing_error", "checkout_failed", "not_found", "not_allowed", "source_incomplete", "model_needs_approved_source", "source_not_approved", "review_incomplete", "image_https", "flow_json"],
      pricing: ["free", "basic", "pro", "popular", "month", "year", "monthly", "yearly", "billing", "current", "included", "signup", "unavailable", "manage", "promo", "subscribe", "stripe_off", "billed_usd", "aed_note", "q1", "a1", "q2", "a2", "q3", "a3", "q4", "a4"],
      "home.acc1": ["title", "body"], "home.acc2": ["title", "body"], "home.acc3": ["title", "body"],
      "home.uae": ["p1", "p2", "p3", "p4", "p5", "p6"],
      "plan.free": ["f1", "f2", "f3", "f4"], "plan.basic": ["f1", "f2", "f3", "f4"], "plan.pro": ["f1", "f2", "f3", "f4"],
      assistant: ["placeholder", "ask", "signin", "rate", "error", "mode_generated", "mode_extractive", "no_match", "sources", "w_model_specific", "w_hazard", "w_ai_disclaimer"],
    };
    const missing = Object.entries(fams).flatMap(([p, ks]) => ks.map((k) => `${p}.${k}`)).filter((k) => !(k in dictEn));
    expect(missing).toEqual([]);
  });
  it("interpolates variables and falls back to English then the key", () => {
    expect(translate("en", "dash.hello", { name: "Sam" })).toBe("Welcome back, Sam");
    expect(translate("ar", "dash.hello", { name: "سام" })).toContain("سام");
    expect(translate("ar", "no.such.key")).toBe("no.such.key");
  });
  it("uses the required hero copy", () => {
    expect(dictEn["home.title"]).toBe("MASTER DAIKIN HVAC INSTALLATION");
    expect(dictEn["home.subtitle"]).toBe("Learn practical installation techniques through structured, model-aware HVAC training.");
    expect(dictEn["cta.trailer"]).toBe("WATCH FREE TRAILER");
    expect(dictEn["cta.unlock"]).toBe("UNLOCK FULL ACADEMY");
  });
});

"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import { BillingError, changePlan, createCheckoutSession, createPortalSession, refreshFromStripe, setCancelAtPeriodEnd } from "@/lib/billing";
import { stripeConfigured } from "@/lib/stripe";
import { rateLimit } from "@/lib/security";
import type { Tier } from "@/lib/entitlements";

const parse = (fd: FormData) => ({
  plan: (fd.get("plan") === "pro" ? "pro" : "basic") as Tier,
  interval: (fd.get("interval") === "year" ? "year" : "month") as "month" | "year",
});

/** Runs a billing call; redirects (outside try/catch) with a stable error code. */
async function run<T>(fail: string, fn: () => Promise<T>): Promise<T> {
  let out: T | undefined, code: string | null = null;
  try { out = await fn(); }
  catch (e) {
    code = e instanceof BillingError ? e.code : (e as Error).message === "STRIPE_NOT_CONFIGURED" ? "stripe_not_configured" : "billing_error";
    if (code === "billing_error") console.error("[billing]", e);
  }
  if (code) redirect(`${fail}${fail.includes("?") ? "&" : "?"}error=${code}`);
  return out as T;
}

export async function checkoutAction(formData: FormData) {
  const v = await requireViewer("/pricing");
  if (!stripeConfigured()) redirect("/pricing?error=stripe_not_configured");
  if (!rateLimit(`checkout:${v.user.id}`, 10, 10 * 60_000)) redirect("/pricing?error=rate_limited");
  const { plan, interval } = parse(formData);
  const url = await run("/pricing", () => createCheckoutSession(v.user, plan, interval, String(formData.get("promo") ?? "") || undefined));
  redirect(url);
}

export async function portalAction() {
  const v = await requireViewer();
  const url = await run("/dashboard/billing", () => createPortalSession(v.user));
  redirect(url);
}

export async function changePlanAction(formData: FormData) {
  const v = await requireViewer();
  const { plan, interval } = parse(formData);
  const r = await run("/dashboard/billing", () => changePlan(v.user, plan, interval));
  revalidatePath("/dashboard/billing");
  redirect(`/dashboard/billing?changed=${r.mode}`);
}

export async function cancelAction(formData: FormData) {
  const v = await requireViewer();
  await run("/dashboard/billing", () => setCancelAtPeriodEnd(v.user, formData.get("resume") !== "1"));
  revalidatePath("/dashboard/billing");
  redirect("/dashboard/billing?updated=1");
}

export async function refreshBillingAction() {
  const v = await requireViewer();
  await run("/dashboard/billing", () => refreshFromStripe(v.user));
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/billing?updated=1");
}

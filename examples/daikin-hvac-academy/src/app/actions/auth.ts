"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authenticate, registerUser, requestPasswordReset, resetPassword, resendVerification } from "@/lib/auth-core";
import { query } from "@/lib/db";
import { clientIp, endSession, requireViewer, startSession } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { rateLimit } from "@/lib/security";

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/dashboard");

export async function signupAction(formData: FormData) {
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 10, 60 * 60_000)) redirect("/signup?error=rate_limited");
  const parsed = z.object({
    email: z.string().max(200), password: z.string().max(200), name: z.string().min(1).max(120),
    company: z.string().max(120).optional(), country: z.string().max(80).optional(), accept: z.literal("on"),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/signup?error=" + (formData.get("accept") ? "invalid" : "accept_terms"));
  const r = await registerUser({ ...parsed.data, locale: await getLocale() });
  if (!r.ok) redirect(`/signup?error=${r.error}`);
  if (r.userId) { await startSession(r.userId); redirect("/dashboard?welcome=1"); }
  redirect("/login?registered=1"); // existing account: identical response, no enumeration
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? ""), password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));
  const user = await authenticate(email, password, await clientIp());
  if (!user) redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
  await startSession(user.id);
  redirect(next);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  await requestPasswordReset(String(formData.get("email") ?? ""), await clientIp());
  redirect("/forgot-password?sent=1"); // same response whether or not the account exists
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const r = await resetPassword(token, String(formData.get("password") ?? ""));
  if (!r.ok) redirect(`/reset-password?token=${encodeURIComponent(token)}&error=${r.error}`);
  redirect("/login?reset=1");
}

export async function resendVerificationAction() {
  const v = await requireViewer();
  if (rateLimit(`resend:${v.user.id}`, 3, 60 * 60_000)) await resendVerification(v.user.id);
  redirect("/dashboard?verify_sent=1");
}

export async function updateProfileAction(formData: FormData) {
  const v = await requireViewer();
  const d = z.object({ name: z.string().min(1).max(120), company: z.string().max(120).optional(), job_title: z.string().max(120).optional(), country: z.string().max(80).optional() })
    .safeParse(Object.fromEntries(formData));
  if (!d.success) redirect("/dashboard/profile?error=invalid");
  await query("UPDATE users SET name=$1, company=$2, job_title=$3, country=$4 WHERE id=$5", [d.data.name.trim(), d.data.company || null, d.data.job_title || null, d.data.country || null, v.user.id]);
  revalidatePath("/dashboard");
  redirect("/dashboard/profile?saved=1");
}


export async function verifyEmailAction(formData: FormData) {
  const { verifyEmail } = await import("@/lib/auth-core");
  const ok = await verifyEmail(String(formData.get("token") ?? ""));
  redirect(`/verify-email?${ok ? "done=1" : "bad=1"}`);
}

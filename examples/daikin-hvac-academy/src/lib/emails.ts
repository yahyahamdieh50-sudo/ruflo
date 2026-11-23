import { env, DISCLAIMER_EN } from "./env";
import { sendMail } from "./email";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function layout(title: string, body: string) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1b2026">
  <div style="background:#0a1a35;color:#fff;padding:18px 24px;font-weight:700;letter-spacing:.04em">DAIKIN HVAC INSTALLATION ACADEMY</div>
  <div style="padding:24px;border:1px solid #d3d9e0;border-top:0"><h2 style="margin-top:0;color:#0a1a35">${esc(title)}</h2>${body}</div>
  <p style="font-size:12px;color:#6c7a8a;padding:0 8px">${esc(DISCLAIMER_EN)}</p></div>`;
}
const btn = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#00a0e4;color:#fff;padding:12px 20px;text-decoration:none;font-weight:600;border-radius:4px">${esc(label)}</a></p>`;

export const sendVerifyEmail = (to: string, name: string, token: string) =>
  sendMail({ to, subject: "Verify your email — Installation Academy",
    html: layout("Welcome, " + name, `<p>Please confirm your email address to unlock checkout and certificates.</p>${btn(`${env.appUrl}/verify-email?token=${encodeURIComponent(token)}`, "Verify email")}<p style="font-size:13px">This link expires in 24 hours.</p>`) });

export const sendResetEmail = (to: string, token: string) =>
  sendMail({ to, subject: "Reset your password — Installation Academy",
    html: layout("Password reset", `<p>Use the button below to choose a new password. If you did not request this, ignore this email.</p>${btn(`${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`, "Reset password")}<p style="font-size:13px">This link expires in 1 hour.</p>`) });

export const sendExistingAccountEmail = (to: string) =>
  sendMail({ to, subject: "Sign-up attempt — Installation Academy",
    html: layout("You already have an account", `<p>Someone tried to register with this email. If it was you, sign in or reset your password.</p>${btn(`${env.appUrl}/login`, "Sign in")}`) });

export const sendPaymentSuccessEmail = (to: string, plan: string, amount: string, invoiceUrl?: string | null) =>
  sendMail({ to, subject: "Payment received — Installation Academy",
    html: layout("Payment received", `<p>Thank you. We received <b>${esc(amount)}</b> for the <b>${esc(plan)}</b> plan.</p>${invoiceUrl ? btn(invoiceUrl, "View invoice") : ""}${btn(`${env.appUrl}/dashboard`, "Go to dashboard")}`) });

export const sendPaymentFailedEmail = (to: string) =>
  sendMail({ to, subject: "Payment failed — action needed",
    html: layout("We could not process your payment", `<p>Your latest subscription payment failed. Please update your payment method to keep access.</p>${btn(`${env.appUrl}/dashboard/billing`, "Update payment method")}`) });

export const sendCompletionEmail = (to: string, name: string, course: string, certNumber: string | null) =>
  sendMail({ to, subject: `Course completed: ${course}`,
    html: layout("Congratulations, " + name, `<p>You completed <b>${esc(course)}</b>.</p>${certNumber ? `<p>Your academy completion certificate number is <b>${esc(certNumber)}</b>. This is an independent academy certificate, not a manufacturer certification.</p>${btn(`${env.appUrl}/certificates/${certNumber}`, "View certificate")}` : ""}`) });

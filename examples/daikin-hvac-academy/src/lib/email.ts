import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

export interface Mail { to: string; subject: string; html: string; text?: string }
export interface MailResult { sent: boolean; reason?: string }

let transport: Transporter | null = null;
export const outbox: Mail[] = []; // test/dev inspection only

function getTransport() {
  if (!env.smtpHost) return null;
  transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Sends via SMTP. When SMTP is not configured the message is logged (never claimed as delivered). */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV !== "test") console.warn(`[email:not-sent] SMTP not configured → "${mail.subject}" for ${mail.to}`);
    outbox.push(mail);
    return { sent: false, reason: "smtp_not_configured" };
  }
  try {
    await t.sendMail({ from: env.emailFrom, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    return { sent: true };
  } catch (e) {
    console.error("[email:error]", (e as Error).message);
    return { sent: false, reason: "smtp_error" };
  }
}

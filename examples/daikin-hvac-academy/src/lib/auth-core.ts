import bcrypt from "bcryptjs";
import { query, queryOne, uuid } from "./db";
import { randomToken, sha256, validatePassword, rateLimit } from "./security";
import { effectivePlan, type PlanCode, type Role } from "./entitlements";
import { sendVerifyEmail, sendResetEmail, sendExistingAccountEmail } from "./emails";

const BCRYPT_COST = process.env.NODE_ENV === "test" ? 4 : 12;
export const SESSION_DAYS = 30;
// Used to equalise timing when the account does not exist.
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO5V8cYb1h6YVdYwJmKfQ4X7pVJrmV7aK";

export interface UserRow {
  id: string; email: string; name: string; role: Role; locale: "en" | "ar";
  company: string | null; job_title: string | null; country: string | null;
  email_verified_at: string | null; disabled_at: string | null;
  stripe_customer_id: string | null; comp_plan: "basic" | "pro" | null; comp_until: string | null;
  created_at: string;
}
export interface Viewer { user: UserRow; plan: PlanCode }

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const hashPassword = (pw: string) => bcrypt.hash(pw, BCRYPT_COST);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

const USER_COLS = "id,email,name,role,locale,company,job_title,country,email_verified_at,disabled_at,stripe_customer_id,comp_plan,comp_until,created_at";

export type RegisterResult = { ok: true } | { ok: false; error: string };

export async function registerUser(i: {
  email: string; password: string; name: string; locale?: "en" | "ar"; company?: string; country?: string; role?: Role;
}): Promise<RegisterResult & { userId?: string }> {
  const email = normalizeEmail(i.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "email_invalid" };
  if (!i.name.trim()) return { ok: false, error: "name_required" };
  const pwErr = validatePassword(i.password);
  if (pwErr) return { ok: false, error: pwErr };

  const existing = await queryOne("SELECT id FROM users WHERE email=$1", [email]);
  if (existing) {
    await sendExistingAccountEmail(email); // no enumeration: caller shows the same success message
    return { ok: true };
  }
  const id = uuid();
  await query(
    "INSERT INTO users (id,email,password_hash,name,locale,company,country,role) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [id, email, await hashPassword(i.password), i.name.trim(), i.locale ?? "en", i.company?.trim() || null, i.country?.trim() || null, i.role ?? "student"],
  );
  const token = await createEmailToken(id, "verify", 24 * 3600);
  await sendVerifyEmail(email, i.name.trim(), token);
  return { ok: true, userId: id };
}

export async function createEmailToken(userId: string, kind: "verify" | "reset", ttlSeconds: number): Promise<string> {
  const token = randomToken();
  await query("INSERT INTO email_tokens (id,user_id,kind,token_hash,expires_at) VALUES ($1,$2,$3,$4,$5)", [
    uuid(), userId, kind, sha256(token), new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  ]);
  return token;
}

/** Single-use: marks used and returns the user id only if valid. */
export async function consumeEmailToken(token: string, kind: "verify" | "reset"): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    "UPDATE email_tokens SET used_at=now() WHERE token_hash=$1 AND kind=$2 AND used_at IS NULL AND expires_at>now() RETURNING user_id",
    [sha256(token), kind],
  );
  return rows[0]?.user_id ?? null;
}

export async function verifyEmail(token: string): Promise<boolean> {
  const uid = await consumeEmailToken(token, "verify");
  if (!uid) return false;
  await query("UPDATE users SET email_verified_at=now() WHERE id=$1 AND email_verified_at IS NULL", [uid]);
  return true;
}

export async function resendVerification(userId: string) {
  const u = await queryOne<{ email: string; name: string; email_verified_at: string | null }>("SELECT email,name,email_verified_at FROM users WHERE id=$1", [userId]);
  if (!u || u.email_verified_at) return;
  await sendVerifyEmail(u.email, u.name, await createEmailToken(userId, "verify", 24 * 3600));
}

export async function requestPasswordReset(emailRaw: string, ip = "unknown") {
  const email = normalizeEmail(emailRaw);
  if (!rateLimit(`reset:${ip}`, 5, 15 * 60_000) || !rateLimit(`reset:${email}`, 3, 15 * 60_000)) return;
  const u = await queryOne<{ id: string }>("SELECT id FROM users WHERE email=$1 AND disabled_at IS NULL", [email]);
  if (u) await sendResetEmail(email, await createEmailToken(u.id, "reset", 3600));
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; error?: string }> {
  const pwErr = validatePassword(newPassword);
  if (pwErr) return { ok: false, error: pwErr };
  const uid = await consumeEmailToken(token, "reset");
  if (!uid) return { ok: false, error: "token_invalid" };
  await query("UPDATE users SET password_hash=$1 WHERE id=$2", [await hashPassword(newPassword), uid]);
  await query("DELETE FROM sessions WHERE user_id=$1", [uid]); // sign out everywhere
  return { ok: true };
}

export async function authenticate(emailRaw: string, password: string, ip = "unknown"): Promise<UserRow | null> {
  const email = normalizeEmail(emailRaw);
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:${email}`, 8, 15 * 60_000)) return null;
  const row = await queryOne<UserRow & { password_hash: string }>(`SELECT ${USER_COLS},password_hash FROM users WHERE email=$1`, [email]);
  const ok = await checkPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || row.disabled_at) return null;
  const { password_hash: _ph, ...user } = row;
  return user;
}

export async function createSessionRecord(userId: string, userAgent?: string): Promise<{ token: string; expires: Date }> {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query("INSERT INTO sessions (id,user_id,token_hash,expires_at,user_agent) VALUES ($1,$2,$3,$4,$5)", [
    uuid(), userId, sha256(token), expires.toISOString(), userAgent?.slice(0, 200) ?? null,
  ]);
  return { token, expires };
}

export async function deleteSession(token: string) {
  await query("DELETE FROM sessions WHERE token_hash=$1", [sha256(token)]);
}

export async function loadViewerByUserId(userId: string): Promise<Viewer | null> {
  const user = await queryOne<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id=$1`, [userId]);
  if (!user || user.disabled_at) return null;
  const subscriptions = await query("SELECT plan_code,status,current_period_end FROM subscriptions WHERE user_id=$1", [userId]);
  return { user, plan: effectivePlan({ role: user.role, subscriptions, compPlan: user.comp_plan, compUntil: user.comp_until }) };
}

export async function getViewerBySessionToken(token: string): Promise<Viewer | null> {
  const s = await queryOne<{ user_id: string }>("SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()", [sha256(token)]);
  return s ? loadViewerByUserId(s.user_id) : null;
}

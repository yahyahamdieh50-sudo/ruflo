import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function hmac(data: string): string {
  return createHmac("sha256", env.appSecret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Short-lived signed token for media/download URLs: <payload>.<sig> */
export function signToken(payload: Record<string, string | number>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyToken<T extends Record<string, any>>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data as T;
  } catch { return null; }
}

/** CSRF defence for cookie-authenticated route handlers: require same-origin. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return req.headers.get("sec-fetch-site") !== "cross-site" && req.method === "GET";
  try { return new URL(origin).origin === new URL(env.appUrl).origin; } catch { return false; }
}

// Fixed-window in-memory limiter. Replace with Redis/Upstash for multi-instance deployments.
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  b.n += 1;
  return b.n <= limit;
}
export function _resetRateLimits() { buckets.clear(); }

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "password_short";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "password_weak";
  if (pw.length > 128) return "password_long";
  return null;
}

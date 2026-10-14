// Admin authentication: one password from the ADMIN_PASSWORD env var, compared
// via scrypt + timingSafeEqual; sessions are random tokens stored only as hashes.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'yh_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class AdminAuth {
  constructor(store, password = process.env.ADMIN_PASSWORD) {
    this.store = store;
    this.enabled = typeof password === 'string' && password.length >= 12;
    if (this.enabled) {
      this.salt = randomBytes(16);
      this.hash = scryptSync(password, this.salt, 32);
    }
  }

  checkPassword(input) {
    if (!this.enabled || typeof input !== 'string' || input.length > 200) return false;
    return timingSafeEqual(scryptSync(input, this.salt, 32), this.hash);
  }

  login(password) {
    if (!this.checkPassword(password)) return null;
    const token = randomBytes(32).toString('base64url');
    this.store.createSession(sha256(token), SESSION_TTL_MS);
    return token;
  }

  isAuthed(req) {
    const token = readCookie(req, SESSION_COOKIE);
    return Boolean(this.enabled && token && this.store.hasSession(sha256(token)));
  }

  logout(req) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) this.store.deleteSession(sha256(token));
  }

  cookie(token, { secure }) {
    const maxAge = token ? Math.floor(SESSION_TTL_MS / 1000) : 0;
    return `${SESSION_COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  }
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

/** Fixed-window in-memory rate limiter keyed by client IP + bucket. */
export class RateLimiter {
  constructor() { this.hits = new Map(); }
  allow(key, limit, windowMs) {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      this.hits.set(key, { count: 1, reset: now + windowMs });
      if (this.hits.size > 10000) for (const [k, e] of this.hits) if (e.reset < now) this.hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  }
}

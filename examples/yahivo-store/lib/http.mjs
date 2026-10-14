// Small HTTP helpers: JSON responses, bounded body reading, security headers, static files.
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export function sendJson(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

export function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request is too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export async function readJson(req, limit) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Send JSON.');
  const raw = await readBody(req, limit);
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON.'); }
}

export function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function securityHeaders(res, { analytics = false } = {}) {
  const ga = analytics ? ' https://www.googletagmanager.com' : '';
  const gaConnect = analytics ? ' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com' : '';
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self'${ga}`,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    `connect-src 'self'${gaConnect}`,
    "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self' https://checkout.stripe.com", "object-src 'none'",
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

/** Serve a file from `root` if it exists. Returns false when not found. Blocks traversal. */
export function serveStatic(req, res, root, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return false; }
  if (rel.includes('\0')) return false;
  const file = path.resolve(root, `.${path.posix.normalize(`/${rel}`)}`);
  if (!file.startsWith(path.resolve(root) + path.sep)) return false;
  let st;
  try { st = statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  if (!TYPES[ext]) return false;
  const isUpload = rel.startsWith('/uploads/');
  res.writeHead(200, {
    'Content-Type': TYPES[ext],
    'Content-Length': st.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : isUpload ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
  });
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).pipe(res);
  return true;
}

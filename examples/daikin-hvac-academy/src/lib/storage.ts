import "server-only";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { env } from "./env";

/** Keys are server-generated; this guards every filesystem/S3 access anyway. */
const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{2,200}$/i;
export function assertSafeKey(key: string) {
  if (!KEY_RE.test(key) || key.includes("..") || key.includes("//")) throw new Error("Invalid storage key");
}

export const ALLOWED_UPLOADS: Record<string, string> = {
  ".mp4": "video/mp4", ".webm": "video/webm", ".vtt": "text/vtt", ".pdf": "application/pdf",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (videos go direct-to-storage on S3)

const root = () => path.resolve(process.cwd(), "storage", "private");
const localPath = (key: string) => {
  assertSafeKey(key);
  const p = path.resolve(root(), key);
  if (!p.startsWith(root() + path.sep)) throw new Error("Invalid storage key");
  return p;
};

export interface UploadTarget { url: string; method: "PUT"; headers: Record<string, string>; key: string }

export function newKey(prefix: string, filename: string): { key: string; contentType: string } {
  const ext = path.extname(filename).toLowerCase();
  const contentType = ALLOWED_UPLOADS[ext];
  if (!contentType) throw new Error("File type not allowed");
  return { key: `${prefix}/${crypto.randomUUID()}${ext}`, contentType };
}

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: process.env.S3_ACCESS_KEY_ID
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "" }
      : undefined,
  });
}

export async function createUploadTarget(key: string, contentType: string): Promise<UploadTarget> {
  assertSafeKey(key);
  if (env.storageDriver === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(await s3(), new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn: 900 });
    return { url, method: "PUT", headers: { "Content-Type": contentType }, key };
  }
  return { url: `/api/admin/upload?key=${encodeURIComponent(key)}`, method: "PUT", headers: { "Content-Type": contentType }, key };
}

export async function saveLocal(key: string, body: ReadableStream<Uint8Array>) {
  const p = localPath(key);
  await fs.promises.mkdir(path.dirname(p), { recursive: true });
  const out = fs.createWriteStream(p);
  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(body as any).pipe(out).on("finish", resolve).on("error", reject);
  });
}

export async function exists(key: string): Promise<boolean> {
  if (env.storageDriver === "s3") return true; // existence checked lazily by the signed URL
  try { await fs.promises.access(localPath(key)); return true; } catch { return false; }
}

/**
 * Deliver an object AFTER the caller has performed entitlement checks.
 * s3 → 302 to a 5-minute presigned URL; local → range-aware stream. Never cached publicly.
 */
export async function deliver(key: string, req: Request, opts: { download?: string } = {}): Promise<Response> {
  assertSafeKey(key);
  const type = ALLOWED_UPLOADS[path.extname(key).toLowerCase()] ?? "application/octet-stream";
  const disposition: Record<string, string> = opts.download ? { "Content-Disposition": `attachment; filename="${opts.download.replace(/[^\w.-]/g, "_")}"` } : {};

  if (env.storageDriver === "s3") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(await s3(), new GetObjectCommand({
      Bucket: process.env.S3_BUCKET, Key: key,
      ResponseContentDisposition: opts.download ? `attachment; filename="${opts.download.replace(/[^\w.-]/g, "_")}"` : undefined,
    }), { expiresIn: 300 });
    return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "private, no-store" } });
  }

  let stat: fs.Stats;
  try { stat = await fs.promises.stat(localPath(key)); } catch { return new Response("Not found", { status: 404 }); }
  const headers: Record<string, string> = {
    "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", ...disposition,
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? parseInt(range[1], 10) : stat.size - parseInt(range[2], 10);
    let end = range[1] && range[2] ? parseInt(range[2], 10) : stat.size - 1;
    start = Math.max(0, start); end = Math.min(end, stat.size - 1);
    if (start > end || start >= stat.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const stream = fs.createReadStream(localPath(key), { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(localPath(key))) as ReadableStream, {
    status: 200, headers: { ...headers, "Content-Length": String(stat.size) },
  });
}

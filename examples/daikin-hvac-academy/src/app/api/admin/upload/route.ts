import { getViewer } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { env } from "@/lib/env";
import { assertSafeKey, MAX_UPLOAD_BYTES, saveLocal, ALLOWED_UPLOADS } from "@/lib/storage";
import path from "node:path";

export const dynamic = "force-dynamic";

/** Local-driver upload target (dev / single-server). With STORAGE_DRIVER=s3 clients PUT straight to the presigned URL. */
export async function PUT(req: Request) {
  if (env.storageDriver !== "local") return new Response("Not available", { status: 404 });
  if (!isSameOrigin(req)) return new Response("Bad origin", { status: 403 });
  const v = await getViewer();
  if (!v || v.user.role === "student") return new Response("Forbidden", { status: 403 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  try { assertSafeKey(key); } catch { return new Response("Bad key", { status: 400 }); }
  if (!ALLOWED_UPLOADS[path.extname(key).toLowerCase()]) return new Response("File type not allowed", { status: 400 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (!len || len > MAX_UPLOAD_BYTES) return new Response("Invalid size", { status: 413 });
  if (!req.body) return new Response("Empty", { status: 400 });
  await saveLocal(key, req.body);
  return Response.json({ ok: true, key });
}

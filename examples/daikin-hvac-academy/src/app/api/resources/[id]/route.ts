import { getViewer } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { canDownloadResources } from "@/lib/entitlements";
import { deliver } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getViewer();
  if (!v) return new Response("Sign in required", { status: 401 });
  if (!canDownloadResources(v.plan)) return new Response("Pro plan required", { status: 403 });
  const r = await queryOne<{ title_en: string; storage_key: string | null; inline_markdown: string | null }>("SELECT title_en,storage_key,inline_markdown FROM resources WHERE id=$1", [id]);
  if (!r) return new Response("Not found", { status: 404 });
  const base = r.title_en.replace(/[^\w.-]+/g, "_");
  if (r.storage_key) return deliver(r.storage_key, req, { download: `${base}${r.storage_key.slice(r.storage_key.lastIndexOf("."))}` });
  return new Response(r.inline_markdown ?? "", { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.md"`, "Cache-Control": "private, no-store" } });
}

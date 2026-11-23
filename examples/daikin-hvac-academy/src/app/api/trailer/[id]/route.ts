import { queryOne } from "@/lib/db";
import { deliver } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Trailers are intentionally public: "site" = homepage trailer, otherwise a course id. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = id === "site"
    ? (await queryOne<{ value: string }>("SELECT value FROM settings WHERE key='site_trailer_key'"))?.value
    : (await queryOne<{ trailer_key: string | null }>("SELECT trailer_key FROM courses WHERE id=$1 AND status IN ('published','coming_soon')", [id]))?.trailer_key;
  return key ? deliver(typeof key === "string" ? key : String(key), req) : new Response("Not found", { status: 404 });
}

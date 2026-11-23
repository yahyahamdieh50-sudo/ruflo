import { getViewer } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { canAccessLesson } from "@/lib/entitlements";
import { deliver } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string; lang: string }> }) {
  const { lessonId, lang } = await params;
  if (lang !== "en" && lang !== "ar") return new Response("Not found", { status: 404 });
  const row = await queryOne<{ storage_key: string; tier: "basic" | "pro"; is_free_preview: boolean; course_tier: "basic" | "pro" }>(
    `SELECT s.storage_key,l.tier,l.is_free_preview,c.tier AS course_tier FROM lesson_subtitles s JOIN lessons l ON l.id=s.lesson_id JOIN courses c ON c.id=l.course_id WHERE s.lesson_id=$1 AND s.lang=$2`, [lessonId, lang]);
  if (!row) return new Response("Not found", { status: 404 });
  const v = await getViewer();
  if (!canAccessLesson(v?.plan ?? "free", { tier: row.course_tier }, row)) return new Response("Forbidden", { status: 403 });
  return deliver(row.storage_key, req);
}

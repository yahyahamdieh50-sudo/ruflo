import { getViewer } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { canAccessLesson } from "@/lib/entitlements";
import { deliver } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Premium video: entitlement is checked on EVERY request (including range requests). */
export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const l = await queryOne<{ video_key: string | null; tier: "basic" | "pro"; is_free_preview: boolean; course_tier: "basic" | "pro"; status: string }>(
    "SELECT l.video_key,l.tier,l.is_free_preview,c.tier AS course_tier,c.status FROM lessons l JOIN courses c ON c.id=l.course_id WHERE l.id=$1", [lessonId]);
  if (!l?.video_key) return new Response("Not found", { status: 404 });
  const v = await getViewer();
  const staff = !!v && v.user.role !== "student";
  if (l.status !== "published" && !staff) return new Response("Not found", { status: 404 });
  if (!canAccessLesson(v?.plan ?? "free", { tier: l.course_tier }, l)) return new Response(v ? "Upgrade required" : "Sign in required", { status: v ? 403 : 401 });
  return deliver(l.video_key, req);
}

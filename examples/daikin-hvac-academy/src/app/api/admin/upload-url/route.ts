import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { isSameOrigin } from "@/lib/security";
import { createUploadTarget, newKey } from "@/lib/storage";

export const dynamic = "force-dynamic";

const PURPOSES: Record<string, string> = { lesson_video: "videos", trailer: "trailers", subtitle: "subtitles", resource: "resources", course_image: "images" };

/** Staff only. Keys are generated server-side; the client never chooses a path. */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Bad origin", { status: 403 });
  const v = await getViewer();
  if (!v || v.user.role === "student") return new Response("Forbidden", { status: 403 });
  const body = z.object({ purpose: z.enum(["lesson_video", "trailer", "subtitle", "resource", "course_image"]), filename: z.string().max(200), ownerId: z.string().uuid().or(z.literal("site")) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return new Response("Bad request", { status: 400 });
  try {
    const { key, contentType } = newKey(`${PURPOSES[body.data.purpose]}/${body.data.ownerId}`, body.data.filename);
    return Response.json(await createUploadTarget(key, contentType));
  } catch (e) { return new Response((e as Error).message, { status: 400 }); }
}

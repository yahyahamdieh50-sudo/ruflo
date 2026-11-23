import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { getLocale } from "@/lib/i18n-server";
import { answerQuestion } from "@/lib/assistant";
import { isSameOrigin, rateLimit } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response("Bad origin", { status: 403 });
  const v = await getViewer();
  if (!v) return new Response("Sign in required", { status: 401 });
  const limit = v.plan === "free" ? 5 : 30;
  if (!rateLimit(`assistant:${v.user.id}`, limit, 60 * 60_000)) return new Response("Rate limit reached. Try again later.", { status: 429 });
  const body = z.object({ question: z.string().min(3).max(500) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return new Response("Bad request", { status: 400 });
  return Response.json(await answerQuestion(body.data.question, v.plan, await getLocale()));
}

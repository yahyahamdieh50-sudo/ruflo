import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "./env";
import { createSessionRecord, deleteSession, getViewerBySessionToken, type Viewer } from "./auth-core";
import type { Role } from "./entitlements";

export const SESSION_COOKIE = "dhia_session";

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? getViewerBySessionToken(token) : null;
});

export async function startSession(userId: string) {
  const h = await headers();
  const { token, expires } = await createSessionRecord(userId, h.get("user-agent") ?? undefined);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function requireViewer(next?: string): Promise<Viewer> {
  const v = await getViewer();
  if (!v) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return v;
}

export async function requireRole(...roles: Role[]): Promise<Viewer> {
  const v = await requireViewer();
  if (!roles.includes(v.user.role)) redirect("/dashboard");
  return v;
}

import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { getViewer } from "@/lib/auth";
import { AssistantChat } from "@/components/AssistantChat";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI training assistant" };

export default async function Assistant() {
  const { t } = await getT(); const v = await getViewer();
  const L = Object.fromEntries(["placeholder", "ask", "signin", "rate", "error", "mode_generated", "mode_extractive", "no_match", "sources", "w_model_specific", "w_hazard", "w_ai_disclaimer"].map((k) => [k, t(`assistant.${k}`)]));
  return (
    <div className="container-x max-w-3xl py-12">
      <h1 className="text-3xl font-extrabold text-navy-900">{t("assistant.title")}</h1>
      <p className="mt-2 text-steel-600">{t("assistant.sub")}</p>
      <p className="mt-3 rounded border border-navy-100 bg-navy-50 p-3 text-xs text-navy-800">{t("assistant.scope")}</p>
      <div className="mt-6">{v ? <AssistantChat L={L} /> : <p className="card p-6 text-sm">{t("assistant.login")} <Link href="/login?next=/assistant" className="font-bold text-accent-dark">{t("auth.login")}</Link></p>}</div>
    </div>
  );
}

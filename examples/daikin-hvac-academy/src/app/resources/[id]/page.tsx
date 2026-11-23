import Link from "next/link";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { queryOne } from "@/lib/db";
import { canDownloadResources } from "@/lib/entitlements";
import { pick } from "@/lib/courses";
import { Locked } from "@/components/Locked";
import { Markdown } from "@/components/Markdown";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function Resource({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ t, locale }, viewer] = await Promise.all([getT(), getViewer()]);
  const r = await queryOne<{ id: string; title_en: string; title_ar: string | null; kind: string; inline_markdown: string | null; storage_key: string | null; course_status: string }>(
    "SELECT r.id,r.title_en,r.title_ar,r.kind,r.inline_markdown,r.storage_key,c.status AS course_status FROM resources r JOIN courses c ON c.id=r.course_id WHERE r.id=$1", [id]);
  if (!r) notFound();
  const plan = viewer?.plan ?? "free";
  if (!canDownloadResources(plan)) return <div className="container-x py-10"><h1 className="text-2xl font-extrabold text-navy-900">{pick(r, "title", locale)}</h1><Locked needed="pro" loggedIn={!!viewer} t={t} what={t("locked.resource")} /></div>;
  return (
    <div className="container-x max-w-3xl py-10">
      <div className="no-print mb-4 flex flex-wrap gap-3"><PrintButton label={t("cert.print")} /><a className="btn-outline" href={`/api/resources/${r.id}`}>{t("resource.download")}</a><Link href="/dashboard" className="btn-outline">{t("nav.dashboard")}</Link></div>
      <div className="card p-8"><p className="tag bg-navy-800 text-white">{t(`resource.${r.kind}`)}</p>
        {r.inline_markdown ? <Markdown source={r.inline_markdown} className="mt-4" /> : <p className="mt-4 text-sm">{t("resource.file")}</p>}
        <p className="mt-8 border-t border-steel-200 pt-3 text-xs text-steel-500">{t("resource.footer")}</p></div>
    </div>
  );
}

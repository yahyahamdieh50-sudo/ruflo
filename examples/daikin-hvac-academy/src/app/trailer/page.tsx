import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { queryOne } from "@/lib/db";
import { MediaPlayer } from "@/components/MediaPlayer";
import { SAMPLE_SLUG } from "@/content/sample-course";

export const dynamic = "force-dynamic";
export const metadata = { title: "Free trailer" };

export default async function Trailer() {
  const { t } = await getT();
  const s = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key='site_trailer_key'");
  const has = !!s?.value;
  return (
    <div className="container-x max-w-4xl py-12">
      <h1 className="text-3xl font-extrabold text-navy-900">{t("trailer.title")}</h1>
      <p className="mt-2 text-steel-600">{t("trailer.sub")}</p>
      <div className="mt-6"><MediaPlayer src="/api/trailer/site" hasVideo={has} t={t} label={t("trailer.title")} /></div>
      <div className="card mt-8 p-6">
        <h2 className="text-lg font-bold text-navy-900">{t("trailer.next")}</h2>
        <div className="mt-4 flex flex-wrap gap-3"><Link href={`/courses/${SAMPLE_SLUG}`} className="btn-navy">{t("trailer.try_sample")}</Link><Link href="/courses" className="btn-outline">{t("home.all_courses")}</Link><Link href="/pricing" className="btn-primary">{t("cta.unlock")}</Link></div>
      </div>
    </div>
  );
}

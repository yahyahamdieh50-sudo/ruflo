import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { queryOne } from "@/lib/db";
import { FileUpload } from "@/components/FileUpload";

export const dynamic = "force-dynamic";
export default async function Site() {
  await requireRole("admin"); const { t } = await getT();
  const s = await queryOne("SELECT 1 AS x FROM settings WHERE key='site_trailer_key'");
  return (<div><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.site")}</h1>
    <section className="card mt-6 max-w-xl p-5"><h2 className="mb-3 font-bold text-navy-900">{t("admin.site_trailer")}</h2><FileUpload purpose="trailer" ownerId="site" accept="video/mp4,video/webm" label={t("admin.upload_trailer")} done={t("admin.uploaded")} />
      <p className="mt-2 text-xs text-steel-500">{s ? t("admin.trailer_set") : t("admin.trailer_none")}</p></section></div>);
}

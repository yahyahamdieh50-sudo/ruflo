import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { getCertificateByNumber } from "@/lib/learning";
import { isWellFormedCertificateNumber } from "@/lib/certificate-number";
import { Alert } from "@/components/AuthForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify a certificate" };

export default async function Verify({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const { t } = await getT();
  const n = sp.number?.trim().toUpperCase();
  const cert = n && isWellFormedCertificateNumber(n) ? await getCertificateByNumber(n) : null;
  return (
    <div className="container-x max-w-xl py-12"><h1 className="text-3xl font-extrabold text-navy-900">{t("verify.title")}</h1><p className="mt-2 text-steel-600">{t("verify.sub")}</p>
      <form className="mt-6 flex gap-2" role="search"><input name="number" defaultValue={n} className="input font-mono" placeholder="DHIA-2026-XXXXXXXX-X" aria-label={t("cert.number")} /><button className="btn-primary">{t("verify.check")}</button></form>
      {n && !cert && <div className="mt-6"><Alert>{t("verify.not_found")}</Alert></div>}
      {cert && <div className="card mt-6 p-5 text-sm"><p className={`font-bold ${cert.revoked_at ? "text-red-700" : "text-emerald-700"}`}>{cert.revoked_at ? `✕ ${t("cert.revoked")}` : `✓ ${t("cert.valid")}`}</p>
        <p className="mt-2"><b>{cert.student_name}</b> — {cert.course_title_en}</p><p className="text-steel-500">{new Date(cert.issued_at).toLocaleDateString("en-GB")} · {cert.score_pct}%</p>
        <p className="mt-3 text-xs text-steel-600">{t("cert.disclaimer")}</p><Link href={`/certificates/${cert.number}`} className="btn-navy btn-sm mt-3">{t("verify.view")}</Link></div>}
    </div>
  );
}

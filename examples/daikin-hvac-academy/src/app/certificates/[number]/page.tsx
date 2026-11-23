import Link from "next/link";
import { notFound } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { getCertificateByNumber } from "@/lib/learning";
import { isWellFormedCertificateNumber } from "@/lib/certificate-number";
import { env } from "@/lib/env";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate verification", robots: { index: false } };

export default async function Certificate({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { number } = await params; const sp = await searchParams;
  const { t, locale } = await getT();
  const n = decodeURIComponent(number).toUpperCase();
  const cert = isWellFormedCertificateNumber(n) ? await getCertificateByNumber(n) : null;
  if (!cert) notFound();
  const revoked = !!cert.revoked_at;
  const title = locale === "ar" && cert.course_title_ar ? cert.course_title_ar : cert.course_title_en;
  return (
    <div className="container-x max-w-4xl py-10">
      {sp.new && <p className="no-print mb-4 rounded bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">🎉 {t("cert.new")}</p>}
      <div className={`no-print mb-4 flex items-center gap-3 rounded p-3 text-sm font-bold ${revoked ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{revoked ? `✕ ${t("cert.revoked")}` : `✓ ${t("cert.valid")}`}</div>
      <div className="relative border-[10px] border-double border-navy-800 bg-white p-8 text-center sm:p-14">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-dark">DAIKIN HVAC INSTALLATION ACADEMY</p>
        <h1 className="mt-6 text-3xl font-extrabold text-navy-900 sm:text-4xl">{t("cert.heading")}</h1>
        <p className="mt-6 text-steel-600">{t("cert.awarded")}</p>
        <p className="mt-2 text-3xl font-bold text-navy-900 sm:text-4xl">{cert.student_name}</p>
        <p className="mt-6 text-steel-600">{t("cert.for")}</p>
        <p className="mt-2 text-xl font-bold text-navy-800">{title}</p>
        <dl className="mx-auto mt-8 grid max-w-xl grid-cols-[auto_auto_1fr] justify-center gap-x-10 gap-y-2 text-sm"><div><dt className="text-xs uppercase text-steel-500">{t("cert.date")}</dt><dd className="font-semibold">{new Date(cert.issued_at).toLocaleDateString("en-GB")}</dd></div>
          <div><dt className="text-xs uppercase text-steel-500">{t("cert.score")}</dt><dd className="font-semibold">{cert.score_pct}%</dd></div>
          <div><dt className="text-xs uppercase text-steel-500">{t("cert.number")}</dt><dd className="whitespace-nowrap font-mono text-xs font-semibold">{cert.number}</dd></div></dl>
        <p className="mx-auto mt-8 max-w-xl rounded border border-steel-300 bg-steel-50 p-3 text-xs text-steel-700">{t("cert.disclaimer")}</p>
        <p className="mt-4 text-[11px] text-steel-500">{t("cert.verify_at")}: {env.appUrl}/certificates/{cert.number}</p>
      </div>
      <div className="no-print mt-6 flex flex-wrap gap-3"><PrintButton label={t("cert.print")} /><Link href="/verify" className="btn-outline">{t("nav.verify")}</Link></div>
    </div>
  );
}

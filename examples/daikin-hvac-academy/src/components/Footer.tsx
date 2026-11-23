import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { DISCLAIMER_AR, DISCLAIMER_EN } from "@/lib/env";

export async function Footer() {
  const { t, locale } = await getT();
  return (
    <footer className="mt-20 bg-navy-950 text-steel-300">
      <div className="container-x py-10">
        <p role="note" className="mb-6 rounded border border-accent/50 bg-navy-900 px-4 py-3 text-sm font-semibold text-white">
          {locale === "ar" ? DISCLAIMER_AR : DISCLAIMER_EN}
        </p>
        <div className="grid gap-8 text-sm sm:grid-cols-3">
          <div><p className="font-bold text-white">DAIKIN HVAC INSTALLATION ACADEMY</p><p className="mt-2 text-steel-400">{t("footer.about")}</p></div>
          <div><p className="font-bold text-white">{t("footer.explore")}</p>
            <ul className="mt-2 space-y-1"><li><Link href="/courses" className="hover:text-white">{t("nav.courses")}</Link></li><li><Link href="/pricing" className="hover:text-white">{t("nav.pricing")}</Link></li><li><Link href="/verify" className="hover:text-white">{t("nav.verify")}</Link></li><li><Link href="/assistant" className="hover:text-white">{t("nav.assistant")}</Link></li></ul></div>
          <div><p className="font-bold text-white">{t("footer.accuracy")}</p><p className="mt-2 text-steel-400">{t("footer.accuracy_body")}</p></div>
        </div>
        <p className="mt-8 border-t border-white/10 pt-4 text-xs text-steel-500">{t("footer.trademark")}</p>
      </div>
    </footer>
  );
}

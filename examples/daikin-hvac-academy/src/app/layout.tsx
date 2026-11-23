import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { getT } from "@/lib/i18n-server";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(env.appUrl),
  title: { default: "Daikin HVAC Installation Academy — Independent Training", template: "%s | Installation Academy" },
  description: "Independent HVAC installation training: site preparation, inspection, testing and commissioning readiness. Not affiliated with Daikin Industries, Ltd.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a1a35" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir, t } = await getT();
  return (
    <html lang={locale} dir={dir}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">{t("a11y.skip")}</a>
        <Header />
        <main id="main" className="min-h-[60vh]">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

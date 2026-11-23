import Link from "next/link";
import { getViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { setLocale } from "@/app/actions/locale";
import { logoutAction } from "@/app/actions/auth";

export async function Header() {
  const [{ t, locale }, viewer] = await Promise.all([getT(), getViewer()]);
  const links = [
    { href: "/courses", label: t("nav.courses") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/assistant", label: t("nav.assistant") },
    { href: "/verify", label: t("nav.verify") },
  ];
  const staff = viewer && (viewer.user.role === "admin" || viewer.user.role === "instructor");
  return (
    <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-900 text-white">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 font-extrabold tracking-wide" aria-label="Home">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded bg-accent text-lg">❄</span>
          <span className="hidden text-sm leading-tight sm:block">DAIKIN HVAC<br /><span className="text-[11px] font-semibold text-steel-300">INSTALLATION ACADEMY</span></span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold md:flex" aria-label="Main">
          {links.map((l) => <Link key={l.href} href={l.href} className="text-steel-200 hover:text-white">{l.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <form action={setLocale}>
            <input type="hidden" name="lang" value={locale === "ar" ? "en" : "ar"} />
            <button className="rounded border border-white/30 px-3 py-1.5 text-xs font-bold hover:bg-white/10" aria-label="Switch language">{locale === "ar" ? "English" : "العربية"}</button>
          </form>
          {viewer ? (
            <>
              {staff && <Link href="/admin" className="hidden rounded border border-white/30 px-3 py-1.5 text-xs font-bold hover:bg-white/10 sm:block">{t("nav.admin")}</Link>}
              <Link href="/dashboard" className="btn-primary btn-sm">{t("nav.dashboard")}</Link>
              <form action={logoutAction}><button className="hidden px-2 text-xs text-steel-300 hover:text-white sm:block">{t("nav.logout")}</button></form>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden px-2 text-sm font-semibold text-steel-200 hover:text-white sm:block">{t("nav.login")}</Link>
              <Link href="/signup" className="btn-primary btn-sm">{t("nav.signup")}</Link>
            </>
          )}
          <details className="relative md:hidden">
            <summary className="cursor-pointer list-none rounded border border-white/30 px-3 py-1.5 text-sm" aria-label="Menu">☰</summary>
            <div className="absolute end-0 mt-2 w-56 rounded bg-white p-2 text-navy-900 shadow-xl">
              {links.map((l) => <Link key={l.href} href={l.href} className="block rounded px-3 py-2 text-sm font-semibold hover:bg-steel-100">{l.label}</Link>)}
              {viewer && <form action={logoutAction}><button className="w-full rounded px-3 py-2 text-start text-sm hover:bg-steel-100">{t("nav.logout")}</button></form>}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const v = await requireViewer("/admin");
  if (v.user.role === "student") redirect("/dashboard");
  const { t } = await getT();
  const admin = v.user.role === "admin";
  const items = [
    admin && { href: "/admin", label: t("admin.overview") }, { href: "/admin/courses", label: t("admin.courses") },
    admin && { href: "/admin/students", label: t("admin.students") }, admin && { href: "/admin/pricing", label: t("admin.pricing") },
    admin && { href: "/admin/promos", label: t("admin.promos") }, { href: "/admin/models", label: t("admin.models") }, admin && { href: "/admin/site", label: t("admin.site") },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="container-x grid gap-6 py-8 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Admin" className="card h-fit p-2 text-sm font-semibold">
        <p className="px-3 py-2 text-xs uppercase tracking-wide text-steel-500">{t(admin ? "admin.role_admin" : "admin.role_instructor")}</p>
        {items.map((i) => <Link key={i.href} href={i.href} className="block rounded px-3 py-2 text-navy-800 hover:bg-steel-100">{i.label}</Link>)}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

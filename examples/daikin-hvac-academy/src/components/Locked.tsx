import Link from "next/link";
import type { PlanCode } from "@/lib/entitlements";
import type { TFn } from "@/lib/i18n";

export function Locked({ needed, loggedIn, t, what }: { needed: PlanCode; loggedIn: boolean; t: TFn; what?: string }) {
  return (
    <div className="card mx-auto my-8 max-w-xl p-8 text-center" role="region" aria-label={t("locked.title")}>
      <div aria-hidden className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-navy-50 text-2xl">🔒</div>
      <h2 className="text-xl font-bold text-navy-900">{t("locked.title")}</h2>
      <p className="mt-2 text-steel-600">{what ? `${what} — ` : ""}{t("locked.needs", { plan: t(`tier.${needed}`) })}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {!loggedIn && <Link href="/signup" className="btn-outline">{t("cta.free_account")}</Link>}
        <Link href="/pricing" className="btn-primary">{t("cta.unlock")}</Link>
      </div>
    </div>
  );
}

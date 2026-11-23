import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { verifyEmailAction } from "@/app/actions/auth";
import { AuthShell, Alert } from "@/components/AuthForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Verify email" };

/** Verification needs an explicit POST so mail-scanner link prefetching cannot consume the single-use token. */
export default async function VerifyEmail({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const { t } = await getT();
  return (
    <AuthShell title={t("auth.verify_title")}>
      {sp.done && <Alert kind="ok">{t("auth.verify_ok")}</Alert>}
      {sp.bad && <Alert>{t("auth.verify_bad")}</Alert>}
      {sp.token && !sp.done && !sp.bad && (
        <form action={verifyEmailAction}><input type="hidden" name="token" value={sp.token} /><p className="mb-4 text-sm text-steel-600">{t("auth.verify_confirm")}</p><button className="btn-primary w-full">{t("auth.verify_button")}</button></form>)}
      {(sp.done || sp.bad) && <Link href="/dashboard" className="btn-primary mt-2 w-full">{t("nav.dashboard")}</Link>}
    </AuthShell>
  );
}

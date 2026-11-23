import { getT } from "@/lib/i18n-server";
import { loginAction } from "@/app/actions/auth";
import { AuthShell, Field, Alert, Link } from "@/components/AuthForm";

export const metadata = { title: "Sign in" };
export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const { t } = await getT();
  return (
    <AuthShell title={t("auth.login")} footer={<>{t("auth.no_account")} <Link href="/signup" className="font-bold text-accent-dark">{t("nav.signup")}</Link></>}>
      {sp.error && <Alert>{t("auth.invalid")}</Alert>}
      {sp.registered && <Alert kind="info">{t("auth.registered")}</Alert>}
      {sp.reset && <Alert kind="ok">{t("auth.reset_done")}</Alert>}
      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field id="email" label={t("auth.email")} type="email" required autoComplete="email" />
        <Field id="password" label={t("auth.password")} type="password" required autoComplete="current-password" />
        <button className="btn-primary w-full">{t("auth.login")}</button>
      </form>
      <p className="mt-4 text-center text-sm"><Link href="/forgot-password" className="text-accent-dark hover:underline">{t("auth.forgot")}</Link></p>
    </AuthShell>
  );
}

import { getT } from "@/lib/i18n-server";
import { signupAction } from "@/app/actions/auth";
import { AuthShell, Field, Alert, Link } from "@/components/AuthForm";

export const metadata = { title: "Create free account" };
export default async function Signup({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const { t } = await getT();
  return (
    <AuthShell title={t("auth.signup")} sub={t("auth.signup_sub")} footer={<>{t("auth.have_account")} <Link href="/login" className="font-bold text-accent-dark">{t("auth.login")}</Link></>}>
      {sp.error && <Alert>{t(`err.${sp.error}`)}</Alert>}
      <form action={signupAction} className="space-y-4">
        <Field id="name" label={t("auth.name")} required maxLength={120} autoComplete="name" />
        <Field id="email" label={t("auth.email")} type="email" required autoComplete="email" />
        <Field id="password" label={t("auth.password")} type="password" required minLength={10} autoComplete="new-password" />
        <p className="-mt-2 text-xs text-steel-500">{t("auth.password_hint")}</p>
        <div className="grid grid-cols-2 gap-3"><Field id="company" label={t("auth.company")} maxLength={120} /><Field id="country" label={t("auth.country")} maxLength={80} autoComplete="country-name" /></div>
        <label className="flex items-start gap-2 text-xs text-steel-600"><input type="checkbox" name="accept" required className="mt-0.5" />{t("auth.accept")}</label>
        <button className="btn-primary w-full">{t("auth.signup")}</button>
      </form>
    </AuthShell>
  );
}

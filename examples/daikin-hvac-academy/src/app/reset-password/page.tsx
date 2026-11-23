import { getT } from "@/lib/i18n-server";
import { resetPasswordAction } from "@/app/actions/auth";
import { AuthShell, Field, Alert } from "@/components/AuthForm";

export const metadata = { title: "Reset password" };
export default async function Reset({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const { t } = await getT();
  return (
    <AuthShell title={t("auth.reset")}>
      {sp.error && <Alert>{t(`err.${sp.error}`)}</Alert>}
      <form action={resetPasswordAction} className="space-y-4"><input type="hidden" name="token" value={sp.token ?? ""} />
        <Field id="password" label={t("auth.new_password")} type="password" required minLength={10} autoComplete="new-password" /><p className="-mt-2 text-xs text-steel-500">{t("auth.password_hint")}</p>
        <button className="btn-primary w-full">{t("auth.reset")}</button></form>
    </AuthShell>
  );
}

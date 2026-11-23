import { getT } from "@/lib/i18n-server";
import { forgotPasswordAction } from "@/app/actions/auth";
import { AuthShell, Field, Alert } from "@/components/AuthForm";

export const metadata = { title: "Forgot password" };
export default async function Forgot({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const { t } = await getT();
  return (
    <AuthShell title={t("auth.forgot")} sub={t("auth.forgot_sub")}>
      {sp.sent && <Alert kind="ok">{t("auth.forgot_sent")}</Alert>}
      <form action={forgotPasswordAction} className="space-y-4"><Field id="email" label={t("auth.email")} type="email" required autoComplete="email" /><button className="btn-primary w-full">{t("auth.send_link")}</button></form>
    </AuthShell>
  );
}

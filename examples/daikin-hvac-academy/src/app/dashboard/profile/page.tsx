import { requireViewer } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { updateProfileAction } from "@/app/actions/auth";
import { Alert, Field } from "@/components/AuthForm";

export const dynamic = "force-dynamic";
export default async function Profile({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const v = await requireViewer("/dashboard/profile"); const { t } = await getT();
  const u = v.user;
  return (
    <div className="container-x max-w-xl py-10"><h1 className="text-3xl font-extrabold text-navy-900">{t("dash.profile")}</h1>
      {sp.saved && <div className="mt-4"><Alert kind="ok">{t("profile.saved")}</Alert></div>}{sp.error && <div className="mt-4"><Alert>{t("err.invalid")}</Alert></div>}
      <form action={updateProfileAction} className="card mt-6 space-y-4 p-6">
        <Field id="name" label={t("auth.name")} defaultValue={u.name} required maxLength={120} />
        <div><label className="label">{t("auth.email")}</label><input className="input bg-steel-100" value={u.email} disabled readOnly /></div>
        <Field id="company" label={t("auth.company")} defaultValue={u.company ?? ""} maxLength={120} />
        <Field id="job_title" label={t("auth.job_title")} defaultValue={u.job_title ?? ""} maxLength={120} />
        <Field id="country" label={t("auth.country")} defaultValue={u.country ?? ""} maxLength={80} />
        <button className="btn-primary">{t("profile.save")}</button></form></div>
  );
}

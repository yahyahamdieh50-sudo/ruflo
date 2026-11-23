import { requireRole } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { query } from "@/lib/db";
import { effectivePlan } from "@/lib/entitlements";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function Students({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const v = await requireRole("admin"); const { t } = await getT();
  const q = sp.q?.trim().slice(0, 80);
  const users = await query<any>(
    `SELECT id,email,name,role,email_verified_at,disabled_at,comp_plan,comp_until,created_at FROM users ${q ? "WHERE email ILIKE $1 OR name ILIKE $1" : ""} ORDER BY created_at DESC LIMIT 100`,
    q ? [`%${q.replace(/[%_\\]/g, "\\$&")}%`] : []);
  const subs = await query<any>("SELECT user_id,plan_code,status,current_period_end FROM subscriptions");
  return (
    <div><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.students")}</h1>
      {sp.saved && <p role="status" className="mt-3 rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}{sp.error && <p role="alert" className="mt-3 rounded bg-red-50 p-3 text-sm text-red-700">{t("err.invalid")}</p>}
      <form className="mt-4 flex gap-2" role="search"><input name="q" defaultValue={q} className="input max-w-sm" placeholder={t("admin.search_users")} aria-label={t("admin.search_users")} /><button className="btn-navy btn-sm">{t("courses.filter")}</button></form>
      <div className="card mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-steel-50 text-xs uppercase text-steel-500"><th className="p-3 text-start">{t("auth.name")}</th><th>{t("admin.role")}</th><th>{t("dash.plan")}</th><th>{t("admin.status")}</th><th>{t("admin.actions")}</th></tr></thead>
        <tbody>{users.map((u) => { const plan = effectivePlan({ role: u.role, subscriptions: subs.filter((s: any) => s.user_id === u.id), compPlan: u.comp_plan, compUntil: u.comp_until });
          return (<tr key={u.id} className="border-t border-steel-100 align-top"><td className="p-3"><b>{u.name}</b><br /><span className="text-xs text-steel-500">{u.email} {u.email_verified_at ? "✓" : `(${t("admin.unverified")})`}</span></td>
            <td className="text-center"><form action={A.setRoleAction} className="flex gap-1"><input type="hidden" name="user_id" value={u.id} /><select name="role" defaultValue={u.role} className="input py-1 text-xs" disabled={u.id === v.user.id}>{["student", "instructor", "admin"].map((r) => <option key={r}>{r}</option>)}</select><button className="btn-outline btn-sm" disabled={u.id === v.user.id}>✓</button></form></td>
            <td className="text-center"><span className="tag bg-navy-100 text-navy-800">{t(`tier.${plan}`)}</span>{u.comp_plan && <div className="text-[10px] text-steel-500">comp {u.comp_plan}</div>}
              <form action={A.grantCompAction} className="mt-1 flex gap-1"><input type="hidden" name="user_id" value={u.id} /><select name="plan" className="input py-1 text-xs"><option value="basic">basic</option><option value="pro">pro</option><option value="none">{t("admin.revoke")}</option></select><input name="days" type="number" defaultValue={30} min={1} className="input w-16 py-1 text-xs" aria-label="days" /><button className="btn-outline btn-sm">{t("admin.grant")}</button></form></td>
            <td className="text-center">{u.disabled_at ? <span className="tag bg-red-100 text-red-700">{t("admin.disabled")}</span> : <span className="tag bg-emerald-100 text-emerald-800">{t("admin.active")}</span>}</td>
            <td className="text-center"><form action={A.toggleDisabledAction}><input type="hidden" name="user_id" value={u.id} /><input type="hidden" name="disable" value={u.disabled_at ? "0" : "1"} /><button className="btn-outline btn-sm" disabled={u.id === v.user.id}>{u.disabled_at ? t("admin.enable") : t("admin.disable")}</button></form></td></tr>); })}</tbody></table></div></div>
  );
}

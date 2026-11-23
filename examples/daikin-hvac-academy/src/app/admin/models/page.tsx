import { requireViewer } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { query } from "@/lib/db";
import { CATEGORIES } from "@/lib/categories";
import * as A from "@/app/actions/admin";

export const dynamic = "force-dynamic";

export default async function Models({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams; const v = await requireViewer("/admin/models"); if (v.user.role === "student") redirect("/dashboard"); const { t } = await getT();
  const admin = v.user.role === "admin";
  const sources = await query<any>("SELECT * FROM technical_sources ORDER BY created_at DESC");
  const models = await query<any>("SELECT m.*,t.title AS source_title,t.approved FROM equipment_models m LEFT JOIN technical_sources t ON t.id=m.source_id ORDER BY m.model_number");
  const chunks = await query<{ source_id: string; n: number }>("SELECT source_id,count(*)::int AS n FROM knowledge_chunks GROUP BY source_id");
  return (
    <div className="space-y-6"><h1 className="text-3xl font-extrabold text-navy-900">{t("admin.models")}</h1><p className="text-sm text-steel-600">{t("admin.models_note")}</p>
      {sp.saved && <p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-800">{t("admin.saved")}</p>}{sp.error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{t(`err.${sp.error}`)}</p>}

      <section className="card p-5"><h2 className="mb-3 text-lg font-bold text-navy-900">{t("admin.sources")}</h2>
        <ul className="divide-y divide-steel-100 text-sm">{sources.map((s: any) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><span><b>{s.title}</b> · {s.revision ?? "—"} · <span className="text-xs text-steel-500">{s.reference ?? "—"}</span><br /><span className="text-xs text-steel-500">{t("admin.rights")}: {s.rights_note ?? "—"} · {chunks.find((c) => c.source_id === s.id)?.n ?? 0} {t("admin.passages")}</span></span>
          <span className="flex items-center gap-2"><span className={`tag ${s.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{s.approved ? t("admin.approved") : t("specs.not_approved")}</span>
            {admin && <form action={A.approveSourceAction}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="approve" value={s.approved ? "0" : "1"} /><button className="btn-outline btn-sm">{s.approved ? t("admin.revoke") : t("admin.approve")}</button></form>}</span></li>)}</ul>
        <form action={A.createSourceAction} className="mt-4 grid gap-2 md:grid-cols-3"><input name="title" required placeholder={t("admin.source_title")} className="input" /><input name="revision" placeholder={t("admin.revision")} className="input" /><input name="reference" placeholder={t("admin.reference")} className="input" />
          <input name="doc_type" placeholder="installation_manual" className="input" /><input name="manufacturer" defaultValue="Daikin" className="input" /><input name="rights_note" placeholder={t("admin.rights_ph")} className="input" /><button className="btn-navy btn-sm w-fit">+ {t("admin.add")}</button></form></section>

      {admin && <section className="card p-5"><h2 className="mb-1 text-lg font-bold text-navy-900">{t("admin.add_passage")}</h2><p className="mb-3 text-xs text-steel-500">{t("admin.passage_note")}</p>
        <form action={A.addKnowledgeAction} className="grid gap-2"><select name="source_id" required className="input"><option value="">—</option>{sources.filter((s: any) => s.approved).map((s: any) => <option key={s.id} value={s.id}>{s.title} {s.revision ?? ""}</option>)}</select>
          <input name="page_ref" placeholder={t("admin.page_ref")} className="input" /><textarea name="content" rows={4} required maxLength={4000} className="input" /><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="model_specific" />{t("admin.model_specific")}</label><button className="btn-navy btn-sm w-fit">+ {t("admin.add")}</button></form></section>}

      <section className="card p-5"><h2 className="mb-3 text-lg font-bold text-navy-900">{t("admin.equipment_models")}</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs uppercase text-steel-500"><th className="py-2 text-start">{t("admin.model_no")}</th><th>{t("courses.category")}</th><th>{t("admin.refrigerant")}</th><th>{t("admin.source")}</th><th>{t("admin.status")}</th></tr></thead>
          <tbody>{models.map((m: any) => <tr key={m.id} className="border-t border-steel-100 text-center"><td className="py-2 text-start font-mono font-semibold">{m.model_number}{m.is_placeholder && <span className="tag ms-2 bg-amber-100 text-amber-800">{t("tag.placeholder")}</span>}</td><td>{m.category}</td><td>{m.refrigerant ?? "—"}</td><td className="text-xs">{m.source_title ?? "—"}</td>
            <td>{m.verified ? <span className="tag bg-emerald-100 text-emerald-800">{t("tag.verified")}</span> : <span className="tag bg-steel-200">{t("tag.unverified")}</span>} {admin && !m.is_placeholder && <form action={A.verifyModelAction} className="inline"><input type="hidden" name="id" value={m.id} /><input type="hidden" name="verify" value={m.verified ? "0" : "1"} /><button className="ms-1 text-xs font-bold text-accent-dark">{m.verified ? t("admin.unverify") : t("admin.verify")}</button></form>}</td></tr>)}</tbody></table></div>
        <form action={A.createModelAction} className="mt-4 grid gap-2 md:grid-cols-5"><input name="model_number" required placeholder={t("admin.model_no")} className="input font-mono" /><select name="category" className="input">{CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.en}</option>)}</select><input name="series" placeholder={t("admin.series")} className="input" /><input name="refrigerant" placeholder="R-410A / R-32 / R-134a…" className="input" />
          <select name="source_id" className="input"><option value="">{t("admin.source")}</option>{sources.map((s: any) => <option key={s.id} value={s.id}>{s.title}</option>)}</select><button className="btn-navy btn-sm w-fit">+ {t("admin.add")}</button></form></section></div>
  );
}

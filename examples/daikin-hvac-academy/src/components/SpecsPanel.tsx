import type { SpecDisplay } from "@/lib/content-rules";
import type { TFn } from "@/lib/i18n";

export function SpecsPanel({ specs, t, sources }: {
  specs: SpecDisplay[]; t: TFn;
  sources: { title: string; revision: string | null; reference: string | null; approved: boolean; page_ref: string | null }[];
}) {
  if (specs.length === 0 && sources.length === 0) {
    return <aside className="my-6 rounded border border-steel-200 bg-white p-4 text-sm text-steel-600">{t("specs.generic_note")}</aside>;
  }
  return (
    <section className="card my-6 overflow-hidden" aria-label={t("specs.title")}>
      <div className="border-b border-steel-200 bg-navy-50 px-5 py-3"><h2 className="text-lg font-bold text-navy-900">{t("specs.title")}</h2><p className="text-xs text-steel-600">{t("specs.intro")}</p></div>
      {specs.length > 0 && (
        <ul className="divide-y divide-steel-100">
          {specs.map((s, i) => (
            <li key={i} className="px-5 py-3 text-sm">
              <p className="font-semibold text-navy-900">{s.label}</p>
              {s.kind === "confirmed" ? (
                <p className="mt-1"><span className="text-base font-bold">{s.value}{s.unit ? ` ${s.unit}` : ""}</span>
                  {s.condition && <span className="text-steel-600"> — {s.condition}</span>}<br />
                  <span className="text-xs text-steel-500">{t("specs.model")}: {s.model} · {s.source} ({t("specs.rev")} {s.revision}) · {t("specs.page")}: {s.page}</span></p>
              ) : (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-amber-800"><span className="tag bg-amber-100">{t("specs.withheld")}</span>
                  <span className="text-xs">{t("specs.withheld_body")}{s.model ? ` (${s.model})` : ""} · {t("specs.missing")}: {s.missing.map((m) => t(`specs.m.${m}`)).join(", ")}</span></p>
              )}
            </li>))}
        </ul>
      )}
      {sources.length > 0 && (
        <div className="border-t border-steel-200 px-5 py-3 text-xs text-steel-600">
          <p className="mb-1 font-semibold uppercase tracking-wide">{t("specs.sources")}</p>
          <ul className="space-y-0.5">{sources.map((s, i) => <li key={i}>{s.title}{s.revision ? ` — ${t("specs.rev")} ${s.revision}` : ""}{s.page_ref ? ` — ${s.page_ref}` : ""} {s.approved ? "✓" : `(${t("specs.not_approved")})`}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

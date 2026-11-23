import type { FlowStep } from "@/lib/courses";
import type { Locale, TFn } from "@/lib/i18n";

export function FlowChart({ steps, locale, t }: { steps: FlowStep[]; locale: Locale; t: TFn }) {
  return (
    <section aria-label={t("lesson.flowchart")} className="card my-6 p-5">
      <h2 className="mb-4 text-lg font-bold text-navy-900">{t("lesson.flowchart")}</h2>
      <ol className="relative space-y-0">
        {steps.map((s, i) => (
          <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute start-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 bg-steel-300" />}
            <span className={`z-10 grid h-8 w-8 shrink-0 place-items-center text-xs font-bold text-white ${s.decision ? "rotate-45 rounded-sm bg-amber-600" : "rounded-full bg-navy-700"}`}>
              <span className={s.decision ? "-rotate-45" : ""}>{i + 1}</span>
            </span>
            <div className="pt-0.5">
              <p className="font-semibold text-navy-900">{(locale === "ar" && s.title_ar) || s.title}
                {s.holdpoint && <span className="tag ms-2 bg-red-100 text-red-700">{t("lesson.hold_point")}</span>}
                {s.decision && <span className="tag ms-2 bg-amber-100 text-amber-800">{t("lesson.decision")}</span>}</p>
              {(s.detail || s.detail_ar) && <p className="text-sm text-steel-600">{(locale === "ar" && s.detail_ar) || s.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

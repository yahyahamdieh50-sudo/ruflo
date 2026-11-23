import type { TFn } from "@/lib/i18n";

export const FreePreviewTag = ({ t }: { t: TFn }) => <span className="tag bg-emerald-100 text-emerald-800">{t("tag.free_preview")}</span>;
export const TierTag = ({ tier, t }: { tier: "basic" | "pro" | "free"; t: TFn }) => (
  <span className={`tag ${tier === "pro" ? "bg-navy-800 text-white" : tier === "basic" ? "bg-accent/15 text-accent-dark" : "bg-steel-200 text-steel-700"}`}>{t(`tier.${tier}`)}</span>
);
export const LevelTag = ({ level, t }: { level: string; t: TFn }) => <span className="tag bg-steel-200 text-steel-700">{t(`level.${level}`)}</span>;
export const SampleTag = ({ t }: { t: TFn }) => <span className="tag bg-amber-100 text-amber-800">{t("tag.sample")}</span>;
export const VerifiedTag = ({ ok, t }: { ok: boolean; t: TFn }) => (
  <span className={`tag ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{ok ? t("tag.verified") : t("tag.generic")}</span>
);
export function Stars({ value, count }: { value: number | null; count: number }) {
  if (!value) return <span className="text-xs text-steel-500">—</span>;
  return <span className="text-xs text-amber-600" aria-label={`${value.toFixed(1)} / 5`}>{"★".repeat(Math.round(value))}<span className="text-steel-300">{"★".repeat(5 - Math.round(value))}</span> <span className="text-steel-500">({count})</span></span>;
}

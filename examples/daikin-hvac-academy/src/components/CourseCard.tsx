import Link from "next/link";
import type { CourseCard as Card } from "@/lib/courses";
import { pick } from "@/lib/courses";
import type { Locale, TFn } from "@/lib/i18n";
import { categoryBySlug } from "@/lib/categories";
import { EquipmentArt } from "./EquipmentArt";
import { FreePreviewTag, LevelTag, SampleTag, Stars, TierTag } from "./Badges";

export function CourseCard({ c, t, locale }: { c: Card; t: TFn; locale: Locale }) {
  const soon = c.status === "coming_soon";
  const cat = categoryBySlug(c.category);
  return (
    <Link href={`/courses/${c.slug}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="relative">
        {c.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.image_url} alt="" className="aspect-[5/3] w-full object-cover" /> : <EquipmentArt slug={c.category} className="aspect-[5/3] w-full" />}
        <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
          {!soon && <FreePreviewTag t={t} />}
          {soon && <span className="tag bg-steel-800 text-white">{t("tag.coming_soon")}</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-dark">{locale === "ar" ? cat?.ar : cat?.en}</p>
        <h3 className="mt-1 text-lg font-bold leading-snug text-navy-900 group-hover:text-accent-dark">{pick(c, "title", locale)}</h3>
        <p className="mt-2 line-clamp-3 text-sm text-steel-600">{pick(c, "summary", locale)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2"><LevelTag level={c.level} t={t} /><TierTag tier={c.tier} t={t} />{c.is_sample && !soon && <SampleTag t={t} />}</div>
        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-steel-600">
          <span>{soon ? t("course.syllabus_only") : `${c.lesson_count} ${t("course.lessons")} · ${Math.round(c.duration_min / 6) / 10} ${t("course.hours")}`}</span>
          <Stars value={c.rating_avg} count={c.rating_count} />
        </div>
      </div>
    </Link>
  );
}

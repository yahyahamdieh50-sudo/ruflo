import type { TFn } from "@/lib/i18n";

/** Video is always served through an entitlement-checked route; never a public file URL. */
export function MediaPlayer({ src, hasVideo, subtitles, t, label }: { src: string; hasVideo: boolean; subtitles?: ("en" | "ar")[]; t: TFn; label: string }) {
  if (!hasVideo) {
    return (
      <div className="grid aspect-video place-items-center rounded-lg bg-navy-900 p-6 text-center text-steel-300" role="img" aria-label={t("media.placeholder")}>
        <div><p className="text-4xl" aria-hidden>▶</p><p className="mt-2 font-semibold text-white">{t("media.placeholder")}</p><p className="mt-1 text-sm">{t("media.placeholder_body")}</p></div>
      </div>
    );
  }
  return (
    <video className="aspect-video w-full rounded-lg bg-black" controls playsInline preload="metadata" controlsList="nodownload" aria-label={label}>
      <source src={src} />
      {subtitles?.map((l) => <track key={l} kind="subtitles" srcLang={l} label={l === "ar" ? "العربية" : "English"} src={`${src.replace("/api/media/", "/api/subtitles/")}/${l}`} />)}
    </video>
  );
}

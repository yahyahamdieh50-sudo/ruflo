import { dictEn, dictAr } from "./i18n-dict";

export type Locale = "en" | "ar";
export const LOCALES: Locale[] = ["en", "ar"];
export const dir = (l: Locale) => (l === "ar" ? "rtl" : "ltr");

const dicts: Record<Locale, Record<string, string>> = { en: dictEn, ar: dictAr };

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = dicts[locale][key] ?? dicts.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
export type TFn = (key: string, vars?: Record<string, string | number>) => string;

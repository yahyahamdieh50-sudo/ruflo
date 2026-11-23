import "server-only";
import { cookies } from "next/headers";
import { translate, dir, type Locale, type TFn } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get("lang")?.value;
  return c === "ar" ? "ar" : "en";
}

export async function getT(): Promise<{ t: TFn; locale: Locale; dir: "ltr" | "rtl" }> {
  const locale = await getLocale();
  return { t: (k, v) => translate(locale, k, v), locale, dir: dir(locale) };
}

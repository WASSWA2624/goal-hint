import { publicPolicy } from "../domain/public-policy.ts";

export type Locale = (typeof publicPolicy.locales)[number];

export function isSupportedLocale(value: string): value is Locale {
  return publicPolicy.locales.some((locale) => locale === value);
}

export function resolveLocale(value?: string): Locale {
  return value && isSupportedLocale(value) ? value : publicPolicy.defaultLocale;
}

let languages: Intl.DisplayNames | undefined;
/** Only real language tags fall back; `/faq` or `/app` must 404, not soft-redirect to the home page. */
function isLanguageTag(value: string): boolean {
  languages ??= new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
  try { return languages.of(value) !== undefined; } catch { return false; }
}

/** Fall back without publishing an untranslated URL; preserve the remaining path. */
export function getLocaleRedirect(pathname: string): string | null {
  const match = /^\/([a-z]{2,3}(?:-[a-z0-9]{2,8})*)(?=\/|$)/i.exec(pathname);
  const requested = match?.[1];
  if (!requested || isSupportedLocale(requested) || !isLanguageTag(requested)) return null;
  return `/${resolveLocale(requested)}${pathname.slice(match[0].length)}`;
}

import { resolveLocale } from "../i18n/locales.ts";

/** Dependency-light paths for the root layout's client code; the feed helpers stay in navigation.ts. */
export const informationPages = ["help", "privacy", "terms", "contact"] as const;
export type InformationPage = (typeof informationPages)[number];

export function homeHref(locale?: string): string {
  return `/${resolveLocale(locale)}`;
}

export function matchesHref(locale?: string): string {
  return `${homeHref(locale)}/matches`;
}

export function performanceHref(locale?: string): string {
  return `${homeHref(locale)}/performance`;
}

export function informationHref(page: InformationPage, locale?: string): string {
  return `${homeHref(locale)}/${page}`;
}

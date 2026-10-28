import { resolveLocale } from "../i18n/locales.ts";
import type { NavigationLocation } from "./navigation.ts";

/** Dependency-light paths for the root layout's client code; the feed helpers stay in navigation.ts. */
export const informationPages = ["help", "privacy", "terms", "contact"] as const;
export type InformationPage = (typeof informationPages)[number];

/** Legacy feed sections share the Matches destination in both navigation bars. */
export function normalizeNavigationLocation(location?: NavigationLocation): NavigationLocation | undefined {
  return location === "live" || location === "results" ? "today" : location;
}

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

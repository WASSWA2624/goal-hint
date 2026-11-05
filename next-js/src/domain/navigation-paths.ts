import { resolveLocale } from "../i18n/locales.ts";
import type { NavigationLocation } from "./navigation.ts";

/** Dependency-light paths for the root layout's client code; the feed helpers stay in navigation.ts. */
export const informationPages = ["contact", "help", "privacy", "terms"] as const;
export type InformationPage = (typeof informationPages)[number];

/** Legacy feed sections share the Matches destination in both navigation bars. */
export function normalizeNavigationLocation(location?: NavigationLocation): NavigationLocation | undefined {
  return location === "live" || location === "results" ? "today" : location;
}

export function localePath(locale?: string): string {
  return `/${resolveLocale(locale)}`;
}

export function matchesHref(locale?: string): string {
  return `${localePath(locale)}/matches`;
}

export function homeHref(locale?: string): string {
  return matchesHref(locale);
}

export function bestSlipsHref(locale?: string): string {
  return `${localePath(locale)}/best-slips`;
}

export function performanceHref(locale?: string): string {
  return `${localePath(locale)}/performance`;
}

export function informationHref(page: InformationPage, locale?: string): string {
  return `${localePath(locale)}/${page}`;
}

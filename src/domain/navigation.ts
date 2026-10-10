import { addReportingDays, parseReportingDate, type ReportingDate } from "./calendar.ts";
import { resolveLocale } from "../i18n/locales.ts";
import { feedDefaults, parseFeedStatus, type FeedStatus } from "./feed-query.ts";

export { feedDefaults } from "./feed-query.ts";
export type { FeedStatus } from "./feed-query.ts";
export type FeedView = Readonly<{ date: ReportingDate; status: FeedStatus }>;
export type FeedEntry = "today" | "results";
export type AppSection = FeedEntry | "live";
export const informationPages = ["how-it-works", "privacy", "terms", "contact"] as const;
export type InformationPage = (typeof informationPages)[number];
export type NavigationLocation = AppSection | InformationPage;

/** Both entry points select the same feed. Results starts with yesterday's finals. */
export function getFeedEntry(today: ReportingDate, entry: FeedEntry): FeedView {
  const defaults = feedDefaults[entry];
  return { date: addReportingDays(today, defaults.dayOffset), status: defaults.status };
}

export function parseFeedView(date: unknown, status?: string | string[]): FeedView {
  return { date: parseReportingDate(date), status: parseFeedStatus(status) };
}

export function homeHref(locale?: string): string {
  return `/${resolveLocale(locale)}`;
}

export function feedHref(view: FeedView, locale?: string): string {
  const parsed = parseFeedView(view.date, view.status);
  const path = `${homeHref(locale)}/predictions/${parsed.date}`;
  return parsed.status === feedDefaults.today.status ? path : `${path}?status=${parsed.status}`;
}

export function performanceHref(locale?: string): string {
  return `${informationHref("how-it-works", locale)}#performance`;
}

export function informationHref(page: InformationPage, locale?: string): string {
  return `${homeHref(locale)}/${page}`;
}

/** Detail API supplies canonical identity/slug; page rendering belongs to prompt 035. */
export function matchHref(fixtureId: string, slug: string, locale?: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(fixtureId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new RangeError("Match links require a safe fixture ID and canonical slug.");
  }
  return `${homeHref(locale)}/matches/${fixtureId}/${slug}`;
}

/** The feed stores its current URL here so the match page can return to the same filters. */
export const feedReturnStorageKey = "goalhint:feed-href";

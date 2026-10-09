import { addReportingDays, parseReportingDate, type ReportingDate } from "./calendar.ts";
import { resolveLocale } from "../i18n/locales.ts";

export type FeedStatus = "all" | "finished";
export type FeedView = Readonly<{ date: ReportingDate; status: FeedStatus }>;
export type FeedEntry = "today" | "results";
export const informationPages = ["how-it-works", "privacy", "terms", "contact"] as const;
export type InformationPage = (typeof informationPages)[number];
export type NavigationLocation = FeedEntry | InformationPage;

/** Both entry points select the same feed. Results starts with yesterday's finals. */
export const feedDefaults = Object.freeze({
  today: Object.freeze({ dayOffset: 0, status: "all" }),
  results: Object.freeze({ dayOffset: -1, status: "finished" }),
} as const);

export function getFeedEntry(today: ReportingDate, entry: FeedEntry): FeedView {
  const defaults = feedDefaults[entry];
  return { date: addReportingDays(today, defaults.dayOffset), status: defaults.status };
}

export function parseFeedView(date: unknown, status?: string | string[]): FeedView {
  const selectedStatus = status ?? feedDefaults.today.status;
  if (selectedStatus !== "all" && selectedStatus !== "finished") {
    throw new RangeError("Unsupported feed status.");
  }
  return { date: parseReportingDate(date), status: selectedStatus };
}

export function homeHref(locale?: string): string {
  return `/${resolveLocale(locale)}`;
}

export function feedHref(view: FeedView, locale?: string): string {
  const parsed = parseFeedView(view.date, view.status);
  const path = `${homeHref(locale)}/predictions/${parsed.date}`;
  return parsed.status === feedDefaults.today.status ? path : `${path}?status=${parsed.status}`;
}

export function informationHref(page: InformationPage, locale?: string): string {
  return `${homeHref(locale)}/${page}`;
}

/** Canonical identity/slug resolution belongs to prompt 035; do not invent fixture pages. */
export function matchHref(fixtureId: string, slug: string, locale?: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(fixtureId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new RangeError("Match links require a safe fixture ID and canonical slug.");
  }
  return `${homeHref(locale)}/matches/${fixtureId}/${slug}`;
}

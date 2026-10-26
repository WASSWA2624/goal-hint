import { performanceHref } from "./navigation-paths.ts";
import type { PerformanceResponse } from "./performance.ts";

export type PerformancePageFilters = PerformanceResponse["filters"] & Readonly<{ from: string; to: string; leaguePage?: number }>;

/** Page links pin the reporting period and retain the selected prediction cohort. */
export function performancePageHref(filters: PerformancePageFilters, page = 1, locale = "en"): string {
  if (!Number.isSafeInteger(page) || page < 1 || page > 9999) throw new RangeError("Invalid performance page.");
  const query = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.market !== "all") query.set("market", filters.market);
  if (filters.source !== "combined") query.set("source", filters.source);
  if (filters.model !== null) query.set("model", filters.model);
  if (filters.version !== null) query.set("version", filters.version);
  const leaguePage = filters.leaguePage ?? 1;
  if (!Number.isSafeInteger(leaguePage) || leaguePage < 1 || leaguePage > 9999) throw new RangeError("Invalid league page.");
  if (leaguePage !== 1) query.set("leaguePage", String(leaguePage));
  if (page !== 1) query.set("page", String(page));
  return `${performanceHref(locale)}?${query}`;
}

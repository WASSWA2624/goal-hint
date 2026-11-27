"use server";

import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { performancePageHref, type PerformancePageFilters } from "@/domain/performance-page";
import { parsePerformancePageQuery, performancePageSize } from "@/server/performance/performance-page";
import { readPublicPerformance } from "@/server/performance/public-performance";
import { readPublishedSlipHistory } from "@/server/slips/published-slips";

function readQuery(filters: PerformancePageFilters, page: number) {
  const at = utcInstantFromEpochMilliseconds(Date.now());
  const href = performancePageHref(filters, page);
  const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
  return parsePerformancePageQuery(Object.fromEntries(query), getReportingDate(at));
}

export async function loadPerformanceLeagues(filters: PerformancePageFilters, leaguePage: number) {
  const { parameters } = readQuery({ ...filters, leaguePage }, 1);
  return (await readPublicPerformance(parameters)).leagues;
}

export async function loadPerformancePublications(filters: PerformancePageFilters, page: number) {
  const { query, slipStatus } = readQuery(filters, page);
  const history = await readPublishedSlipHistory({ from: query.range.startDate, to: query.range.endDate, page, pageSize: performancePageSize,
    ...(slipStatus ? { status: slipStatus } : {}) });
  return history ? { page: history.page, pageSize: history.pageSize, total: history.total, records: history.records } : null;
}

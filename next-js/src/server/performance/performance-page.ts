import "server-only";

import type { ReportingDate } from "../../domain/calendar.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { parsePerformanceQuery, type PerformanceQuery } from "./performance-query.ts";
import { predictionResults, type PredictionResult } from "../../domain/performance-summary.ts";

export const performancePageSize = 20;
export type PerformancePageQuery = Readonly<{ query: PerformanceQuery; parameters: URLSearchParams; page: number; slipStatus?: PredictionResult }>;

/** Strict public GET filters; slip pagination and outcomes never reach the prediction report query. */
export function parsePerformancePageQuery(input: Readonly<Record<string, string | string[] | undefined>>, today: ReportingDate): PerformancePageQuery {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) throw new MatchFeedError("invalid-query");
    if (value !== undefined) parameters.append(key, value);
  }
  const rawPage = parameters.get("page") ?? "1";
  if (!/^[1-9]\d{0,3}$/u.test(rawPage)) throw new MatchFeedError("invalid-query");
  const page = Number(rawPage);
  parameters.delete("page");
  const slipStatus = parameters.get("slipStatus");
  if (slipStatus !== null && !predictionResults.some(result => result === slipStatus)) throw new MatchFeedError("invalid-query");
  parameters.delete("slipStatus");
  const query = parsePerformanceQuery(parameters, today);
  return { query, parameters, page, ...(slipStatus === null ? {} : { slipStatus: slipStatus as PredictionResult }) };
}


import "server-only";

import { z } from "zod";
import { addReportingDays, validateReportingDateRange, type ReportingDate } from "../../domain/calendar.ts";
import { matchFeedRules } from "../../domain/match-feed.ts";
import { performanceFamilies, performanceRules, performanceSourceSchema } from "../../domain/performance.ts";
import { MatchFeedError } from "../matches/feed-error.ts";

const schema = z.strictObject({ market: z.enum(["all", ...performanceFamilies]).default("all"),
  from: z.string().optional(), to: z.string().optional(), source: performanceSourceSchema.default("combined"),
  model: z.string().regex(/^[a-f0-9]{64}$/u).optional(), version: z.string().trim().min(1).max(128).regex(/^[\w.:/-]+$/u).optional(),
}).refine((v) => (v.from === undefined) === (v.to === undefined) && !(v.model && v.source === "api-football"));
export function parsePerformanceQuery(parameters: URLSearchParams, today: ReportingDate) {
  try {
    if (Buffer.byteLength(parameters.toString(), "utf8") > matchFeedRules.maximumQueryBytes) throw new Error();
    const entries = [...parameters];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error();
    const query = schema.parse(Object.fromEntries(entries));
    const range = validateReportingDateRange(query.from ?? addReportingDays(today, 1 - performanceRules.defaultDays), query.to ?? today, performanceRules.maximumDays);
    if (range.startDate < "1000-01-02") throw new Error();
    return { market: query.market, source: query.source, model: query.model ?? null, version: query.version ?? null, range };
  } catch { throw new MatchFeedError("invalid-query"); }
}
export type PerformanceQuery = ReturnType<typeof parsePerformanceQuery>;

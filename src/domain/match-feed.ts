import { z } from "zod";
import { parseReportingDate } from "./calendar.ts";
import { feedQueryRules } from "./feed-query.ts";
import { fixtureSnapshotSchema, fixtureCycleSchema, fixtureUpdateSchema, unavailableMarketSchema } from "./fixture-snapshot.ts";

export const matchFeedRules = Object.freeze({ maximumQueryBytes: 2048, maximumResponseBytes: 1_048_576,
  searchWindowMs: 60_000, searchRequestsPerWindow: 120 });
const date = z.string().refine((value) => { try { parseReportingDate(value); return true; } catch { return false; } });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const at = z.number().int();
const page = count.min(1).max(feedQueryRules.maximumPage);
const pageLink = z.string().max(4096).startsWith("/api/matches?").nullable();
export const matchFeedRecordSchema = fixtureSnapshotSchema.safeExtend({ cycle: fixtureCycleSchema.nullable(),
  unavailableMarkets: z.array(unavailableMarketSchema).max(4), update: fixtureUpdateSchema,
  availabilityMessage: z.string().max(256).nullable(), scorePeriod: z.enum(["regulation", "live"]).nullable() });
export const matchFeedResponseSchema = z.strictObject({
  records: z.array(matchFeedRecordSchema).max(feedQueryRules.maximumPageSize), page, nextPage: page.nullable(), previousPage: page.nullable(),
  pageSize: count.min(1).max(feedQueryRules.maximumPageSize), total: count, totalPages: count,
  links: z.strictObject({ next: pageLink, previous: pageLink }),
  asOf: at, today: date, range: z.strictObject({ from: date, to: date, startInclusive: at, endExclusive: at }),
  state: z.enum(["ready", "no-fixtures", "no-filter-matches", "insufficient-data", "data-unavailable", "page-out-of-range"]),
  message: z.string().max(512).nullable(),
  coverage: z.strictObject({ partial: z.boolean(), knownFixtures: count, matchingWithMarket: count,
    dates: z.array(z.strictObject({ date, status: z.enum(["complete", "partial", "degraded", "failed", "unknown", "pending"]),
      observedAt: at.nullable(), authoritative: z.boolean() })).min(1).max(7) }),
  run: z.strictObject({ id: z.uuid().nullable(), sequence: z.string().regex(/^[1-9]\d*$/u).nullable(), date,
    phase: z.enum(["not-started", "selecting", "updating", "complete", "partial"]), total: count.nullable(),
    completed: count, terminal: count, failed: count, published: count, partialCoverage: z.boolean(), message: z.string().max(256).nullable() }).nullable(),
}).superRefine((value, ctx) => {
  if (value.records.length !== Math.min(value.pageSize, Math.max(0, value.total - (value.page - 1) * value.pageSize)) ||
    value.totalPages !== Math.ceil(value.total / value.pageSize) ||
    new Set(value.records.map((record) => record.fixtureId)).size !== value.records.length ||
    value.nextPage !== null && value.nextPage !== value.page + 1 || value.previousPage !== null && value.previousPage >= value.page ||
    (value.links.next === null) !== (value.nextPage === null) || (value.links.previous === null) !== (value.previousPage === null) ||
    value.coverage.partial !== value.coverage.dates.some((entry) => !entry.authoritative) ||
    value.coverage.dates.some((entry) => entry.authoritative !== (entry.status === "complete")) ||
    value.coverage.matchingWithMarket > value.total || value.total > value.coverage.knownFixtures ||
    value.run && (value.run.completed + value.run.failed !== value.run.terminal || value.run.total !== null &&
      (value.run.terminal > value.run.total || value.run.published > value.run.total))) {
    ctx.addIssue({ code: "custom", message: "Incoherent match feed page." });
  }
});
export type MatchFeedResponse = z.infer<typeof matchFeedResponseSchema>;
export type MatchFeedRecord = z.infer<typeof matchFeedRecordSchema>;
export const matchFeedErrorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(["invalid-query", "rate-limited", "unavailable"]), message: z.string().max(256),
  recoverable: z.boolean(), retryAfterSeconds: z.number().int().positive().max(60).nullable(),
}) });

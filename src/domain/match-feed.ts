import { z } from "zod";
import { parseReportingDate } from "./calendar.ts";
import { feedQueryRules, maximumCompetitionScope } from "./feed-query.ts";
import { isSafeRemoteImageUrl } from "./remote-image.ts";
import { fixtureSnapshotSchema, storedFixtureSnapshotSchema, fixtureCycleSchema, fixturePriceSchema, fixtureUpdateSchema, unavailableMarketSchema } from "./fixture-snapshot.ts";
import { contentAccessSchema } from "./content-access.ts";
import { isFreeFixture } from "./paywall.ts";

export { matchFeedRules } from "./match-feed-rules.ts";
const date = z.string().refine((value) => { try { parseReportingDate(value); return true; } catch { return false; } });
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const at = z.number().int();
const page = count.min(1).max(feedQueryRules.maximumPage);
const pageLink = z.string().max(4096).startsWith("/api/matches?").nullable();
const recordFields = { cycle: fixtureCycleSchema.nullable(),
  unavailableMarkets: z.array(unavailableMarketSchema).max(4), update: fixtureUpdateSchema,
  availabilityMessage: z.string().max(256).nullable(), scorePeriod: z.enum(["regulation", "live"]).nullable(),
  /** Prices for the published picks (052); empty while odds display rights are not recorded. */
  prices: z.array(fixturePriceSchema).max(4).default([]) };
export const storedMatchFeedRecordSchema = storedFixtureSnapshotSchema.safeExtend(recordFields);
export const matchFeedRecordSchema = fixtureSnapshotSchema.safeExtend(recordFields);
export const dailyRunProgressSchema = z.strictObject({ id: z.uuid().nullable(), sequence: z.string().regex(/^[1-9]\d*$/u).nullable(), date,
    phase: z.enum(["not-started", "selecting", "updating", "complete", "partial"]), total: count.nullable(),
    completed: count, terminal: count, failed: count, published: count, partialCoverage: z.boolean(), message: z.string().max(256).nullable() })
  .refine((run) => run.completed + run.failed === run.terminal && (run.total === null || run.terminal <= run.total && run.published <= run.total),
    { message: "Incoherent daily-run counts." }).nullable();
const storedFeedBaseSchema = z.strictObject({
  paginationVersion: z.string().regex(/^[a-f0-9]{64}$/u).nullable().default(null),
  leagues: z.array(z.strictObject({ id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/u),
    name: z.string().max(256).nullable(), country: z.string().max(128).nullable(),
    logoUrl: z.string().refine(isSafeRemoteImageUrl, "Unsafe logo URL.").nullable().default(null),
    /** Fixtures in the unfiltered date cohort, for ordering filter suggestions. */
    fixtures: count.default(0) })).max(maximumCompetitionScope).default([]),
  records: z.array(storedMatchFeedRecordSchema).max(feedQueryRules.maximumPageSize), page, nextPage: page.nullable(), previousPage: page.nullable(),
  pageSize: count.min(1).max(feedQueryRules.maximumPageSize), total: count, totalPages: count,
  links: z.strictObject({ next: pageLink, previous: pageLink }),
  asOf: at, today: date, range: z.strictObject({ from: date, to: date, startInclusive: at, endExclusive: at }),
  state: z.enum(["ready", "no-fixtures", "no-filter-matches", "insufficient-data", "data-unavailable", "page-out-of-range"]),
  message: z.string().max(512).nullable(),
  coverage: z.strictObject({ partial: z.boolean(), knownFixtures: count, matchingWithMarket: count,
    dates: z.array(z.strictObject({ date, status: z.enum(["complete", "partial", "degraded", "failed", "unknown", "pending"]),
      observedAt: at.nullable(), authoritative: z.boolean() })).min(1).max(feedQueryRules.maximumDays + 2) }),
  run: dailyRunProgressSchema,
  /** For a search: matches of every word directly (exact, alias, reordered or prefix) and similar results (spelling
   * slips, abbreviations, one of several named teams). Exact matches always precede similar ones in record order. */
  search: z.strictObject({ exact: count, similar: count }).nullable().default(null),
});
function refineFeed(value: Omit<z.infer<typeof storedFeedBaseSchema>, "records"> & { records: readonly { fixtureId: string }[] }, ctx: z.RefinementCtx) {
  if (value.records.length !== Math.min(value.pageSize, Math.max(0, value.total - (value.page - 1) * value.pageSize)) ||
    new Set(value.leagues.map((league) => league.id)).size !== value.leagues.length ||
    value.totalPages !== Math.ceil(value.total / value.pageSize) ||
    new Set(value.records.map((record) => record.fixtureId)).size !== value.records.length ||
    value.nextPage !== null && value.nextPage !== value.page + 1 || value.previousPage !== null && value.previousPage >= value.page ||
    (value.links.next === null) !== (value.nextPage === null) || (value.links.previous === null) !== (value.previousPage === null) ||
    value.coverage.partial !== value.coverage.dates.some((entry) => !entry.authoritative) ||
    value.coverage.dates.some((entry) => entry.authoritative !== (entry.status === "complete")) ||
    value.coverage.matchingWithMarket > value.total || value.total > value.coverage.knownFixtures ||
    value.search !== null && value.search.exact + value.search.similar !== value.total) {
    ctx.addIssue({ code: "custom", message: "Incoherent match feed page." });
  }
}
export const storedMatchFeedResponseSchema = storedFeedBaseSchema.superRefine(refineFeed);
export const matchFeedResponseSchema = z.strictObject({ ...storedFeedBaseSchema.shape,
  records: z.array(matchFeedRecordSchema).max(feedQueryRules.maximumPageSize), access: contentAccessSchema,
}).superRefine(refineFeed).refine((value) => value.access.tier === "full" || value.records.every((record) => isFreeFixture(record.status)
  || ((!record.forecast || "gated" in record.forecast) && record.prices.length === 0)), "Free responses cannot contain subscriber predictions.");
export type StoredMatchFeedResponse = z.infer<typeof storedMatchFeedResponseSchema>;
export type StoredMatchFeedRecord = z.infer<typeof storedMatchFeedRecordSchema>;
export type MatchFeedResponse = z.infer<typeof matchFeedResponseSchema>;
export type MatchFeedRecord = z.infer<typeof matchFeedRecordSchema>;
export const matchFeedErrorSchema = z.strictObject({ error: z.strictObject({
  code: z.enum(["invalid-query", "not-found", "rate-limited", "unavailable", "subscription-required"]), message: z.string().max(256),
  recoverable: z.boolean(), retryAfterSeconds: z.number().int().positive().max(60).nullable(),
}) });

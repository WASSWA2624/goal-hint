import { z } from "zod";
import { marketFamilySchema, publicForecastSchema, publicVoidReasonSchema, publishedFamiliesSchema, publicChanceSchema } from "./fixture-snapshot.ts";
import { isCompletedFixtureStatus, isPlayedFinalStatus } from "./market-settlement.ts";
import { dailyRunProgressSchema, matchFeedRecordSchema, storedMatchFeedRecordSchema } from "./match-feed.ts";
import { contentAccessSchema } from "./content-access.ts";
import { liveMatchSnapshotSchema } from "./live-match.ts";
import { inPlayOddsObservationSchema } from "./in-play-odds.ts";
import { publicExtendedMarketSnapshotSchema, total15OddsSchema } from "./extended-markets.ts";
import { marketSources } from "./markets.ts";
import { preMatchBookmakerOddsSchema } from "./bookmaker-odds.ts";

/** Why API-Football supplied a published market; "provider-first" is the reviewed baseline order with AI enabled. */
export const detailFallbackReasons = ["ai-failure", "ai-timeout", "ai-insufficient-evidence", "ai-budget-exhausted", "ai-missing-group",
  "ai-invalid-group", "provider-first", "provider-baseline"] as const;
export const matchDetailRules = Object.freeze({ defaultLimit: 10, maximumLimit: 20, maximumSequence: 4_294_967_295 });
const id = z.uuid(), at = publicForecastSchema.shape.publishedAt, sequence = z.number().int().positive().max(matchDetailRules.maximumSequence);
const explanation = z.strictObject({ text: z.string().min(1).max(4096), sourceUrls: z.array(z.url().startsWith("https://")).max(100) });
const source = z.strictObject({ id: z.string().max(128), publisher: z.string().max(512), title: z.string().max(2048),
  url: z.url().startsWith("https://").nullable(), publishedAt: at.nullable(), retrievedAt: at, providerUpdatedAt: at.nullable() });
export const detailCycleSchema = z.strictObject({ id, ordinal: sequence, state: z.enum(["open", "closed", "void"]),
  currentRevisionId: id.nullable(), lockedRevisionId: id.nullable(), kickoffAt: at, cutoffAt: at, openedAt: at,
  closedAt: at.nullable(), lockedAt: at.nullable(), voidedAt: at.nullable(), voidReason: publicVoidReasonSchema.nullable() });
export const detailRevisionSchema = z.strictObject({ revisionId: id, cycleId: id, runId: id, runSequence: z.string().regex(/^[1-9]\d*$/u),
  fixtureRevision: sequence, cycleRevision: sequence, fixtureDataVersion: matchFeedRecordSchema.shape.dataVersion,
  evidenceCutoffAt: at, generationCompletedAt: at, publishedAt: at });
export const detailPublicationSchema = detailRevisionSchema.extend({
  runDate: z.iso.date(), sources: z.array(z.enum(marketSources)).min(1).max(marketSources.length), cycle: detailCycleSchema,
}).refine((v) => v.cycleId === v.cycle.id && v.runSequence === v.runDate.replaceAll("-", "") && new Set(v.sources).size === v.sources.length,
  { message: "Incoherent publication provenance." });
export const storedDetailSnapshotSchema = publicForecastSchema.safeExtend({
  ...detailRevisionSchema.shape, historical: z.boolean(), applicability: z.enum(["current", "locked", "void", "historical"]), cycle: detailCycleSchema,
  markets: z.array(publicForecastSchema.shape.markets.element.safeExtend({
    alternatives: z.array(z.strictObject({ selection: z.string().max(32), probability: z.number().gt(0).lt(1) })).max(2),
    source: z.strictObject({ kind: z.enum(marketSources), provisional: z.boolean(),
      fallbackReason: z.enum(detailFallbackReasons).nullable(),
      sourceIds: z.array(z.string().max(128)).max(500) }),
    timestamps: z.strictObject({ generatedAt: at.nullable(), retrievedAt: at, providerUpdatedAt: at.nullable() }),
  })).max(4),
  unavailableMarkets: matchFeedRecordSchema.shape.unavailableMarkets,
  analysis: z.strictObject({ state: z.enum(["available", "withheld"]), reasons: z.array(explanation).max(4), uncertainty: explanation.nullable(),
    limitedNews: z.boolean(), sources: z.array(source).max(501) }).refine((v) => v.state === "available"
      ? v.reasons.length >= 2 && v.uncertainty !== null : v.reasons.length === 0 && v.uncertainty === null),
  outcomes: z.array(z.strictObject({ family: marketFamilySchema,
    cycleId: id, revisionId: id, selection: z.string().max(32), status: z.enum(["correct", "incorrect", "pending", "void"]),
    reason: z.enum(["verified-result", "awaiting-result", "result-correction", "void-cycle"]), explanation: z.string().max(512),
    settledAt: at.nullable(), correctedAt: at.nullable(), voidedAt: at.nullable() })).max(4),
}).superRefine((v, ctx) => {
  if (v.cycleId !== v.cycle.id || v.outcomes.some((o) => o.revisionId !== v.revisionId || o.cycleId !== v.cycleId ||
    !v.markets.some((m) => m.market.family === o.family && m.market.selection === o.selection)) ||
    v.applicability === "historical" && v.outcomes.length !== 0 ||
    v.applicability === "locked" && v.cycle.lockedRevisionId !== v.revisionId ||
    v.outcomes.some((o) => ["correct", "incorrect"].includes(o.status) && v.applicability !== "locked") ||
    v.markets.some((m) => m.source.kind !== m.market.source || m.alternatives.length !== Object.keys(m.market.probabilities).length - 1 ||
      new Set(m.alternatives.map((a) => a.selection)).size !== m.alternatives.length || m.alternatives.some((a) =>
        a.selection === m.market.selection || (m.market.probabilities as Readonly<Record<string, number>>)[a.selection] !== a.probability)) ||
    new Set([...v.markets.map((m) => m.market.family), ...v.unavailableMarkets.map((m) => m.family)]).size !== 4 ||
    v.markets.length + v.unavailableMarkets.length !== 4) ctx.addIssue({ code: "custom", message: "Incoherent revision identity or market group." });
});
const historyLink = z.string().max(4096).startsWith("/api/matches/").nullable();
const probabilityText = z.string().regex(/^0\.\d{12}$/u);
/** One complete bookmaker price group with de-margined implied probabilities (052). Labelled
 * "market-implied": never an AI or fallback estimate, never mixed into forecast groups, no bookmaker link. */
export const detailOddsGroupSchema = z.strictObject({
  label: z.literal("market-implied"),
  family: marketFamilySchema,
  basis: z.enum(["bookmaker", "median"]),
  method: z.string().regex(/^[a-z0-9-]+-v\d+$/u),
  overround: z.string().regex(/^\d\.\d{12}$/u),
  retrievedAt: at, providerUpdatedAt: at.nullable(),
  selections: z.array(z.strictObject({ selection: z.string().min(1).max(64), price: z.string().regex(/^[1-9]\d{0,3}\.\d{2}$/u),
    impliedProbability: probabilityText })).min(2).max(3),
}).refine((group) => new Set(group.selections.map((item) => item.selection)).size === group.selections.length, "Duplicate odds selection.");
export type DetailOddsGroup = z.infer<typeof detailOddsGroupSchema>;
const storedDetailBaseSchema = z.strictObject({ fixture: storedMatchFeedRecordSchema, asOf: at, run: dailyRunProgressSchema.default(null),
  /** Mutable odds envelope, read outside the immutable revision cache; empty without recorded display rights. */
  odds: z.array(detailOddsGroupSchema).max(4).default([]),
  /** Mutable match observations are independent of the immutable pre-match forecast. Undefined disables the feature. */
  liveMatch: liveMatchSnapshotSchema.nullable().optional(),
  inPlayOdds: inPlayOddsObservationSchema.nullable().optional(),
  bookmakerOdds: preMatchBookmakerOddsSchema.nullable().optional(),
  extendedMarkets: publicExtendedMarketSnapshotSchema.nullable().optional(),
  extendedOdds: total15OddsSchema.nullable().optional(),
  route: z.strictObject({ fixtureId: id, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160), path: z.string().max(512) }),
  currentRevisionId: id.nullable(), selection: z.enum(["applicable", "revision", "cycle"]), selectedCycle: detailCycleSchema.nullable(), snapshot: storedDetailSnapshotSchema.nullable(),
  history: z.strictObject({ limit: z.number().int().min(1).max(matchDetailRules.maximumLimit),
    revisions: z.strictObject({ anchor: sequence.or(z.literal(0)), entries: z.array(detailPublicationSchema).max(matchDetailRules.maximumLimit), next: historyLink }),
    cycles: z.strictObject({ anchor: sequence.or(z.literal(0)), entries: z.array(detailCycleSchema).max(matchDetailRules.maximumLimit), next: historyLink }) }),
});
export const gatedDetailSnapshotSchema = z.strictObject({ gated: z.literal(true), revisionId: id, cycleId: id, historical: z.boolean(),
  applicability: storedDetailSnapshotSchema.shape.applicability, publishedAt: at, families: publishedFamiliesSchema, probabilities: publicChanceSchema.max(0),
});
export const detailSnapshotSchema = z.union([storedDetailSnapshotSchema, gatedDetailSnapshotSchema]);
const wireDetailBaseSchema = z.strictObject({ ...storedDetailBaseSchema.shape, fixture: matchFeedRecordSchema,
  odds: z.array(detailOddsGroupSchema).max(4).optional(), snapshot: detailSnapshotSchema.nullable(), access: contentAccessSchema,
  history: z.union([storedDetailBaseSchema.shape.history, z.strictObject({ gated: z.literal(true) })]),
});
function refineDetail(v: z.infer<typeof wireDetailBaseSchema>, ctx: z.RefinementCtx) {
  const current = v.selection === "applicable" ? v.fixture.forecast : null;
  if (current && !("gated" in current) && v.snapshot && !("gated" in v.snapshot) && (current.runId !== v.snapshot.runId || current.runSequence !== undefined && current.runSequence !== v.snapshot.runSequence ||
    current.publishedAt !== v.snapshot.publishedAt || current.markets.length !== v.snapshot.markets.length || current.markets.some(({ market }) => {
      const counterpart = (v.snapshot as z.infer<typeof storedDetailSnapshotSchema>).markets.find((item) => item.market.family === market.family)?.market;
      return !counterpart || counterpart.source !== market.source || counterpart.selection !== market.selection ||
        Object.entries(market.probabilities).some(([key, probability]) => (counterpart.probabilities as Readonly<Record<string, number>>)[key] !== probability);
    }))) ctx.addIssue({ code: "custom", message: "Applicable forecast and detail must use one complete revision." });
  if (v.route.fixtureId !== v.fixture.fixtureId || v.currentRevisionId !== (v.fixture.forecast?.revisionId ?? null) ||
    v.selection === "applicable" && v.snapshot?.revisionId !== (v.currentRevisionId ?? undefined) ||
    v.snapshot && (v.snapshot.historical !== (v.snapshot.revisionId !== v.currentRevisionId) || v.snapshot.cycleId !== v.selectedCycle?.id)) ctx.addIssue({ code: "custom", message: "Incoherent detail response." });
  if (v.odds && new Set(v.odds.map((group) => group.family)).size !== v.odds.length) ctx.addIssue({ code: "custom", message: "One odds group per family." });
  if (v.liveMatch) {
    const cycleId = v.selection === "applicable" ? v.fixture.cycleId : v.selectedCycle?.id ?? null;
    const kickoffAt = v.selection === "applicable" ? v.fixture.kickoffAt : v.selectedCycle?.kickoffAt ?? null;
    if (v.liveMatch.fixtureId !== v.fixture.fixtureId || v.liveMatch.cycleId !== cycleId || v.liveMatch.kickoffAt !== kickoffAt || v.liveMatch.collectedAt > v.asOf)
      ctx.addIssue({ code: "custom", message: "Match observations must belong to the displayed occurrence." });
  }
  if (v.inPlayOdds && (v.selection !== "applicable" || v.fixture.status !== "live"
    || v.inPlayOdds.fixtureId !== v.fixture.fixtureId || v.inPlayOdds.kickoffAt !== v.fixture.kickoffAt
    || v.inPlayOdds.checkedAt > v.asOf))
    ctx.addIssue({ code: "custom", message: "In-play prices must belong to the current live fixture." });
  const bookmaker = v.bookmakerOdds;
  if (bookmaker && (v.selection !== "applicable" || bookmaker.fixtureId !== v.fixture.fixtureId ||
    bookmaker.kickoffAt !== v.fixture.kickoffAt || bookmaker.checkedAt > v.asOf || (bookmaker.kind === "pre-match"
      ? v.fixture.status !== "scheduled" || v.asOf >= bookmaker.kickoffAt
      : v.asOf < bookmaker.kickoffAt || !(v.fixture.status === "live" || v.fixture.status === "abandoned" || isPlayedFinalStatus(v.fixture.status)))))
    ctx.addIssue({ code: "custom", message: "Bookmaker prices must belong to the displayed fixture occurrence." });
  if (v.extendedMarkets && (!v.snapshot || "gated" in v.snapshot || v.extendedMarkets.fixtureId !== v.fixture.fixtureId ||
    v.extendedMarkets.revisionId !== v.snapshot.revisionId || v.extendedMarkets.cycleId !== v.snapshot.cycleId ||
    v.extendedMarkets.publishedAt !== v.snapshot.publishedAt || v.extendedMarkets.mode !== v.snapshot.applicability))
    ctx.addIssue({ code: "custom", message: "Extended markets must belong to the displayed forecast." });
  const extendedOdds = v.extendedOdds;
  if (extendedOdds && (v.selection !== "applicable" || extendedOdds.checkedAt > v.asOf ||
    v.fixture.status !== (extendedOdds.kind === "in-play" ? "live" : "scheduled") ||
    !v.extendedMarkets?.markets.some(({ key, source }) => key === extendedOdds.marketKey && source !== "market-implied")))
    ctx.addIssue({ code: "custom", message: "Extended prices must belong to a current forecast market." });
}
export const storedMatchDetailResponseSchema = storedDetailBaseSchema.superRefine((v, ctx) => refineDetail({ ...v, access: { tier: "full", signedIn: false } }, ctx));
export const matchDetailResponseSchema = wireDetailBaseSchema.superRefine(refineDetail).superRefine((v, ctx) => {
  const gated = v.access.tier === "free" && !isCompletedFixtureStatus(v.fixture.status);
  if (gated ? !("gated" in v.history) || v.odds !== undefined || v.snapshot !== null && !("gated" in v.snapshot)
    || v.fixture.forecast !== null && (!("gated" in v.fixture.forecast) || v.fixture.forecast.probabilities.length !== 0)
    || v.snapshot !== null && "gated" in v.snapshot && v.snapshot.probabilities.length !== 0
    || v.liveMatch != null || v.inPlayOdds != null || v.bookmakerOdds != null || v.extendedMarkets != null || v.extendedOdds != null
    || v.fixture.marketOdds != null || v.fixture.prices.length !== 0
    : "gated" in v.history || v.snapshot !== null && "gated" in v.snapshot || v.fixture.forecast !== null && "gated" in v.fixture.forecast) {
    ctx.addIssue({ code: "custom", message: "Detail content must match its access tier and fixture status." });
  }
});
export type StoredMatchDetailResponse = z.infer<typeof storedMatchDetailResponseSchema>;
export type StoredDetailSnapshot = z.infer<typeof storedDetailSnapshotSchema>;
export type MatchDetailResponse = z.infer<typeof matchDetailResponseSchema>;
export type DetailSnapshot = z.infer<typeof detailSnapshotSchema>;

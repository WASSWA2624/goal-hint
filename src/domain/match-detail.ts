import { z } from "zod";
import { publicForecastSchema, publicVoidReasonSchema } from "./fixture-snapshot.ts";
import { matchFeedRecordSchema } from "./match-feed.ts";

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
  runDate: z.iso.date(), sources: z.array(z.enum(["ai", "api-football"])).min(1).max(2), cycle: detailCycleSchema,
}).refine((v) => v.cycleId === v.cycle.id && v.runSequence === v.runDate.replaceAll("-", "") && new Set(v.sources).size === v.sources.length,
  { message: "Incoherent publication provenance." });
export const detailSnapshotSchema = publicForecastSchema.safeExtend({
  ...detailRevisionSchema.shape, historical: z.boolean(), applicability: z.enum(["current", "locked", "void", "historical"]), cycle: detailCycleSchema,
  markets: z.array(publicForecastSchema.shape.markets.element.safeExtend({
    alternatives: z.array(z.strictObject({ selection: z.string().max(32), probability: z.number().gt(0).lt(1) })).max(2),
    source: z.strictObject({ kind: z.enum(["ai", "api-football"]), provisional: z.boolean(),
      fallbackReason: z.enum(["ai-failure", "ai-timeout", "ai-insufficient-evidence", "ai-budget-exhausted", "ai-missing-group", "ai-invalid-group"]).nullable(),
      sourceIds: z.array(z.string().max(128)).max(500) }),
    timestamps: z.strictObject({ generatedAt: at.nullable(), retrievedAt: at, providerUpdatedAt: at.nullable() }),
  })).max(4),
  unavailableMarkets: matchFeedRecordSchema.shape.unavailableMarkets,
  analysis: z.strictObject({ state: z.enum(["available", "withheld"]), reasons: z.array(explanation).max(4), uncertainty: explanation.nullable(),
    limitedNews: z.boolean(), sources: z.array(source).max(501) }).refine((v) => v.state === "available"
      ? v.reasons.length >= 2 && v.uncertainty !== null : v.reasons.length === 0 && v.uncertainty === null),
  outcomes: z.array(z.strictObject({ family: z.enum(["match-result", "double-chance", "total-goals", "both-teams-to-score"]),
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
export const matchDetailResponseSchema = z.strictObject({ fixture: matchFeedRecordSchema, asOf: at,
  route: z.strictObject({ fixtureId: id, slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160), path: z.string().max(512) }),
  currentRevisionId: id.nullable(), selection: z.enum(["applicable", "revision", "cycle"]), selectedCycle: detailCycleSchema.nullable(), snapshot: detailSnapshotSchema.nullable(),
  history: z.strictObject({ limit: z.number().int().min(1).max(matchDetailRules.maximumLimit),
    revisions: z.strictObject({ anchor: sequence.or(z.literal(0)), entries: z.array(detailPublicationSchema).max(matchDetailRules.maximumLimit), next: historyLink }),
    cycles: z.strictObject({ anchor: sequence.or(z.literal(0)), entries: z.array(detailCycleSchema).max(matchDetailRules.maximumLimit), next: historyLink }) }),
}).superRefine((v, ctx) => {
  if (v.route.fixtureId !== v.fixture.fixtureId || v.currentRevisionId !== (v.fixture.forecast?.revisionId ?? null) ||
    v.selection === "applicable" && v.snapshot?.revisionId !== (v.currentRevisionId ?? undefined) ||
    v.snapshot && (v.snapshot.historical !== (v.snapshot.revisionId !== v.currentRevisionId) || v.snapshot.cycleId !== v.selectedCycle?.id)) ctx.addIssue({ code: "custom", message: "Incoherent detail response." });
});
export type MatchDetailResponse = z.infer<typeof matchDetailResponseSchema>;
export type DetailSnapshot = z.infer<typeof detailSnapshotSchema>;

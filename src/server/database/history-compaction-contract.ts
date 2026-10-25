import "server-only";

import { z } from "zod";
import { historyHash, historyId } from "../predictions/history-input.ts";

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.number().int().nonnegative().max(253_402_300_799_000);

/** Dry-run bounds. Keyset cursors resume a partial census; nothing here selects or changes a row. */
export const historyCompactionOptionsSchema = z.strictObject({
  maxFixtures: z.number().int().min(1).max(20_000).default(2000), pageSize: z.number().int().min(1).max(500).default(200),
  maxBatches: z.number().int().min(0).max(100_000).default(5000),
  afterFixture: historyId.nullable().default(null), afterBatch: historyHash.nullable().default(null) });
export type HistoryCompactionOptions = z.infer<typeof historyCompactionOptionsSchema>;

// Ordered: each row takes the first reason that applies, and only `transient-candidate` is ever a candidate.
export const OBSERVATION_REASONS = Object.freeze(["pending-batch", "result-source", "non-confirmation-outcome", "settlement-pending",
  "fixture-still-tracked", "implied-evidence", "latest-confirmation", "transient-candidate"] as const);
export const LIFECYCLE_REASONS = Object.freeze(["change-event", "non-confirmation-outcome", "no-result-sync-source",
  "referenced-by-retained-observation", "settlement-pending", "fixture-still-tracked", "implied-evidence", "latest-confirmation",
  "cursor-receipt", "transient-candidate"] as const);
export const BATCH_REASONS = Object.freeze(["pending-batch", "error-receipt", "requested-ids-without-observation",
  "unmatched-observations", "retained-batch-member", "transient-candidate"] as const);
// Applied after classification: either one withholds every candidate in the report.
export const GLOBAL_REASONS = Object.freeze(["reference-coverage-unavailable", "pending-recovery-global"] as const);
export const COMPACTION_TABLES = Object.freeze({ ResultProviderObservation: OBSERVATION_REASONS,
  FixtureLifecycleObservation: LIFECYCLE_REASONS, ResultSyncBatch: BATCH_REASONS });
export type CompactionTable = keyof typeof COMPACTION_TABLES;

/** Structurally referenced or runbook-retained history. The census never classifies these tables. */
export const NEVER_COMPACTED = Object.freeze([
  ...["PredictionSet", "MarketPrediction", "PredictionCycle", "PredictionSchedule", "PredictionAudit", "PredictionCycleOperation",
    "PredictionRefreshResult", "PredictionPublicationBarrier"].map((table) => ({ table, reason: "forecast-history" })),
  ...["MarketSettlementRevision", "ExtendedMarketSettlementRevision", "SettlementBatch", "SettlementEventReceipt",
    "ImpliedMarketResultEvidence", "GoalMarketExtension", "ImpliedMarketExtension"].map((table) => ({ table, reason: "settlement-and-correction" })),
  { table: "PredictionChangeEvent", reason: "replay-cursor" }, { table: "FixtureResult", reason: "result-chain" },
  ...["DailySlipPublication", "PublishedSlip", "PublishedSlipLeg"].map((table) => ({ table, reason: "publication" })),
  ...["DurableJob", "DurableJobAttempt", "DurableJobEvent", "DurableJobUsage"].map((table) => ({ table, reason: "job-record" })),
  ...["OddsImportBatch", "OddsBetObservation", "ProviderOddsSnapshot"].map((table) => ({ table, reason: "provider-odds-retain-until" })),
  { table: "PublicCacheInvalidation", reason: "cache-journal" },
].map((entry) => Object.freeze(entry)));

const reasonEntry = z.strictObject({ reason: z.string().max(64), rows: count, jsonBytes: count });
const tableEntry = z.strictObject({ table: z.enum(Object.keys(COMPACTION_TABLES) as [CompactionTable, ...CompactionTable[]]),
  inspectedRows: count, inspectedJsonBytes: count, candidateRows: count, candidateJsonBytes: count, reasons: z.array(reasonEntry).max(16) });
const total = (rows: readonly z.infer<typeof reasonEntry>[], key: "rows" | "jsonBytes") => rows.reduce((sum, row) => sum + row[key], 0);
const entry = (table: z.infer<typeof tableEntry>, reason: string) => table.reasons.find((row) => row.reason === reason)!;

export const historyCompactionReportSchema = z.strictObject({ version: z.literal(1), mode: z.literal("dry-run"),
  deletion: z.strictObject({ implemented: z.literal(false) }), inspectedAt: instant, engine: z.enum(["mysql", "mariadb"]),
  scope: z.strictObject({ fixturesInspected: count, batchesInspected: count, coverage: z.enum(["complete", "partial"]),
    resumeAfterFixture: historyId.nullable(), resumeAfterBatch: historyHash.nullable() }),
  blockers: z.strictObject({ pendingBatches: z.number().int().min(0).max(1000), referenceCoverage: z.enum(["complete", "incomplete"]) }),
  tables: z.array(tableEntry).length(3),
  retainedChains: z.strictObject({ fixtureResult: z.strictObject({ inspectedRows: count, jsonBytes: count, liveRows: count, liveJsonBytes: count }),
    lifecycleInPlay: z.strictObject({ rows: count, jsonBytes: count }) }),
  neverCompacted: z.array(z.strictObject({ table: z.string().max(64), reason: z.string().max(64) })),
}).refine((value) => {
  const withheld = value.blockers.referenceCoverage === "incomplete" ? "reference-coverage-unavailable"
    : value.blockers.pendingBatches > 0 ? "pending-recovery-global" : null;
  const { fixtureResult, lifecycleInPlay } = value.retainedChains;
  return value.tables.every((table, index) => {
    const reasons = [...COMPACTION_TABLES[table.table], ...GLOBAL_REASONS], candidate = entry(table, "transient-candidate");
    return table.table === Object.keys(COMPACTION_TABLES)[index] && table.reasons.length === reasons.length &&
      table.reasons.every((row, position) => row.reason === reasons[position]) &&
      total(table.reasons, "rows") === table.inspectedRows && total(table.reasons, "jsonBytes") === table.inspectedJsonBytes &&
      table.candidateRows === candidate.rows && table.candidateJsonBytes === candidate.jsonBytes &&
      GLOBAL_REASONS.every((reason) => reason === withheld || entry(table, reason).rows === 0 && entry(table, reason).jsonBytes === 0) &&
      (withheld === null || candidate.rows === 0 && candidate.jsonBytes === 0);
  }) && value.tables[2]!.inspectedRows === value.scope.batchesInspected &&
    (value.scope.coverage === "partial" || value.scope.resumeAfterFixture === null && value.scope.resumeAfterBatch === null) &&
    fixtureResult.liveRows <= fixtureResult.inspectedRows && fixtureResult.liveJsonBytes <= fixtureResult.jsonBytes &&
    lifecycleInPlay.rows <= value.tables[1]!.inspectedRows && lifecycleInPlay.jsonBytes <= value.tables[1]!.inspectedJsonBytes &&
    JSON.stringify(value.neverCompacted) === JSON.stringify(NEVER_COMPACTED);
});
export type HistoryCompactionReport = z.infer<typeof historyCompactionReportSchema>;

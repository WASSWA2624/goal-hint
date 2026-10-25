import "server-only";

import type { DatabaseRuntime } from "./client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { historyHash, historyId } from "../predictions/history-input.ts";
import { settlementSourceKinds } from "../settlement/settlement-service.ts";
import { COMPACTION_TABLES, GLOBAL_REASONS, NEVER_COMPACTED, historyCompactionOptionsSchema, historyCompactionReportSchema,
  type CompactionTable, type HistoryCompactionReport } from "./history-compaction-contract.ts";

export { historyCompactionOptionsSchema, historyCompactionReportSchema } from "./history-compaction-contract.ts";

export class HistoryCompactionError extends Error {
  constructor() { super("History compaction census unavailable; private database diagnostics are withheld."); this.name = "HistoryCompactionError"; }
}

type Tx = Prisma.TransactionClient;
type Engine = "mysql" | "mariadb";
type References = Readonly<{ implied: boolean; extended: boolean }>;
type Tally = Map<string, { rows: number; jsonBytes: number }>;
const CORE_TABLES = ["FootballFixture", "FixtureResultState", "FixtureLifecycleState", "FixtureResult", "ResultSyncBatch",
  "ResultProviderObservation", "FixtureLifecycleObservation", "PredictionChangeEvent", "SettlementEventReceipt",
  "MarketSettlementRevision", "PredictionCycle", "MarketSettlement"];
const IMPLIED_TABLES = ["ImpliedMarketResultEvidence"];
const EXTENDED_TABLES = ["GoalMarketExtension", "ImpliedMarketExtension", "ExtendedMarketSettlement", "ExtendedMarketSettlementRevision"];
const STATEMENT_LIMIT_MS = 5000, BUDGET_MS = 300_000;

function numeric(value: unknown): number {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0) throw new HistoryCompactionError();
  return result;
}
const add = (left: number, right: unknown) => numeric(left + numeric(right));

/** Each transaction may run on a different pooled connection, so each one sets and restores its own statement limit.
 * MariaDB's max_statement_time is a DOUBLE in seconds; it is restored exactly, not through the integer helper. */
async function limited<T>(tx: Tx, engine: Engine, run: () => Promise<T>): Promise<T> {
  if (engine === "mysql") {
    const original = numeric((await tx.$queryRaw<{ value: unknown }[]>`SELECT @@SESSION.max_execution_time AS value`)[0]?.value);
    await tx.$executeRaw`SET SESSION max_execution_time = ${STATEMENT_LIMIT_MS}`;
    try { return await run(); } finally { await tx.$executeRaw`SET SESSION max_execution_time = ${original}`; }
  }
  const original = (await tx.$queryRaw<{ value: unknown }[]>`SELECT @@SESSION.max_statement_time AS value`)[0]?.value;
  if (typeof original !== "number" || !Number.isFinite(original) || original < 0) throw new HistoryCompactionError();
  await tx.$executeRaw`SET SESSION max_statement_time = ${STATEMENT_LIMIT_MS / 1000}`;
  try { return await run(); } finally { await tx.$executeRaw`SET SESSION max_statement_time = ${original}`; }
}

/** One row per scoped fixture: horizon exhaustion, every arm of settlement pending(), and implied evidence. */
function fixtureFlags(scope: Prisma.Sql, references: References) {
  const extended = references.extended ? Prisma.sql`
        OR EXISTS (SELECT 1 FROM GoalMarketExtension x JOIN PredictionCycle c ON c.lockedSetId = x.revisionId
          WHERE x.fixtureId = s.fixtureId AND c.state IN ('closed', 'void') AND JSON_LENGTH(JSON_EXTRACT(x.body, '$.markets')) >
            (SELECT COUNT(*) FROM ExtendedMarketSettlement p WHERE p.cycleId = c.id AND p.marketKey LIKE 'goal:%'))
        OR EXISTS (SELECT 1 FROM ImpliedMarketExtension x JOIN PredictionCycle c ON c.lockedSetId = x.revisionId
          WHERE x.fixtureId = s.fixtureId AND c.state IN ('closed', 'void') AND JSON_LENGTH(JSON_EXTRACT(x.body, '$.markets')) >
            (SELECT COUNT(*) FROM ExtendedMarketSettlement p WHERE p.cycleId = c.id AND p.marketKey LIKE 'implied:%'))` : Prisma.empty;
  const implied = references.implied
    ? Prisma.sql`EXISTS (SELECT 1 FROM ImpliedMarketResultEvidence i WHERE i.fixtureId = s.fixtureId)` : Prisma.sql`FALSE`;
  return Prisma.sql`ff AS (SELECT s.fixtureId, (s.firstFinalAt IS NOT NULL AND s.nextCheckAt IS NULL) AS exhausted,
      (EXISTS (SELECT 1 FROM PredictionChangeEvent e LEFT JOIN SettlementEventReceipt r ON r.fixtureId = e.fixtureId AND r.version = e.version
          WHERE e.fixtureId = s.fixtureId AND e.kind IN (${Prisma.join(settlementSourceKinds)}) AND r.fixtureId IS NULL)
        OR EXISTS (SELECT 1 FROM PredictionCycle c WHERE c.fixtureId = s.fixtureId AND
          (SELECT COUNT(*) FROM MarketSettlement m WHERE m.cycleId = c.id) < 4)${extended}) AS settlementPending,
      ${implied} AS implied
    FROM FixtureResultState s WHERE ${scope})`;
}
// The CASE order is OBSERVATION_REASONS order. A JSON reference only counts when the result names this observation back.
const observationReasons = Prisma.sql`orz AS (SELECT o.id, o.lifecycleId, OCTET_LENGTH(CAST(o.body AS CHAR)) AS bytes,
      CASE WHEN b.completedAt IS NULL THEN 'pending-batch'
        WHEN fr.id IS NOT NULL THEN 'result-source'
        WHEN NOT (JSON_UNQUOTE(JSON_EXTRACT(o.body, '$.outcome')) <=> 'unchanged') THEN 'non-confirmation-outcome'
        WHEN ff.settlementPending THEN 'settlement-pending'
        WHEN NOT ff.exhausted THEN 'fixture-still-tracked'
        WHEN ff.implied THEN 'implied-evidence'
        WHEN NOT EXISTS (SELECT 1 FROM ResultProviderObservation n WHERE n.fixtureId = o.fixtureId
          AND (n.retrievedAt > o.retrievedAt OR n.retrievedAt = o.retrievedAt AND n.id > o.id)) THEN 'latest-confirmation'
        ELSE 'transient-candidate' END AS reason
    FROM ff JOIN ResultProviderObservation o ON o.fixtureId = ff.fixtureId JOIN ResultSyncBatch b ON b.id = o.batchId
    LEFT JOIN FixtureResult fr ON fr.id = JSON_UNQUOTE(JSON_EXTRACT(o.body, '$.resultId')) AND fr.fixtureId = o.fixtureId
      AND JSON_UNQUOTE(JSON_EXTRACT(fr.body, '$.observationId')) = o.id)`;
// LIFECYCLE_REASONS order; a receipt shared by a retained observation (cached replay) stays with it.
const lifecycleReasons = Prisma.sql`lrz AS (SELECT OCTET_LENGTH(CAST(l.receiptJson AS CHAR)) AS bytes,
      (JSON_UNQUOTE(JSON_EXTRACT(l.receiptJson, '$.observation.status')) <=> 'live') AS inPlay,
      CASE WHEN EXISTS (SELECT 1 FROM PredictionChangeEvent e WHERE e.lifecycleId = l.id) THEN 'change-event'
        WHEN NOT (l.outcome <=> 'unchanged') THEN 'non-confirmation-outcome'
        WHEN NOT EXISTS (SELECT 1 FROM ResultProviderObservation o WHERE o.lifecycleId = l.id AND o.fixtureId = l.fixtureId) THEN 'no-result-sync-source'
        WHEN EXISTS (SELECT 1 FROM orz WHERE orz.lifecycleId = l.id AND orz.reason <> 'transient-candidate') THEN 'referenced-by-retained-observation'
        WHEN ff.settlementPending THEN 'settlement-pending'
        WHEN NOT ff.exhausted THEN 'fixture-still-tracked'
        WHEN ff.implied THEN 'implied-evidence'
        WHEN NOT EXISTS (SELECT 1 FROM FixtureLifecycleObservation n WHERE n.fixtureId = l.fixtureId
          AND (n.at > l.at OR n.at = l.at AND n.id > l.id)) THEN 'latest-confirmation'
        WHEN cs.retrievedAt IS NULL OR l.retrievedAt = cs.retrievedAt THEN 'cursor-receipt'
        ELSE 'transient-candidate' END AS reason
    FROM ff JOIN FixtureLifecycleObservation l ON l.fixtureId = ff.fixtureId
    LEFT JOIN FixtureLifecycleState cs ON cs.fixtureId = l.fixtureId)`;
// BATCH_REASONS order. The sealed body has no completeness field: an empty error-null date/live batch is a candidate
// only through the adapter invariant complete === (error === null), and only when it dispatched a request for no ids.
const batchReasons = (scope: Prisma.Sql) => Prisma.sql`brz AS (SELECT OCTET_LENGTH(CAST(b.body AS CHAR)) AS bytes,
      CASE WHEN b.completedAt IS NULL THEN 'pending-batch'
        WHEN NOT (JSON_TYPE(JSON_EXTRACT(b.body, '$.error')) <=> 'NULL') OR NOT (JSON_UNQUOTE(JSON_EXTRACT(b.body, '$.channel')) <=> 'ids')
          AND JSON_LENGTH(JSON_EXTRACT(b.body, '$.observations')) = 0 AND NOT (JSON_LENGTH(JSON_EXTRACT(b.body, '$.requestedIds')) = 0
          AND JSON_EXTRACT(b.body, '$.requestsDispatched') >= 1) THEN 'error-receipt'
        WHEN JSON_UNQUOTE(JSON_EXTRACT(b.body, '$.channel')) = 'ids' AND JSON_LENGTH(JSON_EXTRACT(b.body, '$.observations')) = 0
          THEN 'requested-ids-without-observation'
        WHEN NOT ((SELECT COUNT(*) FROM ResultProviderObservation o WHERE o.batchId = b.id) <=> JSON_LENGTH(JSON_EXTRACT(b.body, '$.observations')))
          THEN 'unmatched-observations'
        WHEN EXISTS (SELECT 1 FROM ResultProviderObservation o LEFT JOIN orz ON orz.id = o.id WHERE o.batchId = b.id
          AND NOT (orz.reason <=> 'transient-candidate')) THEN 'retained-batch-member'
        ELSE 'transient-candidate' END AS reason
    FROM ResultSyncBatch b WHERE ${scope})`;
const grouped = (source: string) => Prisma.sql`SELECT reason, COUNT(*) AS rowCount, CAST(COALESCE(SUM(bytes), 0) AS UNSIGNED) AS jsonBytes
  ${source === "lrz" ? Prisma.sql`, CAST(COALESCE(SUM(inPlay), 0) AS UNSIGNED) AS inPlayRows,
    CAST(COALESCE(SUM(CASE WHEN inPlay THEN bytes ELSE 0 END), 0) AS UNSIGNED) AS inPlayJsonBytes` : Prisma.empty}
  FROM ${Prisma.raw(source)} GROUP BY reason`;
const range = (column: string, after: string | null, last: string) => after === null
  ? Prisma.sql`${Prisma.raw(column)} <= ${last}` : Prisma.sql`${Prisma.raw(column)} > ${after} AND ${Prisma.raw(column)} <= ${last}`;

type ReasonRow = { reason: unknown; rowCount: unknown; jsonBytes: unknown; inPlayRows?: unknown; inPlayJsonBytes?: unknown };
function tally(target: Tally, table: CompactionTable, rows: readonly ReasonRow[]) {
  for (const row of rows) {
    const current = typeof row.reason === "string" ? target.get(row.reason) : undefined;
    if (!current || !(COMPACTION_TABLES[table] as readonly string[]).includes(row.reason as string)) throw new HistoryCompactionError();
    current.rows = add(current.rows, row.rowCount); current.jsonBytes = add(current.jsonBytes, row.jsonBytes);
  }
}

/** Private, read-only operator census of transient result/lifecycle history. It selects only counts and byte sums,
 * plus the two keyset cursors; no body, evidence reference or member record leaves the database, and it never deletes.
 * The caller owns this runtime and must close it after inspection, including on failed session restoration. */
export async function inspectHistoryCompaction(database: Pick<DatabaseRuntime, "transaction">, input: unknown = {}): Promise<HistoryCompactionReport> {
  const parsed = historyCompactionOptionsSchema.safeParse(input);
  if (!parsed.success) throw new HistoryCompactionError();
  const options = parsed.data, started = performance.now(), withinBudget = () => performance.now() - started < BUDGET_MS;
  try {
    const context = await database.transaction(async (tx) => {
      const row = (await tx.$queryRaw<{ at: Date; version: unknown }[]>`SELECT UTC_TIMESTAMP(3) AS at, VERSION() AS version`)[0];
      if (!row || !(row.at instanceof Date) || typeof row.version !== "string") throw new HistoryCompactionError();
      const engine: Engine = /mariadb/iu.test(row.version) ? "mariadb" : "mysql";
      return limited(tx, engine, async () => {
        const tables = await tx.$queryRaw<{ tableName: unknown }[]>`SELECT TABLE_NAME AS tableName FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME LIMIT 1025`;
        // Windows MySQL normally reports lowercase names (lower_case_table_names=1).
        const visible = new Set(tables.map((table) => String(table.tableName).toLowerCase()));
        const seen = (names: readonly string[]) => names.filter((name) => visible.has(name.toLowerCase())).length;
        if (seen(CORE_TABLES) !== CORE_TABLES.length) throw new HistoryCompactionError();
        const references = { implied: seen(IMPLIED_TABLES) === IMPLIED_TABLES.length, extended: seen(EXTENDED_TABLES) === EXTENDED_TABLES.length };
        const pending = (await tx.$queryRaw<{ pending: unknown }[]>`SELECT COUNT(*) AS pending FROM
          (SELECT 1 AS one FROM ResultSyncBatch WHERE completedAt IS NULL LIMIT 1000) AS waiting`)[0];
        return { at: row.at.getTime(), engine, references, pendingBatches: numeric(pending?.pending) };
      });
    }, { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 30_000 });
    const { engine, references } = context;
    const blank = (table: CompactionTable): Tally => new Map([...COMPACTION_TABLES[table], ...GLOBAL_REASONS].map((reason) => [reason, { rows: 0, jsonBytes: 0 }]));
    const tallies = { ResultProviderObservation: blank("ResultProviderObservation"),
      FixtureLifecycleObservation: blank("FixtureLifecycleObservation"), ResultSyncBatch: blank("ResultSyncBatch") };
    const chains = { fixtureResult: { inspectedRows: 0, jsonBytes: 0, liveRows: 0, liveJsonBytes: 0 }, lifecycleInPlay: { rows: 0, jsonBytes: 0 } };

    /** Keyset pages, one RepeatableRead snapshot each. Fetching one extra key tells a finished pass from a bounded one. */
    async function pass(after: string | null, maximum: number, keys: (tx: Tx, after: string | null, limit: number) => Promise<string[]>,
      inspect: (tx: Tx, after: string | null, last: string) => Promise<void>) {
      let inspected = 0;
      while (withinBudget()) {
        const take = Math.min(options.pageSize, maximum - inspected), cursor = after;
        const page = await database.transaction((tx) => limited(tx, engine, async () => {
          const found = await keys(tx, cursor, take + 1), members = found.slice(0, take);
          if (members.length) await inspect(tx, cursor, members.at(-1)!);
          return { more: found.length > take, last: members.at(-1) ?? null, count: members.length };
        }), { isolationLevel: "RepeatableRead", maxWait: 1000, timeout: 30_000 });
        if (page.last !== null) { after = page.last; inspected += page.count; }
        if (!page.more) return { inspected, complete: true, resume: null };
        if (inspected >= maximum) break;
      }
      return { inspected, complete: false, resume: after };
    }

    const fixtures = await pass(options.afterFixture, options.maxFixtures, async (tx, after, limit) =>
      (await tx.$queryRaw<{ id: unknown }[]>(Prisma.sql`SELECT fixtureId AS id FROM FixtureResultState
        ${after === null ? Prisma.empty : Prisma.sql`WHERE fixtureId > ${after}`} ORDER BY fixtureId LIMIT ${limit}`))
        .map((row) => historyId.parse(row.id)),
    async (tx, after, last) => {
      const flags = fixtureFlags(range("s.fixtureId", after, last), references);
      tally(tallies.ResultProviderObservation, "ResultProviderObservation",
        await tx.$queryRaw<ReasonRow[]>(Prisma.sql`WITH ${flags}, ${observationReasons} ${grouped("orz")}`));
      const lifecycle = await tx.$queryRaw<ReasonRow[]>(Prisma.sql`WITH ${flags}, ${observationReasons}, ${lifecycleReasons} ${grouped("lrz")}`);
      tally(tallies.FixtureLifecycleObservation, "FixtureLifecycleObservation", lifecycle);
      for (const row of lifecycle) {
        chains.lifecycleInPlay.rows = add(chains.lifecycleInPlay.rows, row.inPlayRows);
        chains.lifecycleInPlay.jsonBytes = add(chains.lifecycleInPlay.jsonBytes, row.inPlayJsonBytes);
      }
      const results = (await tx.$queryRaw<Record<string, unknown>[]>(Prisma.sql`SELECT COUNT(*) AS rowCount,
          CAST(COALESCE(SUM(OCTET_LENGTH(CAST(r.body AS CHAR))), 0) AS UNSIGNED) AS jsonBytes,
          CAST(COALESCE(SUM(r.status = 'live'), 0) AS UNSIGNED) AS liveRows,
          CAST(COALESCE(SUM(CASE WHEN r.status = 'live' THEN OCTET_LENGTH(CAST(r.body AS CHAR)) ELSE 0 END), 0) AS UNSIGNED) AS liveJsonBytes
        FROM FixtureResultState s JOIN FixtureResult r ON r.fixtureId = s.fixtureId WHERE ${range("s.fixtureId", after, last)}`))[0];
      if (!results) throw new HistoryCompactionError();
      const chain = chains.fixtureResult;
      chain.inspectedRows = add(chain.inspectedRows, results.rowCount); chain.jsonBytes = add(chain.jsonBytes, results.jsonBytes);
      chain.liveRows = add(chain.liveRows, results.liveRows); chain.liveJsonBytes = add(chain.liveJsonBytes, results.liveJsonBytes);
    });

    const batches = await pass(options.afterBatch, options.maxBatches, async (tx, after, limit) =>
      (await tx.$queryRaw<{ id: unknown }[]>(Prisma.sql`SELECT id FROM ResultSyncBatch
        ${after === null ? Prisma.empty : Prisma.sql`WHERE id > ${after}`} ORDER BY id LIMIT ${limit}`))
        .map((row) => historyHash.parse(row.id)),
    async (tx, after, last) => {
      // Members are reclassified with their fixtures' flags; a member without result state stays retained (fail closed).
      const scope = range("b.id", after, last);
      const flags = fixtureFlags(Prisma.sql`s.fixtureId IN (SELECT o.fixtureId FROM ResultSyncBatch b
        JOIN ResultProviderObservation o ON o.batchId = b.id WHERE ${scope})`, references);
      tally(tallies.ResultSyncBatch, "ResultSyncBatch",
        await tx.$queryRaw<ReasonRow[]>(Prisma.sql`WITH ${flags}, ${observationReasons}, ${batchReasons(scope)} ${grouped("brz")}`));
    });

    const referenceCoverage = references.implied && references.extended ? "complete" as const : "incomplete" as const;
    const withheld = referenceCoverage === "incomplete" ? "reference-coverage-unavailable" : context.pendingBatches > 0 ? "pending-recovery-global" : null;
    const tables = (Object.keys(tallies) as CompactionTable[]).map((table) => {
      const rows = tallies[table], candidate = rows.get("transient-candidate")!;
      if (withheld) { rows.set(withheld, { ...candidate }); rows.set("transient-candidate", { rows: 0, jsonBytes: 0 }); }
      const reasons = [...rows].map(([reason, value]) => ({ reason, ...value }));
      return { table, inspectedRows: reasons.reduce((sum, row) => add(sum, row.rows), 0),
        inspectedJsonBytes: reasons.reduce((sum, row) => add(sum, row.jsonBytes), 0),
        candidateRows: rows.get("transient-candidate")!.rows, candidateJsonBytes: rows.get("transient-candidate")!.jsonBytes, reasons };
    });
    return historyCompactionReportSchema.parse({ version: 1, mode: "dry-run", deletion: { implemented: false }, inspectedAt: context.at, engine,
      scope: { fixturesInspected: fixtures.inspected, batchesInspected: batches.inspected,
        coverage: fixtures.complete && batches.complete ? "complete" : "partial",
        resumeAfterFixture: fixtures.complete ? null : fixtures.resume, resumeAfterBatch: batches.complete ? null : batches.resume },
      blockers: { pendingBatches: context.pendingBatches, referenceCoverage }, tables, retainedChains: chains, neverCompacted: NEVER_COMPACTED });
  } catch { throw new HistoryCompactionError(); }
}

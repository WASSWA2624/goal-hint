import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HistoryCompactionError, inspectHistoryCompaction } from "../src/server/database/history-compaction.ts";
import { BATCH_REASONS, GLOBAL_REASONS, LIFECYCLE_REASONS, NEVER_COMPACTED, OBSERVATION_REASONS,
  historyCompactionReportSchema } from "../src/server/database/history-compaction-contract.ts";
import { settlementSourceKinds } from "../src/server/settlement/settlement-service.ts";

const CORE = ["FootballFixture", "FixtureResultState", "FixtureLifecycleState", "FixtureResult", "ResultSyncBatch",
  "ResultProviderObservation", "FixtureLifecycleObservation", "PredictionChangeEvent", "SettlementEventReceipt",
  "MarketSettlementRevision", "PredictionCycle", "MarketSettlement"];
const OPTIONAL = ["ImpliedMarketResultEvidence", "GoalMarketExtension", "ImpliedMarketExtension", "ExtendedMarketSettlement", "ExtendedMarketSettlementRevision"];
const fixtureIds = Array.from({ length: 5 }, (_, index) => `00000000-0000-4000-8000-00000000000${index + 1}`);
const batchIds = Array.from({ length: 3 }, (_, index) => String(index + 1).repeat(64));
const FORBIDDEN = /\b(DELETE|UPDATE|INSERT|REPLACE|ALTER|DROP|TRUNCATE|OPTIMIZE|CREATE)\b/iu;

function fixture({ version = "8.4.13", tables = [...CORE, ...OPTIONAL].map((name) => name.toLowerCase()), pending = 0n, original = 0n,
  fixtures = fixtureIds, batches = batchIds, fail = null } = {}) {
  const queries = [], executions = [], options = [];
  let batchPage = 0;
  const page = (rows, sql, values) => {
    const limit = values.at(-1), after = sql.includes(">") ? values[0] : null;
    return rows.filter((id) => after === null || id > after).slice(0, limit).map((id) => ({ id }));
  };
  const database = { async transaction(run, settings) {
    options.push(settings);
    return run({ async $queryRaw(query, ...rest) {
      const sql = query.sql ?? query.join("?"), values = query.values ?? rest;
      queries.push({ sql, values });
      if (fail && sql.includes(fail)) throw new Error("private mysql://credential SQL diagnostic");
      if (sql.includes("UTC_TIMESTAMP")) return [{ at: new Date(1_761_400_000_000), version }];
      if (sql.includes("@@SESSION")) return [{ value: original }];
      if (sql.includes("information_schema.TABLES")) return tables.map((tableName) => ({ tableName }));
      if (sql.includes("completedAt IS NULL LIMIT 1000")) return [{ pending }];
      if (sql.startsWith("SELECT fixtureId AS id")) return page(fixtures, sql, values);
      if (sql.startsWith("SELECT id FROM ResultSyncBatch")) {
        const found = page(batches, sql, values); batchPage = Math.min(found.length, values.at(-1) - 1); return found;
      }
      if (sql.includes("FROM orz GROUP BY")) return [{ reason: "result-source", rowCount: 2n, jsonBytes: 300n, body: "private observation text" },
        { reason: "transient-candidate", rowCount: 3n, jsonBytes: 450n }];
      if (sql.includes("FROM lrz GROUP BY")) return [{ reason: "change-event", rowCount: 1n, jsonBytes: 200n, inPlayRows: 1n, inPlayJsonBytes: 200n },
        { reason: "transient-candidate", rowCount: 2n, jsonBytes: 100n, inPlayRows: 0n, inPlayJsonBytes: 0n }];
      // Batch reasons cover exactly the page's batches.
      if (sql.includes("FROM brz GROUP BY")) return [{ reason: "transient-candidate", rowCount: BigInt(batchPage), jsonBytes: 50n * BigInt(batchPage) }];
      if (sql.includes("JOIN FixtureResult r")) return [{ rowCount: 4n, jsonBytes: 800n, liveRows: 3n, liveJsonBytes: 600n }];
      throw new Error(`unexpected ${sql}`);
    }, async $executeRaw(query, ...values) { executions.push({ sql: query.join("?"), values }); return 0; } });
  } };
  return { database, queries, executions, options };
}
const table = (report, name) => report.tables.find((entry) => entry.table === name);
const reason = (report, name, key) => table(report, name).reasons.find((entry) => entry.reason === key);
const branch = (sql, name) => sql.search(new RegExp(String.raw`(?:THEN|ELSE)\s+'` + name + "'", "u"));

test("invalid bounds and cursors reject before any database transaction", async () => {
  let called = false;
  const database = { async transaction() { called = true; } };
  for (const input of [{ maxFixtures: 0 }, { maxFixtures: 20_001 }, { maxFixtures: 1.5 }, { maxFixtures: "x" }, { pageSize: 0 },
    { pageSize: 501 }, { maxBatches: -1 }, { afterFixture: "not-a-uuid" }, { afterBatch: "A".repeat(64) }, { afterBatch: "a".repeat(63) },
    { apply: true }, null])
    await assert.rejects(inspectHistoryCompaction(database, input), HistoryCompactionError);
  assert.equal(called, false);
});

test("the census issues only SELECT/WITH reads and session time-limit settings, restored in every transaction", async () => {
  const f = fixture({ original: 1234n }), report = await inspectHistoryCompaction(f.database, { pageSize: 2 });
  assert.equal(report.mode, "dry-run"); assert.deepEqual(report.deletion, { implemented: false }); assert.equal(report.engine, "mysql");
  for (const { sql } of f.queries) { assert.match(sql, /^\s*(WITH|SELECT)\b/iu); assert.doesNotMatch(sql, FORBIDDEN); }
  assert.ok(f.queries.some(({ sql }) => sql.startsWith("WITH ff AS")));
  assert.equal(f.executions.length, 2 * f.options.length);
  f.executions.forEach(({ sql, values }, index) => {
    assert.match(sql, /^SET SESSION max_execution_time = \?$/u); assert.doesNotMatch(sql, FORBIDDEN);
    assert.deepEqual(values, [index % 2 ? 1234 : 5000]);
  });
  assert.deepEqual(f.options[0], { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 30_000 });
  assert.ok(f.options.slice(1).every((value) => value.isolationLevel === "RepeatableRead" && value.timeout === 30_000 && value.maxWait === 1000));
  // Five fixtures in pages of two, three batches in pages of two: one context and five page transactions.
  assert.equal(f.options.length, 6);
  assert.deepEqual(report.scope, { fixturesInspected: 5, batchesInspected: 3, coverage: "complete", resumeAfterFixture: null, resumeAfterBatch: null });
  assert.deepEqual(reason(report, "ResultProviderObservation", "transient-candidate"), { reason: "transient-candidate", rows: 9, jsonBytes: 1350 });
  assert.equal(table(report, "ResultProviderObservation").inspectedRows, 15);
  assert.equal(table(report, "FixtureLifecycleObservation").candidateRows, 6);
  assert.deepEqual([table(report, "ResultSyncBatch").inspectedRows, table(report, "ResultSyncBatch").candidateJsonBytes], [3, 150]);
  assert.deepEqual(report.retainedChains, { fixtureResult: { inspectedRows: 12, jsonBytes: 2400, liveRows: 9, liveJsonBytes: 1800 },
    lifecycleInPlay: { rows: 3, jsonBytes: 600 } });
  assert.ok(!JSON.stringify(report).includes("private observation text"));
});

test("a failing query still restores the session limit inside its own transaction and withholds diagnostics", async () => {
  for (const fail of ["FROM lrz GROUP BY", "FROM brz GROUP BY", "information_schema.TABLES"]) {
    const f = fixture({ original: 7n, fail });
    await assert.rejects(inspectHistoryCompaction(f.database), (error) => error instanceof HistoryCompactionError &&
      !/credential|SQL|mysql:/u.test(error.message));
    assert.equal(f.executions.length, 2 * f.options.length);
    assert.deepEqual(f.executions.at(-1).values, [7]);
  }
});

test("MariaDB uses max_statement_time in seconds and restores its DOUBLE value exactly", async () => {
  const f = fixture({ version: "11.4.4-MariaDB-log", original: 0.5 }), report = await inspectHistoryCompaction(f.database);
  assert.equal(report.engine, "mariadb");
  f.executions.forEach(({ sql, values }, index) => {
    assert.match(sql, /^SET SESSION max_statement_time = \?$/u); assert.deepEqual(values, [index % 2 ? 0.5 : 5]);
  });
  assert.ok(f.queries.every(({ sql }) => !sql.includes("max_execution_time")));
  for (const original of [-1, Number.NaN, "0.5", 5n]) {
    const broken = fixture({ version: "11.4.4-MariaDB", original });
    await assert.rejects(inspectHistoryCompaction(broken.database), HistoryCompactionError);
    assert.equal(broken.executions.length, 0);
  }
});

test("a missing core table fails without SQL or credential text", async () => {
  for (const missing of CORE) {
    const f = fixture({ tables: [...CORE, ...OPTIONAL].filter((name) => name !== missing) });
    await assert.rejects(inspectHistoryCompaction(f.database), (error) => error instanceof HistoryCompactionError &&
      !/SELECT|credential|mysql:|FixtureResult/u.test(error.message));
    assert.ok(!f.queries.some(({ sql }) => sql.startsWith("WITH")), missing);
  }
});

test("missing implied evidence or a partially visible extended group withholds every candidate", async () => {
  for (const [missing, absent] of [[["ImpliedMarketResultEvidence"], ["ImpliedMarketResultEvidence"]],
    [["ExtendedMarketSettlementRevision"], ["GoalMarketExtension", "ImpliedMarketExtension", "ExtendedMarketSettlement"]],
    [OPTIONAL, OPTIONAL]]) {
    const f = fixture({ tables: [...CORE, ...OPTIONAL].filter((name) => !missing.includes(name)) });
    const report = await inspectHistoryCompaction(f.database);
    assert.equal(report.blockers.referenceCoverage, "incomplete");
    for (const entry of report.tables) {
      assert.equal(entry.candidateRows, 0); assert.equal(entry.candidateJsonBytes, 0);
      assert.equal(reason(report, entry.table, "pending-recovery-global").rows, 0);
    }
    assert.deepEqual(reason(report, "ResultProviderObservation", "reference-coverage-unavailable"), { reason: "reference-coverage-unavailable", rows: 3, jsonBytes: 450 });
    for (const name of absent) assert.ok(f.queries.every(({ sql }) => !sql.includes(name)), name);
  }
});

test("a pending batch anywhere withholds candidates as pending recovery", async () => {
  const report = await inspectHistoryCompaction(fixture({ pending: 1n }).database);
  assert.equal(report.blockers.pendingBatches, 1); assert.equal(report.blockers.referenceCoverage, "complete");
  for (const entry of report.tables) {
    assert.equal(entry.candidateRows, 0); assert.equal(reason(report, entry.table, "reference-coverage-unavailable").rows, 0);
  }
  assert.equal(reason(report, "FixtureLifecycleObservation", "pending-recovery-global").rows, 2);
  assert.equal(reason(report, "ResultSyncBatch", "pending-recovery-global").rows, 3);
});

test("bounded passes report partial coverage and resume from the last inspected key", async () => {
  const fixtures = await inspectHistoryCompaction(fixture().database, { maxFixtures: 3, pageSize: 2 });
  assert.deepEqual(fixtures.scope, { fixturesInspected: 3, batchesInspected: 3, coverage: "partial", resumeAfterFixture: fixtureIds[2], resumeAfterBatch: null });
  const resumed = fixture(), next = await inspectHistoryCompaction(resumed.database, { afterFixture: fixtureIds[2], pageSize: 2 });
  assert.equal(next.scope.fixturesInspected, 2); assert.equal(next.scope.coverage, "complete");
  assert.deepEqual(resumed.queries.find(({ sql }) => sql.startsWith("SELECT fixtureId AS id")).values, [fixtureIds[2], 3]);
  const exact = await inspectHistoryCompaction(fixture().database, { maxFixtures: 5, pageSize: 5 });
  assert.equal(exact.scope.coverage, "complete", "an extra probe key distinguishes a finished pass from a bound");
  const batches = await inspectHistoryCompaction(fixture().database, { maxBatches: 2 });
  assert.deepEqual([batches.scope.coverage, batches.scope.batchesInspected, batches.scope.resumeAfterBatch, batches.scope.resumeAfterFixture],
    ["partial", 2, batchIds[1], null]);
  const skipped = await inspectHistoryCompaction(fixture().database, { maxBatches: 0, afterBatch: batchIds[0] });
  assert.deepEqual([skipped.scope.coverage, skipped.scope.batchesInspected, skipped.scope.resumeAfterBatch], ["partial", 0, batchIds[0]]);
  const none = await inspectHistoryCompaction(fixture({ batches: [] }).database, { maxBatches: 0 });
  assert.equal(none.scope.coverage, "complete");
});

test("reason tuples are ordered and the settlement flags mirror every pending() arm", async () => {
  assert.deepEqual(OBSERVATION_REASONS, ["pending-batch", "result-source", "non-confirmation-outcome", "settlement-pending",
    "fixture-still-tracked", "implied-evidence", "latest-confirmation", "transient-candidate"]);
  assert.deepEqual(LIFECYCLE_REASONS, ["change-event", "non-confirmation-outcome", "no-result-sync-source", "referenced-by-retained-observation",
    "settlement-pending", "fixture-still-tracked", "implied-evidence", "latest-confirmation", "cursor-receipt", "transient-candidate"]);
  assert.deepEqual(BATCH_REASONS, ["pending-batch", "error-receipt", "requested-ids-without-observation", "unmatched-observations",
    "retained-batch-member", "transient-candidate"]);
  assert.deepEqual(GLOBAL_REASONS, ["reference-coverage-unavailable", "pending-recovery-global"]);
  const f = fixture(), report = await inspectHistoryCompaction(f.database);
  for (const [name, reasons] of [["ResultProviderObservation", OBSERVATION_REASONS], ["FixtureLifecycleObservation", LIFECYCLE_REASONS], ["ResultSyncBatch", BATCH_REASONS]])
    assert.deepEqual(table(report, name).reasons.map((entry) => entry.reason), [...reasons, ...GLOBAL_REASONS]);
  const flags = f.queries.find(({ sql }) => sql.includes("FROM orz GROUP BY"));
  for (const kind of settlementSourceKinds) assert.ok(flags.values.includes(kind), kind);
  assert.match(flags.sql, /\(SELECT COUNT\(\*\) FROM MarketSettlement m WHERE m\.cycleId = c\.id\) < 4/u);
  assert.match(flags.sql, /marketKey LIKE 'goal:%'/u); assert.match(flags.sql, /marketKey LIKE 'implied:%'/u);
  assert.match(flags.sql, /FROM ImpliedMarketResultEvidence i/u);
  // CASE branches appear in tuple order, so the first applicable reason wins.
  for (const [marker, reasons] of [["orz AS", OBSERVATION_REASONS], ["lrz AS", LIFECYCLE_REASONS]]) {
    const sql = f.queries.find(({ sql: text }) => text.includes("FROM lrz GROUP BY")).sql, body = sql.slice(sql.indexOf(marker));
    const positions = reasons.map((name) => branch(body, name));
    assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])), marker);
  }
  const batch = f.queries.find(({ sql }) => sql.includes("FROM brz GROUP BY")).sql, body = batch.slice(batch.indexOf("brz AS"));
  const positions = BATCH_REASONS.map((name) => branch(body, name));
  assert.ok(positions.every((value, index) => value >= 0 && (index === 0 || value > positions[index - 1])));
  // The pending() SQL literal list is the exported constant.
  const source = await readFile(new URL("../src/server/settlement/settlement-service.ts", import.meta.url), "utf8");
  assert.equal(source.match(/e\.kind IN \(([^)]+)\)/u)[1], settlementSourceKinds.map((kind) => `'${kind}'`).join(","));
});

test("never-compacted tables exist in the schema and none of them is classified", async () => {
  const schema = await readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  for (const { table: name } of NEVER_COMPACTED) assert.match(schema, new RegExp(`^model ${name} \\{`, "mu"), name);
  assert.ok(Object.isFrozen(NEVER_COMPACTED) && NEVER_COMPACTED.every(Object.isFrozen));
  const report = await inspectHistoryCompaction(fixture().database);
  assert.deepEqual(report.tables.map((entry) => entry.table), ["ResultProviderObservation", "FixtureLifecycleObservation", "ResultSyncBatch"]);
  for (const name of ["FixtureResult", "PredictionChangeEvent", "SettlementEventReceipt"]) {
    assert.ok(!report.tables.some((entry) => entry.table === name));
    assert.ok(report.neverCompacted.some((entry) => entry.table === name));
  }
});

test("the report schema rejects inconsistent sums, candidates and unwithheld global blockers", async () => {
  const report = await inspectHistoryCompaction(fixture().database);
  assert.ok(historyCompactionReportSchema.safeParse(report).success);
  const changed = (edit) => { const value = structuredClone(report); edit(value); return historyCompactionReportSchema.safeParse(value).success; };
  assert.equal(changed((value) => { value.tables[0].inspectedRows += 1; }), false);
  assert.equal(changed((value) => { value.tables[0].reasons[1].jsonBytes += 1; }), false);
  assert.equal(changed((value) => { value.tables[1].candidateRows = 0; }), false);
  assert.equal(changed((value) => { value.tables[0].reasons.reverse(); }), false);
  assert.equal(changed((value) => { value.tables.reverse(); }), false);
  assert.equal(changed((value) => { value.blockers.pendingBatches = 1; }), false, "candidates cannot remain beside a pending batch");
  assert.equal(changed((value) => { value.tables[2].table = "FixtureResult"; }), false);
  assert.equal(changed((value) => { value.neverCompacted.pop(); }), false);
  assert.equal(changed((value) => { value.mode = "apply"; }), false);
  assert.equal(changed((value) => { value.deletion.implemented = true; }), false);
  assert.equal(changed((value) => { value.scope.resumeAfterFixture = fixtureIds[0]; }), false, "a complete census has no resume cursor");
  assert.equal(changed((value) => { value.body = "private"; }), false);
});

test("unknown database reasons or unsafe counts are refused", async () => {
  const base = fixture();
  const database = { async transaction(run, settings) {
    return base.database.transaction((tx) => run({ ...tx, async $queryRaw(query, ...rest) {
      const rows = await tx.$queryRaw(query, ...rest), sql = query.sql ?? query.join("?");
      return sql.includes("FROM orz GROUP BY") ? [{ reason: "deleted", rowCount: 1n, jsonBytes: 1n }] : rows;
    } }), settings);
  } };
  await assert.rejects(inspectHistoryCompaction(database), HistoryCompactionError);
  const unsafe = { async transaction(run, settings) {
    return base.database.transaction((tx) => run({ ...tx, async $queryRaw(query, ...rest) {
      const rows = await tx.$queryRaw(query, ...rest), sql = query.sql ?? query.join("?");
      return sql.includes("FROM brz GROUP BY") ? [{ reason: "transient-candidate", rowCount: BigInt(Number.MAX_SAFE_INTEGER) + 1n, jsonBytes: 1n }] : rows;
    } }), settings);
  } };
  await assert.rejects(inspectHistoryCompaction(unsafe), HistoryCompactionError);
});

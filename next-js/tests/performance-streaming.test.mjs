import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { performanceRules } from "../src/domain/performance.ts";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { parsePerformanceQuery } from "../src/server/performance/performance-query.ts";
import { readPerformanceBatches, readPerformanceSnapshot } from "../src/server/performance/performance-read.ts";
import { aggregatePerformance, createPerformanceAccumulator, createPerformanceService } from "../src/server/performance/performance-service.ts";
import { performanceRecord, performanceSnapshot, performanceProtocol } from "./helpers/performance-fixtures.mjs";

const asOf = Date.parse("2026-10-28T09:00:00Z");
const query = parsePerformanceQuery(new URLSearchParams("from=2026-09-29&to=2026-10-28"), parseReportingDate("2026-10-28"));
const idFor = (index) => `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const hash = (value) => createHash("sha256").update(value).digest("hex");

/** A sealed result cohort with real serialized payload bytes, not an oversized metadata-only stub. */
function largeStoredCohort(count, { reportedBytesPerResult = 0, corruptAt = -1 } = {}) {
  const selected = Array.from({ length: count }, (_, index) => ({ id: idFor(index + 1) }));
  const resultRows = [], batches = [], decodedBatches = [];
  let current = [], historicalReads = 0, totalDecodedBytes = 0;
  const content = { status: "finished-regulation", providerStatus: "FT", elapsedMinutes: 90,
    reportedGoals: { home: 2, away: 1 }, extraTimeScore: { home: null, away: null }, penaltyScore: { home: null, away: null },
    regulation: { verified: true, home: 2, away: 1, evidenceRef: "synthetic-" + "r".repeat(500) },
    halfTime: { verified: true, period: "first-half-including-stoppage-time", home: 1, away: 0, evidenceRef: "synthetic-" + "h".repeat(500) } };
  for (const [index, fixture] of selected.entries()) {
    const body = { ...content, id: hash(fixture.id), fixtureId: fixture.id, fixtureVersion: 1n,
      previousId: null, observationId: hash(`observation:${fixture.id}`), observedAt: asOf, providerUpdatedAt: null, regulationVerifiedAt: asOf };
    resultRows.push({ id: body.id, fixtureId: fixture.id, fixtureVersion: 1n, observedAt: new Date(asOf), status: content.status,
      regulationVerified: 1, regulationHome: 2n, regulationAway: 1n, contentHash: evidenceFingerprint(content),
      body: evidenceSerialize(body), validIntegrity: index === corruptAt ? 0n : 1n });
  }
  const byFixture = new Map(resultRows.map((row) => [row.fixtureId, row]));
  const tx = {
    footballFixture: { findMany: async ({ where }) => {
      current = where.id.in.map((id) => byFixture.get(id));
      batches.push(current.length);
      return current.map((row) => ({ id: row.fixtureId, activeCycleId: null, dataVersion: 1n,
        resultState: { resultId: row.id }, homeTeam: { name: "Synthetic Home" }, awayTeam: { name: "Synthetic Away" },
        season: { competitionId: idFor(900_000), competition: { name: "Synthetic League", country: "Uganda" } } }));
    } },
    predictionCycle: { findMany: async () => [] },
    $queryRaw: async (sql) => {
      const text = sql.strings.join(" ");
      if (text.includes("SELECT f.id")) return selected;
      if (text.includes("FROM FixtureResult")) {
        const bytes = current.reduce((sum, row) => sum + Buffer.byteLength(row.body), 0);
        if (text.includes("SUM(OCTET_LENGTH")) return [{ bytes: BigInt(Math.max(bytes, current.length * reportedBytesPerResult)), total: BigInt(current.length) }];
        decodedBatches.push(current.length); totalDecodedBytes += bytes;
        return current;
      }
      if (text.includes("SELECT c.voidReason")) { historicalReads++; return [{ voidReason: "formal-postponement" }]; }
      return [];
    },
  };
  return { tx, batches, decodedBatches, get historicalReads() { return historicalReads; }, get totalDecodedBytes() { return totalDecodedBytes; },
    storedBytes: resultRows.reduce((sum, row) => sum + Buffer.byteLength(row.body), 0) };
}

test("a 30-day 16,800-fixture cohort exceeding the old total byte cap streams completely", async () => {
  const source = largeStoredCohort(16_800);
  assert.ok(source.storedBytes > performanceRules.maximumStoredBytes);
  const accumulator = createPerformanceAccumulator(query, asOf, null);
  for await (const batch of readPerformanceBatches(source.tx, query, [39])) accumulator.add(batch);
  const report = accumulator.finish();
  assert.equal(report.cohort.fixtureCount, 16_800);
  assert.equal(report.cells[0].coverage.total, 16_800);
  assert.equal(report.cells[0].coverage.unavailable, 16_800);
  assert.equal(report.leagues.records[0].fixtureCount, 16_800);
  assert.equal(source.totalDecodedBytes, source.storedBytes);
  assert.ok(source.decodedBatches.every((size) => size <= performanceRules.maximumFixtures));
  assert.equal(source.historicalReads, 1);
  assert.equal(report.historicalCycles.postponed, 1);
  // Confirm this payload represents the prior failure mode, rather than merely many tiny rows.
  await assert.rejects(readPerformanceSnapshot(largeStoredCohort(16_800).tx, query, [39]), (error) => error.code === "unavailable");
});

test("dense batches split before JSON loading while preserving one historical-cycle read", async () => {
  const source = largeStoredCohort(1005, { reportedBytesPerResult: 20_000 });
  let records = 0;
  for await (const batch of readPerformanceBatches(source.tx, query, [39])) records += batch.records.length;
  assert.equal(records, 1005);
  assert.deepEqual(source.batches, [1000, 500, 500, 5]);
  assert.deepEqual(source.decodedBatches, [500, 500, 5]);
  assert.equal(source.historicalReads, 1);
});

test("later dense batches reuse the first safe size without repeating rejected JSON preflights", async () => {
  const source = largeStoredCohort(2500, { reportedBytesPerResult: 20_000 });
  let records = 0;
  for await (const batch of readPerformanceBatches(source.tx, query, [39])) records += batch.records.length;
  assert.equal(records, 2500);
  assert.deepEqual(source.batches, [1000, 500, 500, 500, 500, 500]);
  assert.deepEqual(source.decodedBatches, [500, 500, 500, 500, 500]);
  assert.equal(source.historicalReads, 1);
});

test("a final quote-byte overflow rejects the entire batch before any earlier JSON payload loads", async () => {
  const fixtureId = idFor(1), cycleId = idFor(2), revisionId = idFor(3), kickoffAt = asOf + 600_000;
  const cutoffAt = kickoffAt - 300_000, resultId = "a".repeat(64), modelId = "b".repeat(64);
  const preflightTables = [], loaded = [];
  const cycle = { id: cycleId, fixtureId, creationKey: "c".repeat(64), creationHash: "d".repeat(64), ordinal: 1, version: 1,
    scheduleVersion: 1, kickoffAt: new Date(kickoffAt), cutoffAt: new Date(cutoffAt), openedAt: new Date(asOf - 60_000),
    state: "closed", currentSetId: revisionId, lockedSetId: revisionId, closedAt: new Date(cutoffAt), lockedAt: new Date(cutoffAt),
    voidedAt: null, voidReason: null };
  const tx = {
    footballFixture: { findMany: async () => [{ id: fixtureId, activeCycleId: cycleId, resultState: { resultId } }] },
    predictionCycle: { findMany: async () => [cycle] },
    predictionSchedule: { findMany: async () => [{ cycleId, fixtureId, version: 1, kickoffAt: cycle.kickoffAt, cutoffAt: cycle.cutoffAt }] },
    predictionSet: { findMany: async ({ select }) => {
      assert.deepEqual(select, { id: true, modelVersionId: true });
      return [{ id: revisionId, modelVersionId: modelId }];
    } },
    $queryRaw: async (sql) => {
      const text = sql.strings.join(" ");
      if (text.includes("SELECT f.id")) return [{ id: fixtureId }];
      const table = text.match(/FROM ([A-Za-z]+)/u)?.[1];
      if (text.includes("SUM(OCTET_LENGTH")) {
        preflightTables.push(table);
        return [{ bytes: BigInt(table === "PredictionQuote" ? performanceRules.maximumStoredBytes : 1), total: 1n }];
      }
      loaded.push(table);
      throw new Error("JSON decoding began before complete payload preflight.");
    },
  };
  await assert.rejects(readPerformanceSnapshot(tx, query, [39], { bookmakerId: 8, maximumAgeMs: 300_000 }), error => error.code === "unavailable");
  assert.deepEqual(preflightTables, ["PredictionSet", "MarketPrediction", "FixtureResult", "MarketSettlementRevision", "ModelVersion", "PredictionQuote"]);
  assert.deepEqual(loaded, []);
});

test("a corrupt later batch prevents the public service from returning partial period counts", async () => {
  const source = largeStoredCohort(1005, { corruptAt: 1004 });
  const service = createPerformanceService({ competitionIds: [39], clock: { now: () => utcInstantFromEpochMilliseconds(asOf) },
    database: { transaction: async (operation) => operation(source.tx) } });
  await assert.rejects(service.query(new URLSearchParams("from=2026-09-29&to=2026-10-28")), (error) => error.code === "unavailable");
  assert.deepEqual(source.decodedBatches, [1000, 5]);
});

test("stream boundaries preserve quality gates, source/league totals, quotes and publication-order streaks", () => {
  const records = Array.from({ length: 18 }, (_, index) => {
    const record = performanceRecord({ source: index % 3 === 0 ? "api-football" : "ai", score: index % 4 === 0 ? [2, 1] : [0, 1],
      state: index % 7 === 0 ? "void" : index % 11 === 0 ? "open" : "closed" });
    if (record.revision) record.revision.publishedAt += (18 - index) * 1000;
    return record;
  });
  const snapshot = performanceSnapshot(records), protocol = performanceProtocol();
  for (const record of records) if (record.revision) snapshot.quotes.set(`${record.revision.id}:match-result:${record.revision.candidate.markets["match-result"].market.selection}`, "2.25");
  const expected = aggregatePerformance(snapshot, query, asOf, protocol);
  for (const batchSize of [1, 3, 7]) {
    const accumulator = createPerformanceAccumulator(query, asOf, protocol);
    for (let offset = 0; offset < records.length; offset += batchSize) accumulator.add({ ...snapshot, records: records.slice(offset, offset + batchSize) });
    assert.deepEqual(accumulator.finish(), expected);
  }
});

test("stream state retains numeric metrics rather than references to decoded candidates", () => {
  const snapshot = performanceSnapshot([performanceRecord(), performanceRecord({ score: [0, 1] })]), protocol = performanceProtocol();
  const expected = aggregatePerformance(snapshot, query, asOf, protocol), accumulator = createPerformanceAccumulator(query, asOf, protocol);
  const decoded = structuredClone(snapshot);
  let discarded = false;
  for (const record of decoded.records) for (const item of Object.values(record.revision.candidate.markets)) if (item.available) {
    item.market = new Proxy(item.market, { get(target, key, receiver) {
      if (discarded) throw new Error("Decoded market was retained after its batch was discarded.");
      return Reflect.get(target, key, receiver);
    } });
  }
  accumulator.add(decoded);
  discarded = true;
  decoded.records.length = 0;
  assert.deepEqual(accumulator.finish(), expected);
});

test("a quote grant received and revoked mid-query cannot price stored picks", async () => {
  const { spawnSync } = await import("node:child_process");
  // Isolate the module mock from the real streaming reader exercised above.
  const child = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--input-type=module"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 15_000,
    input: `
      import { mock } from "node:test";
      import { performanceRecord, performanceSnapshot } from "./tests/helpers/performance-fixtures.mjs";
      const snapshot = performanceSnapshot([performanceRecord()]), record = snapshot.records[0];
      const key = record.revision.id + ":match-result:" + record.revision.candidate.markets["match-result"].market.selection;
      mock.module("./src/server/performance/performance-read.ts", { exports: {
        readPerformanceBatches: async function* (_tx, _query, _scope, grant) {
          yield { ...snapshot, quotes: grant ? new Map([[key, "2.25"]]) : new Map() };
        },
      } });
      const { createPerformanceService } = await import("./src/server/performance/performance-service.ts");
      const approvals = [false, true, true, false];
      let calls = 0;
      const service = createPerformanceService({ competitionIds: [39],
        database: { transaction: async (operation) => operation({}) },
        clock: { now: () => Date.parse("2026-10-28T09:00:00Z") },
        quoteBinding: { bookmakerId: 1, maximumAgeMs: 60_000,
          verifyPublicDisplay: () => approvals[calls++] ?? false },
      });
      const report = await service.query(new URLSearchParams("market=match-result"));
      process.stdout.write(JSON.stringify(report.cells[0].returns));
    `,
  });
  assert.equal(child.status, 0, child.stderr || child.error?.message);
  const returns = JSON.parse(child.stdout);
  assert.equal(returns.settled, 1);
  assert.equal(returns.returnsSampleCount, 0);
  assert.equal(returns.excludedQuoteCount, 1);
  assert.equal(returns.roi, null);
  assert.equal(returns.meanQuotedOdds, null);
});

test("only development demo reporting receives the bounded full-cohort transaction budget", async () => {
  const { spawnSync } = await import("node:child_process");
  for (const [mode, enabled, expectedTimeout] of [["production", "true", 30_000], ["development", "false", 30_000], ["development", "true", 240_000]]) {
    const child = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--input-type=module"], {
      cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 15_000,
      env: { ...process.env, NODE_ENV: mode, NEXT_PUBLIC_GOAL_HINT_DEMO: enabled },
      input: `
        import assert from "node:assert/strict";
        import { mock } from "node:test";
        import { performanceSnapshot } from "./tests/helpers/performance-fixtures.mjs";
        mock.module("./src/server/demo/read-seed.ts", { exports: { prepareDemoRange: async () => {} } });
        mock.module("./src/server/demo/publication-quotes.ts", { exports: { ensureDemoPublicationQuotes: async () => {} } });
        mock.module("./src/server/performance/performance-read.ts", { exports: {
          readPerformanceBatches: async function* () { yield performanceSnapshot([]); },
        } });
        const { createPerformanceService } = await import("./src/server/performance/performance-service.ts");
        const service = createPerformanceService({ competitionIds: [39],
          clock: { now: () => Date.parse("2026-10-28T09:00:00Z") },
          database: { transaction: async (operation, options) => {
            assert.equal(options.isolationLevel, "RepeatableRead");
            assert.equal(options.timeout, ${expectedTimeout});
            return operation({});
          } },
        });
        await service.query();
      `,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { measureDatabaseStorage, databaseStorageReport, storageHealthFromReport, StorageMeasurementError } from "../src/server/database/storage.ts";
import { storageMeasurementSchema } from "../src/server/database/storage-contract.ts";
import { approvedStorageHealth } from "../src/server/monitoring/monitoring-storage.ts";
import { evaluateMonitoring } from "../src/server/monitoring/monitoring-rules.ts";
import { monitoringPolicy, monitoringSnapshot, MONITOR_NOW, memoryMonitoring } from "./helpers/monitoring-fixtures.mjs";

const databaseKey = "a".repeat(64);
function fixture({ rows, sample, metadataError = false, sampleError = false } = {}) {
  const queries = [], executions = [];
  const database = { async transaction(run, options) {
    assert.deepEqual(options, { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 30_000 });
    return run({ async $queryRaw(query) {
      const sql = query.sql ?? query.join("?"); queries.push({ sql, values: query.values ?? [] });
      if (sql.includes("UTC_TIMESTAMP")) return [{ at: new Date(MONITOR_NOW), databaseKey, cacheSeconds: 86400n }];
      if (sql.includes("information_schema.TABLES")) {
        if (metadataError) throw new Error("private mysql://credential diagnostic");
        return rows ?? [{ tableName: "PredictionSet", engine: "InnoDB", dataBytes: 16_384n, indexBytes: 32_768n, estimatedRows: 99n, estimatedAverageRowBytes: 180n },
          { tableName: "MemberAccount", engine: "InnoDB", dataBytes: 16_384n, indexBytes: 16_384n, estimatedRows: 4n, estimatedAverageRowBytes: 400n }];
      }
      if (sampleError) throw new Error("private JSON body and SQL diagnostic");
      return sample ?? [{ rowCount: 2n, jsonBytes: 150n, maximumJsonBytes: 100n }];
    }, async $executeRaw(query, ...values) { executions.push({ sql: query.join("?"), values }); return 0; } });
  } };
  return { database, queries, executions };
}

test("storage inspection reads current-schema allocation and bounded aggregate payload sizes without returning records", async () => {
  const f = fixture(), result = await measureDatabaseStorage(f.database, 25);
  assert.equal(result.allocatedBytes, 81_920); assert.equal(result.dataBytes, 32_768); assert.equal(result.indexBytes, 49_152);
  const prediction = result.tables[0];
  assert.equal(prediction.estimatedRows, 99); assert.equal(prediction.estimatedAverageRowBytes, 180);
  assert.deepEqual(prediction.sample, { state: "measured", rows: 2, jsonBytes: 150, maximumJsonBytes: 100, averageJsonBytes: 75 });
  assert.equal(result.tables[1].sample, null, "member rows are never sampled");
  assert.equal(result.statsCacheSeconds, 0); assert.equal(result.databaseKey, databaseKey);
  assert.ok(f.queries[1].sql.includes("TABLE_SCHEMA = DATABASE()"));
  assert.ok(f.queries[1].sql.includes("TABLE_TYPE = 'BASE TABLE'"));
  assert.match(f.queries[1].sql, /LIMIT 513/u);
  assert.match(f.queries[2].sql, /JSON_STORAGE_SIZE\(`candidateJson`\).*FROM `PredictionSet`/su);
  assert.deepEqual(f.queries[2].values, [25]);
  assert.equal(f.queries.length, 3); assert.equal(f.executions.length, 2);
  assert.match(f.executions[0].sql, /SET SESSION information_schema_stats_expiry = 0/u);
  assert.deepEqual(f.executions[1].values, [86400]);
  assert.ok(!JSON.stringify(result).includes("credential"));
});

test("empty JSON samples, unavailable sampling and unknown allocation remain distinct", async () => {
  const empty = await measureDatabaseStorage(fixture({ sample: [{ rowCount: 0n, jsonBytes: 0n, maximumJsonBytes: 0n }] }).database);
  assert.deepEqual(empty.tables[0].sample, { state: "measured", rows: 0, jsonBytes: 0, maximumJsonBytes: 0, averageJsonBytes: null });
  const unavailable = await measureDatabaseStorage(fixture({ sampleError: true }).database);
  assert.deepEqual(unavailable.tables[0].sample, { state: "unavailable", rows: null, jsonBytes: null, maximumJsonBytes: null, averageJsonBytes: null });
  const unknown = await measureDatabaseStorage(fixture({ rows: [{ tableName: "FixtureResult", engine: "InnoDB", dataBytes: null, indexBytes: 16_384n,
    estimatedRows: null, estimatedAverageRowBytes: null }] }).database, 0);
  assert.equal(unknown.allocatedBytes, null); assert.equal(unknown.indexBytes, 16_384); assert.equal(unknown.tables[0].sample, null);
});

test("Windows lowercase metadata names still receive fixed-column JSON size sampling", async () => {
  const result = await measureDatabaseStorage(fixture({ rows: [{ tableName: "predictionset", engine: "InnoDB", dataBytes: 16_384n,
    indexBytes: 0n, estimatedRows: 2n, estimatedAverageRowBytes: 8192n }] }).database, 2);
  assert.equal(result.tables[0].table, "predictionset", "preserve actual engine metadata spelling");
  assert.equal(result.tables[0].sample.state, "measured"); assert.equal(result.tables[0].sample.rows, 2);
});

test("collector restores the metadata cache setting after failure and rejects unsafe/oversized metadata without diagnostics", async () => {
  for (const options of [{ metadataError: true }, { rows: [] }, { rows: Array(513).fill({}) },
    { rows: [{ tableName: "Injected`Secret", dataBytes: 0n, indexBytes: 0n }] },
    { rows: [{ tableName: "FixtureResult", engine: "InnoDB", dataBytes: BigInt(Number.MAX_SAFE_INTEGER) + 1n, indexBytes: 0n }] }]) {
    const f = fixture(options);
    await assert.rejects(measureDatabaseStorage(f.database), (error) => error instanceof StorageMeasurementError && !/credential|Injected|Secret/u.test(error.message));
    assert.equal(f.executions.length, 2); assert.deepEqual(f.executions[1].values, [86400]);
  }
  let called = false;
  for (const value of [-1, 1001, 1.5, Infinity, "100"])
    await assert.rejects(measureDatabaseStorage({ async transaction() { called = true; } }, value), StorageMeasurementError);
  assert.equal(called, false);
});

test("storage measurements reject inconsistent totals, duplicates and unsupported sampling claims", async () => {
  const measured = await measureDatabaseStorage(fixture().database);
  for (const changed of [{ ...measured, allocatedBytes: 1 }, { ...measured, statsCacheSeconds: 86400 },
    { ...measured, tables: [...measured.tables, measured.tables[0]] },
    { ...measured, tables: [{ ...measured.tables[0], sample: { state: "measured", rows: null, jsonBytes: null, maximumJsonBytes: null, averageJsonBytes: null } }, measured.tables[1]] }])
    assert.equal(storageMeasurementSchema.safeParse(changed).success, false);
});

test("growth compares only matching database identity and increasing clocks, includes shrinkage and threshold equality", async () => {
  const previous = await measureDatabaseStorage(fixture().database);
  const current = structuredClone(previous); current.measuredAt += 86_400_000;
  current.tables[0].dataBytes += 16_384; current.tables[0].allocatedBytes += 16_384;
  current.dataBytes += 16_384; current.allocatedBytes += 16_384;
  const report = databaseStorageReport(current, previous, { maximumAllocatedBytes: current.allocatedBytes, maximumGrowthBytesPerDay: 16_384 });
  assert.equal(report.comparison.allocatedDeltaBytes, 16_384); assert.equal(report.comparison.growthBytesPerDay, 16_384);
  assert.deepEqual(report.alerts, { allocation: true, growth: true });
  assert.equal(report.comparison.tableChanges[0].allocatedDeltaBytes, 16_384);
  for (const prior of [null, { ...previous, databaseKey: "b".repeat(64) }, { ...previous, measuredAt: current.measuredAt }, { ...previous, measuredAt: current.measuredAt + 1 }]) {
    const missing = databaseStorageReport(current, prior, report.limits);
    assert.equal(missing.comparison.growthBytesPerDay, null); assert.equal(missing.alerts.growth, null);
  }
  const smaller = structuredClone(previous); smaller.measuredAt = current.measuredAt + 86_400_000;
  assert.equal(databaseStorageReport(smaller, current, report.limits).comparison.growthBytesPerDay, -16_384);
  assert.equal(databaseStorageReport(smaller, current, report.limits).alerts.growth, false);
});

test("storage monitoring requires current verified evidence and never clears incidents from missing/stale/unapproved data", async () => {
  const measured = await measureDatabaseStorage(fixture().database);
  const report = databaseStorageReport(measured, null, { maximumAllocatedBytes: 10_000, maximumGrowthBytesPerDay: 10_000 });
  const evidence = storageHealthFromReport(report, "synthetic-storage-policy");
  assert.deepEqual(approvedStorageHealth(evidence, MONITOR_NOW, 60_000, () => true), evidence);
  for (const input of [undefined, { ...evidence, measuredAt: MONITOR_NOW + 1 }, { ...evidence, measuredAt: MONITOR_NOW - 60_001 }, { ...evidence, raw: "secret" }])
    assert.equal(approvedStorageHealth(input, MONITOR_NOW, 60_000, () => true), null);
  for (const verify of [undefined, () => false, async () => true, async () => { throw new Error("private"); }, () => { throw new Error("private"); }])
    assert.equal(approvedStorageHealth(evidence, MONITOR_NOW, 60_000, verify), null);
  await new Promise((done) => setImmediate(done));
  for (const age of [0, -1, NaN, Infinity]) assert.equal(approvedStorageHealth(evidence, MONITOR_NOW, age, () => true), null);
  const policy = monitoringPolicy(), snapshot = monitoringSnapshot(); snapshot.storage = evidence;
  const cap = evaluateMonitoring(snapshot, policy).find((condition) => condition.rule === "storage-cap");
  assert.equal(cap.active, true); assert.equal(cap.scope, "database");
  assert.equal(evaluateMonitoring(snapshot, policy).find((condition) => condition.rule === "storage-growth").active, null, "no baseline is not zero growth");
  const monitor = memoryMonitoring(() => MONITOR_NOW);
  await monitor.monitor.observe(snapshot); await monitor.monitor.deliver();
  assert.ok(monitor.sink.read().some((message) => message.rule === "storage-cap"));
  snapshot.storage = null;
  await monitor.monitor.observe(snapshot);
  assert.equal(monitor.state().slots.find((slot) => slot.message.rule === "storage-cap").message.status, "firing");
  snapshot.storage = { ...evidence, growthBytesPerDay: 20_000 };
  await monitor.monitor.observe(snapshot);
  assert.equal(monitor.state().slots.find((slot) => slot.message.rule === "storage-growth").message.status, "firing");
  snapshot.storage = { ...evidence, growthBytesPerDay: -1000 };
  await monitor.monitor.observe(snapshot);
  const resolved = monitor.state().slots.find((slot) => slot.message.rule === "storage-growth").message;
  assert.equal(resolved.status, "resolved"); assert.equal(resolved.value, 0, "nonnegative alert values preserve existing outbox contract");
});

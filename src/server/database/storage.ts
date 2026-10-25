import "server-only";

import type { z } from "zod";
import type { DatabaseRuntime } from "./client.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { storageMeasurementSchema, storageLimitsSchema, storageHealthSchema, storageTableName, storageSampleSchema, type StorageMeasurement } from "./storage-contract.ts";

export { storageMeasurementSchema, storageLimitsSchema } from "./storage-contract.ts";

export class StorageMeasurementError extends Error {
  constructor() { super("Storage measurement unavailable; private database diagnostics are withheld."); this.name = "StorageMeasurementError"; }
}

const sampleColumns = Object.freeze({ PredictionSet: { column: "candidateJson", key: "id" },
  FixtureResult: { column: "body", key: "id" }, ResultSyncBatch: { column: "body", key: "id" },
  ResultProviderObservation: { column: "body", key: "id" }, FixtureLifecycleObservation: { column: "receiptJson", key: "id" },
  FixtureEvidenceSnapshot: { column: "snapshotJson", key: "requestId" }, EvidenceSourceVersion: { column: "metadataJson", key: "id" },
  ProviderOddsSnapshot: { column: "body", key: "id" }, DailySlipPublication: { column: "bodyJson", key: "id" },
  PublishedSlip: { column: "snapshotJson", key: "id" } });
// Windows MySQL normally stores metadata table names in lowercase (lower_case_table_names=1).
const sampleSources = new Map(Object.entries(sampleColumns).map(([name, source]) => [name.toLowerCase(), source]));
const identifier = (value: string) => Prisma.raw(`\`${value}\``);
function numeric(value: unknown): number | null {
  if (value === null) return null;
  const result = typeof value === "bigint" ? Number(value) : value;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result < 0) throw new StorageMeasurementError();
  return result;
}
const sum = (values: readonly (number | null)[]) => values.some((value) => value === null) ? null : numeric(values.reduce<number>((total, value) => total + value!, 0));

/** Private operator inspection. Only sizes/metadata leave MySQL; no JSON body or member record is selected.
 * The caller owns this runtime and must close it after inspection, including on failed session restoration. */
export async function measureDatabaseStorage(database: Pick<DatabaseRuntime, "transaction">, sampleRows = 100): Promise<StorageMeasurement> {
  if (!Number.isSafeInteger(sampleRows) || sampleRows < 0 || sampleRows > 1000) throw new StorageMeasurementError();
  try {
    return await database.transaction(async (tx) => {
      const context = (await tx.$queryRaw<{ at: Date; databaseKey: string; cacheSeconds: bigint }[]>`SELECT UTC_TIMESTAMP(3) AS at,
        SHA2(CONCAT(@@server_uuid, ':', DATABASE()), 256) AS databaseKey, @@SESSION.information_schema_stats_expiry AS cacheSeconds`)[0];
      if (!context || !(context.at instanceof Date)) throw new StorageMeasurementError();
      const cacheSeconds = numeric(context.cacheSeconds);
      if (cacheSeconds === null) throw new StorageMeasurementError();
      // Session-only: bypass MySQL's normally 24-hour metadata cache without ANALYZE or persistent writes.
      await tx.$executeRaw`SET SESSION information_schema_stats_expiry = 0`;
      try {
        const rows = await tx.$queryRaw<{ tableName: string; engine: string | null; dataBytes: bigint | null; indexBytes: bigint | null;
          estimatedRows: bigint | null; estimatedAverageRowBytes: bigint | null }[]>`SELECT /*+ MAX_EXECUTION_TIME(5000) */
          TABLE_NAME AS tableName, ENGINE AS engine, DATA_LENGTH AS dataBytes, INDEX_LENGTH AS indexBytes,
          TABLE_ROWS AS estimatedRows, AVG_ROW_LENGTH AS estimatedAverageRowBytes
          FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME LIMIT 513`;
        if (rows.length === 0 || rows.length > 512) throw new StorageMeasurementError();
        const tables: StorageMeasurement["tables"] = [];
        for (const row of rows) {
          const name = storageTableName.parse(row.tableName), dataBytes = numeric(row.dataBytes), indexBytes = numeric(row.indexBytes);
          let sample: z.infer<typeof storageSampleSchema> | null = null;
          const source = sampleSources.get(name.toLowerCase());
          if (sampleRows > 0 && source) {
            try {
              const record = (await tx.$queryRaw<{ rowCount: bigint; jsonBytes: bigint | null; maximumJsonBytes: bigint | null }[]>(Prisma.sql`
                SELECT /*+ MAX_EXECUTION_TIME(5000) */ COUNT(*) AS rowCount, CAST(COALESCE(SUM(sizeBytes), 0) AS UNSIGNED) AS jsonBytes,
                  COALESCE(MAX(sizeBytes), 0) AS maximumJsonBytes FROM (
                  SELECT JSON_STORAGE_SIZE(${identifier(source.column)}) AS sizeBytes FROM ${identifier(name)}
                  ORDER BY ${identifier(source.key)} LIMIT ${sampleRows}) AS sampled`))[0];
              if (!record) throw new StorageMeasurementError();
              const count = numeric(record.rowCount), total = numeric(record.jsonBytes), maximum = numeric(record.maximumJsonBytes);
              if (count === null || total === null || maximum === null || count > sampleRows) throw new StorageMeasurementError();
              sample = { state: "measured", rows: count, jsonBytes: total, maximumJsonBytes: maximum,
                averageJsonBytes: count ? total / count : null };
            } catch { sample = { state: "unavailable", rows: null, jsonBytes: null, maximumJsonBytes: null, averageJsonBytes: null }; }
          }
          tables.push({ table: name, engine: row.engine, dataBytes, indexBytes, allocatedBytes: sum([dataBytes, indexBytes]),
            estimatedRows: numeric(row.estimatedRows), estimatedAverageRowBytes: numeric(row.estimatedAverageRowBytes), sample });
        }
        return storageMeasurementSchema.parse({ version: 1, measuredAt: context.at.getTime(), databaseKey: context.databaseKey,
          statsCacheSeconds: 0, sampleRows, tables, dataBytes: sum(tables.map((table) => table.dataBytes)),
          indexBytes: sum(tables.map((table) => table.indexBytes)), allocatedBytes: sum(tables.map((table) => table.allocatedBytes)) });
      } finally { await tx.$executeRaw`SET SESSION information_schema_stats_expiry = ${cacheSeconds}`; }
    }, { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 30_000 });
  } catch { throw new StorageMeasurementError(); }
}

/** Only comparable, increasing-time snapshots establish growth; unavailable statistics never become zero. */
export function databaseStorageReport(input: unknown, prior: unknown = null, settings: unknown = { maximumAllocatedBytes: null, maximumGrowthBytesPerDay: null }) {
  const measurement = storageMeasurementSchema.parse(input), previous = prior === null ? null : storageMeasurementSchema.parse(prior);
  const limits = storageLimitsSchema.parse(settings);
  const comparable = previous !== null && previous.databaseKey === measurement.databaseKey && previous.measuredAt < measurement.measuredAt;
  const elapsedMs = comparable ? measurement.measuredAt - previous.measuredAt : null;
  const allocatedDeltaBytes = comparable && previous.allocatedBytes !== null && measurement.allocatedBytes !== null
    ? measurement.allocatedBytes - previous.allocatedBytes : null;
  const growthBytesPerDay = allocatedDeltaBytes === null ? null : allocatedDeltaBytes * (86_400_000 / elapsedMs!);
  const before = new Map(comparable ? previous.tables.map((table) => [table.table, table]) : []);
  const tableChanges = comparable ? measurement.tables.map((table) => ({ table: table.table, added: !before.has(table.table),
    allocatedDeltaBytes: table.allocatedBytes !== null && before.get(table.table)?.allocatedBytes !== null && before.has(table.table)
      ? table.allocatedBytes - before.get(table.table)!.allocatedBytes! : null })) : [];
  return { measurement, comparison: { state: previous === null ? "baseline-missing" : !comparable ? "not-comparable" : "compared",
    previousAt: comparable ? previous.measuredAt : null, elapsedMs, allocatedDeltaBytes, growthBytesPerDay, tableChanges,
    removedTables: comparable ? previous.tables.filter((table) => !measurement.tables.some((current) => current.table === table.table)).map((table) => table.table) : [] }, limits,
    alerts: { allocation: limits.maximumAllocatedBytes === null || measurement.allocatedBytes === null ? null : measurement.allocatedBytes >= limits.maximumAllocatedBytes,
      growth: limits.maximumGrowthBytesPerDay === null || growthBytesPerDay === null ? null : growthBytesPerDay >= limits.maximumGrowthBytesPerDay } };
}

/** A trusted binding must verify the measurement target, provenance and these exact limits before monitoring use. */
export function storageHealthFromReport(report: ReturnType<typeof databaseStorageReport>, evidenceRef: string) {
  return storageHealthSchema.parse({ evidenceRef, measuredAt: report.measurement.measuredAt, allocatedBytes: report.measurement.allocatedBytes,
    growthBytesPerDay: report.comparison.growthBytesPerDay, limits: report.limits });
}

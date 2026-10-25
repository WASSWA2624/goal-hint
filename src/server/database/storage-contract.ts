import "server-only";

import { z } from "zod";

const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.number().int().nonnegative().max(253_402_300_799_000);
export const storageTableName = z.string().regex(/^[A-Za-z0-9_$]{1,64}$/u);
export const storageSampleSchema = z.strictObject({ state: z.enum(["measured", "unavailable"]), rows: bytes.nullable(),
  jsonBytes: bytes.nullable(), maximumJsonBytes: bytes.nullable(), averageJsonBytes: z.number().finite().nonnegative().nullable(),
}).refine((value) => value.state === "unavailable"
  ? [value.rows, value.jsonBytes, value.maximumJsonBytes, value.averageJsonBytes].every((item) => item === null)
  : value.rows !== null && value.jsonBytes !== null && value.maximumJsonBytes !== null && value.maximumJsonBytes <= value.jsonBytes &&
    (value.rows === 0 ? value.jsonBytes === 0 && value.maximumJsonBytes === 0 && value.averageJsonBytes === null
      : value.averageJsonBytes === value.jsonBytes / value.rows));
export const storageMeasurementSchema = z.strictObject({ version: z.literal(1), measuredAt: instant,
  databaseKey: z.string().regex(/^[a-f0-9]{64}$/u), statsCacheSeconds: z.literal(0), sampleRows: z.number().int().min(0).max(1000),
  tables: z.array(z.strictObject({ table: storageTableName, engine: z.string().max(64).nullable(),
    dataBytes: bytes.nullable(), indexBytes: bytes.nullable(), allocatedBytes: bytes.nullable(),
    estimatedRows: bytes.nullable(), estimatedAverageRowBytes: bytes.nullable(), sample: storageSampleSchema.nullable() })).min(1).max(512),
  allocatedBytes: bytes.nullable(), dataBytes: bytes.nullable(), indexBytes: bytes.nullable(),
}).refine((value) => {
  const total = (values: readonly (number | null)[]) => values.some((item) => item === null) ? null : values.reduce<number>((sum, item) => sum + item!, 0);
  return new Set(value.tables.map((table) => table.table)).size === value.tables.length &&
    value.tables.every((table) => table.allocatedBytes === total([table.dataBytes, table.indexBytes]) &&
      (!table.sample || table.sample.rows === null || table.sample.rows <= value.sampleRows)) &&
    (["dataBytes", "indexBytes", "allocatedBytes"] as const).every((key) => value[key] === total(value.tables.map((table) => table[key])));
});
export type StorageMeasurement = z.infer<typeof storageMeasurementSchema>;
export const storageLimitsSchema = z.strictObject({ maximumAllocatedBytes: bytes.positive().nullable(),
  maximumGrowthBytesPerDay: z.number().finite().positive().max(Number.MAX_SAFE_INTEGER).nullable() });
export type StorageLimits = z.infer<typeof storageLimitsSchema>;
export const storageHealthSchema = z.strictObject({ evidenceRef: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u),
  measuredAt: instant, allocatedBytes: bytes.nullable(), growthBytesPerDay: z.number().finite().nullable(),
  limits: storageLimitsSchema });
export type StorageHealthEvidence = z.infer<typeof storageHealthSchema>;

import "server-only";

import { z } from "zod";
import { jobInstant } from "../jobs/job-input.ts";
import { monitoringRef } from "./monitoring-contract.ts";

const duration = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const evidenceSchema = z.strictObject({ evidenceRef: monitoringRef, measuredAt: jobInstant,
  snapshotAt: jobInstant.nullable(), archiveAt: jobInstant.nullable(), restoreAt: jobInstant.nullable(),
  failureCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  snapshotMaxAgeMs: duration, archiveMaxAgeMs: duration, restoreMaxAgeMs: duration,
}).refine((v) => [v.snapshotAt, v.archiveAt, v.restoreAt].every((at) => at === null || at <= v.measuredAt));
export type BackupHealthEvidence = z.infer<typeof evidenceSchema>;
export type BackupMonitoringSource = Readonly<{ read(): Promise<unknown>; verify(evidence: BackupHealthEvidence): boolean }>;
export const backupMetricNames = ["backup-failures", "backup-stale", "restore-verification-pending"] as const;

/** Missing/stale/unapproved evidence cannot imply a healthy backup or clear an incident. */
export function assessBackupHealth(input: unknown, at: number, evidenceMaxAgeMs: number, verify?: BackupMonitoringSource["verify"]) {
  const pending = { "backup-failures": null, "backup-stale": null, "restore-verification-pending": null };
  try {
    const parsed = evidenceSchema.safeParse(input);
    if (!parsed.success || verify?.(parsed.data) !== true) return pending;
    const e = parsed.data;
    if (e.measuredAt > at || at - e.measuredAt > evidenceMaxAgeMs) return pending;
    return { "backup-failures": e.failureCount,
      "backup-stale": e.snapshotAt === null || e.archiveAt === null || at - e.snapshotAt > e.snapshotMaxAgeMs || at - e.archiveAt > e.archiveMaxAgeMs ? 1 : 0,
      "restore-verification-pending": e.restoreAt === null || at - e.restoreAt > e.restoreMaxAgeMs ? 1 : 0 };
  } catch { return pending; }
}

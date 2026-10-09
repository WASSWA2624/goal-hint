import "server-only";

import { getReportingDate, parseReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { selectionFail, type SelectionManifest } from "./selection-contract.ts";
import type { Prisma, DailyRun } from "../generated/prisma/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";

export async function storedSelectionManifest(tx: Prisma.TransactionClient, row: DailyRun): Promise<SelectionManifest | null> {
  const sealed = await tx.dailyRunManifest.findUnique({ where: { runId: row.id } });
  if (sealed === null) return row.committedAt === null ? null : selectionFail("unavailable");
  if (evidenceFingerprint(sealed.manifestJson) !== sealed.manifestHash) return selectionFail("unavailable");
  const manifest = sealed.manifestJson as unknown as SelectionManifest;
  if (manifest.runId !== row.id || manifest.sequence !== String(row.sequence) || manifest.runDate !== row.eatDate.toISOString().slice(0, 10) ||
    manifest.selectionHash !== row.selectionHash || evidenceFingerprint(row.selectionJson) !== manifest.selectionHash ||
    manifest.committedAt !== row.committedAt?.getTime() || manifest.startInclusive !== row.windowStart?.getTime() ||
    manifest.endExclusive !== row.windowEnd?.getTime() || manifest.partial !== row.partial || manifest.entries.length !== row.totalJobs) return selectionFail("unavailable");
  return freezeEvidence(manifest);
}

/** Later feed projections must consult date coverage before claiming emptiness. */
export function selectionDateState(manifest: SelectionManifest, input: string) {
  const date = parseReportingDate(input), coverage = manifest.coverage.find((entry) => entry.date === date);
  if (!coverage) return selectionFail("invalid-request");
  const count = manifest.entries.filter((entry) => getReportingDate(utcInstantFromEpochMilliseconds(entry.kickoffAt)) === date).length;
  return Object.freeze({ date, count, state: coverage.status !== "complete" ? count > 0 ? "partial" : "data-unavailable" :
    count > 0 ? "selected" : "no-fixtures", importId: coverage.importId, missingCoverage: coverage.missingCoverage });
}

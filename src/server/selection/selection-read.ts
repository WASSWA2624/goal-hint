import "server-only";

import { addReportingDays, createPredictionWindow, getReportingDate, parseReportingDate, predictionWindowDays, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { selectionFail, type SelectionManifest } from "./selection-contract.ts";
import type { Prisma, DailyRun } from "../generated/prisma/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseSelectionPolicy } from "./selection-input.ts";

/** Frozen policy and stored boundaries must agree; a later deployment cannot extend an old run. */
export function selectionRunWindow(row: Pick<DailyRun, "eatDate" | "selectionJson" | "windowStart" | "windowEnd">) {
  try {
    const policy = row.selectionJson === null ? null : parseSelectionPolicy(row.selectionJson);
    const window = createPredictionWindow(parseReportingDate(row.eatDate.toISOString().slice(0, 10)), policy?.windowDays ?? 7);
    if (policy === null ? row.windowStart !== null || row.windowEnd !== null
      : row.windowStart?.getTime() !== window.startInclusive || row.windowEnd?.getTime() !== window.endExclusive) return selectionFail("unavailable");
    return window;
  } catch { return selectionFail("unavailable"); }
}

export async function storedSelectionManifest(tx: Prisma.TransactionClient, row: DailyRun): Promise<SelectionManifest | null> {
  const sealed = await tx.dailyRunManifest.findUnique({ where: { runId: row.id } });
  if (sealed === null) return row.committedAt === null ? null : selectionFail("unavailable");
  if (evidenceFingerprint(sealed.manifestJson) !== sealed.manifestHash) return selectionFail("unavailable");
  const manifest = sealed.manifestJson as unknown as SelectionManifest;
  const window = selectionRunWindow(row);
  if (manifest.version !== 1 || manifest.runId !== row.id || manifest.sequence !== String(row.sequence) || manifest.runDate !== row.eatDate.toISOString().slice(0, 10) ||
    manifest.selectionHash !== row.selectionHash || evidenceFingerprint(row.selectionJson) !== manifest.selectionHash ||
    manifest.committedAt !== row.committedAt?.getTime() || manifest.startInclusive !== row.windowStart?.getTime() ||
    manifest.endExclusive !== row.windowEnd?.getTime() || manifest.startInclusive !== window.startInclusive || manifest.endExclusive !== window.endExclusive ||
    manifest.partial !== row.partial || manifest.entries.length !== row.totalJobs ||
    manifest.coverage.length !== predictionWindowDays(window) ||
    manifest.coverage.some((entry, index) => entry.date !== addReportingDays(window.runDate, index)) ||
    manifest.entries.some((entry) => !Number.isSafeInteger(entry.kickoffAt) || entry.kickoffAt < window.startInclusive ||
      entry.kickoffAt >= window.endExclusive)) return selectionFail("unavailable");
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

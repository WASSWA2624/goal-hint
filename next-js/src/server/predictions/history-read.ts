import "server-only";

import type { Prisma } from "../generated/prisma/client.ts";
import { MARKET_RULE_VERSION, marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import { parseResolvedForecastCandidate } from "../fallback/fallback-input.ts";
import { historyFail, type CycleDisplay, type StoredCycle, type StoredRevision, type StoredRun } from "./history-contract.ts";
import { historyHash, historyId, historyInstant, historyVersion, parseHistory, parseStoredCycle } from "./history-input.ts";

export type HistoryTransaction = Prisma.TransactionClient;
export type HistoryRow = Record<string, unknown>;
export const historyDate = (value: number | null) => value === null ? null : new Date(value);
export function historyTime(value: unknown): ReturnType<typeof utcInstantFromEpochMilliseconds> {
  if (!(value instanceof Date)) return historyFail("invalid-state");
  return parseHistory(historyInstant, value.getTime());
}
export function historyInteger(value: unknown): bigint {
  try {
    if (typeof value !== "bigint" || value < 1n || value > 18_446_744_073_709_551_615n) throw new Error();
    return value;
  } catch { return historyFail("invalid-state"); }
}
export function historyJson(value: unknown): unknown {
  try {
    return JSON.parse(typeof value === "string" ? value : JSON.stringify(value), (_key, child: unknown) => {
      if (child !== null && typeof child === "object" && "$evidenceInteger" in child) {
        if (Object.keys(child).length !== 1 || typeof child.$evidenceInteger !== "string" || !/^[1-9][0-9]{0,19}$/u.test(child.$evidenceInteger)) throw new Error();
        return historyInteger(BigInt(child.$evidenceInteger));
      }
      return child;
    });
  } catch { return historyFail("invalid-state"); }
}
export function assertHistorySeal(value: unknown): void {
  if (value !== true && value !== 1 && value !== 1n) historyFail("invalid-state");
}
const unsignedVersion = (value: unknown) => parseHistory(historyVersion, typeof value === "bigint" ? Number(value) : value);
export function runFromRow(row: HistoryRow): StoredRun {
  const date = historyTime(row.eatDate);
  const eatDate = new Date(date).toISOString().slice(0, 10), sequence = historyInteger(row.sequence);
  if (sequence !== BigInt(eatDate.replaceAll("-", ""))) return historyFail("invalid-state");
  return freezeEvidence({ id: parseHistory(historyId, row.id), sequence, eatDate,
    createdAt: historyTime(row.createdAt) });
}
export async function storedCycle(transaction: HistoryTransaction, id: string): Promise<StoredCycle | null> {
  const row = await transaction.predictionCycle.findUnique({ where: { id } });
  if (!row) return null;
  const schedule = await transaction.predictionSchedule.findUnique({ where: { cycleId_version: { cycleId: id, version: row.scheduleVersion } } });
  return cycleFromRows(row, schedule);
}
export function cycleFromRows(row: HistoryRow, schedule: HistoryRow | null): StoredCycle {
  try {
    const value = parseStoredCycle({ ...row, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt),
      openedAt: historyTime(row.openedAt), closedAt: row.closedAt === null ? null : historyTime(row.closedAt),
      lockedAt: row.lockedAt === null ? null : historyTime(row.lockedAt), voidedAt: row.voidedAt === null ? null : historyTime(row.voidedAt) });
    if (!schedule || schedule.cycleId !== value.id || schedule.version !== value.scheduleVersion || schedule.fixtureId !== value.fixtureId ||
      historyTime(schedule.kickoffAt) !== value.kickoffAt || historyTime(schedule.cutoffAt) !== value.cutoffAt) return historyFail("invalid-state");
    return value;
  } catch { return historyFail("invalid-state"); }
}
export async function storedRevision(transaction: HistoryTransaction, id: string): Promise<StoredRevision | null> {
  const rows = await transaction.$queryRaw<HistoryRow[]>`SELECT *,
    integrity = SHA2(CONCAT(id, ':', requestHash, ':', CAST(candidateJson AS CHAR)), 256) AS validIntegrity
    FROM PredictionSet WHERE id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  const markets = await transaction.$queryRaw<HistoryRow[]>`SELECT *,
    integrity = SHA2(CAST(payloadJson AS CHAR), 256) AS validIntegrity FROM MarketPrediction WHERE setId = ${id}`;
  return revisionFromRows(row, markets);
}
export function revisionFromRows(row: HistoryRow, markets: HistoryRow[]): StoredRevision {
  try {
    assertHistorySeal(row.validIntegrity);
    const candidate = parseResolvedForecastCandidate(historyJson(row.candidateJson)), context = candidate.context.context;
    const revision: StoredRevision = freezeEvidence({ id: parseHistory(historyId, row.id),
      fixtureId: parseHistory(historyId, row.fixtureId), fixtureVersion: historyInteger(row.fixtureVersion),
      cycleId: parseHistory(historyId, row.cycleId), runId: parseHistory(historyId, row.runId), runSequence: historyInteger(row.runSequence),
      jobId: parseHistory(historyHash, row.jobId), fixtureRevision: unsignedVersion(row.fixtureRevision),
      cycleRevision: unsignedVersion(row.cycleRevision), predecessorId: row.predecessorId === null ? null : parseHistory(historyId, row.predecessorId),
      scheduleVersion: unsignedVersion(row.scheduleVersion), modelVersionId: row.modelVersionId === null ? null : parseHistory(historyHash, row.modelVersionId),
      evidenceSnapshotId: parseHistory(historyHash, row.evidenceSnapshotId), evidenceHash: parseHistory(historyHash, row.evidenceHash),
      evidenceCutoffAt: historyTime(row.evidenceCutoffAt), generationCompletedAt: historyTime(row.generationCompletedAt),
      publishedAt: historyTime(row.publishedAt), recordedAt: historyTime(row.recordedAt),
      ruleVersion: String(row.ruleVersion), requestHash: parseHistory(historyHash, row.requestHash), candidate });
    if (context.fixtureId !== revision.fixtureId || context.fixtureVersion !== revision.fixtureVersion ||
      context.cycleId !== revision.cycleId || context.runId !== revision.runId || candidate.context.jobId !== revision.jobId ||
      candidate.context.evidenceHash !== revision.evidenceHash || context.cutoffAt !== revision.evidenceCutoffAt ||
      (candidate.context.pin?.modelVersionId ?? null) !== revision.modelVersionId || revision.ruleVersion !== MARKET_RULE_VERSION ||
      !Object.values(candidate.markets).some((item) => item.available) ||
      revision.generationCompletedAt < context.analysisAt || revision.publishedAt < revision.generationCompletedAt ||
      revision.recordedAt < revision.publishedAt) return historyFail("invalid-state");
    if (markets.length !== 4) return historyFail("invalid-state");
    const seen = new Set<string>();
    for (const marketRow of markets) {
      assertHistorySeal(marketRow.validIntegrity);
      const family = marketRow.family as MarketFamily, item = candidate.markets[family];
      if (marketRow.setId !== revision.id || !item || seen.has(family) || evidenceFingerprint(historyJson(marketRow.payloadJson)) !== evidenceFingerprint(item) ||
        Boolean(marketRow.available) !== item.available) return historyFail("invalid-state");
      seen.add(family);
      const probabilities = item.available ? marketSelections[family].map((selection) =>
        (item.market.probabilities as Readonly<Record<string, number>>)[selection]) : [];
      if (marketRow.source !== (item.available ? item.market.source : null) ||
        marketRow.selection !== (item.available ? item.market.selection : null) ||
        marketRow.selectedProbability !== (item.available ? item.market.selectedProbability : null) ||
        marketRow.unavailableReason !== (item.available ? null : item.reason) ||
        [1, 2, 3].some((number) => marketRow[`probability${number}`] !== (probabilities[number - 1] ?? null))) return historyFail("invalid-state");
      for (const name of ["generatedAt", "retrievedAt", "providerUpdatedAt"] as const) {
        const time = item.available ? item.timestamps[name] : null;
        if (time === null ? marketRow[name] !== null : historyTime(marketRow[name]) !== time) return historyFail("invalid-state");
      }
      if (item.available && item.timestamps.retrievedAt > revision.generationCompletedAt) return historyFail("invalid-state");
    }
    return revision;
  } catch { return historyFail("invalid-state"); }
}

export async function storedCycleDisplay(transaction: HistoryTransaction, cycleId: string): Promise<CycleDisplay | null> {
  const cycle = await storedCycle(transaction, cycleId);
  if (!cycle) return null;
  let id = cycle.state === "open" ? cycle.currentSetId : cycle.lockedSetId;
  if (cycle.state === "void" && id === null) {
    id = cycle.currentSetId ?? (await transaction.predictionSet.findFirst({ where: { cycleId }, orderBy: { cycleRevision: "desc" }, select: { id: true } }))?.id ?? null;
  }
  const revision = id === null ? null : await storedRevision(transaction, id);
  if (id !== null && (!revision || revision.cycleId !== cycle.id || revision.fixtureId !== cycle.fixtureId)) return historyFail("invalid-state");
  return freezeEvidence({ cycle, mode: cycle.state === "open" ? "current" : cycle.state === "void" ? "void" : "locked", revision });
}

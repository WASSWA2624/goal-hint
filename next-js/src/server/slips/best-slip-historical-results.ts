import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { isMarketFamily } from "../../domain/markets.ts";
import type { SlipSelection } from "../../domain/slip-builder.ts";
import type { SlipResult } from "../../domain/slip-snapshot.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { revisionEligibleForLock } from "../predictions/cutoff-eligibility.ts";
import { storedCutoffOperation } from "../predictions/cutoff-read.ts";
import type { StoredRevision } from "../predictions/history-contract.ts";
import { historyTime, storedRevisions } from "../predictions/history-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import { cycleEligibilityFor, storedSettlementRevision } from "../settlement/settlement-read.ts";
import { readVerifiedSlipResultRows } from "./best-slip-history.ts";

type Tx = Prisma.TransactionClient;

async function originalSettlement(tx: Tx, selection: SlipSelection, revision: StoredRevision | undefined, observedAt: number, before: Date) {
  const reference = selection.forecast;
  if (!reference || !revision || !isMarketFamily(selection.family) || revision.fixtureId !== selection.fixtureId ||
    revision.cycleId !== reference.cycleId || revision.publishedAt !== reference.publishedAt || revision.publishedAt > observedAt)
    return null;

  const result: SlipResult = { fixtureId: selection.fixtureId, forecast: reference, family: selection.family, selection: selection.selection,
    completed: true, fixtureCompleted: true, status: "unknown", regulationVerified: false, regulationHome: null, regulationAway: null };
  const voided = await storedCutoffOperation(tx, reference.cycleId, "void");
  if (voided && voided.at < before.getTime() && voided.fixtureId === selection.fixtureId)
    return { result: { ...result, cycleEligibility: cycleEligibilityFor(voided.cycle) }, settlement: null };

  const closed = await storedCutoffOperation(tx, reference.cycleId, "close");
  if (!closed?.cycle.lockedSetId || closed.fixtureId !== selection.fixtureId || closed.at >= before.getTime() ||
    closed.effectiveCloseAt <= observedAt) return null;
  const schedules = await tx.predictionSchedule.findMany({ where: { cycleId: reference.cycleId, fixtureId: selection.fixtureId,
    version: { lte: closed.cycle.scheduleVersion }, observedAt: { lte: new Date(closed.at) } }, orderBy: { version: "asc" } });
  if (schedules.length !== closed.cycle.scheduleVersion || !revisionEligibleForLock(revision, closed.cycle, schedules.map(row => ({
    version: row.version, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt), observedAt: historyTime(row.observedAt),
    actualStartedAt: row.actualStartedAt === null ? null : historyTime(row.actualStartedAt),
  })), closed.effectiveCloseAt)) return null;

  const newest = await tx.marketSettlementRevision.findFirst({ where: { fixtureId: selection.fixtureId, cycleId: reference.cycleId,
    family: selection.family, at: { lt: before } }, orderBy: [{ at: "desc" }, { batch: { fixtureVersion: "desc" } }, { id: "desc" }], select: { id: true } });
  if (!newest) return null;
  const settlement = await storedSettlementRevision(tx, newest.id);
  if (settlement.fixtureId !== selection.fixtureId || settlement.cycleId !== reference.cycleId || settlement.family !== selection.family ||
    settlement.lockedSetId !== closed.cycle.lockedSetId || settlement.cycleState !== "closed" || settlement.at < closed.at ||
    settlement.at >= before.getTime() || !settlement.resultUsable || !settlement.resultId ||
    (settlement.status !== "correct" && settlement.status !== "incorrect")) return null;
  return { result, settlement, context: revision.candidate.context.context, kickoffAt: closed.cycle.kickoffAt };
}

/** Use only original-cycle settlement and result revisions recorded by the phase boundary. */
export async function readBestSlipHistoricalResults(database: Pick<DatabaseRuntime, "transaction">, input: Readonly<{
  selections: readonly SlipSelection[]; observationAt: number; availableAt: number; competitionIds: readonly number[];
}>): Promise<readonly SlipResult[]> {
  const { selections, observationAt, availableAt, competitionIds } = input;
  const before = new Date(utcInstantFromEpochMilliseconds(availableAt) + 1);
  if (availableAt <= observationAt || selections.length > 40) throw new RangeError("Invalid historical study settlement boundary.");
  if (!selections.length) return [];
  return database.transaction(async tx => {
    const revisions = await storedRevisions(tx, selections.flatMap(({ forecast }) => forecast ? [forecast.revisionId] : []));
    const originals = [];
    for (const selection of selections) {
      const original = await originalSettlement(tx, selection, revisions.get(selection.forecast?.revisionId ?? ""), observationAt, before);
      if (original) originals.push(original);
    }
    const rows = await readVerifiedSlipResultRows(tx, originals.flatMap(({ settlement }) => settlement?.resultId ? [settlement.resultId] : []),
      competitionIds, before);
    const byId = new Map(rows.map(row => [row.id, row]));
    return originals.flatMap<SlipResult>(original => {
      const { result, settlement } = original;
      if (!settlement) return [result];
      const row = byId.get(settlement.resultId);
      if (!row) return [];
      const verified = fixtureResultFromRow(row), recordedAt = historyTime(row.recordedAt);
      const started = row.lifecycleStartedAt;
      if (verified.fixtureId !== result.fixtureId || !isPlayedFinalStatus(verified.status) || !verified.regulation.verified ||
        verified.observedAt <= observationAt || verified.observedAt < original.kickoffAt || recordedAt < verified.observedAt ||
        recordedAt > settlement.at || row.lifecycleCycleId !== result.forecast!.cycleId || row.lifecycleStatus !== verified.status ||
        Number(row.lifecycleKickoffAt) !== original.kickoffAt || Number(row.lifecycleHomeId) !== original.context.home.externalId ||
        Number(row.lifecycleAwayId) !== original.context.away.externalId ||
        (started !== null && started !== "null" && !(Number(started) > observationAt && Number(started) <= verified.observedAt)) ||
        (verified.providerUpdatedAt !== null && verified.providerUpdatedAt > verified.observedAt)) return [];
      return [{ ...result, status: verified.status, regulationVerified: true,
        regulationHome: verified.regulation.home, regulationAway: verified.regulation.away }];
    });
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}

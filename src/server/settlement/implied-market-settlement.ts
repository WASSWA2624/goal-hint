import "server-only";

import { z } from "zod";
import { settledExtendedStatuses as settledStatuses } from "../../domain/extended-markets.ts";
import { NON_GOAL_MARKET_RULE_VERSION } from "../../domain/non-goal-market-definitions.ts";
import { settleNonGoalSelection, type NonGoalSettlementContext } from "../../domain/non-goal-market-settlement.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { historyFail, type StoredCycle } from "../predictions/history-contract.ts";
import { historyHash, historyId, historyInstant } from "../predictions/history-input.ts";
import { assertHistorySeal, historyJson, historyTime, storedCycle, type HistoryRow } from "../predictions/history-read.ts";
import type { StoredImpliedMarketExtension } from "../predictions/implied-market-contract.ts";
import { readImpliedMarketExtension } from "../predictions/implied-market-store.ts";
import { fixtureResultMatchesCanonical, resultStatus, storedFixtureResult } from "../results/result-read.ts";
import { readImpliedResultEvidence, type StoredImpliedResultEvidence } from "./implied-market-evidence.ts";
import { cycleEligibilityFor } from "./settlement-read.ts";

type Tx = Prisma.TransactionClient;
const baseSchema = z.strictObject({
  fixtureId: historyId, cycleId: historyId, predictionRevisionId: historyId,
  marketKey: z.string().startsWith("implied:").max(128), source: z.literal("market-implied"), ruleVersion: z.literal(NON_GOAL_MARKET_RULE_VERSION),
  probabilityBasis: z.enum(["normalized-bookmaker-price", "conditional-payout-price"]).nullable(),
  selection: z.string().min(1).max(64).nullable(), selectedProbability: z.number().finite().min(0).max(1).nullable(),
  resultId: historyHash.nullable(), evidenceId: historyHash.nullable(), resultUsable: z.boolean(),
  status: z.enum([...settledStatuses, "pending", "void", "unavailable"]), reason: z.string().min(1).max(128),
  cycleState: z.enum(["closed", "void"]), voidReason: z.string().min(1).max(2000).nullable(),
});
export const impliedMarketSettlementRevisionSchema = baseSchema.extend({
  id: historyHash, batchId: historyHash, previousId: historyHash.nullable(), inputHash: historyHash,
  at: historyInstant, correctedAt: historyInstant.nullable(), kind: z.enum(["initial", "transition", "correction"]),
}).refine((value) => (value.kind === "initial") === (value.previousId === null) &&
  (value.kind !== "correction" || value.correctedAt === value.at) && (value.correctedAt === null || value.correctedAt <= value.at) &&
  (value.selection === null) === (value.status === "unavailable") && (value.selection === null) === (value.selectedProbability === null) &&
  (value.selection === null) === (value.probabilityBasis === null) && (!value.resultUsable || value.resultId !== null) &&
  (value.evidenceId === null || value.resultId !== null) &&
  (!settledStatuses.some((status) => status === value.status) || value.resultUsable && value.resultId !== null && value.evidenceId !== null) &&
  (value.cycleState === "void") === (value.voidReason !== null));
export type ImpliedMarketSettlementRevision = Readonly<z.infer<typeof impliedMarketSettlementRevisionSchema>>;
type SettlementBase = Readonly<z.infer<typeof baseSchema>>;
export type ImpliedMarketSettlementPlan = Readonly<{ base: SettlementBase; inputHash: string; previous: ImpliedMarketSettlementRevision | null }>;

export function impliedMarketSettlementFromRow(row: HistoryRow): ImpliedMarketSettlementRevision {
  assertHistorySeal(row.validIntegrity);
  const parsed = impliedMarketSettlementRevisionSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const value = parsed.data, base = baseSchema.parse(Object.fromEntries(Object.keys(baseSchema.shape)
    .map((key) => [key, value[key as keyof typeof value]])));
  if (evidenceFingerprint(base) !== value.inputHash || value.id !== row.id || value.batchId !== row.batchId ||
      value.fixtureId !== row.fixtureId || value.cycleId !== row.cycleId || value.marketKey !== row.marketKey ||
      value.predictionRevisionId !== row.predictionRevisionId || value.previousId !== row.previousId || value.resultId !== row.resultId ||
      value.inputHash !== row.inputHash || value.source !== row.source || historyTime(row.at) !== value.at) return historyFail("invalid-state");
  return freezeEvidence(value);
}
export async function readImpliedMarketSettlement(tx: Tx, id: string): Promise<ImpliedMarketSettlementRevision> {
  historyHash.parse(id);
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
    FROM ExtendedMarketSettlementRevision WHERE id = ${id}`;
  if (!row) return historyFail("invalid-state");
  return impliedMarketSettlementFromRow(row);
}

/** One sealed pick and exact result-bound evidence; statistic corrections never choose a new market or selection. */
export function projectImpliedMarketSettlements(extension: StoredImpliedMarketExtension, cycle: StoredCycle,
  context: NonGoalSettlementContext, resultId: string | null, evidence: StoredImpliedResultEvidence | null,
  recorded: ReadonlyMap<string, ImpliedMarketSettlementRevision>): readonly ImpliedMarketSettlementPlan[] {
  if (cycle.state === "open" || cycle.id !== extension.cycleId || cycle.fixtureId !== extension.fixtureId ||
      cycle.lockedSetId !== extension.revisionId || context.cycleEligibility.eligible !== (cycle.state !== "void") ||
      !evidence && context.evidence !== null ||
      evidence && (evidence.fixtureId !== extension.fixtureId || evidence.resultId !== resultId ||
        evidenceFingerprint(context.evidence) !== evidenceFingerprint(evidence.evidence))) return historyFail("invalid-state");
  return freezeEvidence(extension.markets.map(({ definition, derivation }) => {
    const market = derivation.available ? derivation.market : null, previous = recorded.get(definition.key) ?? null;
    if (previous && (previous.predictionRevisionId !== extension.revisionId || previous.fixtureId !== extension.fixtureId ||
        previous.cycleId !== cycle.id || previous.marketKey !== definition.key || previous.selection !== (market?.selection ?? null))) return historyFail("invalid-state");
    const outcome = market ? settleNonGoalSelection(definition, market.selection, context)
      : { status: "unavailable" as const, reason: derivation.available ? "unsupported-market" : derivation.reason };
    const historicalVoid = previous?.cycleState === "void" && cycle.state === "void";
    const base: SettlementBase = { fixtureId: extension.fixtureId, cycleId: cycle.id, predictionRevisionId: extension.revisionId,
      marketKey: definition.key, source: "market-implied", ruleVersion: NON_GOAL_MARKET_RULE_VERSION,
      probabilityBasis: market?.probabilityBasis ?? null, selection: market?.selection ?? null, selectedProbability: market?.selectedProbability ?? null,
      resultId: historicalVoid ? previous.resultId : market ? resultId : null,
      evidenceId: historicalVoid ? previous.evidenceId : market ? evidence?.id ?? null : null,
      resultUsable: historicalVoid ? previous.resultUsable : market ? context.resultUsable : false,
      status: outcome.status, reason: outcome.reason, cycleState: cycle.state as "closed" | "void", voidReason: cycle.voidReason };
    return { base, inputHash: evidenceFingerprint(base), previous };
  }));
}

/** Called only when the separate extended-markets capability is enabled and the fixture lock is held. */
export async function planImpliedMarketSettlements(tx: Tx, fixtureId: string): Promise<readonly ImpliedMarketSettlementPlan[]> {
  historyId.parse(fixtureId);
  const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } });
  const issue = (await tx.fixtureLifecycleState.findUnique({ where: { fixtureId } }))?.issue ?? null;
  const state = await tx.fixtureResultState.findUnique({ where: { fixtureId } });
  const result = state?.resultId ? await storedFixtureResult(tx, fixtureId, state.resultId) : null;
  const resultUsable = fixtureResultMatchesCanonical(fixture, result, issue);
  const evidence = resultUsable && result ? await readImpliedResultEvidence(tx, fixtureId, result.id) : null;
  const rows = await tx.predictionCycle.findMany({ where: { fixtureId, state: { in: ["closed", "void"] }, lockedSetId: { not: null } },
    orderBy: { ordinal: "asc" }, select: { id: true } });
  const plans: ImpliedMarketSettlementPlan[] = [];
  for (const row of rows) {
    const cycle = (await storedCycle(tx, row.id))!, extension = await readImpliedMarketExtension(tx, cycle.lockedSetId!);
    if (!extension) continue;
    const pointers = await tx.$queryRaw<{ revisionId: string }[]>`SELECT revisionId FROM ExtendedMarketSettlement WHERE cycleId = ${cycle.id} AND marketKey LIKE 'implied:%'`;
    const recorded = new Map<string, ImpliedMarketSettlementRevision>();
    for (const pointer of pointers) { const previous = await readImpliedMarketSettlement(tx, pointer.revisionId); recorded.set(previous.marketKey, previous); }
    const context: NonGoalSettlementContext = { status: issue && cycle.state !== "void" ? "unknown" : resultStatus.parse(fixture.status),
      cycleEligibility: cycleEligibilityFor(cycle),
      resultUsable, evidence: evidence?.evidence ?? null };
    plans.push(...projectImpliedMarketSettlements(extension, cycle, context, result?.id ?? null, evidence, recorded));
  }
  return freezeEvidence(plans);
}

/** Same existing SettlementBatch/version/outbox transaction. Rechecks caller plans before writing. */
export async function persistImpliedMarketSettlements(tx: Tx, plans: readonly ImpliedMarketSettlementPlan[], batchId: string, at: number) {
  historyHash.parse(batchId); historyInstant.parse(at);
  const verified = new Map<string, ImpliedMarketSettlementPlan>();
  for (const fixtureId of new Set(plans.map(({ base }) => base.fixtureId))) {
    for (const plan of await planImpliedMarketSettlements(tx, fixtureId)) verified.set(`${plan.base.cycleId}:${plan.base.marketKey}`, plan);
  }
  let changed = 0;
  for (const { base, inputHash, previous } of plans) {
    const current = verified.get(`${base.cycleId}:${base.marketKey}`);
    if (!current || evidenceFingerprint(current) !== evidenceFingerprint({ base, inputHash, previous })) return historyFail("invalid-state");
    if (previous?.inputHash === inputHash) continue;
    const correction = previous && settledStatuses.some((status) => status === previous.status) &&
      (previous.resultId !== base.resultId || previous.evidenceId !== base.evidenceId || previous.status !== base.status || previous.reason !== base.reason);
    const id = evidenceFingerprint({ batchId, cycleId: base.cycleId, marketKey: base.marketKey });
    const value = impliedMarketSettlementRevisionSchema.parse({ ...base, id, batchId, inputHash, previousId: previous?.id ?? null, at,
      kind: !previous ? "initial" : correction ? "correction" : "transition", correctedAt: correction ? at : previous?.correctedAt ?? null });
    if (evidenceFingerprint(base) !== inputHash || previous && at < previous.at) return historyFail("invalid-state");
    const cycle = await tx.predictionCycle.findUnique({ where: { id: base.cycleId }, select: { fixtureId: true, lockedSetId: true } });
    if (cycle?.lockedSetId !== base.predictionRevisionId || cycle.fixtureId !== base.fixtureId) return historyFail("invalid-state");
    const body = evidenceSerialize(value);
    await tx.$executeRaw`INSERT INTO ExtendedMarketSettlementRevision
      (id, fixtureId, cycleId, marketKey, predictionRevisionId, source, batchId, previousId, resultId, inputHash, at, integrity, body)
      VALUES (${id}, ${base.fixtureId}, ${base.cycleId}, ${base.marketKey}, ${base.predictionRevisionId}, ${base.source}, ${batchId}, ${value.previousId},
        ${value.resultId}, ${inputHash}, ${new Date(at)}, SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
    await tx.$executeRaw`INSERT INTO ExtendedMarketSettlement (fixtureId, cycleId, marketKey, revisionId)
      VALUES (${base.fixtureId}, ${base.cycleId}, ${base.marketKey}, ${id}) ON DUPLICATE KEY UPDATE revisionId = ${id}`;
    changed++;
  }
  return changed;
}

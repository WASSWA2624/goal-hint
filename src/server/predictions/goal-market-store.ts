import "server-only";

import { z } from "zod";
import { scoreDistributionSchema, type ScoreDistribution } from "../../domain/score-distribution.ts";
import { deriveGoalMarket, goalMarketDefinitionSchema, GOAL_MARKET_RULE_VERSION, settleGoalSelection,
  type GoalDerivationResult, type GoalMarketDefinition, type GoalSettlementContext } from "../../domain/score-distribution-markets.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { fixtureResultMatchesCanonical, resultStatus, storedFixtureResult } from "../results/result-read.ts";
import { historyFail, type StoredCycle } from "./history-contract.ts";
import { historyHash, historyId, historyInstant } from "./history-input.ts";
import { assertHistorySeal, historyJson, historyTime, storedCycle, type HistoryRow } from "./history-read.ts";

type Tx = Prisma.TransactionClient;
export const goalMarketStorageLimits = Object.freeze({ definitions: 256, bytes: 4 * 1024 * 1024 });
const inputSchema = z.strictObject({ scoreDistribution: scoreDistributionSchema,
  definitions: z.array(goalMarketDefinitionSchema).max(goalMarketStorageLimits.definitions),
}).superRefine(({ definitions }, context) => {
  if (new Set(definitions.map(({ key }) => key)).size !== definitions.length ||
      definitions.some(({ key, period }) => !key.startsWith(`goal:${period}:`))) {
    context.addIssue({ code: "custom", message: "Goal market definitions require unique period-qualified identities." });
  }
});
export type GoalMarketExtensionInput = Readonly<{
  scoreDistribution: ScoreDistribution; definitions: readonly GoalMarketDefinition[];
}>;
export type PreparedGoalMarketExtension = Readonly<{
  version: 1; ruleVersion: typeof GOAL_MARKET_RULE_VERSION; scoreDistribution: ScoreDistribution;
  markets: readonly Readonly<{ definition: GoalMarketDefinition; derivation: GoalDerivationResult }>[];
}>;
export type StoredGoalMarketExtension = PreparedGoalMarketExtension & Readonly<{
  revisionId: string; cycleId: string; fixtureId: string; recordedAt: number; contentHash: string;
}>;

/** Only reviewed provider definitions are accepted; no arbitrary finite line catalogue is manufactured. */
export function parseGoalMarketExtensionInput(input: unknown): GoalMarketExtensionInput {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success || Buffer.byteLength(evidenceSerialize(parsed.data)) > goalMarketStorageLimits.bytes) return historyFail("invalid-request");
  return freezeEvidence(parsed.data);
}
/** Model probabilities are derived locally; callers cannot supply a precomputed or independently published market. */
export function prepareGoalMarketExtension(input: unknown): PreparedGoalMarketExtension {
  const { scoreDistribution, definitions } = parseGoalMarketExtensionInput(input);
  const prepared: PreparedGoalMarketExtension = freezeEvidence({ version: 1 as const, ruleVersion: GOAL_MARKET_RULE_VERSION, scoreDistribution,
    markets: definitions.map((definition) => ({ definition, derivation: deriveGoalMarket(scoreDistribution, definition) })) });
  if (Buffer.byteLength(evidenceSerialize(prepared)) > goalMarketStorageLimits.bytes) return historyFail("invalid-request");
  return prepared;
}
const identitySchema = z.strictObject({ revisionId: historyId, cycleId: historyId, fixtureId: historyId, recordedAt: historyInstant });

export function goalMarketExtensionFromRow(row: HistoryRow): StoredGoalMarketExtension {
  assertHistorySeal(row.validIntegrity);
  const body = historyJson(row.body) as Record<string, unknown>;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return historyFail("invalid-state");
  const identity = identitySchema.safeParse({ revisionId: body?.revisionId, cycleId: body?.cycleId,
    fixtureId: body?.fixtureId, recordedAt: body?.recordedAt });
  if (!identity.success || !Array.isArray(body.markets)) return historyFail("invalid-state");
  let prepared;
  try { prepared = prepareGoalMarketExtension({ scoreDistribution: body.scoreDistribution,
    definitions: body.markets.map((entry) => (entry as { definition?: unknown })?.definition) }); }
  catch { return historyFail("invalid-state"); }
  const contentHash = evidenceFingerprint(prepared), expected = { ...prepared, ...identity.data, contentHash };
  if (body.contentHash !== contentHash || row.contentHash !== contentHash || row.ruleVersion !== prepared.ruleVersion ||
      row.revisionId !== expected.revisionId || row.cycleId !== expected.cycleId || row.fixtureId !== expected.fixtureId ||
      historyTime(row.recordedAt) !== expected.recordedAt || evidenceFingerprint(body) !== evidenceFingerprint(expected)) return historyFail("invalid-state");
  return freezeEvidence(expected);
}
export async function readGoalMarketExtension(tx: Tx, revisionId: string): Promise<StoredGoalMarketExtension | null> {
  historyId.parse(revisionId);
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
    FROM GoalMarketExtension WHERE revisionId = ${revisionId}`;
  return row ? goalMarketExtensionFromRow(row) : null;
}

/** Must be called immediately after appendRevision inside its existing fixture/publication transaction.
 * It cannot open a transaction, move a current/locked pointer, or retrofit an accepted legacy revision. */
export async function appendGoalMarketExtension(tx: Tx, input: GoalMarketExtensionInput & Readonly<{
  revisionId: string; cycleId: string; fixtureId: string; recordedAt: number;
}>): Promise<StoredGoalMarketExtension> {
  const identity = identitySchema.parse({ revisionId: input.revisionId, cycleId: input.cycleId,
    fixtureId: input.fixtureId, recordedAt: input.recordedAt });
  const prepared = prepareGoalMarketExtension({ scoreDistribution: input.scoreDistribution, definitions: input.definitions });
  const contentHash = evidenceFingerprint(prepared), known = await readGoalMarketExtension(tx, identity.revisionId);
  if (known) {
    if (known.contentHash !== contentHash || known.cycleId !== identity.cycleId || known.fixtureId !== identity.fixtureId)
      return historyFail("conflicting-request");
    return known;
  }
  const revision = await tx.predictionSet.findUnique({ where: { id: identity.revisionId } });
  const cycle = await tx.predictionCycle.findUnique({ where: { id: identity.cycleId } });
  if (!revision || !cycle || revision.cycleId !== cycle.id || revision.fixtureId !== identity.fixtureId ||
      cycle.fixtureId !== identity.fixtureId || cycle.state !== "open" || cycle.currentSetId === revision.id ||
      identity.recordedAt < revision.publishedAt.getTime() || identity.recordedAt >= cycle.cutoffAt.getTime() ||
      await tx.predictionRefreshResult.findFirst({ where: { revisionId: revision.id, outcome: "published" }, select: { id: true } }))
    return historyFail("invalid-request");
  const value = freezeEvidence({ ...prepared, ...identity, contentHash }), body = evidenceSerialize(value);
  await tx.$executeRaw`INSERT INTO GoalMarketExtension (revisionId, cycleId, fixtureId, ruleVersion, contentHash, integrity, recordedAt, body)
    VALUES (${identity.revisionId}, ${identity.cycleId}, ${identity.fixtureId}, ${prepared.ruleVersion}, ${contentHash},
      SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), ${new Date(identity.recordedAt)}, JSON_EXTRACT(${body}, '$'))`;
  return value;
}

const settledStatuses = ["correct", "incorrect", "half-win", "half-loss", "push"] as const;
const settlementBaseSchema = z.strictObject({
  fixtureId: historyId, cycleId: historyId, predictionRevisionId: historyId,
  marketKey: z.string().min(1).max(128), source: z.literal("ai-score-distribution"), ruleVersion: z.literal(GOAL_MARKET_RULE_VERSION),
  selection: z.string().min(1).max(64).nullable(), selectedProbability: z.number().finite().min(0).max(1).nullable(),
  resultId: historyHash.nullable(), resultUsable: z.boolean(),
  status: z.enum([...settledStatuses, "pending", "void", "unavailable"]), reason: z.string().min(1).max(128),
  cycleState: z.enum(["closed", "void"]), voidReason: z.string().min(1).max(2000).nullable(),
});
export const goalMarketSettlementRevisionSchema = settlementBaseSchema.extend({
  id: historyHash, batchId: historyHash, previousId: historyHash.nullable(), inputHash: historyHash,
  at: historyInstant, correctedAt: historyInstant.nullable(), kind: z.enum(["initial", "transition", "correction"]),
}).refine((value) => (value.kind === "initial") === (value.previousId === null) &&
  (value.kind !== "correction" || value.correctedAt === value.at) && (value.correctedAt === null || value.correctedAt <= value.at) &&
  (value.selection === null) === (value.status === "unavailable") &&
  (value.selection === null) === (value.selectedProbability === null) &&
  (!value.resultUsable || value.resultId !== null) &&
  (!settledStatuses.some((status) => status === value.status) || value.resultUsable && value.resultId !== null) &&
  (value.cycleState === "void") === (value.voidReason !== null));
export type GoalMarketSettlementRevision = Readonly<z.infer<typeof goalMarketSettlementRevisionSchema>>;
type GoalSettlementBase = Readonly<z.infer<typeof settlementBaseSchema>>;
export type GoalMarketSettlementPlan = Readonly<{
  base: GoalSettlementBase; inputHash: string; previous: GoalMarketSettlementRevision | null;
}>;

export function goalMarketSettlementFromRow(row: HistoryRow): GoalMarketSettlementRevision {
  assertHistorySeal(row.validIntegrity);
  const parsed = goalMarketSettlementRevisionSchema.safeParse(historyJson(row.body));
  if (!parsed.success) return historyFail("invalid-state");
  const value = parsed.data, base = settlementBaseSchema.parse(Object.fromEntries(
    Object.keys(settlementBaseSchema.shape).map((key) => [key, value[key as keyof typeof value]])));
  if (evidenceFingerprint(base) !== value.inputHash || value.id !== row.id || value.batchId !== row.batchId ||
      value.fixtureId !== row.fixtureId || value.cycleId !== row.cycleId || value.marketKey !== row.marketKey ||
      value.predictionRevisionId !== row.predictionRevisionId || value.previousId !== row.previousId || value.resultId !== row.resultId ||
      value.inputHash !== row.inputHash || value.source !== row.source || historyTime(row.at) !== value.at) return historyFail("invalid-state");
  return freezeEvidence(value);
}
export async function readGoalMarketSettlement(tx: Tx, id: string): Promise<GoalMarketSettlementRevision> {
  historyHash.parse(id);
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
    FROM ExtendedMarketSettlementRevision WHERE id = ${id}`;
  if (!row) return historyFail("invalid-state");
  return goalMarketSettlementFromRow(row);
}

/** Projects only a sealed canonical locked revision and immutable result evidence; never live scores. */
export function projectGoalMarketSettlements(extension: StoredGoalMarketExtension, cycle: StoredCycle,
  context: GoalSettlementContext, resultId: string | null, resultUsable: boolean,
  recorded: ReadonlyMap<string, GoalMarketSettlementRevision>): readonly GoalMarketSettlementPlan[] {
  if (cycle.state === "open" || cycle.id !== extension.cycleId || cycle.fixtureId !== extension.fixtureId ||
      cycle.lockedSetId !== extension.revisionId || context.cycleEligibility.eligible !== (cycle.state !== "void")) return historyFail("invalid-state");
  return freezeEvidence(extension.markets.map(({ definition, derivation }) => {
    const market = derivation.available ? derivation.market : null, previous = recorded.get(definition.key) ?? null;
    if (previous && (previous.predictionRevisionId !== extension.revisionId || previous.fixtureId !== extension.fixtureId ||
        previous.cycleId !== cycle.id || previous.marketKey !== definition.key || previous.selection !== (market?.selection ?? null)))
      return historyFail("invalid-state");
    const outcome = market ? settleGoalSelection(definition, market.selection, context)
      : { status: "unavailable" as const, reason: derivation.available ? "unsupported-market" : derivation.reason };
    // Once a historical cycle is void its retained result evidence stays fixed, as in the four-family store.
    const historicalVoid = previous?.cycleState === "void" && cycle.state === "void";
    const base: GoalSettlementBase = { fixtureId: extension.fixtureId, cycleId: cycle.id, predictionRevisionId: extension.revisionId,
      marketKey: definition.key, source: "ai-score-distribution", ruleVersion: GOAL_MARKET_RULE_VERSION, selection: market?.selection ?? null,
      selectedProbability: market?.selectedProbability ?? null, resultId: historicalVoid ? previous.resultId : market ? resultId : null,
      resultUsable: historicalVoid ? previous.resultUsable : market ? resultUsable : false, status: outcome.status,
      reason: outcome.reason, cycleState: cycle.state as "closed" | "void", voidReason: cycle.voidReason };
    return { base, inputHash: evidenceFingerprint(base), previous };
  }));
}

/** The caller already owns the fixture lock. Only separately verified, sealed HT evidence can settle period markets. */
export async function planGoalMarketSettlements(tx: Tx, fixtureId: string): Promise<readonly GoalMarketSettlementPlan[]> {
  historyId.parse(fixtureId);
  const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } });
  const issue = (await tx.fixtureLifecycleState.findUnique({ where: { fixtureId } }))?.issue ?? null;
  const state = await tx.fixtureResultState.findUnique({ where: { fixtureId } });
  const result = state?.resultId ? await storedFixtureResult(tx, fixtureId, state.resultId) : null;
  const resultUsable = fixtureResultMatchesCanonical(fixture, result, issue);
  const rows = await tx.predictionCycle.findMany({ where: { fixtureId, state: { in: ["closed", "void"] }, lockedSetId: { not: null } },
    orderBy: { ordinal: "asc" }, select: { id: true } });
  const plans: GoalMarketSettlementPlan[] = [];
  for (const row of rows) {
    const cycle = (await storedCycle(tx, row.id))!, extension = await readGoalMarketExtension(tx, cycle.lockedSetId!);
    if (!extension) continue;
    const pointers = await tx.$queryRaw<{ revisionId: string }[]>`SELECT revisionId FROM ExtendedMarketSettlement WHERE cycleId = ${cycle.id} AND marketKey LIKE 'goal:%'`;
    const recorded = new Map<string, GoalMarketSettlementRevision>();
    for (const pointer of pointers) { const previous = await readGoalMarketSettlement(tx, pointer.revisionId); recorded.set(previous.marketKey, previous); }
    const context: GoalSettlementContext = {
      status: issue && cycle.state !== "void" ? "unknown" : resultStatus.parse(fixture.status),
      cycleEligibility: cycle.state !== "void" ? { eligible: true } : { eligible: false,
        reason: cycle.voidReason === "formal-postponement" ? "postponed-cycle"
          : cycle.voidReason === "locked-cutoff-invalidated" ? "cutoff-invalidated" : "ineligible-cycle" },
      regulationScore: resultUsable && result?.regulation.verified ? { verified: true, period: "regulation-including-stoppage-time",
        home: result.regulation.home!, away: result.regulation.away! } : null,
      halfTimeScore: resultUsable && result?.halfTime ? { verified: true, period: result.halfTime.period,
        home: result.halfTime.home, away: result.halfTime.away } : null,
    };
    plans.push(...projectGoalMarketSettlements(extension, cycle, context, result?.id ?? null, resultUsable, recorded));
  }
  return freezeEvidence(plans);
}

/** Shared SettlementBatch supplies fixture version/invalidation. This function neither commits nor publishes. */
export async function persistGoalMarketSettlements(tx: Tx, plans: readonly GoalMarketSettlementPlan[], batchId: string, at: number) {
  historyHash.parse(batchId); historyInstant.parse(at);
  // Recheck plans against sealed source rows in the same transaction; exported structural types are not an authority.
  const verified = new Map<string, GoalMarketSettlementPlan>();
  for (const fixtureId of new Set(plans.map(({ base }) => base.fixtureId))) {
    for (const plan of await planGoalMarketSettlements(tx, fixtureId)) verified.set(`${plan.base.cycleId}:${plan.base.marketKey}`, plan);
  }
  let changed = 0;
  for (const { base, inputHash, previous } of plans) {
    const current = verified.get(`${base.cycleId}:${base.marketKey}`);
    if (!current || evidenceFingerprint(current) !== evidenceFingerprint({ base, inputHash, previous }))
      return historyFail("invalid-state");
    if (previous?.inputHash === inputHash) continue;
    const correction = previous && settledStatuses.some((status) => status === previous.status) &&
      (previous.resultId !== base.resultId || previous.status !== base.status || previous.reason !== base.reason);
    const id = evidenceFingerprint({ batchId, cycleId: base.cycleId, marketKey: base.marketKey });
    const value = goalMarketSettlementRevisionSchema.parse({ ...base, id, batchId, inputHash, previousId: previous?.id ?? null, at,
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
      VALUES (${base.fixtureId}, ${base.cycleId}, ${base.marketKey}, ${id})
      ON DUPLICATE KEY UPDATE revisionId = ${id}`;
    changed++;
  }
  return changed;
}

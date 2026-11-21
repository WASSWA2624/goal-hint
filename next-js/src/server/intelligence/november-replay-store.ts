import "server-only";

import { z } from "zod";
import { legacyLocalFirstGoalMarketDefinitions, LEGACY_LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localFirstGoalMarketDefinitions,
  registeredForecastGoalMarkets, type RegisteredGoalMarketDefinition } from "../../domain/goal-market-definitions.ts";
import { LEGACY_LOCAL_FIRST_MARKET_REGISTRY_VERSION, LOCAL_FIRST_MARKET_REGISTRY_VERSION } from "../../domain/market-registry.ts";
import { legacyLocalFeaturedDecisionVersion, localFeaturedDecisionSchema, localFeaturedDecisionVersion } from "../../domain/local-featured-decision.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import { marketSelections, type MarketFamily } from "../../domain/markets.ts";
import { novemberReplayRange, replaySuppressionClocks } from "../../domain/november-replay.ts";
import { compareForecastPicks } from "../../domain/recommendation.ts";
import { goalMarketDefinitionSchema, type GoalMarketDefinition } from "../../domain/score-distribution-markets.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { revisionEligibleForLock } from "../predictions/cutoff-eligibility.ts";
import { legacyForecastMarketKey } from "../predictions/forecast-market-evaluator.ts";
import type { StoredCycle } from "../predictions/history-contract.ts";
import { historyHash, historyId, historyInstant, historyVersion } from "../predictions/history-input.ts";
import { assertHistorySeal, historyTime, storedCycle, storedRevision, type HistoryRow } from "../predictions/history-read.ts";
import { storedRefreshResult } from "../predictions/publication-read.ts";
import { localGoalModelVersion } from "./local-goals-model.ts";
import { loadNovemberReplayEvidenceInTransaction, readNovemberReplayTrainingMembership, type NovemberReplayTrainingMembership } from "./november-replay-evidence.ts";
import { buildNovemberReplayMarkets } from "./november-replay-model.ts";
import { preparePricedNovemberReplay, sameLegacyReplaySelection, sameReplayFeaturedDisplay } from "./november-replay-featured.ts";
import { decodeShadowArchive, encodeShadowArchive } from "./shadow-store.ts";

type Tx = Prisma.TransactionClient;
const { startInclusive: start, endExclusive: end } = novemberReplayRange.window;
const inNovember = (at: number) => at >= start && at < end;
const maxMarkets = 256;
const token = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._:-]*$/iu);
const selectionKey = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9._:+-]*$/iu);
const probability = z.number().finite().min(0).max(1);
const outcomesSchema = z.strictObject({ win: probability, loss: probability, push: probability, "half-win": probability, "half-loss": probability });
const selectedSchema = z.strictObject({ selection: selectionKey, probability });
const topSchema = selectedSchema.extend({ marketKey: token });
const marketIdentity = { definition: goalMarketDefinitionSchema, selected: selectedSchema };
const marketSelectionsSchema = z.array(z.strictObject({ key: selectionKey, outcomes: outcomesSchema })).min(2).max(128);
const publicMarketSchema = z.strictObject({ ...marketIdentity, selections: marketSelectionsSchema.optional() });
const marketSchema = z.strictObject({ ...marketIdentity, unrepresentedProbability: probability.optional(), selections: marketSelectionsSchema });
const decisionFields = { featuredDecision: localFeaturedDecisionSchema.optional(), decisionAt: historyInstant.optional(),
  teams: z.tuple([historyId, historyId]).optional() };
const policyDeltaSchema = z.strictObject({ baselineRevisionId: historyHash, expectedProjectionRevisionId: historyHash.nullable() });
const stageSchema = z.strictObject({ fixtureId: historyId, kickoffAt: historyInstant.nullable(), cycleId: historyId.nullable(),
  scheduleVersion: historyVersion.nullable(), sourceRevisionId: historyId.nullable(), evidenceCutoffAt: historyInstant.nullable(), evidenceHash: historyHash,
  engineVersion: token, registryVersion: token, artifactHash: historyHash.nullable(), evidenceReceiptIds: z.array(historyHash).max(20_000),
  generatedAt: historyInstant, status: z.enum(["estimated", "abstained"]), reason: token.nullable(), markets: z.array(marketSchema).max(maxMarkets),
  selected: topSchema.nullable(), ...decisionFields, replayAsOf: historyInstant.optional(),
  suppressedProjectionRevisionId: historyHash.optional(), policyDelta: policyDeltaSchema.optional() });
type MarketValue = z.input<typeof marketSchema>;
export type NovemberReplayMarket = Omit<MarketValue, "selections"> & Readonly<{ selections: readonly MarketValue["selections"][number][] }>;
export type NovemberReplayStageInput = Readonly<Omit<z.input<typeof stageSchema>, "markets" | "evidenceReceiptIds"> & {
  markets: readonly NovemberReplayMarket[]; evidenceReceiptIds: readonly string[];
}>;
export type NovemberReplayRecord = NovemberReplayStageInput & Readonly<{ id: string; stagedAt: number }>;

const projectionSchema = z.strictObject({ fixtureId: historyId, revisionId: historyHash, sourceRevisionId: historyId.nullable(),
  cycleId: historyId.nullable(), kickoffAt: historyInstant, scheduleVersion: historyVersion.nullable(),
  evidenceCutoffAt: historyInstant, generatedAt: historyInstant, activatedAt: historyInstant,
  markets: z.array(publicMarketSchema).min(1).max(maxMarkets), selected: topSchema.nullable(), ...decisionFields });
export type NovemberReplayProjection = Readonly<z.infer<typeof projectionSchema>>;

const actionSchema = z.strictObject({ id: historyHash, fixtureId: historyId, operationId: token,
  kind: z.enum(["activate", "rollback"]), activationOperationId: token, revisionId: historyHash, at: historyInstant,
  previousProjection: z.strictObject({ projection: projectionSchema, operationId: token }).optional() });
export type NovemberReplayAction = Readonly<z.infer<typeof actionSchema>>;
type RollbackInput = Readonly<{ fixtureId: string; operationId: string; activationOperationId: string }>;
type ActivationInput = Readonly<{ operationId: string; revisionId: string; expectedProjectionRevisionId?: string | null }>;

function replayMarketFingerprints(markets: readonly RegisteredGoalMarketDefinition[], enabled: readonly GoalMarketDefinition[]) {
  const supported = new Set([...enabled.map(({ key }) => key), ...(Object.keys(marketSelections) as MarketFamily[]).map(legacyForecastMarketKey)]);
  return new Map(markets.filter(({ definition }) => supported.has(definition.key))
    .map(({ definition }) => [definition.key, evidenceFingerprint(definition)]));
}
// A sealed draft keeps the definitions used when it was staged.
const registered = new Map<string, ReadonlyMap<string, string>>([
  [LEGACY_LOCAL_FIRST_MARKET_REGISTRY_VERSION,
    replayMarketFingerprints(registeredForecastGoalMarkets(LEGACY_LOCAL_FIRST_GOAL_EVALUATION_PROFILE), legacyLocalFirstGoalMarketDefinitions)],
  [LOCAL_FIRST_MARKET_REGISTRY_VERSION, replayMarketFingerprints(registeredForecastGoalMarkets(true), localFirstGoalMarketDefinitions)],
]);
export class NovemberReplayStoreError extends Error {
  readonly reason: Rejection | "invalid-input" | "corrupt-record" | "conflicting-operation" | "unavailable";
  constructor(reason: NovemberReplayStoreError["reason"]) {
    super(`November replay persistence refused: ${reason}.`);
    this.name = "NovemberReplayStoreError";
    this.reason = reason;
  }
}
const deny = (reason: NovemberReplayStoreError["reason"]): never => { throw new NovemberReplayStoreError(reason); };

function validateMarkets(input: z.output<typeof stageSchema>, definitions: ReadonlyMap<string, string>) {
  const { markets, selected, featuredDecision } = input;
  if (!markets.length || !featuredDecision && markets.length !== definitions.size ||
      new Set(markets.map(({ definition }) => definition.key)).size !== markets.length) return false;
  const best = markets.map(({ definition, selected: pick }) => ({ key: definition.key, ...pick, odds: null })).sort(compareForecastPicks)[0];
  if (featuredDecision ? !featuredSelectionMatches(input) :
    !selected || !best || best.key !== selected.marketKey || best.selection !== selected.selection || best.probability !== selected.probability) return false;
  return markets.every((market) => {
    const { definition, selections } = market;
    const choice = selections.map(({ key: selection, outcomes }) => ({ key: definition.key, selection, probability: outcomes.win, odds: null }))
      .sort(compareForecastPicks)[0];
    return definitions.get(definition.key) === evidenceFingerprint(definition) &&
      definition.selections.length === selections.length && new Set(selections.map(({ key }) => key)).size === selections.length &&
      definition.selections.every(({ key }) => selections.some((selection) => selection.key === key)) &&
      choice?.selection === market.selected.selection && choice.probability === market.selected.probability &&
      selections.every(({ outcomes }) =>
        Math.abs(Object.values(outcomes).reduce((sum, mass) => sum + mass, market.unrepresentedProbability ?? 0) - 1) <= 1e-6);
  });
}

function featuredSelectionMatches({ selected, featuredDecision, decisionAt, markets }: Pick<NovemberReplayProjection,
  "selected" | "featuredDecision" | "decisionAt" | "markets">) {
  if (!featuredDecision || decisionAt === undefined) return false;
  if (featuredDecision.status !== "priced") return selected === null;
  return Boolean(selected && selected.marketKey === featuredDecision.marketKey && selected.selection === featuredDecision.selection &&
    selected.probability === featuredDecision.probability && featuredDecision.quote.observedAt <= decisionAt &&
    featuredDecision.quote.checkedAt <= decisionAt && (featuredDecision.quote.providerUpdatedAt ?? 0) <= decisionAt &&
    markets.some(({ definition, selections }) => definition.key === selected.marketKey &&
      selections?.some(({ key, outcomes }) => key === selected.selection && outcomes.win === selected.probability)));
}

function checkedStage(value: unknown) {
  const parsed = stageSchema.safeParse(value);
  if (!parsed.success) return deny("invalid-input");
  const input = parsed.data, { kickoffAt, evidenceCutoffAt, generatedAt } = input;
  const definitions = registered.get(input.registryVersion);
  const { featuredDecision, decisionAt, replayAsOf, teams, suppressedProjectionRevisionId, policyDelta } = input;
  if (!definitions || !featuredDecision && kickoffAt !== null && !inNovember(kickoffAt) || evidenceCutoffAt !== null &&
      (kickoffAt === null || evidenceCutoffAt >= kickoffAt || generatedAt < evidenceCutoffAt) ||
      input.sourceRevisionId !== null && input.cycleId === null || input.scheduleVersion !== null && input.cycleId === null ||
      new Set(input.evidenceReceiptIds).size !== input.evidenceReceiptIds.length) return deny("invalid-input");
  if (featuredDecision ? !teams || teams[0] === teams[1] || kickoffAt === null ||
    evidenceCutoffAt === null || decisionAt === undefined || evidenceCutoffAt > decisionAt || decisionAt >= kickoffAt ||
    replayAsOf === undefined || decisionAt >= replayAsOf || replayAsOf > generatedAt ||
    (input.cycleId === null) !== (input.scheduleVersion === null) ||
    (input.status === "abstained") !== (suppressedProjectionRevisionId !== undefined) ||
    suppressedProjectionRevisionId && (featuredDecision.status !== "abstained" || featuredDecision.reason !== "no-local-forecast")
    : decisionAt !== undefined || replayAsOf !== undefined || teams !== undefined || suppressedProjectionRevisionId !== undefined)
    return deny("invalid-input");
  if (policyDelta && (input.status !== "estimated" || featuredDecision?.version !== localFeaturedDecisionVersion)) return deny("invalid-input");
  if (input.status === "estimated" ? input.reason !== null || kickoffAt === null || generatedAt < kickoffAt || evidenceCutoffAt === null ||
    input.artifactHash === null || input.evidenceReceiptIds.length === 0 || !validateMarkets(input, definitions) :
    input.reason === null || input.markets.length !== 0 || input.selected !== null) return deny("invalid-input");
  if (Buffer.byteLength(evidenceSerialize(input), "utf8") > 1_048_576) return deny("invalid-input");
  return freezeEvidence(input);
}

function replayId(input: NovemberReplayStageInput) {
  const { fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, engineVersion, registryVersion, evidenceHash } = input;
  const legacy = { cohort: "2026-11-africa-kampala", fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId,
    engineVersion, registryVersion, evidenceHash };
  const { featuredDecision, decisionAt, replayAsOf, suppressedProjectionRevisionId, policyDelta } = input;
  return evidenceFingerprint(featuredDecision ? { ...legacy, cohort: "point-in-time-featured-replay", featuredDecision, decisionAt,
    replayAsOf, ...(suppressedProjectionRevisionId && { suppressedProjectionRevisionId }), ...(policyDelta && { policyDelta }) } : legacy);
}

function storedClock(value: unknown) {
  const clock = historyInstant.safeParse(value instanceof Date ? value.getTime() : null);
  return clock.success ? clock.data : deny("corrupt-record");
}
const nullableClock = (value: unknown) => value === null ? null : storedClock(value);
const played = (status: string) => status === "live" || isPlayedFinalStatus(status as SettlementStatus);
const serverNow = async (tx: Tx) => storedClock((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]?.at);

function checkedBody<T>(row: HistoryRow): T {
  try { assertHistorySeal(row.validIntegrity); return decodeShadowArchive<T>(row.body); }
  catch { return deny("corrupt-record"); }
}

function recordFromRow(row: HistoryRow): NovemberReplayRecord {
  const input = checkedStage(checkedBody(row)), id = replayId(input), stagedAt = storedClock(row.stagedAt);
  if (id !== row.id || input.fixtureId !== row.fixtureId || input.kickoffAt !== nullableClock(row.kickoffAt) ||
    input.cycleId !== row.cycleId || input.scheduleVersion !== (row.scheduleVersion === null ? null : Number(row.scheduleVersion)) || input.sourceRevisionId !== row.sourceRevisionId ||
    input.evidenceHash !== row.evidenceHash || input.status !== row.status || input.generatedAt !== storedClock(row.generatedAt) ||
    input.evidenceCutoffAt !== nullableClock(row.evidenceCutoffAt) || stagedAt < input.generatedAt) return deny("corrupt-record");
  return freezeEvidence({ ...input, id, stagedAt });
}

async function readRecord(tx: Tx, id: string) {
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *,integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256) AS validIntegrity
    FROM NovemberReplayRevision WHERE id=${id}`;
  return row ? recordFromRow(row) : null;
}

function projectionFromRow(row: HistoryRow): NovemberReplayProjection {
  const parsed = projectionSchema.safeParse(checkedBody(row));
  if (!parsed.success) return deny("corrupt-record");
  const result = parsed.data;
  if (result.fixtureId !== row.fixtureId || result.revisionId !== row.revisionId || result.cycleId !== row.cycleId ||
    result.sourceRevisionId !== row.sourceRevisionId || result.scheduleVersion !== (row.scheduleVersion === null ? null : Number(row.scheduleVersion)) ||
    result.kickoffAt !== storedClock(row.kickoffAt) || result.evidenceCutoffAt !== storedClock(row.evidenceCutoffAt) ||
    result.activatedAt !== storedClock(row.changedAt) || !result.featuredDecision && !inNovember(result.kickoffAt) ||
    result.evidenceCutoffAt >= result.kickoffAt ||
    result.generatedAt < result.kickoffAt || result.generatedAt > result.activatedAt ||
    new Set(result.markets.map(({ definition }) => definition.key)).size !== result.markets.length ||
    (result.featuredDecision ? !result.teams || result.decisionAt === undefined || result.decisionAt < result.evidenceCutoffAt ||
      result.decisionAt >= result.kickoffAt || !featuredSelectionMatches(result) : !result.selected || !result.cycleId || !result.sourceRevisionId ||
      !result.markets.some(({ definition, selected }) => definition.key === result.selected?.marketKey &&
        selected.selection === result.selected.selection && selected.probability === result.selected.probability))) return deny("corrupt-record");
  return freezeEvidence(result);
}

/** Shared eligibility for public batch hydration and SQL outcome filtering. */
const projectionBody = Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(p.body,'$.canonicalBody'))`;
const storedDecisionAt = Prisma.sql`CAST(JSON_UNQUOTE(JSON_EXTRACT(${projectionBody},'$.decisionAt')) AS SIGNED)`;
const decisionTime = Prisma.sql`COALESCE(TIMESTAMPADD(MICROSECOND,${storedDecisionAt}*1000,'1970-01-01 00:00:00.000'),p.evidenceCutoffAt)`;
export const activeNovemberReplaySql = Prisma.sql`(SELECT p.*,TRUE AS validIntegrity
  FROM NovemberReplayProjection p JOIN FootballFixture f ON f.id=p.fixtureId AND f.activeCycleId<=>p.cycleId AND f.kickoff=p.kickoffAt
  LEFT JOIN PredictionCycle c ON c.id=p.cycleId AND c.fixtureId=p.fixtureId AND c.state='closed' AND c.lockedSetId<=>p.sourceRevisionId
    AND c.scheduleVersion=p.scheduleVersion AND c.kickoffAt=p.kickoffAt AND c.closedAt>=${decisionTime}
  LEFT JOIN PredictionSet s ON s.id=p.sourceRevisionId AND s.cycleId=p.cycleId AND s.fixtureId=p.fixtureId
  LEFT JOIN FixtureLifecycleState l ON l.fixtureId=f.id
  LEFT JOIN PredictionPublicationBarrier b ON b.cycleId=c.id
  WHERE p.revisionId IS NOT NULL AND p.integrity=SHA2(CAST(p.body AS CHAR CHARACTER SET utf8mb4),256) AND f.provider='api-football'
    AND (p.cycleId IS NULL OR c.id IS NOT NULL)
    AND (p.sourceRevisionId IS NULL OR s.id IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(s.candidateJson,'$.context.context.home.teamId'))=f.homeTeamId
      AND JSON_UNQUOTE(JSON_EXTRACT(s.candidateJson,'$.context.context.away.teamId'))=f.awayTeamId)
    AND ((${storedDecisionAt} IS NULL AND p.sourceRevisionId IS NOT NULL) OR
      (JSON_UNQUOTE(JSON_EXTRACT(${projectionBody},'$.teams[0]'))=f.homeTeamId AND
       JSON_UNQUOTE(JSON_EXTRACT(${projectionBody},'$.teams[1]'))=f.awayTeamId))
    AND f.status IN ('live','finished-regulation','finished-extra-time','finished-penalties') AND l.issue IS NULL
    AND (l.actualStartedAt IS NULL OR l.actualStartedAt>${decisionTime}
      OR (${storedDecisionAt} IS NULL AND l.actualStartedAt=p.evidenceCutoffAt))
    AND (b.closedAt IS NULL OR b.closedAt>=${decisionTime}))`;

/** The public role reads only the compact projection, under the same fixture snapshot as Matches. */
export async function readNovemberReplayProjections(tx: Tx, fixtureIds: readonly string[]): Promise<ReadonlyMap<string, NovemberReplayProjection>> {
  const ids = [...new Set(fixtureIds)], values = new Map<string, NovemberReplayProjection>();
  if (ids.some((id) => !historyId.safeParse(id).success)) return deny("invalid-input");
  for (let offset = 0; offset < ids.length; offset += 100) {
    const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT p.* FROM ${activeNovemberReplaySql} p
      WHERE p.fixtureId IN (${Prisma.join(ids.slice(offset, offset + 100))})`);
    for (const row of rows) {
      const projection = projectionFromRow(row);
      values.set(projection.fixtureId, projection);
    }
  }
  return values;
}

type Rejection = "not-staged" | "abstained" | "missing-locked-source" | "occurrence-changed" | "source-not-api" |
  "evidence-changed" | "projection-owned" | "registry-superseded" | "no-featured-display-change";
type ReplayDiff = Readonly<{ revisionId: string; fixtureId: string | null; sourceRevisionId: string | null;
  kickoffAt: number | null; selected: NovemberReplayRecord["selected"]; eligible: boolean; reason: Rejection | "eligible";
  featuredDecision?: NovemberReplayRecord["featuredDecision"]; previousProjectionRevisionId?: string | null;
  previousSelection?: NovemberReplayRecord["selected"] }>;

async function verifiedSource(tx: Tx, record: NovemberReplayRecord, cycle: StoredCycle,
  fixture: { externalId: bigint; homeTeamId: string; awayTeamId: string }) {
  const { fixtureId, sourceRevisionId, cycleId, kickoffAt, evidenceCutoffAt } = record;
  if (!sourceRevisionId || !cycleId || evidenceCutoffAt === null) return false;
  const source = await storedRevision(tx, sourceRevisionId);
  if (!source || source.fixtureId !== fixtureId || source.cycleId !== cycleId || source.scheduleVersion > cycle.scheduleVersion ||
    source.candidate.context.context.kickoffAt !== kickoffAt || source.publishedAt >= evidenceCutoffAt ||
    source.recordedAt >= evidenceCutoffAt || source.candidate.context.context.home.teamId !== fixture.homeTeamId ||
    source.candidate.context.context.away.teamId !== fixture.awayTeamId) return false;
  // Confirmed play appends schedule evidence even when the kickoff is unchanged.
  // Reuse the original locking rule to verify the schedule under which it was published.
  const rows = await tx.predictionSchedule.findMany({ where: { cycleId, fixtureId }, orderBy: { version: "asc" } });
  const schedules = rows.map((row) => ({ version: row.version, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt),
    observedAt: historyTime(row.observedAt), actualStartedAt: nullableClock(row.actualStartedAt) }));
  if (!revisionEligibleForLock(source, cycle, schedules, historyInstant.parse(evidenceCutoffAt))) return false;
  const receipts = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM PredictionRefreshResult
    WHERE cycleId=${cycleId} AND revisionId=${sourceRevisionId} AND outcome='published' ORDER BY at,id LIMIT 2`;
  if (receipts.length !== 1) return false;
  const receipt = await storedRefreshResult(tx, receipts[0]!.id);
  if (!receipt || receipt.at !== source.publishedAt || receipt.candidateHash !== evidenceFingerprint(source.candidate) ||
    receipt.observation.kickoffAt !== kickoffAt || receipt.evidenceSnapshotId !== source.evidenceSnapshotId) return false;
  const groups = Object.values(source.candidate.markets).filter((market) => market.available);
  const provider = groups.filter((group) => group.provenance.kind === "api-football" &&
    group.market.source === "api-football" && BigInt(group.provenance.source.externalFixtureId) === fixture.externalId);
  if (!provider.length) return false;
  if (receipt.forecastDecision !== undefined) return receipt.forecastDecision.topPick?.source === "api-football";
  // Older receipts did not seal a ranked decision. Support only an unambiguous
  // provider display, including any extended picks competing with launch markets.
  if (groups.length !== provider.length) return false;
  const [local, implied] = await Promise.all([
    tx.goalMarketExtension.findUnique({ where: { revisionId: sourceRevisionId }, select: { revisionId: true } }),
    tx.impliedMarketExtension.findUnique({ where: { revisionId: sourceRevisionId }, select: { revisionId: true } }),
  ]);
  return local === null && implied === null;
}

async function activationRejection(tx: Tx, record: NovemberReplayRecord, at: number,
  training: NovemberReplayTrainingMembership, previous: NovemberReplayProjection | null): Promise<Rejection | null> {
  if (record.registryVersion !== LOCAL_FIRST_MARKET_REGISTRY_VERSION) return "registry-superseded";
  if (record.status !== "estimated" && !record.suppressedProjectionRevisionId) return "abstained";
  const { fixtureId, cycleId, scheduleVersion, sourceRevisionId, evidenceCutoffAt, kickoffAt } = record;
  if (evidenceCutoffAt === null || kickoffAt === null || !record.featuredDecision && (!cycleId || scheduleVersion === null || !sourceRevisionId))
    return "missing-locked-source";
  const fixture = await tx.footballFixture.findUnique({ where: { id: fixtureId }, include: { homeTeam: { select: { name: true } },
    awayTeam: { select: { name: true } }, season: { include: { competition: { select: { name: true } } } },
    lifecycleState: { select: { issue: true, actualStartedAt: true } } } });
  const cycle = cycleId === null ? null : await storedCycle(tx, cycleId);
  const decisionAt = record.decisionAt ?? evidenceCutoffAt;
  if (!fixture || fixture.provider !== "api-football" || !played(fixture.status) || fixture.kickoff?.getTime() !== kickoffAt ||
    fixture.activeCycleId !== cycleId || fixture.lifecycleState?.issue ||
    (fixture.lifecycleState?.actualStartedAt?.getTime() ?? Infinity) < (record.featuredDecision ? decisionAt + 1 : decisionAt) ||
    cycleId !== null && (!cycle || cycle.fixtureId !== fixtureId || cycle.kickoffAt !== kickoffAt || cycle.scheduleVersion !== scheduleVersion) ||
    record.teams && (record.teams[0] !== fixture.homeTeamId || record.teams[1] !== fixture.awayTeamId))
    return "occurrence-changed";
  if (cycle && (cycle.state !== "closed" || cycle.lockedSetId !== sourceRevisionId || cycle.closedAt === null || cycle.closedAt < decisionAt))
    return "missing-locked-source";
  if (record.engineVersion !== localGoalModelVersion()) return "evidence-changed";
  const occurrence = { fixtureId, externalId: fixture.externalId,
    kickoffAt, fixtureVersion: fixture.dataVersion, competitionId: fixture.season.competitionId, competitionName: fixture.season.competition.name,
    homeTeamId: fixture.homeTeamId, homeTeamName: fixture.homeTeam.name, awayTeamId: fixture.awayTeamId, awayTeamName: fixture.awayTeam.name,
    status: fixture.status, applicable: true, cycleId, originalRevisionId: sourceRevisionId };
  if (record.featuredDecision && record.replayAsOf !== undefined) {
    const { policyDelta } = record;
    if (policyDelta && (previous?.revisionId ?? null) !== policyDelta.expectedProjectionRevisionId) return "projection-owned";
    if (policyDelta && previous && !(await readNovemberReplayProjections(tx, [fixtureId])).has(fixtureId)) return "occurrence-changed";
    const { evidence, result, comparativeDecision } = await preparePricedNovemberReplay(tx, occurrence, record.replayAsOf, training,
      record.featuredDecision.version, policyDelta ? legacyLocalFeaturedDecisionVersion : undefined);
    if (record.suppressedProjectionRevisionId) {
      if (previous?.revisionId !== record.suppressedProjectionRevisionId || previous.featuredDecision || result ||
        evidence.evidenceHash !== record.evidenceHash) return "evidence-changed";
      const clocks = replaySuppressionClocks(previous.evidenceCutoffAt, evidence.decisionAt);
      return clocks && clocks.decisionAt === record.decisionAt && clocks.evidenceCutoffAt === evidenceCutoffAt ? null : "evidence-changed";
    }
    const approved = { artifactHash: record.artifactHash, markets: record.markets, selected: record.selected,
      decisionAt: record.decisionAt, featuredDecision: record.featuredDecision };
    if (evidence.evidenceHash !== record.evidenceHash || evidence.cutoffAt !== evidenceCutoffAt || evidence.scheduleVersion !== scheduleVersion ||
      evidenceFingerprint(evidence.evidenceReceiptIds) !== evidenceFingerprint(record.evidenceReceiptIds) ||
      evidenceFingerprint(result) !== evidenceFingerprint(approved)) return "evidence-changed";
    if (!policyDelta) return null;
    const baseline = await readRecord(tx, policyDelta.baselineRevisionId);
    if (!baseline || baseline.status !== "estimated" || baseline.featuredDecision?.version !== legacyLocalFeaturedDecisionVersion ||
      !comparativeDecision || evidenceFingerprint(comparativeDecision) !== evidenceFingerprint(baseline.featuredDecision) ||
      evidenceFingerprint(deltaReplayEvidence(baseline)) !== evidenceFingerprint(deltaReplayEvidence(record)))
      return "evidence-changed";
    if (sameReplayFeaturedDisplay(baseline.featuredDecision, record.featuredDecision) ||
      (previous?.featuredDecision ? sameReplayFeaturedDisplay(previous.featuredDecision, record.featuredDecision)
        : sameLegacyReplaySelection(previous?.selected ?? null, record.featuredDecision))) return "no-featured-display-change";
    return null;
  }
  if (!cycle || !await verifiedSource(tx, record, cycle, fixture)) return "source-not-api";
  const evidence = await loadNovemberReplayEvidenceInTransaction(tx, occurrence, at, training);
  if (evidence.status !== "qualified" || !evidence.forecast || evidence.forecast.hash !== record.artifactHash ||
    evidence.evidenceHash !== record.evidenceHash || evidence.cutoffAt !== evidenceCutoffAt || evidence.scheduleVersion !== scheduleVersion ||
    evidenceFingerprint(evidence.evidenceReceiptIds) !== evidenceFingerprint(record.evidenceReceiptIds)) return "evidence-changed";
  const forecast = buildNovemberReplayMarkets(evidence.forecast);
  return !forecast || evidenceFingerprint(forecast) !== evidenceFingerprint({ markets: record.markets, selected: record.selected })
    ? "evidence-changed" : null;
}

function deltaReplayEvidence(record: NovemberReplayRecord) {
  const { fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, evidenceCutoffAt, evidenceHash, engineVersion,
    registryVersion, artifactHash, evidenceReceiptIds, markets, decisionAt, replayAsOf, teams } = record;
  return { fixtureId, kickoffAt, cycleId, scheduleVersion, sourceRevisionId, evidenceCutoffAt, evidenceHash, engineVersion,
    registryVersion, artifactHash, evidenceReceiptIds, markets, decisionAt, replayAsOf, teams };
}

const actionId = (fixtureId: string, operationId: string) => evidenceFingerprint({ fixtureId, operationId });
async function readAction(tx: Tx, fixtureId: string, operationId: string): Promise<NovemberReplayAction | null> {
  const [row] = await tx.$queryRaw<HistoryRow[]>`SELECT *,integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256) AS validIntegrity
    FROM NovemberReplayAction WHERE id=${actionId(fixtureId, operationId)}`;
  if (!row) return null;
  const parsed = actionSchema.safeParse(checkedBody(row));
  if (!parsed.success) return deny("corrupt-record");
  const value = parsed.data;
  if (value.id !== row.id || value.id !== actionId(fixtureId, operationId) || value.fixtureId !== fixtureId || value.operationId !== operationId ||
    value.kind !== row.kind || value.activationOperationId !== row.activationOperationId || value.revisionId !== row.revisionId ||
    value.at !== storedClock(row.at) || value.previousProjection && (value.kind !== "activate" ||
      value.previousProjection.projection.fixtureId !== fixtureId || value.previousProjection.projection.revisionId === value.revisionId ||
      value.previousProjection.projection.activatedAt > value.at)) return deny("corrupt-record");
  return freezeEvidence(value);
}

async function addAction(tx: Tx, action: Omit<NovemberReplayAction, "id">) {
  const value = freezeEvidence({ ...action, id: actionId(action.fixtureId, action.operationId) });
  const body = encodeShadowArchive(value);
  await tx.$executeRaw`INSERT INTO NovemberReplayAction (id,fixtureId,operationId,kind,activationOperationId,revisionId,at,integrity,body)
    VALUES (${value.id},${value.fixtureId},${value.operationId},${value.kind},${value.activationOperationId},${value.revisionId},
      ${new Date(value.at)},SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR CHARACTER SET utf8mb4),256),JSON_EXTRACT(${body},'$'))`;
  return value;
}

async function lockFixture(tx: Tx, fixtureId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM FootballFixture
    WHERE id=${fixtureId} AND provider='api-football' LOCK IN SHARE MODE`;
  if (rows.length !== 1) return deny("unavailable");
}

class ReplayPointerInitializationRace extends Error {}

async function readPointer(tx: Tx, fixtureId: string) {
  const [pointer] = await tx.$queryRaw<HistoryRow[]>`
    SELECT *,integrity=SHA2(CAST(body AS CHAR CHARACTER SET utf8mb4),256) AS validIntegrity
    FROM NovemberReplayProjection WHERE fixtureId=${fixtureId}`;
  if (!pointer) return null;
  if (pointer.revisionId === null) return { revisionId: null, operationId: null, projection: null };
  const operationId = token.safeParse(pointer.activationOperationId);
  if (!operationId.success) return deny("corrupt-record");
  const projection = projectionFromRow(pointer);
  return { revisionId: projection.revisionId, operationId: operationId.data, projection };
}

async function lockPointer(tx: Tx, fixtureId: string, at: number) {
  const [locked] = await tx.$queryRaw<{ revisionId: string | null; activationOperationId: string | null }[]>`
    SELECT revisionId,activationOperationId FROM NovemberReplayProjection WHERE fixtureId=${fixtureId} FOR UPDATE`;
  if (locked) return await readPointer(tx, fixtureId) ?? deny("unavailable");
  const inserted = await tx.$executeRaw`INSERT IGNORE INTO NovemberReplayProjection (fixtureId,changedAt)
    VALUES (${fixtureId},${new Date(at)})`;
  // Dropping the transaction releases a concurrent duplicate's shared lock
  // before the retry acquires the existing pointer exclusively.
  if (inserted !== 1) throw new ReplayPointerInitializationRace();
  return { revisionId: null, operationId: null, projection: null };
}

async function writeProjection(tx: Tx, projection: NovemberReplayProjection, operationId: string) {
  const body = encodeShadowArchive(projection);
  await tx.$executeRaw`UPDATE NovemberReplayProjection SET revisionId=${projection.revisionId},sourceRevisionId=${projection.sourceRevisionId},
    cycleId=${projection.cycleId},scheduleVersion=${projection.scheduleVersion},kickoffAt=${new Date(projection.kickoffAt)},
    evidenceCutoffAt=${new Date(projection.evidenceCutoffAt)},activationOperationId=${operationId},changedAt=${new Date(projection.activatedAt)},
    integrity=SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR CHARACTER SET utf8mb4),256),body=JSON_EXTRACT(${body},'$')
    WHERE fixtureId=${projection.fixtureId}`;
}

// Runtime errors from the database are sanitized. Preserve classified replay
// refusals without exposing details from an inner SQL or archive failure.
async function runReplay<T>(database: Pick<DatabaseRuntime, "transaction">, visit: (tx: Tx) => Promise<T>): Promise<T> {
  for (let retry = true; ; retry = false) {
    let failure: unknown;
    try {
      return await database.transaction(async (tx) => {
        try { return await visit(tx); }
        catch (error) { failure = error; throw error; }
      }, { isolationLevel: "ReadCommitted", timeout: 45_000 });
    } catch {
      if (failure instanceof NovemberReplayStoreError) throw failure;
      if (!(retry && failure instanceof ReplayPointerInitializationRace)) return deny("unavailable");
    }
  }
}

export function createMysqlNovemberReplayStore(database: Pick<DatabaseRuntime, "query" | "transaction">) {
  // An operator batch reuses only the identity superset. Source and labels are
  // checked again in each transaction against the exact original cutoff.
  let training: Promise<NovemberReplayTrainingMembership> | undefined;
  const trainingMembership = () => training ??= readNovemberReplayTrainingMembership(database).catch(() => {
    training = undefined;
    return deny("unavailable");
  });
  return Object.freeze({
    async stage(value: NovemberReplayStageInput): Promise<NovemberReplayRecord> {
      const input = checkedStage(value), id = replayId(input);
      if (input.engineVersion !== localGoalModelVersion() || input.registryVersion !== LOCAL_FIRST_MARKET_REGISTRY_VERSION) return deny("invalid-input");
      return runReplay(database, async (tx) => {
        await lockFixture(tx, input.fixtureId);
        const at = await serverNow(tx);
        if (at < input.generatedAt) return deny("invalid-input");
        const body = encodeShadowArchive(input);
        const date = (instant: number | null) => instant === null ? null : new Date(instant);
        await tx.$executeRaw`INSERT IGNORE INTO NovemberReplayRevision
          (id,fixtureId,kickoffAt,cycleId,scheduleVersion,sourceRevisionId,evidenceCutoffAt,evidenceHash,generatedAt,stagedAt,status,integrity,body)
          VALUES (${id},${input.fixtureId},${date(input.kickoffAt)},${input.cycleId},${input.scheduleVersion},${input.sourceRevisionId},
            ${date(input.evidenceCutoffAt)},${input.evidenceHash},${new Date(input.generatedAt)},${new Date(at)},${input.status},
            SHA2(CAST(JSON_EXTRACT(${body},'$') AS CHAR CHARACTER SET utf8mb4),256),JSON_EXTRACT(${body},'$'))`;
        const saved = await readRecord(tx, id);
        if (!saved) return deny("unavailable");
        const { id: savedId, stagedAt, generatedAt, ...savedContent } = saved;
        void savedId; void stagedAt;
        // A retry may regenerate, but it cannot change the first record or its generation clock.
        if (evidenceFingerprint({ ...savedContent, generatedAt: input.generatedAt }) !== evidenceFingerprint(input) || generatedAt > at)
          return deny("conflicting-operation");
        return saved;
      });
    },
    async activeProjections(window: Readonly<{ startInclusive: number; endExclusive: number }>) {
      return runReplay(database, async (tx) => (await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT p.*
        FROM ${activeNovemberReplaySql} p WHERE p.kickoffAt>=${new Date(window.startInclusive)} AND p.kickoffAt<${new Date(window.endExclusive)}`))
        .map(projectionFromRow));
    },
    async activationDiff(ids: readonly string[]): Promise<readonly ReplayDiff[]> {
      if (ids.some((id) => !historyHash.safeParse(id).success)) return deny("invalid-input");
      const result: ReplayDiff[] = [];
      if (ids.length === 0) return freezeEvidence(result);
      const membership = await trainingMembership();
      for (const revisionId of [...new Set(ids)]) {
        result.push(await runReplay(database, async (tx): Promise<ReplayDiff> => {
          const record = await readRecord(tx, revisionId);
          if (!record) return { revisionId, fixtureId: null, sourceRevisionId: null, kickoffAt: null, selected: null,
            eligible: false, reason: "not-staged" };
          const { fixtureId, sourceRevisionId, kickoffAt, selected, featuredDecision } = record;
          const pointer = record.registryVersion === LOCAL_FIRST_MARKET_REGISTRY_VERSION
            ? await readPointer(tx, fixtureId) : null;
          const owned = pointer?.revisionId && (!featuredDecision || pointer.revisionId === revisionId);
          const reason = owned ? "projection-owned" : await activationRejection(tx, record, await serverNow(tx), membership, pointer?.projection ?? null);
          return { revisionId, fixtureId, sourceRevisionId, kickoffAt, selected, featuredDecision,
            previousProjectionRevisionId: pointer?.revisionId ?? null, previousSelection: pointer?.projection?.selected ?? null,
            eligible: reason === null, reason: reason ?? "eligible" };
        }));
      }
      return freezeEvidence(result);
    },
    async activate({ operationId, revisionId, expectedProjectionRevisionId }: ActivationInput): Promise<NovemberReplayAction> {
      if (!token.safeParse(operationId).success || !historyHash.safeParse(revisionId).success ||
        expectedProjectionRevisionId != null && !historyHash.safeParse(expectedProjectionRevisionId).success) return deny("invalid-input");
      const activationReceipt = (prior: NovemberReplayAction) => prior.kind === "activate" && prior.revisionId === revisionId
        ? prior : deny("conflicting-operation");
      if (!training) {
        const prior = await runReplay(database, async (tx) => {
          const record = await readRecord(tx, revisionId);
          if (!record) return deny("invalid-input");
          await lockFixture(tx, record.fixtureId);
          return readAction(tx, record.fixtureId, operationId);
        });
        if (prior) return activationReceipt(prior);
      }
      const membership = await trainingMembership();
      return runReplay(database, async (tx) => {
        const record = await readRecord(tx, revisionId);
        if (!record) return deny("invalid-input");
        const { fixtureId } = record;
        await lockFixture(tx, fixtureId);
        const pointer = await lockPointer(tx, fixtureId, await serverNow(tx));
        const prior = await readAction(tx, fixtureId, operationId);
        if (prior) return activationReceipt(prior);
        if (record.registryVersion !== LOCAL_FIRST_MARKET_REGISTRY_VERSION) return deny("registry-superseded");
        if (pointer.revisionId !== (expectedProjectionRevisionId ?? null) ||
          pointer.revisionId !== null && (!record.featuredDecision || pointer.revisionId === revisionId)) return deny("projection-owned");
        const reason = await activationRejection(tx, record, await serverNow(tx), membership, pointer.projection);
        if (reason) return deny(reason);
        const at = await serverNow(tx);
        const projection = projectionSchema.parse({ fixtureId, revisionId, sourceRevisionId: record.sourceRevisionId, cycleId: record.cycleId,
          scheduleVersion: record.scheduleVersion, kickoffAt: record.kickoffAt, evidenceCutoffAt: record.evidenceCutoffAt,
          generatedAt: record.generatedAt, activatedAt: at, selected: record.selected,
          markets: record.suppressedProjectionRevisionId ? pointer.projection?.markets :
            record.markets.map(({ definition, selected, selections }) => ({ definition, selected, ...(record.featuredDecision && { selections }) })),
          ...(record.featuredDecision && { featuredDecision: record.featuredDecision, decisionAt: record.decisionAt, teams: record.teams }) });
        const previousProjection = pointer.projection && pointer.operationId
          ? { projection: pointer.projection, operationId: pointer.operationId } : undefined;
        const receipt = await addAction(tx, { fixtureId, operationId, activationOperationId: operationId, revisionId, kind: "activate", at,
          ...(previousProjection && { previousProjection }) });
        await writeProjection(tx, projection, operationId);
        return receipt;
      });
    },
    async rollback({ fixtureId, operationId, activationOperationId }: RollbackInput): Promise<NovemberReplayAction> {
      if (!historyId.safeParse(fixtureId).success || !token.safeParse(operationId).success ||
        !token.safeParse(activationOperationId).success || operationId === activationOperationId) return deny("invalid-input");
      return runReplay(database, async (tx) => {
        await lockFixture(tx, fixtureId);
        const at = await serverNow(tx), pointer = await lockPointer(tx, fixtureId, at);
        const prior = await readAction(tx, fixtureId, operationId);
        if (prior) return prior.kind === "rollback" && prior.activationOperationId === activationOperationId ? prior : deny("conflicting-operation");
        const activation = await readAction(tx, fixtureId, activationOperationId);
        if (!activation || activation.kind !== "activate" || pointer.operationId !== activationOperationId ||
          pointer.revisionId !== activation.revisionId) return deny("projection-owned");
        const receipt = await addAction(tx, { fixtureId, operationId, activationOperationId, revisionId: activation.revisionId, kind: "rollback", at });
        if (activation.previousProjection) await writeProjection(tx, activation.previousProjection.projection, activation.previousProjection.operationId);
        else await tx.$executeRaw`UPDATE NovemberReplayProjection SET revisionId=NULL,sourceRevisionId=NULL,cycleId=NULL,scheduleVersion=NULL,
          kickoffAt=NULL,evidenceCutoffAt=NULL,activationOperationId=NULL,integrity=NULL,body=NULL,changedAt=${new Date(at)}
          WHERE fixtureId=${fixtureId}`;
        return receipt;
      });
    },
  });
}

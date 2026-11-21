import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { total15MarketKey } from "../../domain/extended-markets.ts";
import { legacyForecastMarketKey, legacyForecastOutcome } from "../../domain/legacy-goal-market-identities.ts";
import { localFeaturedDecisionVersion, verifiedLocalFeaturedBinding } from "../../domain/local-featured-decision.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import { isMarketFamily, isMarketSelection, marketRules, type MarketFamily, type MarketSource } from "../../domain/markets.ts";
import { parseDecimalOdds } from "../../domain/odds.ts";
import { preMatchReferenceOddsFreshMs } from "../../domain/reference-odds.ts";
import { isTotal15SlipSelection, type SlipMarketFamily, type SlipMarketSelection } from "../../domain/slip-markets.ts";
import { settleSlipSelection } from "../../domain/slip-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { wilson } from "../evaluation/evaluation-metrics.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { frozenLocalFeaturedPickSchema } from "../matches/frozen-featured-picks.ts";
import { assertHistorySeal, historyJson, historyTime, type HistoryRow } from "../predictions/history-read.ts";
import { fixtureResultFromRow } from "../results/result-read.ts";
import { settlementRevisionFromRow } from "../settlement/settlement-read.ts";

const dayMs = 86_400_000;
const lookbackMs = 90 * dayMs;
const validationMs = 30 * dayMs;
const maximumDecisions = 2_000;
const probabilityFloors = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0];
const oddsFloors = ["8.00", "5.00", "3.50", "2.50", "2.00", "1.75", "1.50", "1.30", "1.15", "1.01"];
const oddsFloorValues = oddsFloors.map((price) => parseDecimalOdds(price)!.scaled);
const minimumTraining = 30;
const minimumValidation = 20;
const priorWeight = 20;

export type BestSlipHistoryCandidate = Readonly<{ family: SlipMarketFamily; selection: SlipMarketSelection;
  probability: number; odds: string; offer?: Readonly<{ decimal?: string }>; source?: MarketSource }>;

type Comparable = Readonly<{ family: MarketFamily; line: number | null; selection: SlipMarketSelection;
  probabilityFloor: number; oddsFloor: string }>;
type HistoricalSample = BestSlipHistoryCandidate & Readonly<{
  fixtureId: string; kickoffAt: number; decisionAt: number; decisionRecordedAt: number;
  resultObservedAt: number; resultRecordedAt: number; settledAt: number; won: boolean;
}>;
type SampleCounts = Readonly<{ samples: number; wins: number; meanModelProbability: number | null }>;
export type BestSlipHistoryReport = Readonly<{
  version: "featured-hit-history-v1"; asOf: number; status: "ready" | "insufficient" | "limited" | "unavailable";
  scannedDecisions: number; settledDecisions: number;
  profiles: readonly (Comparable & Readonly<{ training: SampleCounts; validation: SampleCounts }>)[];
}>;

function reviewedSelection(family: MarketFamily, selection: string): selection is SlipMarketSelection {
  return isMarketSelection(family, selection) || family === "total-goals" && isTotal15SlipSelection(selection);
}

function comparable(candidate: BestSlipHistoryCandidate): Comparable | null {
  const { family, selection, probability, odds, offer, source } = candidate;
  const price = parseDecimalOdds(offer?.decimal ?? odds);
  if (source !== "local-engine" || !price || !Number.isFinite(probability) || probability < 0 || probability > 1 ||
    !isMarketFamily(family) || !reviewedSelection(family, selection)) return null;
  const line = family === "total-goals" ? (isTotal15SlipSelection(selection) ? 1.5 : marketRules.totalGoalsLine) : null;
  return { family, line, selection, probabilityFloor: probabilityFloors.find((floor) => floor <= probability)!,
    oddsFloor: oddsFloors[oddsFloorValues.findIndex((floor) => floor <= price.scaled)]! };
}

const comparableKey = ({ family, line, probabilityFloor, oddsFloor }: Comparable) =>
  JSON.stringify([family, line, probabilityFloor, oddsFloor]);
const profileKey = (group: Comparable) => JSON.stringify([comparableKey(group), group.selection]);
const exactPrice = (candidate: BestSlipHistoryCandidate) => parseDecimalOdds(candidate.offer?.decimal ?? candidate.odds)?.text;
const counts = (rows: readonly HistoricalSample[]): SampleCounts => ({
  samples: rows.length, wins: rows.filter(({ won }) => won).length,
  meanModelProbability: rows.length ? rows.reduce((sum, row) => sum + row.probability, 0) / rows.length : null,
});
const smoothedLift = (sample: SampleCounts) =>
  (sample.wins - sample.samples * sample.meanModelProbability!) / (sample.samples + priorWeight);

/** Use unique fixtures with both original decisions and verified outcomes visible at the study cutoff. */
export function assessBestSlipHistory(samples: readonly HistoricalSample[], asOf: number,
  scannedDecisions = samples.length, scan: "complete" | "limited" | "unavailable" = "complete") {
  const split = asOf - validationMs;
  const training = new Map<string, HistoricalSample | null>(), validation = new Map<string, HistoricalSample | null>();
  for (const row of samples) {
    if (!comparable(row) || !row.fixtureId || row.kickoffAt < asOf - lookbackMs ||
      ![row.kickoffAt, row.decisionAt, row.decisionRecordedAt, row.resultObservedAt, row.resultRecordedAt, row.settledAt]
        .every((clock) => Number.isSafeInteger(clock) && clock > 0) ||
      row.decisionAt >= getPublicationDeadline(utcInstantFromEpochMilliseconds(row.kickoffAt)) || row.decisionRecordedAt <= row.decisionAt ||
      row.resultObservedAt <= row.kickoffAt || row.resultObservedAt < row.decisionRecordedAt ||
      row.resultRecordedAt < row.resultObservedAt || row.settledAt < row.resultRecordedAt || row.settledAt >= asOf) continue;
    // The training set excludes outcomes that only became known during validation.
    if (row.kickoffAt < split && row.settledAt >= split) continue;
    const byFixture = row.kickoffAt < split ? training : validation;
    byFixture.set(row.fixtureId, byFixture.has(row.fixtureId) ? null : row);
  }
  const groups = new Map<string, { bucket: Comparable; training: HistoricalSample[]; validation: HistoricalSample[] }>();
  let settledDecisions = 0;
  for (const [window, fixtures] of [["training", training], ["validation", validation]] as const) {
    for (const row of fixtures.values()) {
      // A later occurrence cannot change training membership or be counted in both windows.
      if (!row || window === "validation" && training.has(row.fixtureId)) continue;
      const bucket = comparable(row)!;
      const key = profileKey(bucket);
      const group = groups.get(key) ?? { bucket, training: [], validation: [] };
      group[window].push(row);
      groups.set(key, group);
      settledDecisions++;
    }
  }
  const profiles = [...groups].sort(([left], [right]) => left.localeCompare(right)).map(([, group]) => ({
    ...group.bucket, training: counts(group.training), validation: counts(group.validation),
  }));
  type Profile = typeof profiles[number];
  const peers = new Map<string, Profile[]>();
  for (const profile of profiles) {
    if (profile.training.samples < minimumTraining || profile.validation.samples < minimumValidation) continue;
    const key = comparableKey(profile);
    const group = peers.get(key) ?? [];
    group.push(profile);
    peers.set(key, group);
  }
  const supported = new Map<string, number>();
  for (const group of peers.values()) {
    group.sort((left, right) => smoothedLift(right.training) - smoothedLift(left.training));
    // Organize statistically separated training groups, then require the direction on a later holdout.
    if (group.length < 2 || !group.slice(1).every((lower, index) => {
      const higher = group[index]!;
      const highInterval = wilson(higher.training.wins, higher.training.samples, 1.96);
      const lowInterval = wilson(lower.training.wins, lower.training.samples, 1.96);
      return highInterval.lower - higher.training.meanModelProbability! > lowInterval.upper - lower.training.meanModelProbability!
        && smoothedLift(higher.validation) > smoothedLift(lower.validation);
    })) continue;
    group.forEach((profile, index) => supported.set(profileKey(profile), index));
  }
  const report: BestSlipHistoryReport = freezeEvidence({ version: "featured-hit-history-v1", asOf,
    status: scan === "complete" ? (supported.size ? "ready" : "insufficient") : scan, scannedDecisions, settledDecisions, profiles });
  return Object.freeze({
    report,
    /** Reorder only equal exact probability/price peers of the same market. Retain the remaining candidates' slots. */
    order<T extends BestSlipHistoryCandidate>(baselineOrdered: readonly T[]): T[] {
      const ordered = [...baselineOrdered];
      if (report.status !== "ready") return ordered;
      const tied = new Map<string, { index: number; rank: number; candidate: T }[]>();
      for (const [index, candidate] of ordered.entries()) {
        const bucket = comparable(candidate);
        if (!bucket) continue;
        const rank = supported.get(profileKey(bucket));
        if (rank === undefined) continue;
        const key = JSON.stringify([comparableKey(bucket), candidate.probability, exactPrice(candidate)]);
        const group = tied.get(key) ?? [];
        group.push({ candidate, index, rank });
        tied.set(key, group);
      }
      for (const group of tied.values()) {
        const candidates = [...group].sort((left, right) => left.rank - right.rank);
        group.forEach(({ index }, offset) => { ordered[index] = candidates[offset]!.candidate; });
      }
      return ordered;
    },
  });
}

type DecisionRow = Readonly<{ fixtureId: string; cycleId: string; revisionId: string; decisionJson: unknown; validDecision: unknown;
  validClose: unknown; validRevision: unknown; effectiveCloseAt: string; kickoffAt: Date; cutoffAt: Date; scheduleObservedAt: Date;
  homeTeamId: string; awayTeamId: string; homeExternalId: string; awayExternalId: string;
  decisionRecordedAt: Date; revisionPublishedAt: Date; revisionRecordedAt: Date;
  settlementId: string | null }>;

/** Return only exact, supported full-time choices. Historic forecast aliases share the same regulation identity. */
function originalChoice(marketKey: string, selection: string) {
  if (marketKey === total15MarketKey && (selection === "over" || selection === "under"))
    return { family: "total-goals" as const, selection: `${selection}-1.5` as const };
  if (marketKey === legacyForecastMarketKey("total-goals") && (selection === "over" || selection === "under"))
    return { family: "total-goals" as const, selection: `${selection}-2.5` as const };
  const legacy = legacyForecastOutcome(marketKey, selection);
  const family = legacy?.family ?? marketKey;
  selection = legacy?.selection ?? selection;
  return isMarketFamily(family) && reviewedSelection(family, selection) ? { family, selection } : null;
}

function readDecision(row: DecisionRow) {
  assertHistorySeal(row.validDecision);
  assertHistorySeal(row.validClose);
  assertHistorySeal(row.validRevision);
  const pick = frozenLocalFeaturedPickSchema.parse(historyJson(row.decisionJson));
  const { decision, decisionAt, kickoffAt } = pick;
  if (decision.status !== "priced" || decision.version !== localFeaturedDecisionVersion ||
    pick.fixtureId !== row.fixtureId || pick.cycleId !== row.cycleId || pick.revisionId !== row.revisionId ||
    pick.homeTeamId !== row.homeTeamId || pick.awayTeamId !== row.awayTeamId ||
    kickoffAt !== historyTime(row.kickoffAt) || decisionAt >= historyTime(row.cutoffAt) ||
    decisionAt + 1 !== Number(row.effectiveCloseAt) || historyTime(row.scheduleObservedAt) > decisionAt ||
    historyTime(row.revisionRecordedAt) > decisionAt || historyTime(row.revisionPublishedAt) > decisionAt) return null;
  const { quote } = decision, mapping = verifiedLocalFeaturedBinding(decision.marketKey, decision.selection);
  if (!mapping || quote.betId !== mapping.betId || quote.betName !== mapping.betName || quote.providerSelection !== mapping.label ||
    decisionAt - quote.observedAt > preMatchReferenceOddsFreshMs ||
    quote.providerUpdatedAt !== null && decisionAt - quote.providerUpdatedAt > preMatchReferenceOddsFreshMs) return null;
  const choice = originalChoice(decision.marketKey, decision.selection);
  return choice && { ...choice, fixtureId: pick.fixtureId, kickoffAt, decisionAt, decisionRecordedAt: historyTime(row.decisionRecordedAt),
    source: "local-engine" as const, probability: decision.probability, odds: quote.decimal };
}

function sampleFromRows(row: DecisionRow, settlementRow: HistoryRow | undefined, resultRow: HistoryRow | undefined): HistoricalSample | null {
  if (!settlementRow || !resultRow) return null;
  try {
    const decision = readDecision(row);
    if (decision === null) return null;
    const settlement = settlementRevisionFromRow(settlementRow), result = fixtureResultFromRow(resultRow);
    const startedAt = resultRow.lifecycleStartedAt;
    if (settlement.fixtureId !== row.fixtureId || settlement.cycleId !== row.cycleId || settlement.family !== decision.family ||
      settlement.lockedSetId !== row.revisionId || settlement.resultId !== result.id || result.fixtureId !== row.fixtureId ||
      settlement.cycleState !== "closed" || !settlement.resultUsable || (settlement.status !== "correct" && settlement.status !== "incorrect") ||
      !isPlayedFinalStatus(result.status) || !result.regulation.verified || result.regulation.home === null || result.regulation.away === null ||
      resultRow.lifecycleCycleId !== row.cycleId || Number(resultRow.lifecycleKickoffAt) !== decision.kickoffAt ||
      resultRow.lifecycleHomeId !== row.homeExternalId || resultRow.lifecycleAwayId !== row.awayExternalId ||
      resultRow.lifecycleStatus !== result.status ||
      startedAt !== null && startedAt !== "null" && !(Number(startedAt) > decision.decisionAt && Number(startedAt) <= result.observedAt) ||
      result.providerUpdatedAt !== null && result.providerUpdatedAt > result.observedAt) return null;
    const context = { status: result.status, cycleEligibility: { eligible: true as const }, regulationScore: { verified: true as const,
      period: marketRules.period, home: result.regulation.home, away: result.regulation.away } };
    // The stored settlement is a proof for the occurrence; grade the actual featured selection on the proven score.
    const grade = settleSlipSelection(decision.family, decision.selection, context);
    if (grade.status !== "correct" && grade.status !== "incorrect") return null;
    return { ...decision, won: grade.status === "correct", settledAt: settlement.at, resultObservedAt: result.observedAt,
      resultRecordedAt: historyTime(resultRow.recordedAt) };
  } catch { return null; }
}

/** Study first-party cutoff captures. Versions reconstructed later by replay, recovered prices, and mutable pointers are excluded. */
export async function readBestSlipHistory(database: Pick<DatabaseRuntime, "transaction">, asOf: number,
  competitionIds: readonly number[]) {
  if (!competitionIds.length || !Number.isSafeInteger(asOf) || asOf <= lookbackMs)
    return assessBestSlipHistory([], asOf, 0, "unavailable");
  const start = new Date(asOf - lookbackMs), split = new Date(asOf - validationMs), through = new Date(asOf);
  try {
    return await database.transaction(async (tx) => {
      async function readWindow(from: Date, before: Date) {
        return tx.$queryRaw<DecisionRow[]>(Prisma.sql`
        SELECT o.fixtureId, o.cycleId, o.revisionId, o.featuredDecisionJson AS decisionJson, o.at AS decisionRecordedAt,
          o.featuredDecisionIntegrity = SHA2(CAST(o.featuredDecisionJson AS CHAR CHARACTER SET utf8mb4), 256) AS validDecision,
          o.integrity = SHA2(CAST(o.operationJson AS CHAR), 256) AS validClose,
          p.integrity = SHA2(CONCAT(p.id, ':', p.requestHash, ':', CAST(p.candidateJson AS CHAR)), 256) AS validRevision,
          JSON_UNQUOTE(JSON_EXTRACT(o.operationJson, '$.effectiveCloseAt')) AS effectiveCloseAt,
          ps.kickoffAt, ps.cutoffAt, ps.observedAt AS scheduleObservedAt, p.publishedAt AS revisionPublishedAt, p.recordedAt AS revisionRecordedAt,
          JSON_UNQUOTE(JSON_EXTRACT(p.candidateJson, '$.context.context.home.teamId')) AS homeTeamId,
          JSON_UNQUOTE(JSON_EXTRACT(p.candidateJson, '$.context.context.away.teamId')) AS awayTeamId,
          JSON_UNQUOTE(JSON_EXTRACT(p.candidateJson, '$.context.context.home.externalId')) AS homeExternalId,
          JSON_UNQUOTE(JSON_EXTRACT(p.candidateJson, '$.context.context.away.externalId')) AS awayExternalId,
          (SELECT m.id FROM MarketSettlementRevision m
           JOIN SettlementBatch batch ON batch.id = m.batchId AND batch.fixtureId = m.fixtureId
           WHERE m.cycleId = o.cycleId AND m.fixtureId = o.fixtureId AND m.at < ${before}
             AND m.family = CASE JSON_UNQUOTE(JSON_EXTRACT(o.featuredDecisionJson, '$.decision.marketKey'))
               WHEN 'goal:full-time:result' THEN 'match-result' WHEN 'match-result' THEN 'match-result'
               WHEN 'goal:full-time:double-chance' THEN 'double-chance' WHEN 'double-chance' THEN 'double-chance'
               WHEN 'goal:full-time:btts' THEN 'both-teams-to-score' WHEN 'both-teams-to-score' THEN 'both-teams-to-score'
               ELSE 'total-goals' END
           ORDER BY m.at DESC, batch.fixtureVersion DESC, m.id DESC LIMIT 1) AS settlementId
        FROM PredictionSet p
        JOIN PredictionSchedule ps ON ps.cycleId = p.cycleId AND ps.version = p.scheduleVersion AND ps.fixtureId = p.fixtureId
        JOIN PredictionCycleOperation o ON o.cycleId = p.cycleId AND o.fixtureId = p.fixtureId AND o.revisionId = p.id AND o.kind = 'close'
        WHERE p.publishedAt >= ${new Date(from.getTime() - 14 * dayMs)} AND p.publishedAt < ${before}
          AND ps.kickoffAt >= ${from} AND ps.kickoffAt < ${before} AND o.at < ${before}
          AND JSON_UNQUOTE(JSON_EXTRACT(o.featuredDecisionJson, '$.decision.status')) = 'priced'
          AND JSON_UNQUOTE(JSON_EXTRACT(o.featuredDecisionJson, '$.decision.version')) = ${localFeaturedDecisionVersion}
          AND NOT EXISTS (SELECT 1 FROM PredictionCycleOperation voided WHERE voided.cycleId = o.cycleId AND voided.kind = 'void' AND voided.at < ${before})
        ORDER BY ps.kickoffAt DESC, p.fixtureId, p.id LIMIT ${maximumDecisions + 1}`);
      }
      let scanned = 0;
      const samples: HistoricalSample[] = [];
      for (const [from, before] of [[start, split], [split, through]] as const) {
        const decisions = await readWindow(from, before);
        scanned += decisions.length;
        if (scanned > maximumDecisions) return assessBestSlipHistory([], asOf, scanned, "limited");
        for (let offset = 0; offset < decisions.length; offset += 200) {
          const batch = decisions.slice(offset, offset + 200);
          const settlementIds = batch.flatMap(({ settlementId }) => settlementId ? [settlementId] : []);
          if (!settlementIds.length) continue;
          const settlements = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT *,
            integrity = SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM MarketSettlementRevision WHERE id IN (${Prisma.join(settlementIds)})`);
          const resultIds = settlements.flatMap(({ resultId }) => typeof resultId === "string" ? [resultId] : []);
          if (!resultIds.length) continue;
          const results = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`
            SELECT r.*, event.at AS recordedAt, life.cycleId AS lifecycleCycleId,
              JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson, '$.observation.kickoffAt')) AS lifecycleKickoffAt,
              JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson, '$.observation.homeExternalId')) AS lifecycleHomeId,
              JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson, '$.observation.awayExternalId')) AS lifecycleAwayId,
              JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson, '$.observation.actualStartedAt')) AS lifecycleStartedAt,
              JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson, '$.observation.status')) AS lifecycleStatus,
              r.integrity = SHA2(CAST(r.body AS CHAR),256) AS validIntegrity
            FROM FixtureResult r JOIN PredictionChangeEvent event ON event.fixtureResultId = r.id
            JOIN ResultProviderObservation proof ON proof.id = JSON_UNQUOTE(JSON_EXTRACT(r.body, '$.observationId'))
              AND proof.fixtureId = r.fixtureId AND proof.retrievedAt = r.observedAt
            JOIN FixtureLifecycleObservation life ON life.id = proof.lifecycleId AND life.fixtureId = r.fixtureId
              AND life.retrievedAt = r.observedAt AND life.at < ${before} AND life.outcome IN ('accepted', 'unchanged')
            WHERE r.id IN (${Prisma.join(resultIds)}) AND r.observedAt < ${before} AND event.at < ${before}
              AND life.integrity = SHA2(CAST(life.receiptJson AS CHAR),256) AND proof.integrity = SHA2(CAST(proof.body AS CHAR),256)
              AND CAST(JSON_UNQUOTE(JSON_EXTRACT(life.receiptJson, '$.observation.competitionExternalId')) AS UNSIGNED)
                IN (${Prisma.join(competitionIds)})
              AND JSON_UNQUOTE(JSON_EXTRACT(proof.body, '$.resultId')) = r.id
              AND NOT EXISTS (SELECT 1 FROM FixtureResult newer
                JOIN PredictionChangeEvent receipt ON receipt.fixtureResultId = newer.id
                WHERE newer.fixtureId = r.fixtureId AND newer.fixtureVersion > r.fixtureVersion
                  AND newer.observedAt < ${before} AND receipt.at < ${before})`);
          const bySettlement = new Map(settlements.map((row) => [row.id, row]));
          const byResult = new Map(results.map((row) => [row.id, row]));
          for (const row of batch) {
            const settlement = bySettlement.get(row.settlementId);
            const sample = sampleFromRows(row, settlement, byResult.get(settlement?.resultId));
            if (sample) samples.push(sample);
          }
        }
      }
      return assessBestSlipHistory(samples, asOf, scanned);
    }, { isolationLevel: "RepeatableRead", maxWait: 2_000, timeout: 10_000 });
  } catch {
    return assessBestSlipHistory([], asOf, 0, "unavailable");
  }
}

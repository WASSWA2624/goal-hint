import { randomUUID } from 'node:crypto';
import { getPublicationDeadline } from '../../src/domain/calendar.ts';
import { marketSelections } from '../../src/domain/markets.ts';
import { evidenceSerialize } from '../../src/server/evidence/evidence-input.ts';
import { evidenceContext, evidenceHash } from './evidence-fixtures.mjs';
import { liveRecord } from './live-refresh-fixtures.mjs';
import { historyCandidate } from './prediction-history-fixtures.mjs';
import { predictorRawOutput, predictorSnapshot } from './predictor-output-fixtures.mjs';

/** Synthetic sealed-row inputs for the real history readers; no provider or database access. */
export function slipForecastFixture({ fixtureId = randomUUID(), cycleId = randomUUID(), revisionId = randomUUID(),
  at = Date.parse('2026-10-09T09:00:00Z') } = {}) {
  const record = liveRecord(), homeId = randomUUID(), awayId = randomUUID(), runId = randomUUID();
  const kickoffAt = at + 3_600_000, analysisAt = at - 60_000, publishedAt = analysisAt + 3000;
  const context = evidenceContext(undefined, { fixtureId, cycleId, runId, home: { teamId: homeId, externalId: 10 },
    away: { teamId: awayId, externalId: 20 }, analysisAt, cutoffAt: analysisAt, kickoffAt });
  const snapshot = predictorSnapshot(undefined, undefined, context), groups = predictorRawOutput(snapshot).groups;
  const candidate = historyCandidate({ snapshot, probabilities: { ...groups,
    'match-result': { period: 'regulation-including-stoppage-time', probabilities: { 'home-win': 0.7, draw: 0.2, 'away-win': 0.1 } } } });
  const row = { id: revisionId, fixtureId, fixtureVersion: 1n, cycleId, runId, runSequence: 20261009n, jobId: candidate.context.jobId,
    fixtureRevision: 1, cycleRevision: 1, predecessorId: null, scheduleVersion: 1, modelVersionId: candidate.context.pin.modelVersionId,
    evidenceSnapshotId: evidenceHash('synthetic-slip-snapshot'), evidenceHash: snapshot.hash, evidenceCutoffAt: new Date(analysisAt),
    generationCompletedAt: new Date(analysisAt + 2500), publishedAt: new Date(publishedAt), recordedAt: new Date(publishedAt),
    ruleVersion: candidate.markets['match-result'].market.ruleVersion, requestHash: evidenceHash('synthetic-slip-revision'),
    candidateJson: evidenceSerialize(candidate), validIntegrity: 1 };
  const marketRows = Object.entries(candidate.markets).map(([family, item]) => ({ setId: revisionId, family,
    available: item.available, source: item.available ? item.market.source : null,
    selection: item.available ? item.market.selection : null, selectedProbability: item.available ? item.market.selectedProbability : null,
    unavailableReason: item.available ? null : item.reason,
    probability1: item.available ? item.market.probabilities[marketSelections[family][0]] : null,
    probability2: item.available ? item.market.probabilities[marketSelections[family][1]] : null,
    probability3: item.available && marketSelections[family].length === 3 ? item.market.probabilities[marketSelections[family][2]] : null,
    generatedAt: item.available && item.timestamps.generatedAt !== null ? new Date(item.timestamps.generatedAt) : null,
    retrievedAt: item.available ? new Date(item.timestamps.retrievedAt) : null,
    providerUpdatedAt: item.available && item.timestamps.providerUpdatedAt !== null ? new Date(item.timestamps.providerUpdatedAt) : null,
    payloadJson: evidenceSerialize(item), validIntegrity: 1 }));
  const cycle = { id: cycleId, fixtureId, creationKey: evidenceHash('synthetic-slip-cycle'), creationHash: evidenceHash('synthetic-slip-cycle-body'),
    ordinal: 1, version: 1, scheduleVersion: 1, kickoffAt: new Date(kickoffAt), cutoffAt: new Date(getPublicationDeadline(kickoffAt)),
    openedAt: new Date(analysisAt - 1000), state: 'open', currentSetId: revisionId, lockedSetId: null,
    closedAt: null, lockedAt: null, voidedAt: null, voidReason: null };
  const schedule = { id: randomUUID(), cycleId, fixtureId, version: 1, kickoffAt: cycle.kickoffAt, cutoffAt: cycle.cutoffAt,
    observedAt: cycle.openedAt, actualStartedAt: null };
  const fixture = { id: fixtureId, status: 'scheduled', activeCycleId: cycleId, kickoff: cycle.kickoffAt,
    homeTeamId: homeId, awayTeamId: awayId, regulationHome: null, regulationAway: null, regulationVerifiedAt: null,
    regulationEvidenceRef: null, lifecycleState: null, resultState: null };
  const selection = { fixtureId, kickoffAt, homeTeam: { ...record.homeTeam, id: homeId }, awayTeam: { ...record.awayTeam, id: awayId },
    competition: record.competition, family: 'match-result', selection: 'home-win', probability: 0.7, odds: '2.00', oddsBasis: 'bookmaker' };
  const slip = { id: 'synthetic-original-slip', selections: [selection], totalOdds: '2.00', oddsBasis: 'bookmaker', averageProbability: 0.7 };
  return { fixture, cycle, schedule, row, marketRows, slip, at, candidate };
}

import { randomUUID } from 'node:crypto';
import { getPublicationDeadline } from '../../src/domain/calendar.ts';
import { marketSelections, validateMarketSnapshot } from '../../src/domain/markets.ts';
import { evidenceSerialize } from '../../src/server/evidence/evidence-input.ts';
import { LIVE_FORECAST_CASCADE, LOCAL_FIRST_FORECAST_CASCADE } from '../../src/server/fallback/fallback-contract.ts';
import { evidenceContext, evidenceHash } from './evidence-fixtures.mjs';
import { liveRecord } from './live-refresh-fixtures.mjs';
import { historyCandidate } from './prediction-history-fixtures.mjs';
import { predictorRawOutput, predictorSnapshot } from './predictor-output-fixtures.mjs';

/** Synthetic sealed-row inputs for the real history readers; no provider or database access. */
export function slipForecastFixture({ fixtureId = randomUUID(), cycleId = randomUUID(), revisionId = randomUUID(),
  at = Date.parse('2026-10-09T09:00:00Z'), localQualification, homeWin = 0.7 } = {}) {
  const record = liveRecord(), homeId = randomUUID(), awayId = randomUUID(), runId = randomUUID();
  const kickoffAt = at + 3_600_000, analysisAt = at - 60_000, publishedAt = analysisAt + 3000;
  const context = evidenceContext(undefined, { fixtureId, cycleId, runId, home: { teamId: homeId, externalId: 10 },
    away: { teamId: awayId, externalId: 20 }, analysisAt, cutoffAt: analysisAt, kickoffAt });
  const snapshot = predictorSnapshot(undefined, undefined, context), groups = predictorRawOutput(snapshot).groups;
  const inputs = { ...groups, 'match-result': { period: 'regulation-including-stoppage-time',
    probabilities: { 'home-win': homeWin, draw: 0.2, 'away-win': homeWin === 0.7 ? 0.1 : 1 - homeWin - 0.2 } } };
  const seed = historyCandidate({ snapshot, probabilities: inputs });
  let candidate = seed;
  if (localQualification) {
    const local = validateMarketSnapshot(Object.fromEntries(Object.entries(inputs).map(([family, group]) =>
      [family, { ...group, source: 'local-engine' }])));
    const qualified = localQualification === 'qualified';
    const provenance = { kind: 'local-engine', modelVersion: 'synthetic-slip-local-model', historyHash: evidenceHash('synthetic-slip-model-history'),
      evidenceHash: snapshot.hash, rates: { home: 1.4, away: 1.1 }, sample: { matches: 200, homeEffectiveMatches: 20, awayEffectiveMatches: 24 },
      ...(qualified ? { numericalBasis: 'qualified-local-model' } : {}) };
    const transitions = Object.fromEntries(Object.entries(local.markets).map(([family, item]) =>
      [family, { selected: item.available ? item.market.source : null, ai: 'not-requested', local: 'candidate', provider: 'not-requested' }]));
    candidate = { ...seed, context: { ...seed.context, pin: null }, issues: local.issues,
      markets: Object.fromEntries(Object.entries(local.markets).map(([family, item]) => [family, item.available ? { ...item, provenance,
        fallback: null, timestamps: { generatedAt: analysisAt + 1000, retrievedAt: analysisAt + 1000, providerUpdatedAt: null },
        flags: ['unknown-provider-update-time'] } : item])),
      audit: { aiStatus: 'denied', aiReason: 'unconfigured', providerStatus: 'not-requested', providerReason: null,
        sourceCascade: qualified ? LOCAL_FIRST_FORECAST_CASCADE : LIVE_FORECAST_CASCADE, localStatus: 'candidate',
        ...(qualified ? { transitions } : {}) } };
  }
  const row = { id: revisionId, fixtureId, fixtureVersion: 1n, cycleId, runId, runSequence: 20261009n, jobId: candidate.context.jobId,
    fixtureRevision: 1, cycleRevision: 1, predecessorId: null, scheduleVersion: 1, modelVersionId: candidate.context.pin?.modelVersionId ?? null,
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
    competition: record.competition, family: 'match-result', selection: 'home-win', probability: homeWin, odds: '2.00', oddsBasis: 'bookmaker',
    ...(localQualification ? { source: 'local-engine' } : {}) };
  const slip = { id: 'synthetic-original-slip', selections: [selection], totalOdds: '2.00', oddsBasis: 'bookmaker', averageProbability: homeWin };
  return { fixture, cycle, schedule, row, marketRows, slip, at, candidate };
}

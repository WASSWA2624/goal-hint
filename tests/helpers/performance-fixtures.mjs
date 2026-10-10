import { randomUUID } from 'node:crypto';
import { performanceFamilies } from '../../src/domain/performance.ts';
import { settleMarketSelection } from '../../src/domain/market-settlement.ts';
import { historyCandidate } from './prediction-history-fixtures.mjs';
import { modelVersion } from './predictor-fixtures.mjs';
import { evaluationProtocol, EVALUATION_COMPETITION_ID } from './evaluation-fixtures.mjs';

// Synthetic reporting policy and data; these are never a production approval.
export function performanceProtocol(overrides = {}) {
  const base = { ...evaluationProtocol({ candidateModel: modelVersion(), horizons: [{ id: 'day-ahead', minimumMs: 0, maximumMs: 7 * 86_400_000 }] }) };
  delete base.id; delete base.hash;
  const gates = base.gates.filter((g) => g.purpose === 'public-claim').flatMap((g) => ['combined', 'ai', 'api-football'].map((system) => ({
    ...g, id: `${g.id}-${system}`, system, ...overrides.gate,
  })));
  const rest = { ...overrides }; delete rest.gate;
  return evaluationProtocol({ ...base, candidateModel: modelVersion(), horizons: base.horizons, gates, ...rest });
}
export function performanceRecord({ source = 'ai', score = [2, 1], state = 'closed', partial = false, noLock = false, id = randomUUID() } = {}) {
  const candidate = historyCandidate({ source, partial }), revisionId = randomUUID(), cycleId = randomUUID();
  const result = score ? { id: 'a'.repeat(64), status: 'finished-regulation', regulation: { verified: true, home: score[0], away: score[1] } } : null;
  const cycle = { id: cycleId, state, lockedSetId: noLock || state === 'open' ? null : revisionId,
    kickoffAt: candidate.context.context.kickoffAt, voidReason: state === 'void' ? 'formal-postponement' : null };
  const revision = cycle.lockedSetId ? { id: revisionId, cycleId, fixtureId: id, modelVersionId: source === 'ai' ? modelVersion().id : null,
    evidenceCutoffAt: candidate.context.context.cutoffAt, publishedAt: candidate.context.context.analysisAt + 3000, candidate } : null;
  return { fixture: { id, dataVersion: 1n, homeTeam: {name: 'Synthetic Home'}, awayTeam: {name: 'Synthetic Away'}, season: { competitionId: EVALUATION_COMPETITION_ID } }, cycle, revision, result,
    projection: { markets: performanceFamilies.map((family) => {
      const item = candidate.markets[family];
      const status = result && item.available ? settleMarketSelection(family, item.market.selection, {
        status: result.status, cycleEligibility: { eligible: state !== 'void', reason: 'postponed-cycle' },
        regulationScore: { verified: true, period: 'regulation-including-stoppage-time', home: score[0], away: score[1] },
      }).status : 'pending';
      return { base: { family }, inputHash: 'synthetic', previous: { status, inputHash: 'synthetic', lockedSetId: cycle.lockedSetId } };
    }) } };
}
export function performanceSnapshot(records = []) {
  return { records, models: new Map([[modelVersion().id, modelVersion()]]), settlements: [],
    historicalCycles: { basis: 'void-cycle-original-kickoff-in-period-excluding-applicable-cycle', void: 0, postponed: 0 },
    operations: { basis: 'refresh-jobs-for-current-cohort-fixtures-across-runs', total: 0, failed: 0, pending: 0, failedFixtures: 0, delayedRefreshes: 0, delayedFixtures: 0 } };
}

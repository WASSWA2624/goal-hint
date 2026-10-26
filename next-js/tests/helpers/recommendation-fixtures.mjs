import { recommendationPolicy } from '../../src/domain/recommendation.ts';
import { evidenceHash } from './evidence-fixtures.mjs';

/** Synthetic immutable quote only; no actual bookmaker or accuracy evidence. */
export function candidateRecommendation(candidate, evidenceSnapshotId, overrides = {}) {
  const context = candidate.context.context, family = overrides.family ?? 'double-chance';
  const item = candidate.markets[family], selection = overrides.selection ?? 'home-or-away';
  const probability = item.market.probabilities[selection];
  const quote = { fixtureId: context.fixtureId, fixtureVersion: String(context.fixtureVersion), homeTeamId: context.home.teamId,
    awayTeamId: context.away.teamId, family, selection, period: item.market.period, line: family === 'total-goals' ? 2.5 : null,
    bookmakerId: 8, decimal: '1.9001', snapshotId: evidenceHash('synthetic-private-odds-snapshot'), observedAt: context.cutoffAt - 1000,
    providerUpdatedAt: null, permitted: true, suspended: false };
  return { version: 1, policyVersion: recommendationPolicy.version, fixtureId: context.fixtureId,
    fixtureVersion: String(context.fixtureVersion), homeTeamId: context.home.teamId, awayTeamId: context.away.teamId,
    analysisAt: context.analysisAt, evidenceSnapshotId, evidenceHash: candidate.context.evidenceHash, status: 'selected',
    selected: { family, selection, period: item.market.period, line: quote.line, source: item.market.source, probability,
      forecastTimestamps: item.timestamps, quote },
    decisions: [{ source: item.market.source, family, selection, probability, eligible: true, reasons: [], evidence: {} }],
    fallbackReason: null, explanation: 'The synthetic candidate meets the evidence and probability policy with the highest eligible price.', ...overrides };
}

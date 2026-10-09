import { evidenceHash } from './evidence-fixtures.mjs';
import { fallbackFixture, fallbackProvider, fallbackAiDenied } from './fallback-fixtures.mjs';
import { resolveFallbackCandidate } from '../../src/server/fallback/fallback-resolution.ts';

// Synthetic forecasts/permissions only, through the real candidate resolver.
export function historyCandidate({ snapshot, model, source = 'ai', partial = false, probabilities } = {}) {
  const fixture = fallbackFixture({ snapshot, model, output: probabilities ? { groups: probabilities } : {} });
  const ai = source === 'ai' ? fixture.ai : fallbackAiDenied('unconfigured');
  const result = resolveFallbackCandidate({ expected: fixture.expected, ai,
    provider: source === 'ai' ? null : fallbackProvider(fixture.expected), now: fixture.now }, fixture.authority);
  if (result.status !== 'candidate') throw new Error('Invalid synthetic history candidate');
  if (!partial) return result.candidate;
  return { ...result.candidate, markets: { ...result.candidate.markets,
    'total-goals': { available: false, reason: 'unsupported-family' },
    'both-teams-to-score': { available: false, reason: 'unsupported-family' } } };
}
export const historyActor = { actor: 'synthetic-test-worker', reason: 'Synthetic storage decision', evidenceRef: 'synthetic-history-proof' };
export function cycleCreation(fixture, key = 'first-cycle', activate = true) {
  return { ...historyActor, fixtureId: fixture.id, creationKey: evidenceHash(`${fixture.id}:${key}`),
    kickoffAt: fixture.kickoff, openedAt: Date.parse('2026-10-09T08:00:00.000Z'), activate };
}
export function cycleChange(cycle, overrides = {}, key = 'cycle-change') {
  const { state, currentSetId, lockedSetId, closedAt, lockedAt, voidedAt, voidReason } = cycle;
  return { ...historyActor, cycleId: cycle.id, expectedVersion: cycle.version,
    eventKey: evidenceHash(`${cycle.id}:${key}`), at: cycle.openedAt + 60_000,
    next: { state, currentSetId, lockedSetId, closedAt, lockedAt, voidedAt, voidReason, ...overrides } };
}
export function revisionInput(candidate, evidenceSnapshotId, scheduleVersion = 1) {
  const base = candidate.context.context.analysisAt;
  return { ...historyActor, candidate, evidenceSnapshotId, scheduleVersion,
    generationCompletedAt: base + 2500, publishedAt: base + 3000 };
}

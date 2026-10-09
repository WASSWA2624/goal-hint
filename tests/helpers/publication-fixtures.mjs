import { evidenceHash, EVIDENCE_NOW } from './evidence-fixtures.mjs';

// Synthetic trial policies/receipts only; no live approval or provider calls.
export const PUBLICATION_NOW = EVIDENCE_NOW + 4000;
export function publicationPolicy(overrides = {}) {
  const freshness = { maxAgeMs: 60_000, basis: 'retrieved', unknownGeneration: 'allow-flagged', unknownUpdate: 'allow-flagged' };
  return { version: 1, evidenceRef: 'synthetic-publication-freshness-proof', maxObservationAgeMs: 10_000,
    sources: { ai: freshness, 'api-football': freshness }, ...overrides };
}
export function publicationAuthority(overrides = {}) {
  return { authorize() {}, verifyPolicy: () => true, verifyObservation: () => true, verifyCandidate: () => true, ...overrides };
}
export function publicationInput(candidate, evidenceSnapshotId, scheduleVersion = 1, overrides = {}) {
  const context = candidate.context.context;
  return { attemptKey: evidenceHash(`${context.runId}:${context.fixtureId}:attempt-1`), candidate, evidenceSnapshotId, scheduleVersion,
    generationCompletedAt: context.analysisAt + 2500, observation: { provider: 'api-football', fixtureId: context.fixtureId,
      externalFixtureId: context.externalFixtureId, cycleId: context.cycleId, kickoffAt: context.kickoffAt,
      status: 'scheduled', retrievedAt: PUBLICATION_NOW, providerUpdatedAt: null, actualStartedAt: null,
      evidenceRef: 'synthetic-current-status-response' }, ...overrides };
}
export function emptyCandidate(candidate) {
  return { ...candidate, markets: Object.fromEntries(Object.keys(candidate.markets).map((family) =>
    [family, { available: false, reason: 'unsupported-family' }])) };
}

import { jobEnvelope, jobTestHash } from './job-fixtures.mjs';
import { catalogBounds } from './catalog-fixtures.mjs';

export const SELECTION_FOR = Date.parse('2026-10-08T21:00:00Z');
export const selectionHash = jobTestHash;
export function selectionPolicy(overrides = {}) {
  const bounds = { ...catalogBounds() }; delete bounds.deadlineAt;
  const { handlerVersion, payload, maxAttempts, timeoutMs, leaseMs, fallbackReserveMs, backoff } = jobEnvelope();
  return { version: 1, evidenceRef: 'synthetic-trial-backed-selection-policy', competitionIds: [39], eligibleStatuses: ['scheduled'],
    degradationPolicyRef: 'synthetic-explicit-degradation-policy', retentionEvidenceRef: 'synthetic-catalog-retention', leaseMs: 120_000,
    attemptsPerInvocation: 2, maxFixtures: 1000, importBounds: { ...bounds, deadlineMs: 120_000 },
    refresh: { type: 'test.selected-refresh', handlerVersion, payload, maxAttempts, timeoutMs, leaseMs, fallbackReserveMs, backoff }, ...overrides };
}
export const selectionAuthority = (overrides = {}) => ({ authorize() {}, verifyPolicy: () => true,
  verifyDegradedAction: () => true, verifyCycleEligibility: () => true, ...overrides });
export const degradedAction = { actor: 'synthetic-operator', evidenceRef: 'synthetic-degradation-action', policyRef: 'synthetic-explicit-degradation-policy' };
export const catalogSelectionAuthority = { authorize() {}, authorizeMapping() {}, verifyRetention: () => true,
  verifyObservation: () => true, verifyLogo: () => true, verifyRegulationScore: () => true,
  verifyMapping: () => false, regulationEvidenceRef: () => 'synthetic-score-proof', verifyKnownSubset: () => true };

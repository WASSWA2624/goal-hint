// Synthetic workload approval only; live bounds and hosting need actual approval.
export function cutoffPolicy(overrides = {}) {
  return { version: 1, evidenceRef: 'synthetic-cutoff-policy-proof', job: { priority: 255, maxAttempts: 3,
    timeoutMs: 30_000, leaseMs: 30_000, backoff: { baseMs: 100, maxMs: 1000 } }, ...overrides };
}
export function cutoffAuthority(overrides = {}) {
  return { authorize() {}, verifyPolicy: () => true, verifyObservation: () => true, verifyVoid: () => true,
    verifyRecovery: () => true, ...overrides };
}

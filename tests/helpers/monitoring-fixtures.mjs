import { emptyMonitoringState, createLocalMonitoringSink, createOperationsMonitor, monitoringStateSchema } from '../../src/server/monitoring/monitoring-alerts.ts';
import { budgetCategories, operationMetrics } from '../../src/server/monitoring/monitoring-contract.ts';

export const MONITOR_NOW = Date.UTC(2026, 9, 10, 8);
export const monitoringPolicy = (changes = {}) => ({ version: 1, evidenceRef: 'synthetic-monitoring-approval', owner: 'synthetic-incident-owner',
  destination: 'local-test', retentionEvidenceRef: 'synthetic-retention', retentionMs: 60_000, reminderMs: 30_000,
  evidenceMaxAgeMs: 60_000, lookbackDays: 1, accountId: 'a'.repeat(64), thresholds: {
    runGraceMs: 60_000, jobStallMs: 60_000, lockGraceMs: 60_000, staleMs: 60_000, resultDelayMs: 120_000,
    failureCount: 1, quotaRemainingWarn: 25_000, essentialReserveWarn: 5000, rateLimitCount: 1, expiryWarnMs: 86_400_000, costWarnPercent: 80,
  }, ...changes });
export const monitoringAuthority = (changes = {}) => ({ authorize: () => true, verifyPolicy: () => true, ...changes });
export function monitoringSnapshot(now = MONITOR_NOW, changes = {}) {
  return { at: now, metrics: { ...Object.fromEntries(operationMetrics.map((key) => [key, 0])), available: 1 },
    quota: { remaining: 100_000, reserved: 20_000, launched: 19_900, uncertain: 100, essentialUsed: 500,
      essentialRemaining: 20_000, essentialReserveUsed: 0, rollingSecondLaunches: 1, rollingMinuteLaunches: 20,
      rateLimited: 0, providerErrors: 0, resetPending: false, credentialFailure: false,
      subscriptionExpired: false, expiresAt: now + 2 * 86_400_000 },
    costs: budgetCategories.map((category) => ({ category, startsAt: now - 1000, endsAt: now + 30 * 86_400_000 - 1000,
      measuredAt: now, capUsd: category === 'football' ? '45' : '100', committedUsd: '1', invoicedUsd: '1', coverage: 'complete', evidenceRef: 'synthetic-bill' })),
    reasons: [], correlations: [], ...changes };
}
export function memoryMonitoring(clock, changes = {}) {
  let state = emptyMonitoringState(), tail = Promise.resolve();
  const store = { transaction(operation) {
    const result = tail.then(async () => { const copy = structuredClone(state), value = await operation(copy, clock());
      state = monitoringStateSchema.parse(copy); return value; });
    tail = result.catch(() => {}); return result;
  } };
  const policy = monitoringPolicy(changes.policy), sink = changes.sink ?? createLocalMonitoringSink(policy.destination, policy.retentionMs, 64, clock);
  return { store, sink, state: () => structuredClone(state),
    monitor: createOperationsMonitor({ policy, store, sink, authority: changes.authority ?? monitoringAuthority() }) };
}

import { evidenceFingerprint } from '../../src/server/evidence/evidence-input.ts';
import { createRecoveryWatchdog } from '../../src/server/recovery/recovery-service.ts';
import { createMarketSettlementService } from '../../src/server/settlement/settlement-service.ts';
import { createMysqlDailySelectionStore } from '../../src/server/selection/selection-mysql-store.ts';
import { createDailySelectionService } from '../../src/server/selection/selection-service.ts';
import { createFootballCatalogImporter } from '../../src/server/football/catalog-service.ts';
import { createSyntheticCatalogAdapter, catalogResponse } from './catalog-fixtures.mjs';
import { selectionPolicy, selectionAuthority, catalogSelectionAuthority } from './selection-fixtures.mjs';
import { createJobRegistry } from '../../src/server/jobs/job-registry.ts';
import { createJobWorker } from '../../src/server/jobs/job-worker.ts';

export function recoveryPolicy(overrides = {}) {
  return { version: 1, evidenceRef: 'synthetic-recovery-thresholds', lookbackDays: 1, maxItems: 20,
    runGraceMs: 1000, stalledJobMs: 1000, lockGraceMs: 0, resultGraceMs: 1000, planTtlMs: 3_600_000,
    resultAccountId: null, job: { priority: 250, maxAttempts: 4, timeoutMs: 60_000, leaseMs: 15_000,
      backoff: { baseMs: 100, maxMs: 100 } }, ...overrides };
}
export const recoveryAuthority = (changes = {}) => ({ authorize: () => true, verifyPolicy: () => true, verifyPlan: () => true, ...changes });
export function approvedPlan(p, policy, actions, changes = {}) {
  return { version: 1, policyHash: evidenceFingerprint(policy), plannedAt: p.now(), expiresAt: p.now() + policy.planTtlMs,
    actions, actor: 'synthetic-operator', reason: 'synthetic-incident', approvalRef: 'synthetic-reviewed-plan', ...changes };
}
export async function recoveryHarness(p, changes = {}) {
  await p.instance.executeAdmin("GRANT SELECT, INSERT ON goal_hint_test.RecoveryAudit TO 'cutoff_app'@'127.0.0.1';");
  const policy = changes.policy ?? recoveryPolicy();
  const provider = createSyntheticCatalogAdapter({ respond: (url) => catalogResponse(url, []) });
  provider.clock.value = p.now();
  const importer = createFootballCatalogImporter({ adapter: provider.adapter, store: p.catalog, authority: catalogSelectionAuthority,
    clock: { now: p.now } });
  const selectionStore = createMysqlDailySelectionStore(p.a, p.queue);
  const services = { selectionPolicy: selectionPolicy(), selection: (raw) => createDailySelectionService({ policy: raw,
    authority: selectionAuthority(), store: selectionStore, importer, cutoff: p.first }), cutoff: p.first,
    settlement: createMarketSettlementService({ database: p.a, queue: p.queue }), mapping: { store: p.catalog,
      authority: { ...catalogSelectionAuthority, verifyMapping: () => true } }, ...changes.services };
  const watchdog = createRecoveryWatchdog({ database: p.a, queue: p.queue, policy, authority: changes.authority ?? recoveryAuthority(), services });
  const registry = createJobRegistry([watchdog.definition]);
  const worker = createJobWorker({ queue: p.queue, registry, ownerId: evidenceFingerprint('synthetic-watchdog-worker') });
  return { watchdog, worker, policy, services, provider, selectionStore,
    plan: (actions, overrides) => approvedPlan(p, policy, actions, overrides),
    async repair(actions) { const job = await watchdog.enqueue(approvedPlan(p, policy, actions)); await worker.runOnce(); return job; } };
}

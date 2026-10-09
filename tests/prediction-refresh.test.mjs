import test from 'node:test';
import assert from 'node:assert/strict';
import { predictorHarness } from './helpers/predictor-service-fixtures.mjs';
import { fallbackServiceSetup } from './helpers/fallback-service-fixtures.mjs';
import { createEvidenceService } from '../src/server/evidence/evidence-service.ts';
import { evidenceAuthority, evidenceContext, evidenceHash, evidencePolicy, evidenceSource } from './helpers/evidence-fixtures.mjs';

test('refresh cancellation stops primary AI before provider dispatch', async () => {
  const h = await predictorHarness(), controller = new AbortController(); controller.abort();
  const result = await h.predictor.predict(h.input, { signal: controller.signal, deadlineAt: h.clock.now() + 1000, check() {} });
  assert.equal(result.status, 'denied'); assert.equal(h.calls.length, 0);
});
test('refresh cancellation stops evidence before storage or research', async () => {
  const context = evidenceContext(), controller = new AbortController(); controller.abort(); let reads = 0;
  const service = createEvidenceService({ authority: evidenceAuthority(), clock: { now: () => context.analysisAt },
    store: { async find() { reads++; return null; }, async save() { throw new Error('unexpected save'); } },
    football: { async collect() { throw new Error('unexpected football call'); } }, research: null });
  const result = await service.collect({ requestId: evidenceHash('canceled-refresh-evidence'), context, policy: evidencePolicy(),
    footballPlan: null, researchPlan: null, cachedSources: [evidenceSource(context)], maxElapsedMs: 1000 },
  { signal: controller.signal, deadlineAt: context.analysisAt + 1000, check() {} });
  assert.equal(result.status, 'denied'); assert.equal(reads, 0);
});
test('refresh cancellation stops fallback without dispatching provider work', async () => {
  const h = fallbackServiceSetup({ reason: 'timeout' }), controller = new AbortController(); controller.abort();
  const result = await h.service.resolve(h.request(), { signal: controller.signal, deadlineAt: h.clock.now() + 1000, check() {} });
  assert.equal(result.status, 'denied'); assert.equal(h.collected.length, 0);
});
test('interrupted fallback composes valid AI through the shared resolver', () => {
  const h = fallbackServiceSetup({ output: { groups: { 'total-goals': { period: 'regulation-including-stoppage-time',
    line: 2.5, probabilities: { 'over-2.5': 0.6, 'under-2.5': 0.4 } } } } });
  const result = h.service.resolveWithoutProvider(h.request());
  assert.equal(result.status, 'candidate'); assert.equal(h.collected.length, 0);
  assert.equal(result.candidate.markets['total-goals'].market.source, 'ai');
  assert.equal(result.candidate.markets['match-result'].available, false);
  h.permissions.request = false;
  assert.equal(h.service.resolveWithoutProvider(h.request()).reason, 'not-authorized');
});

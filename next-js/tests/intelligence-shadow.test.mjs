import test from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { createShadowIntelligenceService } from '../src/server/intelligence/shadow-service.ts';
import { decodeShadowArchive, encodeShadowArchive } from '../src/server/intelligence/shadow-store.ts';
import { memoryShadowStore, shadowObservation, shadowForecast, SHADOW_NOW as now, SHADOW_FIXTURE as fixtureId } from './helpers/intelligence-shadow-fixtures.mjs';

function harness(mode = 'shadow') {
  const store = memoryShadowStore(); let evaluations = 0;
  const service = createShadowIntelligenceService({ store, mode });
  const request = (index, changes = {}) => {
    const at = now + index * 60_000;
    return { checkId: evidenceFingerprint({ index }), fixtureId, checkedAt: at,
      observation: shadowObservation({ observedAt: at, receivedAt: at }), modelVersion: 'synthetic-v1', dependencyHash: evidenceFingerprint('original-history'),
      async evaluate() { evaluations++; return shadowForecast(fixtureId, at); }, ...changes };
  };
  return { store, service, request, get evaluations() { return evaluations; } };
}
test('canonical JSON text preserves exact model floats and rejects modified noncanonical archives', () => {
  const body = { probabilities: { win: 0.18200534316583006, tiny: 3.8027208696602615e-7 }, forecast: { mode: 'shadow', publish: false } };
  const archive = JSON.parse(encodeShadowArchive(body, body.forecast));
  assert.equal(archive.forecast.mode, 'shadow'); assert.equal(archive.forecast.publish, false);
  assert.deepEqual(decodeShadowArchive(archive), body);
  assert.equal(evidenceFingerprint(decodeShadowArchive(archive)), evidenceFingerprint(body));
  assert.throws(() => decodeShadowArchive({ ...archive, canonicalBody: `${archive.canonicalBody} ` }), { reason: 'corrupt-record' });
});
test('shadow mode defaults off and performs neither reads nor computation', async () => {
  const service = createShadowIntelligenceService({ store: {} });
  assert.deepEqual(await service.observe({}), { status: 'disabled' });
});
test('unchanged checks preserve one version; restart replay does not compute or count again', async () => {
  const h = harness(), request = h.request(0), first = await h.service.observe(request);
  for (let i = 1; i <= 5; i++) await h.service.observe(h.request(i));
  assert.equal(h.store.revisions.size, 1); assert.equal(h.evaluations, 1);
  assert.equal(h.store.states.get(fixtureId).checks, 6n);
  const restarted = createShadowIntelligenceService({ store: h.store, mode: 'shadow' });
  assert.deepEqual(await restarted.observe(request), first);
  assert.equal(h.store.states.get(fixtureId).checks, 6n); assert.equal(h.evaluations, 1);
  await assert.rejects(restarted.observe({ ...request, modelVersion: 'conflict' }), { reason: 'conflicting-check' });
});
test('meaningful and cumulative revisions retain prior bodies and original clocks', async () => {
  const h = harness(); await h.service.observe(h.request(0));
  const original = structuredClone([...h.store.revisions.values()][0]);
  await h.service.observe(h.request(1, { observation: shadowObservation({ observedAt: now + 60_000, receivedAt: now + 60_000, probabilities: { home: 0.63 } }) }));
  assert.equal(h.store.revisions.size, 1);
  await h.service.observe(h.request(2, { observation: shadowObservation({ observedAt: now + 120_000, receivedAt: now + 120_000, probabilities: { home: 0.66 } }) }));
  assert.equal(h.store.revisions.size, 2); assert.equal(h.evaluations, 2);
  assert.deepEqual(h.store.revisions.get(original.id), original);
  assert.equal(original.body.observation.receivedAt, now);
});
test('missing provider updates abstain without changing history and resume only after known evidence returns', async () => {
  const h = harness(); await h.service.observe(h.request(0));
  await h.service.observe(h.request(1, { observation: null }));
  assert.equal(h.store.states.get(fixtureId).availability, 'unavailable');
  assert.equal(h.store.revisions.size, 1); assert.equal(h.evaluations, 1);
  await h.service.observe(h.request(2));
  assert.equal(h.store.states.get(fixtureId).availability, 'available');
});
test('repeated critical fixture status suspends once and cannot produce public publication', async () => {
  const h = harness(); await h.service.observe(h.request(0));
  for (let i = 1; i <= 3; i++) await h.service.observe(h.request(i, {
    observation: shadowObservation({ status: 'postponed', observedAt: now + i * 60_000, receivedAt: now + i * 60_000 }),
  }));
  assert.equal(h.store.revisions.size, 2); assert.equal(h.evaluations, 2);
  assert.equal(h.store.states.get(fixtureId).availability, 'suspended');
  assert.equal(h.store.states.get(fixtureId).latest.body.forecast.decision, 'withhold');
  assert.equal(h.store.states.get(fixtureId).latest.body.forecast.publish, false);
});
test('cutoff prevents evaluation and versions; model updates before cutoff create independent revisions', async () => {
  const h = harness(); await h.service.observe(h.request(0));
  await h.service.observe(h.request(1, { modelVersion: 'synthetic-v2' }));
  assert.equal(h.store.revisions.size, 2);
  const lockedAt = now + 86_400_000 - 5 * 60_000;
  await h.service.observe(h.request(2, { checkedAt: lockedAt, observation: shadowObservation({ receivedAt: lockedAt, observedAt: lockedAt }), modelVersion: 'synthetic-v3' }));
  assert.equal(h.store.revisions.size, 2); assert.equal(h.evaluations, 2);
  assert.equal(h.store.states.get(fixtureId).availability, 'cutoff-locked');
});
test('invalid publication flags fail without a persisted check or revision', async () => {
  const h = harness();
  await assert.rejects(h.service.observe(h.request(0, { async evaluate() { return { ...shadowForecast(), publish: true }; } })), { reason: 'invalid-input' });
  assert.equal(h.store.checks.size, 0); assert.equal(h.store.revisions.size, 0);
});

test('fresh recovery revalidates and restores shadow eligibility without a duplicate version', async () => {
  const h = harness(); let evaluated = 0;
  const eligible = async () => { evaluated++; return shadowForecast(fixtureId, now, { decision: 'eligible-shadow' }); };
  await h.service.observe(h.request(0, { evaluate: eligible }));
  const originalId = h.store.states.get(fixtureId).latestEligibleRevisionId;
  assert.ok(originalId);
  await h.service.observe(h.request(1, { observation: null }));
  assert.equal(h.store.states.get(fixtureId).latestEligibleRevisionId, null);
  await h.service.observe(h.request(2, { evaluate: eligible }));
  assert.equal(evaluated, 2); assert.equal(h.store.revisions.size, 1);
  assert.equal(h.store.states.get(fixtureId).latestEligibleRevisionId, originalId);
});
test('postponed fixture recovery and changed source dependencies recompute before eligibility', async () => {
  const h = harness();
  await h.service.observe(h.request(0, { observation: shadowObservation({ status: 'postponed' }) }));
  await h.service.observe(h.request(1));
  assert.equal(h.evaluations, 2); assert.equal(h.store.revisions.size, 2);
  await h.service.observe(h.request(2, { dependencyHash: evidenceFingerprint('new-result-receipt') }));
  assert.equal(h.evaluations, 3); assert.equal(h.store.revisions.size, 3);
  const latest = h.store.states.get(fixtureId).latest.body.forecast;
  const { hash, ...body } = latest; assert.equal(evidenceFingerprint(body), hash);
});
test('critical veto clears final probabilities/value and retains valid hash and component evidence', async () => {
  const h = harness(), candidate = shadowForecast(fixtureId, now, { decision: 'eligible-shadow', probabilities: { synthetic: 0.9 },
    oddsValue: { probability: 0.9, impliedProbability: 0.5, expectedUnitReturn: 0.8 } });
  await h.service.observe(h.request(0, { observation: shadowObservation({ seriousSecurityIssue: true }), async evaluate() { return candidate; } }));
  const final = h.store.states.get(fixtureId).latest.body.forecast, { hash, ...body } = final;
  assert.equal(final.decision, 'withhold'); assert.equal(final.probabilities, null); assert.equal(final.oddsValue, null);
  assert.deepEqual(final.components, candidate.components); assert.equal(hash, evidenceFingerprint(body));
});

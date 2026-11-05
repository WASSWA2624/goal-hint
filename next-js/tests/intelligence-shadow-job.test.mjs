import test from 'node:test';
import assert from 'node:assert/strict';
import { createShadowIntelligenceJob, SHADOW_INTELLIGENCE_JOB } from '../src/server/intelligence/shadow-job.ts';
import { createJobRegistry } from '../src/server/jobs/job-registry.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { durableJobId } from '../src/server/jobs/job-input.ts';
import { localGoalModelVersion, estimateLocalGoals } from '../src/server/intelligence/local-goals-model.ts';
import { jobEnvelope, jobTestHash } from './helpers/job-fixtures.mjs';
import { memoryShadowStore, shadowObservation, SHADOW_FIXTURE as fixtureId } from './helpers/intelligence-shadow-fixtures.mjs';
import { intelligenceFixture, intelligenceHistory, INTELLIGENCE_NOW } from './helpers/intelligence-fixtures.mjs';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';

test('existing worker dispatches an explicitly registered shadow job and replays without reloading input', async () => {
  const now = Date.now(), kickoffAt = now + 86_400_000, store = memoryShadowStore(); let loads = 0;
  const payload = { fixtureId, asOfAt: now, kickoffAt, inputRef: 'synthetic-immutable-archive', modelVersion: localGoalModelVersion() };
  const definition = createShadowIntelligenceJob({ mode: 'shadow', store, clock: { now: () => now }, authorize: () => true, verifyInput: () => true,
    async load() {
      loads++;
      return { local: { fixture: { fixtureId, competitionId: 'synthetic-league', homeTeamId: 'home', awayTeamId: 'away', kickoffAt, forecastAt: now }, history: [] },
        observation: shadowObservation({ fixtureId, kickoffAt, observedAt: now, receivedAt: now }) };
    },
  });
  const registry = createJobRegistry([definition]), envelope = registry.validate(jobEnvelope({ type: SHADOW_INTELLIGENCE_JOB, payload,
    notBefore: now - 1000, expiresAt: now + 60_000, leaseMs: 5000 }));
  const id = durableJobId(envelope), ownerId = jobTestHash('shadow-worker'); let claimable = true, acknowledgements = 0, failure = null;
  const job = { id, envelope, state: 'running', version: 1, attemptCount: 1, fence: 1, availableAt: now, createdAt: now, updatedAt: now,
    ownerId, leaseExpiresAt: now + 5000, attemptDeadlineAt: now + 10_000, finishedAt: null, terminalReason: null };
  const lease = { job, jobId: id, attemptId: jobTestHash('attempt'), ownerId, fence: 1, leaseExpiresAt: now + 5000, deadlineAt: now + 10_000, serverNow: now };
  const queue = { async claim() { if (!claimable) return null; claimable = false; return lease; }, async renew() { return lease; },
    async acknowledge() { acknowledgements++; return { ...job, state: 'succeeded' }; }, async retry(_lease, reason) { failure = reason; }, async recordUsage() {}, async inspect() { return job; } };
  const worker = createJobWorker({ queue, registry, ownerId });
  assert.equal(await worker.runOnce(), true); assert.equal(failure, null); assert.equal(acknowledgements, 1);
  assert.equal(store.revisions.size, 1); assert.equal(store.states.get(fixtureId).latest.body.forecast.publish, false);
  assert.equal(store.states.get(fixtureId).latest.body.forecast.decision, 'withhold'); // Sparse synthetic evidence abstains.
  claimable = true; await worker.runOnce();
  assert.equal(acknowledgements, 2); assert.equal(loads, 1); assert.equal(store.checks.size, 1);
});

test('crossing actual kickoff lock while loading prevents retrospective shadow persistence', async () => {
  const asOfAt = Date.now(), kickoffAt = asOfAt + 600_000; let at = asOfAt;
  const store = memoryShadowStore(), payload = { fixtureId, asOfAt, kickoffAt, inputRef: 'immutable-test', modelVersion: localGoalModelVersion() };
  const definition = createShadowIntelligenceJob({ mode: 'shadow', store, clock: { now: () => at }, authorize: () => true, verifyInput: () => true,
    async load() { at = kickoffAt - 300_000; return { local: { fixture: { fixtureId, competitionId: 'league', homeTeamId: 'home', awayTeamId: 'away', kickoffAt, forecastAt: asOfAt }, history: [] },
      observation: shadowObservation({ kickoffAt, observedAt: asOfAt, receivedAt: asOfAt }) }; },
  });
  assert.equal(await definition.eligible(payload, new AbortController().signal), true);
  await assert.rejects(definition.handle(payload, { checkpoint: async () => {}, lease: { jobId: jobTestHash('late') } }), /no longer eligible/u);
  assert.equal(store.revisions.size, 0); assert.equal(store.checks.size, 0);
});
test('shadow job is disabled without explicit flag and refuses unverified inputs', async () => {
  const now = Date.now(), payload = { fixtureId, asOfAt: now, kickoffAt: now + 86_400_000, modelVersion: 'test', inputRef: 'test' };
  const options = { store: memoryShadowStore(), clock: { now: () => now }, authorize: () => true, verifyInput: () => false,
    async load() { return { local: { fixture: { fixtureId, forecastAt: now, kickoffAt: payload.kickoffAt }, history: [] }, observation: null }; } };
  assert.equal(await createShadowIntelligenceJob(options).eligible(payload, new AbortController().signal), false);
  const definition = createShadowIntelligenceJob({ ...options, mode: 'shadow' });
  const result = await definition.handle(payload, { checkpoint: async () => {}, lease: { jobId: jobTestHash('invalid-input') } });
  assert.deepEqual(result, { status: 'failed', reason: 'invalid-output', retryable: false });
});

function freshnessHarness({ withProvider = false, withContext = false, withQuote = false } = {}) {
  const start = Date.now(), kickoffAt = start + 86_400_000, store = memoryShadowStore();
  const deadlines = [], record = store.record;
  store.record = async input => { deadlines.push(input.executionDeadlineAt); return record(input); };
  let at = start, observedAt = start, authorized = true, jobNumber = 0;
  const history = intelligenceHistory().map(row => ({ ...row,
    kickoffAt: row.kickoffAt + start - INTELLIGENCE_NOW, availableAt: row.availableAt + start - INTELLIGENCE_NOW }));
  const fixture = () => intelligenceFixture({ fixtureId, kickoffAt, forecastAt: at });
  const probabilities = estimateLocalGoals({ fixture: fixture(), history }).probabilities;
  assert.ok(probabilities);
  const definition = createShadowIntelligenceJob({ mode: 'shadow', store, clock: { now: () => at }, authorize: () => true, verifyInput: () => true,
    async load() {
      return { local: { fixture: fixture(), history }, observation: shadowObservation({ fixtureId, kickoffAt, observedAt: at, receivedAt: at }),
        validation: { maxAgeMs: 1000,
          ...(withProvider ? { provider: { source: 'api-football', modelVersion: 'synthetic-provider-v1', fixtureId,
            observedAt, evidenceRef: 'synthetic-provider-proof', probabilities: { 'match-result': probabilities['match-result'] } }, verifyProvider: () => authorized } : {}),
          ...(withContext ? { context: { source: 'ai-context', modelVersion: 'synthetic-context-v1', fixtureId,
            evidenceHash: 'a'.repeat(64), assessedAt: observedAt, facts: [] }, verifyContext: () => authorized } : {}),
          ...(withQuote ? { quote: { family: 'match-result', selection: 'home-win', decimalOdds: 2,
            observedAt } } : {}),
        } };
    },
  });
  return { store, start, deadlines, refresh: () => { observedAt = at; }, authorize: value => { authorized = value; },
    async check(offset, expected = { status: 'succeeded' }) {
      at = start + offset;
      const payload = { fixtureId, asOfAt: at, kickoffAt, inputRef: 'synthetic-stable-archive', modelVersion: localGoalModelVersion() };
      assert.deepEqual(await definition.handle(payload, { checkpoint: async () => {}, lease: { jobId: jobTestHash(`freshness-${++jobNumber}`) } }), expected);
      return store.states.get(fixtureId);
    } };
}

test('unchanged checks revoke expired provider/context eligibility and recover fresh identical receipts', async () => {
  for (const component of ['withProvider', 'withContext']) {
    const harness = freshnessHarness({ [component]: true });
    assert.ok((await harness.check(0)).latestEligibleRevisionId);
    const original = structuredClone([...harness.store.revisions.values()][0]);
    assert.ok((await harness.check(100)).latestEligibleRevisionId); assert.equal(harness.store.revisions.size, 1);
    assert.equal((await harness.check(1001)).latestEligibleRevisionId, null); assert.equal(harness.store.revisions.size, 2);
    harness.refresh();
    assert.ok((await harness.check(1100)).latestEligibleRevisionId); assert.equal(harness.store.revisions.size, 3);
    await harness.check(1200); assert.equal(harness.store.revisions.size, 3);
    harness.authorize(false);
    assert.equal((await harness.check(1300)).latestEligibleRevisionId, null); assert.equal(harness.store.revisions.size, 4);
    harness.authorize(true);
    assert.ok((await harness.check(1400)).latestEligibleRevisionId); assert.equal(harness.store.revisions.size, 5);
    assert.deepEqual(harness.store.revisions.get(original.id), original);
  }
});

test('local-only eligibility renews an expired stored model once and keeps ordinary checks quiet', async () => {
  const harness = freshnessHarness(), first = await harness.check(0);
  const originalId = first.latest.id, originalAt = first.latest.body.forecast.components.local.forecastAt;
  await harness.check(100); assert.equal(harness.store.revisions.size, 1);
  const renewed = await harness.check(1001);
  assert.ok(renewed.latestEligibleRevisionId); assert.notEqual(renewed.latest.id, originalId);
  assert.ok(renewed.latest.body.forecast.components.local.forecastAt > originalAt); assert.equal(harness.store.revisions.size, 2);
  await harness.check(1100); assert.equal(harness.store.revisions.size, 2);
});

test('quote expiry clears odds value while preserving otherwise valid forecast eligibility', async () => {
  const harness = freshnessHarness({ withQuote: true });
  assert.ok((await harness.check(0)).latest.body.forecast.oddsValue);
  const expired = await harness.check(1001);
  assert.ok(expired.latestEligibleRevisionId); assert.equal(expired.latest.body.forecast.oddsValue, null);
  assert.ok(expired.latest.body.forecast.reasons.includes('quote-unavailable-or-stale'));
  await harness.check(1100); assert.equal(harness.store.revisions.size, 2);
});

test('fresh receipt clocks do not create versions until the original retained evidence window expires', async () => {
  const harness = freshnessHarness({ withProvider: true });
  await harness.check(0); await harness.check(100); harness.refresh(); await harness.check(200); harness.refresh();
  await harness.check(900); assert.equal(harness.store.revisions.size, 1);
  assert.equal(harness.deadlines.at(-1), harness.start + 1001);
  const renewed = await harness.check(1001);
  assert.equal(harness.store.revisions.size, 2); assert.ok(renewed.latestEligibleRevisionId);
  assert.equal(renewed.latest.body.forecast.components.provider.observedAt, harness.start + 200);
  assert.equal(harness.deadlines.at(-1), harness.start + 1201);
  await harness.check(1100); harness.refresh(); await harness.check(1300);
  assert.equal(harness.store.revisions.size, 3);
  await harness.check(1400); assert.equal(harness.store.revisions.size, 3);
});

test('renewal metadata is hashed, accepts legacy absence and rejects impossible restored deadlines', async () => {
  const harness = freshnessHarness(), state = await harness.check(0);
  const { hash, ...body } = state.latest.body.forecast;
  assert.equal(hash, evidenceFingerprint(body));
  const legacy = { ...body }; delete legacy.eligibility;
  harness.store.states.set(fixtureId, { ...state, latest: { ...state.latest,
    body: { ...state.latest.body, forecast: { ...legacy, hash: evidenceFingerprint(legacy) } } } });
  await harness.check(100); assert.equal(harness.store.revisions.size, 1);
  const current = harness.store.states.get(fixtureId), invalid = { ...current.latest.body.forecast,
    eligibility: { localValidUntil: Number.MAX_SAFE_INTEGER, maximumAgeMs: 1000 } };
  harness.store.states.set(fixtureId, { ...current, latest: { ...current.latest, body: { ...current.latest.body, forecast: invalid } } });
  await harness.check(200, { status: 'failed', reason: 'invalid-output', retryable: false });
  assert.equal(harness.store.checks.size, 2);
});

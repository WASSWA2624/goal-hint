import test from 'node:test';
import assert from 'node:assert/strict';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { refreshHarness } from './helpers/refresh-fixtures.mjs';
import { createPredictionRefreshService } from '../src/server/refresh/refresh-service.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { createJobRegistry } from '../src/server/jobs/job-registry.ts';
import { evidenceHash } from './helpers/evidence-fixtures.mjs';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';

test('one manifest-owned prediction refresh through real MySQL services', { timeout: 300000 }, async (t) => {
  await withPredictionPipeline(t, async (db) => {
    const scenarios = [{}, { ai: 'invalid' }, { ai: 'outage' }, { ai: 'timeout' }, { missing: true }, { ai: 'budget' },
      { ai: 'partial' }, { ai: 'invalid', fallback: 'none' }, { ai: 'partial', fallback: 'timeout' }, { research: true },
      { ai: 'invalid', fallback: 'outage' }, { observation: 'outage' }, { observation: 'live' }, {}, {}, {}];
    const h = await refreshHarness(db, scenarios);
    async function execute(index) {
      h.source.clock.value = db.now(); assert.equal(await h.worker.runOnce(), true);
      const outcome = await h.outcome(index);
      if (!outcome) t.diagnostic(JSON.stringify({ index, job: await h.job(index), events: h.events.slice(-4) }));
      assert.ok(outcome); return outcome;
    }
    await t.test('valid AI publishes all groups without provider leakage or fallback calls', async () => {
      const outcome = await execute(0); assert.equal(outcome.outcome, 'published'); assert.equal(h.calls.fallback.length, 0);
      assert.equal(h.calls.ai.length, 1); assert.equal(outcome.costs.ai.requests, 1n);
      assert.equal(outcome.costs.research.reason, 'unknown-job');
      const prompt = JSON.stringify(h.calls.ai[0].prompt);
      assert.equal(prompt.includes('API-Football fallback'), false); assert.equal(prompt.includes('away-win":0.5'), false);
      const revision = (await db.publisher.displayForFixture(outcome.fixtureId)).revision;
      assert.equal(revision.candidate.context.pin.id, (await h.store.intent(outcome.jobId)).pin.id);
    });
    for (const [index, reason] of [[1,'invalid-output'],[2,'uncertain-usage'],[3,'timeout'],[4,'insufficient-evidence'],[5,'job-budget-exhausted']]) {
      await t.test(`AI ${reason} uses bounded provider fallback`, async () => {
        const before = h.calls.fallback.length, outcome = await execute(index);
        assert.equal(outcome.outcome, 'published'); assert.equal(h.calls.fallback.length, before + 1);
        assert.equal(outcome.phases.ai, reason);
        const revision = (await db.publisher.displayForFixture(outcome.fixtureId)).revision;
        assert.equal(revision.candidate.markets['match-result'].market.source, 'api-football');
      });
    }
    await t.test('partial fallback preserves valid AI and match-result/double-chance ownership', async () => {
      const outcome = await execute(6), revision = (await db.publisher.displayForFixture(outcome.fixtureId)).revision;
      const markets = revision.candidate.markets;
      assert.equal(markets['match-result'].market.source, 'api-football'); assert.equal(markets['double-chance'].market.source, 'api-football');
      assert.equal(markets['total-goals'].market.source, 'ai');
    });
    await t.test('no usable source records unavailable', async () => {
      assert.equal((await execute(7)).outcome, 'unavailable');
    });
    await t.test('fallback timeout preserves valid AI groups', async () => {
      const outcome = await execute(8); assert.equal(outcome.outcome, 'published');
      const revision = (await db.publisher.displayForFixture(outcome.fixtureId)).revision;
      assert.equal(revision.candidate.markets['total-goals'].market.source, 'ai');
      assert.equal(revision.candidate.markets['match-result'].available, false);
    });
    await t.test('limited news does not force fallback; research and AI costs remain separate', async () => {
      const before = h.calls.fallback.length, outcome = await execute(9);
      assert.equal(outcome.outcome, 'published'); assert.equal(h.calls.fallback.length, before);
      assert.equal(h.calls.research.length, 1); assert.equal(outcome.costs.ai.requests, 1n); assert.equal(outcome.costs.research.requests, 1n);
      const revision = (await db.publisher.displayForFixture(outcome.fixtureId)).revision;
      assert.equal(revision.candidate.markets['match-result'].provenance.evidence.coverage.limitedNews, true);
    });
    await t.test('provider outage produces an auditable unavailable outcome', async () => { assert.equal((await execute(10)).outcome, 'unavailable'); });
    await t.test('missing fresh status fails without publishing', async () => { assert.equal((await execute(11)).reason, 'observation-unavailable'); });
    await t.test('fresh early play closes lifecycle before publication', async () => {
      const outcome = await execute(12); assert.equal(outcome.outcome, 'skipped');
      const display = await db.publisher.displayForFixture(outcome.fixtureId); assert.equal(display.cycle.state, 'closed'); assert.equal(display.revision, null);
    });
    await t.test('worker death after AI dispatch recovers pinned identity and never redispatches AI', async () => {
      const lease = await db.queue.claim(evidenceHash('dead-refresh-worker'), h.jobs.types);
      const member = await h.store.loadMember(lease), plan = h.configure(member);
      const { refreshPin } = await import('../src/server/refresh/refresh-input.ts');
      await h.store.saveIntent(lease, { member, plan, pin: refreshPin(member, plan) });
      // Persist real evidence before dying at the next outbound boundary.
      await h.store.start(lease, 'evidence');
      const evidence = await h.serviceOptions.evidence.collect(plan.evidence);
      assert.equal(evidence.status, 'collected'); await h.store.complete(lease, 'evidence', evidence);
      await h.store.start(lease, 'ai');
      await assert.rejects(h.store.complete(lease, 'ai', { status: 'denied' }, [{ provider: 'ai', requestReference: evidenceHash('invalid-usage'),
        costReference: null, phase: 'completed', requests: -1, durationMs: null }]));
      assert.equal(await h.store.stage(lease.jobId, 'ai', 'completed'), null, 'usage failure rolls the completed stage back');
      await db.queue.retry(lease, 'lease-expired', true); db.setTime(db.now() + 101);
      const before = h.calls.ai.length, outcome = await execute(13);
      assert.equal(outcome.outcome, 'published'); assert.equal(h.calls.ai.length, before); assert.equal(outcome.phases.ai, 'uncertain-usage');
      assert.equal(evidenceFingerprint((await h.store.intent(lease.jobId)).plan), evidenceFingerprint(plan));
    });
    await t.test('published replay returns the original revision after an ambiguous response', async () => {
      let first = true;
      const service = createPredictionRefreshService({ ...h.serviceOptions, publisher: { async publish(input, lease) {
        const result = await db.publisher.publish(input, lease);
        if (first) { first = false; throw new Error('synthetic lost commit response'); } return result;
      } } });
      const worker = createJobWorker({ queue: db.queue, registry: createJobRegistry([service.definition]), ownerId: evidenceHash('ambiguous-worker') });
      const before = h.calls.ai.length; await worker.runOnce(); db.setTime(db.now() + 101);
      const accepted = await h.store.publication(await h.jobIdAt(14)); assert.ok(accepted);
      await worker.runOnce(); const outcome = await h.outcome(14);
      assert.equal(outcome.revisionId, accepted.revision.id); assert.equal(h.calls.ai.length, before + 1);
      assert.equal((await db.queue.usage(outcome.jobId)).filter((usage) => usage.provider === 'ai').reduce((sum, usage) => sum + usage.requests, 0), 1);
    });
    await t.test('two workers claim once and aggregate progress counts terminal outcomes honestly', async () => {
      const other = createJobWorker({ queue: db.otherQueue, registry: h.jobs, ownerId: evidenceHash('second-worker') });
      await Promise.all([h.worker.runOnce(), other.runOnce()]);
      assert.equal((await h.outcome(15)).outcome, 'published');
      const progress = await h.service.reconcileRun(h.selected.selected.runId);
      assert.equal(progress.total, scenarios.length); assert.equal(progress.terminal, scenarios.length); assert.equal(progress.finished, true);
      assert.equal(progress.completed, scenarios.length - 1); // Status outage is a failed terminal job.
      assert.equal(await h.worker.runOnce(), false);
    });
    await t.test('orchestration records are append-only for the worker role', async () => {
      const jobId = await h.jobIdAt(0);
      for (const table of ['PredictionRefreshIntent','PredictionRefreshStage','PredictionRefreshOutcome']) {
        await assert.rejects(db.a.query((tx) => tx.$executeRawUnsafe(`UPDATE ${table} SET integrity = ? WHERE jobId = ?`, evidenceHash('tamper'), jobId)));
      }
    });
    await t.test('unapproved allocations cannot consume fallback/status capacity or cross cost identities', async () => {
      const { parseRefreshPlan } = await import('../src/server/refresh/refresh-input.ts');
      const intent = await h.store.intent(await h.jobIdAt(0));
      for (const alter of [
        (plan) => { plan.footballRequestLimit = 1; },
        (plan) => { plan.fallback.maxElapsedMs = 20000; },
        (plan) => { plan.ai.job.costCapUsdPicos = -1n; },
        (plan) => { plan.ai.request.attemptId = evidenceHash('another-paid-attempt'); },
        (plan) => { plan.ai.request.maximum.inputTokens = plan.ai.job.inputTokenLimit + 1; },
        // Pacing retries are allowed only while a single dispatch remains the whole allowance.
        (plan) => { plan.observation.bounds.retry.maxAttempts = 2; plan.observation.bounds.maxRequests = 2; },
        (plan) => { plan.fallback.bounds.retry.maxAttempts = 2; plan.fallback.bounds.maxRequests = 2; },
      ]) {
        const changed = structuredClone(intent.plan); alter(changed);
        assert.throws(() => parseRefreshPlan(changed, intent.member), (error) => error.reason === 'policy-required');
      }
    });
  });
});

test('provider-fallback-only plans publish without a model pin or AI dispatch', { timeout: 300000 }, async (t) => {
  await withPredictionPipeline(t, async (db) => {
    const scenarios = [{ aiPlan: 'none' }, { aiPlan: 'none', fallback: 'none' }, { aiPlan: 'none' }];
    const h = await refreshHarness(db, scenarios);
    async function execute(index) {
      h.source.clock.value = db.now(); assert.equal(await h.worker.runOnce(), true);
      const outcome = await h.outcome(index);
      if (!outcome) t.diagnostic(JSON.stringify({ index, job: await h.job(index), events: h.events.slice(-4) }));
      assert.ok(outcome); return outcome;
    }
    await t.test('fallback publishes match result and double chance with no pin', async () => {
      const outcome = await execute(0);
      assert.equal(outcome.outcome, 'published'); assert.equal(outcome.phases.ai, 'unconfigured');
      assert.equal(h.calls.ai.length, 0); assert.equal(h.calls.fallback.length, 1);
      const intent = await h.store.intent(outcome.jobId); assert.equal(intent.pin, null); assert.equal(intent.plan.ai, null);
      const revision = (await db.publisher.displayForFixture(outcome.fixtureId)).revision;
      assert.equal(revision.candidate.context.pin, null);
      assert.equal(revision.candidate.markets['match-result'].market.source, 'api-football');
      assert.equal(revision.candidate.markets['double-chance'].market.source, 'api-football');
      assert.equal(revision.candidate.markets['total-goals'].available, false);
      assert.equal((await db.queue.usage(outcome.jobId)).filter((usage) => usage.provider === 'ai').length, 0);
    });
    await t.test('no provider forecast records unavailable without AI', async () => {
      assert.equal((await execute(1)).outcome, 'unavailable'); assert.equal(h.calls.ai.length, 0);
    });
    await t.test('a model without an AI allocation, or the reverse, is refused', async () => {
      const { parseRefreshPlan } = await import('../src/server/refresh/refresh-input.ts');
      const intent = await h.store.intent(await h.jobIdAt(0));
      const withModel = structuredClone(intent.plan); withModel.modelVersionId = h.model.id;
      assert.throws(() => parseRefreshPlan(withModel, intent.member), (error) => error.reason === 'policy-required');
      delete scenarios[0].aiPlan; const full = h.configure(intent.member); scenarios[0].aiPlan = 'none';
      assert.ok(full.ai);
      const withAi = { ...structuredClone(intent.plan), ai: full.ai };
      assert.throws(() => parseRefreshPlan(withAi, intent.member), (error) => error.reason === 'policy-required');
    });
  });
});

test('retention, overlapping runs, freshness and paid-dispatch death recovery', { timeout: 300000 }, async (t) => {
  await withPredictionPipeline(t, async (db) => {
    const scenarios = [{}, {}, {}, {}, {}], h = await refreshHarness(db, scenarios);
    await h.worker.runOnce(); const original = await h.outcome(0), prior = (await db.publisher.displayForFixture(original.fixtureId)).revision;
    const old = await db.queue.claim(evidenceHash('old-daily-run-worker'), h.jobs.types);
    for (let index = 2; index < scenarios.length; index++) {
      const unused = await db.queue.claim(evidenceHash(`old-terminal-${index}`), h.jobs.types);
      await db.queue.retry(unused, 'non-retryable', false);
    }
    const dayTwo = db.now() + 86_400_000;
    const envelope = h.selected.manifest.entries[0].envelope;
    const { type, handlerVersion, payload, maxAttempts, timeoutMs, leaseMs, fallbackReserveMs, backoff } = envelope;
    const newer = await db.cohort('2026-10-10', db.first, { claim: false, rows: h.rows,
      refresh: { type, handlerVersion, payload: payload.input, maxAttempts, timeoutMs, leaseMs, fallbackReserveMs, backoff },
      selectionAt: dayTwo, afterSelectionAt: dayTwo });
    // Selection accepts a refresh template, rather than envelope-owned identity fields.
    assert.ok(newer.manifest.entries.length);
    scenarios[0].ai = 'invalid'; scenarios[0].fallback = 'none';
    h.source.clock.value = db.now(); await h.worker.runOnce();
    const { durableJobId } = await import('../src/server/jobs/job-input.ts');
    const retained = await h.service.outcome(durableJobId(newer.manifest.entries[0].envelope));
    await t.test('zero valid families retain the previous complete set with its original age', async () => {
      assert.equal(retained.outcome, 'retained-previous'); assert.equal(retained.revisionId, prior.id);
      const display = await db.publisher.displayForFixture(original.fixtureId);
      assert.equal(display.updateDelayed, true); assert.equal(display.revision.generationCompletedAt, prior.generationCompletedAt);
      assert.equal(display.revision.evidenceCutoffAt, prior.evidenceCutoffAt); assert.equal(display.revision.publishedAt, prior.publishedAt);
    });
    await t.test('newer run publishes while an older manifest member remains leased', async () => {
      h.source.clock.value = db.now(); await h.worker.runOnce();
      const accepted = await h.service.outcome(durableJobId(newer.manifest.entries[1].envelope));
      assert.equal(accepted.outcome, 'published');
      assert.equal(old.job.envelope.refresh.fixtureId, accepted.fixtureId);
      // Simulate expired old attempt using its owning queue; it cannot regain
      // prediction authority after a newer revision, even with approved settings.
      const member = await h.store.loadMember(old).catch((error) => error);
      assert.equal(member.reason, 'ineligible'); assert.equal(member.detail, 'older-run');
      await db.queue.retry(old, 'lease-expired', true).catch(() => {});
    });
    await t.test('worker death after a real paid dispatch keeps liability and cannot dispatch AI twice', async () => {
      // Old pending jobs expire on the next claim; current priority chooses the new member.
      let entered; const started = new Promise((resolve) => { entered = resolve; }); let release;
      scenarios[2].generate = async () => { entered(); return new Promise((resolve) => { release = resolve; }); };
      const controller = new AbortController(), before = h.calls.ai.length;
      h.source.clock.value = db.now(); const running = h.worker.runOnce(controller.signal);
      await Promise.race([started, new Promise((_resolve, reject) => setTimeout(() => reject(new Error('paid dispatch did not start')), 10000))]);
      controller.abort(); await running;
      const jobId = durableJobId(newer.manifest.entries[2].envelope);
      const liability = await h.costs.ai.jobSummary(jobId); assert.equal(liability.requests, 1n); assert.ok(liability.liabilityUsdPicos > 0n);
      delete scenarios[2].generate; db.setTime(db.now() + 101); h.source.clock.value = db.now();
      for (let attempt = 0; attempt < 3 && !await h.service.outcome(jobId); attempt++) await h.worker.runOnce();
      const recovered = await h.service.outcome(jobId);
      assert.equal(recovered.outcome, 'published'); assert.equal(recovered.phases.ai, 'uncertain-usage');
      assert.equal(h.calls.ai.length, before + 1); release({});
      assert.equal((await h.costs.ai.jobSummary(jobId)).requests, 1n);
    });
    await t.test('original stale status cannot publish or be refreshed by reading its receipt', async () => {
      const stale = createPredictionRefreshService({ ...h.serviceOptions, observation: { async collect(member) {
        const { lifecycleInput } = await import('./helpers/lifecycle-fixtures.mjs');
        return { input: lifecycleInput({ fixture: { id: member.context.fixtureId, externalId: member.context.externalFixtureId }, cycle: member.cycle },
          db.now() - 20000), requestsDispatched: 0, requestCountUnknown: false };
      } } });
      const worker = createJobWorker({ queue: db.queue, registry: createJobRegistry([stale.definition]), ownerId: evidenceHash('stale-status-worker') });
      await worker.runOnce(); const outcome = await stale.outcome(durableJobId(newer.manifest.entries[3].envelope));
      assert.equal(outcome.outcome, 'skipped'); assert.equal(outcome.reason, 'stale-observation');
    });
    await t.test('fresh earlier kickoff correction closes the cycle at its corrected cutoff', async () => {
      const corrected = createPredictionRefreshService({ ...h.serviceOptions, observation: { async collect(member) {
        const { lifecycleInput } = await import('./helpers/lifecycle-fixtures.mjs');
        return { input: lifecycleInput({ fixture: { id: member.context.fixtureId, externalId: member.context.externalFixtureId }, cycle: member.cycle },
          db.now(), { kickoffAt: db.now() + 300000 }), requestsDispatched: 1, requestCountUnknown: false };
      } } });
      const worker = createJobWorker({ queue: db.queue, registry: createJobRegistry([corrected.definition]), ownerId: evidenceHash('corrected-cutoff-worker') });
      await worker.runOnce(); const outcome = await corrected.outcome(durableJobId(newer.manifest.entries[4].envelope));
      assert.equal(outcome.outcome, 'skipped'); assert.equal((await db.publisher.displayForFixture(outcome.fixtureId)).cycle.state, 'closed');
    });
    await t.test('cutoff expiry is terminal and progress repair includes never-claimed jobs', async () => {
      db.setTime(Date.parse('2026-10-13T12:00:00Z'));
      await h.worker.runOnce();
      const oldProgress = await h.service.reconcileRun(h.selected.selected.runId);
      const newProgress = await h.service.reconcileRun(newer.selected.runId);
      assert.equal(oldProgress.finished, true); assert.equal(newProgress.finished, true);
    });
  });
});

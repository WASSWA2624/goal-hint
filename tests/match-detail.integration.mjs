import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { createMatchDetailHandler } from '../src/server/matches/detail-http.ts';
import { createMysqlEvidenceStore } from '../src/server/evidence/evidence-mysql-store.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { storedCycle } from '../src/server/predictions/history-read.ts';
import { createScheduleLifecycleService } from '../src/server/predictions/lifecycle-service.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { createMysqlResultSyncStore } from '../src/server/results/result-sync-mysql-store.ts';
import { createMarketSettlementService } from '../src/server/settlement/settlement-service.ts';
import { resolveFallbackCandidate } from '../src/server/fallback/fallback-resolution.ts';
import { fallbackFixture, fallbackProvider } from './helpers/fallback-fixtures.mjs';
import { historyCandidate, cycleCreation, cycleChange, revisionInput } from './helpers/prediction-history-fixtures.mjs';
import { evidenceContext, evidenceSource, evidenceAuthority, evidencePolicy, evidenceHash } from './helpers/evidence-fixtures.mjs';
import { modelVersion } from './helpers/predictor-fixtures.mjs';
import { lifecycleAuthority, lifecyclePolicy, lifecycleInput } from './helpers/lifecycle-fixtures.mjs';
import { resultHash } from './helpers/result-sync-fixtures.mjs';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { savePageScenarios } from './helpers/page-capture.mjs';

test('stored anonymous match detail and history on genuine isolated MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    let readAt = PUBLICATION_NOW;
    const service = createMatchDetailService({ database: p.a, clock: { now: () => readAt } });
    const states = new Map();
    const captured = {}, capture = (name, data) => { captured[name] = { data, error: null }; };
    async function publish(id, options = {}) {
      p.setTime(PUBLICATION_NOW); readAt = p.now();
      const state = await p.setup(id);
      if (options.linkedEvidence) {
        const context = state.snapshot.context, authority = evidenceAuthority();
        state.snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context, {
          sourceUrl: 'https://news.example.com/synthetic-match-preview', publishedAt: context.cutoffAt - 3000,
        })] }, authority);
        state.input.evidenceSnapshotId = evidenceHash(randomUUID());
        await createMysqlEvidenceStore(p.a).save(state.input.evidenceSnapshotId, evidenceHash(`request:${state.input.evidenceSnapshotId}`), state.snapshot, authority);
      }
      state.input.candidate = options.candidate?.(state) ?? historyCandidate({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId, ...options });
      const receipt = await p.publisher.publish(state.input, state.lease); assert.equal(receipt.refresh.outcome, 'published');
      await p.queue.acknowledge(state.lease); state.revision = receipt.revision; states.set(id, state); return state;
    }
    const read = (state, query = '') => service.query(state.fixture.id, new URLSearchParams(query));
    await t.test('known unpublished and unknown or cross-fixture references', async () => {
      const state = await p.setup(3009), response = await read(state);
      assert.equal(response.snapshot, null); assert.equal(response.fixture.unavailableMarkets.length, 4);
      assert.equal(response.selection, 'applicable'); assert.equal(response.currentRevisionId, null);
      capture('unpublished', response);
      await assert.rejects(service.query(randomUUID()), (e) => e.code === 'not-found');
      const first = await publish(3000), other = await publish(3001);
      await assert.rejects(read(first, `revision=${other.revision.id}`), (e) => e.code === 'not-found');
      await assert.rejects(read(first, `cycle=${other.cycle.id}`), (e) => e.code === 'not-found');
      await assert.rejects(read(first, `revision=${randomUUID()}`), (e) => e.code === 'not-found');
      assert.equal((await read(first)).snapshot.revisionId, first.revision.id);
    });
    await t.test('open snapshot preserves complete probabilities, alternatives, identity, source and original clocks', async () => {
      const state = states.get(3000), response = matchDetailResponseSchema.parse(await read(state)), snapshot = response.snapshot;
      assert.equal(snapshot.applicability, 'current'); assert.equal(snapshot.historical, false); assert.equal(snapshot.markets.length, 4);
      assert.equal(snapshot.analysis.state, 'available'); assert.ok(snapshot.analysis.reasons.length >= 2); assert.ok(snapshot.analysis.uncertainty.text);
      assert.equal(response.route.fixtureId, state.fixture.id); assert.ok(response.route.path.endsWith(`/${response.route.slug}`));
      for (const item of snapshot.markets) {
        const stored = state.revision.candidate.markets[item.market.family];
        assert.deepEqual(item.market, stored.market); assert.deepEqual(item.timestamps, stored.timestamps);
        assert.equal(item.alternatives.length, Object.keys(item.market.probabilities).length - 1);
        assert.ok(item.alternatives.every((a) => a.selection !== item.market.selection && a.probability === item.market.probabilities[a.selection]));
      }
      assert.ok(snapshot.outcomes.every((o) => o.status === 'pending'));
      assert.equal(matchDetailResponseSchema.safeParse({ ...response, privatePrompt: 'secret' }).success, false);
      assert.doesNotMatch(JSON.stringify(response), /candidateJson|evidenceRef|transportEvidence|requestHash|observationHash|invocationId|promptVersion|rawJson|claims/u);
      capture('open', response);
    });
    await t.test('provider fallback and mixed-family provenance stay in one coherent revision', async () => {
      const fallback = await publish(3002, { source: 'api-football' });
      const snapshot = (await read(fallback)).snapshot;
      capture('fallback', await read(fallback));
      assert.equal(snapshot.markets.length, 2); assert.equal(snapshot.unavailableMarkets.length, 2);
      assert.ok(snapshot.markets.every((m) => m.source.kind === 'api-football' && m.source.fallbackReason === 'ai-failure' && m.timestamps.providerUpdatedAt === null && m.timestamps.generatedAt === null));
      const mixed = await publish(3003, { candidate: (state) => {
        const f = fallbackFixture({ snapshot: state.snapshot, model: modelVersion(), jobId: state.lease.jobId,
          output: { groups: { 'total-goals': { period: 'regulation-including-stoppage-time', line: 2.5, probabilities: { 'over-2.5': 0.6, 'under-2.5': 0.4 } },
            'both-teams-to-score': { period: 'regulation-including-stoppage-time', probabilities: { yes: 0.6, no: 0.4 } } } } });
        return resolveFallbackCandidate({ expected: f.expected, ai: f.ai, provider: fallbackProvider(f.expected), now: f.now }, f.authority).candidate;
      } });
      const data = (await read(mixed)).snapshot;
      assert.deepEqual(data.markets.map((m) => [m.market.family, m.source.kind]), [['match-result', 'api-football'], ['double-chance', 'api-football'], ['total-goals', 'ai'], ['both-teams-to-score', 'ai']]);
      assert.equal(data.analysis.reasons.length, 3); assert.equal(data.analysis.sources.filter((s) => s.id === 'api-football').length, 1);
      capture('mixed', await read(mixed));
      const partial = await publish(3011, { partial: true }), response = await read(partial);
      assert.equal(response.snapshot.markets.length, 2); assert.equal(response.snapshot.unavailableMarkets.length, 2);
      capture('partial', response);
      const linked = await publish(3012, { linkedEvidence: true }), attribution = await read(linked);
      assert.equal(attribution.snapshot.analysis.sources[0].url, 'https://news.example.com/synthetic-match-preview');
      assert.equal(attribution.snapshot.analysis.sources[0].publishedAt, linked.snapshot.context.cutoffAt - 3000);
      assert.ok(attribution.snapshot.analysis.reasons.every(reason => reason.sourceUrls.includes('https://news.example.com/synthetic-match-preview')));
      capture('linked-evidence', attribution);
    });
    await t.test('locked snapshot and closed without eligible lock keep distinct identities', async () => {
      const state = states.get(3000); p.setTime(state.cycle.cutoffAt); await p.first.close(p.target(state));
      assert.equal((await read(state)).snapshot.applicability, 'locked');
      capture('locked', await read(state));
      const preview = await publish(3006);
      await p.first.closeObservedPlay({ ...preview.input.observation, status: 'live', retrievedAt: p.now(), actualStartedAt: PUBLICATION_NOW - 1 });
      const response = await read(preview); assert.equal(response.snapshot, null); assert.equal(response.currentRevisionId, null);
      capture('closed-without-lock', response);
      const historical = (await read(preview, `revision=${preview.revision.id}`)).snapshot;
      assert.equal(historical.applicability, 'historical'); assert.equal(historical.historical, true); assert.deepEqual(historical.outcomes, []);
    });
    await t.test('void preview retains forecast and reason across a new applicable cycle', async () => {
      const state = await publish(3007);
      await p.first.voidCycle({ ...p.target(state), actor: 'synthetic-detail-test', reason: 'formal-postponement', evidenceRef: 'private-void-proof' });
      const response = await read(state);
      assert.equal(response.snapshot.applicability, 'void'); assert.equal(response.snapshot.cycle.lockedAt, null);
      assert.ok(response.snapshot.outcomes.every((o) => o.status === 'void' && o.voidedAt === p.now()));
      capture('void-preview', response);
      const next = await p.history.withFixtureTransaction(state.fixture.id, (writer) => writer.createCycle(cycleCreation(state.fixture, 'detail-rescheduled')));
      const current = await read(state); assert.equal(current.fixture.cycleId, next.id); assert.equal(current.snapshot, null);
      const previous = await read(state, `cycle=${state.cycle.id}&limit=1`);
      assert.equal(previous.snapshot.revisionId, state.revision.id); assert.equal(previous.snapshot.historical, true);
      assert.equal(previous.snapshot.cycle.voidReason.code, 'formal-postponement'); assert.ok(previous.history.cycles.next);
      await p.first.voidCycle({ fixtureId: state.fixture.id, cycleId: next.id, actor: 'synthetic-detail-test', reason: 'formal-postponement', evidenceRef: 'private-next-cycle-proof' });
      capture('void-without-prediction', await read(state));
      await p.history.withFixtureTransaction(state.fixture.id, (writer) => writer.createCycle(cycleCreation(state.fixture, 'third-detail-cycle')));
      const page = await read(state, new URL(previous.history.cycles.next, 'http://localhost').searchParams);
      assert.equal(page.history.cycles.entries[0].id, state.cycle.id); assert.equal(page.history.cycles.next, null);
      assert.doesNotMatch(JSON.stringify(previous), /private-void-proof/u);
      const emptyAnchor = await read(state, 'revisionAnchor=0&cycleAnchor=0');
      assert.deepEqual(emptyAnchor.history.revisions.entries, []); assert.deepEqual(emptyAnchor.history.cycles.entries, []);
    });
    await t.test('earlier revision selection and anchored history stay stable under new publication', async () => {
      const state = await publish(3010);
      async function nextRevision(date) {
        p.setTime(Date.parse(`${date}T08:00:04Z`)); readAt = p.now();
        const fixture = await p.catalog.fixtureByProviderId(3010), cycle = await p.history.findCycle(state.cycle.id), run = await p.history.createRun(date, p.now() - 4000);
        const context = evidenceContext(fixture, { runId: run.id, cycleId: cycle.id, analysisAt: p.now() - 4000, cutoffAt: p.now() - 4000,
          home: { teamId: fixture.homeTeamId, externalId: fixture.homeExternalIds[0] }, away: { teamId: fixture.awayTeamId, externalId: fixture.awayExternalIds[0] } });
        const authority = evidenceAuthority(), snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources: [evidenceSource(context)] }, authority);
        const evidenceId = evidenceHash(randomUUID()); await createMysqlEvidenceStore(p.a).save(evidenceId, evidenceHash(`request:${evidenceId}`), snapshot, authority);
        const candidate = historyCandidate({ snapshot, model: modelVersion(), jobId: evidenceHash(randomUUID()) });
        return p.history.withFixtureTransaction(fixture.id, async (writer, tx) => {
          const revision = await writer.appendRevision(revisionInput(candidate, evidenceId, cycle.scheduleVersion));
          const current = await storedCycle(tx, cycle.id);
          await writer.changeCycle({ ...cycleChange(current, { currentSetId: revision.id }, `detail:${date}`), at: p.now() });
          return revision;
        });
      }
      const second = await nextRevision('2026-10-10'), third = await nextRevision('2026-10-11');
      const firstPage = await read(state, `revision=${state.revision.id}&limit=1`);
      assert.equal(firstPage.snapshot.historical, true); assert.deepEqual(firstPage.snapshot.outcomes, []);
      assert.equal(firstPage.currentRevisionId, third.id); assert.equal(firstPage.history.revisions.anchor, 3);
      const fourth = await nextRevision('2026-10-12');
      const secondPage = await read(state, new URL(firstPage.history.revisions.next, 'http://localhost').searchParams);
      assert.equal(secondPage.snapshot.revisionId, state.revision.id); assert.equal(secondPage.currentRevisionId, fourth.id);
      assert.deepEqual(secondPage.history.revisions.entries.map((r) => r.revisionId), [second.id]);
      const thirdPage = await read(state, new URL(secondPage.history.revisions.next, 'http://localhost').searchParams);
      assert.deepEqual(thirdPage.history.revisions.entries.map((r) => r.revisionId), [state.revision.id]); assert.equal(thirdPage.history.revisions.next, null);
      assert.ok(BigInt(secondPage.fixture.dataVersion) > BigInt(firstPage.fixture.dataVersion));
    });
    await t.test('expired evidence suppresses analysis without replacing immutable probabilities or source clocks', async () => {
      const state = states.get(3000); readAt = PUBLICATION_NOW + 2 * 86_400_000;
      const data = (await read(state)).snapshot;
      assert.equal(data.analysis.state, 'withheld'); assert.deepEqual(data.analysis.reasons, []); assert.equal(data.analysis.uncertainty, null);
      assert.deepEqual(data.markets[0].market, state.revision.candidate.markets['match-result'].market);
      capture('withheld', await read(state));
      readAt = PUBLICATION_NOW;
    });
    await t.test('verified result correction updates outcomes while preserving the locked forecast', async () => {
      const state = states.get(3000), accountId = resultHash('match-detail-results');
      await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
      const lifecycle = createScheduleLifecycleService({ database: p.a, cutoff: p.first, policy: lifecyclePolicy(), authority: lifecycleAuthority() });
      const store = createMysqlResultSyncStore({ database: p.a, accountId, lifecycle });
      const settlement = createMarketSettlementService({ database: p.a, queue: p.queue });
      async function result(home, away, number) {
        p.setTime(state.cycle.kickoffAt + 7_200_000 + number * 1000); readAt = p.now();
        const observation = parseLifecycleInput(lifecycleInput(state, p.now(), { status: 'FT', raw: { goals: { home, away }, score: { fulltime: { home, away } } } }));
        const lease = await store.acquire(resultHash(`detail-result-owner:${number}`), 30_000); assert.ok(lease);
        const batch = { id: resultHash(`detail-result:${number}`), accountId, policyHash: resultHash('detail-result-policy'), receivedAt: p.now(),
          channel: 'ids', date: null, requestedIds: [3000], observations: [observation], error: null, requestsDispatched: 1 };
        try { await store.save(lease, batch); await store.apply(lease, batch); } finally { await store.release(lease); }
      }
      await result(2, 0, 1); assert.ok((await read(state)).snapshot.outcomes.every((o) => o.status === 'pending'));
      capture('pending-settlement', await read(state));
      await settlement.settleFixture(state.fixture.id);
      const original = await read(state); assert.equal(original.fixture.score.home, 2);
      assert.equal(original.snapshot.outcomes[0].status, 'correct'); assert.equal(original.snapshot.outcomes[0].correctedAt, null);
      assert.deepEqual(original.snapshot.outcomes.map(outcome => outcome.status), ['correct', 'correct', 'incorrect', 'incorrect']);
      capture('settled', original);
      await result(0, 1, 2); assert.ok((await read(state)).snapshot.outcomes.every((o) => o.status === 'pending'));
      capture('correction-pending', await read(state));
      await settlement.settleFixture(state.fixture.id);
      const corrected = await read(state); assert.equal(corrected.fixture.score.home, 0);
      assert.equal(corrected.snapshot.outcomes[0].status, 'incorrect'); assert.equal(corrected.snapshot.outcomes[0].reason, 'result-correction');
      assert.equal(corrected.snapshot.outcomes[0].correctedAt, p.now()); assert.equal(corrected.snapshot.outcomes[0].settledAt, p.now());
      assert.equal(corrected.snapshot.revisionId, original.snapshot.revisionId); assert.deepEqual(corrected.snapshot.markets, original.snapshot.markets);
      capture('corrected', corrected);
      const previousReadAt = readAt; readAt += 20 * 86_400_000; capture('historical', await read(state)); readAt = previousReadAt;
    });
    await t.test('anonymous detail and historical requests perform only reads, dispatch no outbound work and set no cookie', async () => {
      const counts = () => p.a.query(async (tx) => ({ jobs: await tx.durableJob.findMany({ orderBy: { id: 'asc' } }),
        revisions: await tx.predictionSet.count(), evidence: await tx.fixtureEvidenceSnapshot.count(), results: await tx.fixtureResult.count(),
        events: await tx.predictionChangeEvent.count(), audits: await tx.predictionAudit.count(), settlement: await tx.marketSettlementRevision.count(),
        cycles: await tx.predictionCycle.findMany({ orderBy: { id: 'asc' } }),
        versions: await tx.footballFixture.findMany({ orderBy: { id: 'asc' }, select: { id: true, dataVersion: true } }),
        limit: await tx.publicSearchLimit.findMany() }));
      const before = await counts(), fetch = globalThis.fetch; let outbound = 0, writes = 0;
      const database = { transaction: (operation, options) => p.a.transaction((tx) => operation(new Proxy(tx, {
        get(target, key) {
          if (key === '$executeRaw' || key === '$executeRawUnsafe' || key === '$queryRawUnsafe') return () => { writes++; throw new Error('Unexpected write'); };
          const value = Reflect.get(target, key);
          if (key === '$queryRaw') return (strings, ...values) => {
            if (!/^\s*SELECT\b/iu.test(strings.join(' '))) { writes++; throw new Error('Unexpected non-SELECT query'); }
            return value.call(target, strings, ...values);
          };
          return value && typeof value === 'object' ? new Proxy(value, { get(model, method) {
            if (/create|update|delete|upsert/iu.test(String(method))) return () => { writes++; throw new Error('Unexpected model write'); };
            return Reflect.get(model, method);
          } }) : value;
        },
      })), options) };
      const reader = createMatchDetailService({ database, clock: { now: () => readAt } });
      globalThis.fetch = async () => { outbound++; throw new Error('Unexpected network'); };
      try {
        const state = states.get(3000), handler = createMatchDetailHandler((id, parameters) => reader.query(id, parameters));
        const response = await handler(new Request(`http://localhost/api/matches/${state.fixture.id}?revision=${state.revision.id}`), { params: Promise.resolve({ id: state.fixture.id }) });
        assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
        await reader.query(states.get(3007).fixture.id, new URLSearchParams({ cycle: states.get(3007).cycle.id }));
        await reader.query(states.get(3010).fixture.id, new URLSearchParams({ revision: states.get(3010).revision.id, limit: '1' }));
      } finally { globalThis.fetch = fetch; }
      assert.equal(writes, 0); assert.equal(outbound, 0); assert.deepEqual(await counts(), before);
    });
    await savePageScenarios(t, 'MATCH_DETAIL_PAGE_CAPTURE', captured);
  });
});

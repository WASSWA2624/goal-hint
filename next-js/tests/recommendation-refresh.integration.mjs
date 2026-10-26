import assert from 'node:assert/strict';
import test from 'node:test';
import { createPredictionRefreshService } from '../src/server/refresh/refresh-service.ts';
import { createJobRegistry } from '../src/server/jobs/job-registry.ts';
import { createJobWorker } from '../src/server/jobs/job-worker.ts';
import { createRevisionPublicationService } from '../src/server/predictions/publication-service.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { createRecommendationQuoteLoader } from '../src/server/odds/recommendation-quotes.ts';
import { oddsPolicyHash } from '../src/server/odds/odds-input.ts';
import { evidenceHash } from './helpers/evidence-fixtures.mjs';
import { publicationAuthority, publicationPolicy } from './helpers/publication-fixtures.mjs';
import { recommendationFootballSources } from './helpers/recommendation-evidence-fixtures.mjs';
import { refreshHarness } from './helpers/refresh-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, launchBets, oddsAuthority, oddsBounds, oddsPolicy, oddsRequest,
  rawOddsRow, offsetTime } from './helpers/odds-fixtures.mjs';

test('qualified recommendations traverse the durable refresh and atomic publication services on owned MySQL', { timeout: 300000 }, async (t) => {
  await withPredictionPipeline(t, async (db) => {
    const groups = (home, draw, away) => ({ 'match-result': { period: 'regulation-including-stoppage-time',
      probabilities: { 'home-win': home, draw, 'away-win': away } }, 'total-goals': null, 'both-teams-to-score': null });
    const scenarios = [{ aiPlan: 'none' }, { groups: groups(.2, .4, .4), sourceOrder: 'ai-first' },
      { groups: groups(.7, .2, .1), sourceOrder: 'ai-first' }].map((scenario) => ({ ...scenario, recommendations: true,
      evidenceSources: recommendationFootballSources }));
    const h = await refreshHarness(db, scenarios, { fallbackSelectionPolicy: 'optional-ai-primary' });
    const policy = oddsPolicy(), accountId = evidenceHash('recommendation-refresh-odds-account'), clock = { now: db.now };
    await db.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const transport = createSyntheticOddsAdapter(clock, { setTime: db.setTime });
    const store = createMysqlOddsStore(db.a);
    const odds = createOddsImportService({ adapter: transport.adapter.odds, store, authority: oddsAuthority({ publicDisplay: false }, policy),
      accountId: () => accountId, clock, bounds: () => oddsBounds(db.now()) });
    const request = (kind) => oddsRequest(kind, Math.floor(db.now() / 10800000) * 10800000,
      { policy, date: kind === 'prices' ? '2026-10-12' : null, id: evidenceHash(`${kind}:${db.now()}`) });
    transport.state.bets = launchBetCatalog(); await odds.importCatalog(request('bets'));
    const rows = (homeAway) => h.rows.map((row) => rawOddsRow(row.fixture.id, Date.parse(row.fixture.date),
      { update: offsetTime(db.now() - 1000), bets: launchBets({ home: '2.00', homeDraw: '1.20', drawAway: '1.20', homeAway }) }));
    transport.state.rows = rows('1.90'); await odds.importDate(request('prices')); db.setTime(db.now() + 1000);
    const publisher = createRevisionPublicationService({ database: db.a, queue: db.queue, policy: publicationPolicy(),
      authority: publicationAuthority({ verifyRecommendation: () => true }) });
    const attempts = [];
    const service = createPredictionRefreshService({ ...h.serviceOptions,
      publisher: { async publish(input, lease) { attempts.push({ input, lease }); return publisher.publish(input, lease); } },
      recommendations: { quotes: createRecommendationQuoteLoader(db.a, { bookmakerId: policy.bookmakerId,
        freshnessMs: policy.freshnessMs, expectedPolicyHash: oddsPolicyHash(policy), verifyInternalUse: () => true }) } });
    const worker = createJobWorker({ queue: db.queue, registry: createJobRegistry([service.definition]), ownerId: evidenceHash('recommendation-worker') });
    const revisions = [];
    for (const [index, source] of ['api-football', 'api-football', 'ai'].entries()) {
      assert.equal(await worker.runOnce(), true);
      const outcome = await h.outcome(index); assert.equal(outcome.outcome, 'published');
      const revision = await db.history.findRevision(outcome.revisionId); revisions.push(revision);
      assert.equal(revision.candidate.audit.recommendation.selected.source, source);
      assert.equal(revision.candidate.audit.recommendation.evidenceSnapshotId, revision.evidenceSnapshotId);
    }
    assert.equal(revisions[0].candidate.audit.recommendation.selected.selection, 'home-or-away');
    assert.equal(revisions[2].candidate.audit.recommendation.selected.selection, 'home-win');
    assert.equal(h.calls.ai.length, 2); assert.equal(h.calls.fallback.length, 3);
    assert.equal((await db.a.query((tx) => tx.fixtureOddsPrice.count())), 0, 'all quotes remain private');
    const original = revisions[0].candidate.audit.recommendation;
    transport.state.rows = rows('2.20'); db.setTime(db.now() + 1000); await odds.importDate(request('prices'));
    assert.deepEqual((await db.history.findRevision(revisions[0].id)).candidate.audit.recommendation, original);
    const replay = await publisher.publish(attempts[0].input, attempts[0].lease);
    assert.equal(replay.revision.id, revisions[0].id); assert.deepEqual(replay.revision.candidate.audit.recommendation, original);
    assert.equal(original.selected.quote.decimal, '1.9');
    assert.equal(h.calls.ai.length, 2); assert.equal(h.calls.fallback.length, 3);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { readPerformanceQuotes } from '../src/server/performance/performance-quotes.ts';
import { createMysqlOddsStore } from '../src/server/odds/odds-mysql-store.ts';
import { createOddsImportService } from '../src/server/odds/odds-service.ts';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { createSyntheticOddsAdapter, launchBetCatalog, launchBets, oddsAuthority, oddsBounds, oddsHash,
  oddsPolicy, oddsRequest, rawOddsRow } from './helpers/odds-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

test('historical pick quotes on owned genuine MySQL retain pre-publication prices and exclude intervening withdrawals', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const first = await p.setup(3000), second = await p.setup(3001);
    const accountId = oddsHash('synthetic-performance-quotes');
    await p.a.query((tx) => tx.apiQuotaAccount.create({ data: { id: accountId } }));
    const clock = { now: () => p.now() }, odds = createSyntheticOddsAdapter(clock), policy = oddsPolicy();
    odds.state.bets = launchBetCatalog();
    const service = createOddsImportService({ adapter: odds.adapter.odds, store: createMysqlOddsStore(p.a),
      authority: oddsAuthority({ publicDisplay: true }, policy), accountId: () => accountId,
      bounds: () => oddsBounds(p.now()), clock });
    const request = (kind, date = null) => oddsRequest(kind, p.now(), { policy, date, id: oddsHash(`${kind}:${p.now()}`) });
    p.setTime(PUBLICATION_NOW - 2000);
    await service.importCatalog(request('bets'));
    odds.state.rows = [first, second].map((state, index) => rawOddsRow(3000 + index, state.cycle.kickoffAt, { bets: launchBets({ home: '2.35' }) }));
    assert.equal((await service.importDate(request('prices', '2026-10-09'))).status, 'complete');
    p.setTime(PUBLICATION_NOW);
    const original = await p.publisher.publish(first.input, first.lease);
    assert.equal(original.refresh.outcome, 'published');
    const target = (state, revision) => ({ fixtureId: state.fixture.id, externalId: BigInt(state.fixture.externalId), revisionId: revision.id,
      openedAt: state.cycle.openedAt, publishedAt: revision.publishedAt, cutoffAt: state.cycle.cutoffAt, kickoffAt: state.cycle.kickoffAt });
    const read = (targets, override = {}) => p.a.transaction((tx) => readPerformanceQuotes(tx, targets,
      { bookmakerId: 8, maximumAgeMs: 60_000, ...override }, { remainingBytes: 1_000_000 }), { isolationLevel: 'RepeatableRead' });
    const firstTarget = target(first, original.revision);
    assert.equal((await read([firstTarget])).get(`${original.revision.id}:match-result:home-win`), '2.35');

    // A later complete sweep changes A and withdraws B before B's forecast is published.
    p.setTime(PUBLICATION_NOW + 100);
    odds.state.rows = [rawOddsRow(3000, first.cycle.kickoffAt, { bets: launchBets({ home: '9.99' }) })];
    assert.equal((await service.importDate(request('prices', '2026-10-09'))).status, 'complete');
    p.setTime(PUBLICATION_NOW + 200);
    const afterWithdrawal = await p.publisher.publish(second.input, second.lease);
    assert.equal(afterWithdrawal.refresh.outcome, 'published');
    const quotes = await read([firstTarget, target(second, afterWithdrawal.revision)]);
    assert.equal(quotes.get(`${original.revision.id}:match-result:home-win`), '2.35');
    assert.equal([...quotes.keys()].some((key) => key.startsWith(afterWithdrawal.revision.id)), false);
    assert.equal((await read([firstTarget], { maximumAgeMs: 1000 })).size, 0);
    assert.equal((await read([firstTarget], { bookmakerId: 9 })).size, 0);
    assert.ok(odds.network.length > 0, 'all provider envelopes used the synthetic adapter');
  }, { migrationTimeoutMs: 180_000 });
});

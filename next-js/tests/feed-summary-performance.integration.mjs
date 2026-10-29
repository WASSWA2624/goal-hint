import assert from 'node:assert/strict';
import test from 'node:test';
import { createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';
import { createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { PUBLICATION_NOW } from './helpers/publication-fixtures.mjs';
import { withPredictionPipeline } from './prediction-pipeline.mjs';

test('compact summaries match full stored feed counts and invalidate on genuine isolated MySQL', { timeout: 300_000 }, async (t) => {
  await withPredictionPipeline(t, async (p) => {
    const states = [];
    for (const id of [3000, 3001]) {
      const state = await p.setup(id);
      assert.equal((await p.publisher.publish(state.input, state.lease)).refresh.outcome, 'published');
      await p.queue.acknowledge(state.lease); states.push(state);
    }
    const clock = { now: () => PUBLICATION_NOW }, cache = createMysqlPublicResponseCache(p.a, clock.now);
    const options = { database: p.a, competitionIds: [39], clock, cache };
    const feed = createMatchFeedService(options), summary = createMatchFeedSummaryService(options);
    async function compare(input) {
      const full = await feed.query(input), compact = await summary.query(input);
      assert.deepEqual(compact.performance, full.performance, JSON.stringify(input));
      assert.equal(compact.total, full.total);
      assert.equal(compact.paginationVersion, full.paginationVersion);
      assert.equal(compact.asOf, full.asOf);
      return compact;
    }
    for (const parameters of [{}, { page: '2', pageSize: '1' }, { page: '10000' }, { picks: 'only' },
      { status: 'scheduled' }, { status: 'finished' }, { prob: '60-100' }, { market: 'total-goals' },
      { market: 'match-result', sort: 'probability', dir: 'asc' }, { country: 'Synthetic Country' },
      { q: 'Synthetic' }, { when: 'next-7-days' }, { tz: 'America/New_York' }]) {
      await compare(parameters.when ? parameters : { date: '2026-10-09', ...parameters });
    }
    const before = await compare({ date: '2026-10-09', picks: 'only' });
    const state = states[0];
    await p.first.voidCycle({ ...p.target(state), actor: 'synthetic-summary-test', reason: 'formal-postponement', evidenceRef: 'synthetic-void-proof' });
    const after = await compare({ date: '2026-10-09', picks: 'only' });
    assert.notEqual(after.paginationVersion, before.paginationVersion);
    assert.equal(after.performance.void, before.performance.void + 1);
    assert.deepEqual(await summary.query({ date: '2026-10-09', picks: 'only' }), after, 'repeated compact reads retain authoritative cached counts');
  });
});

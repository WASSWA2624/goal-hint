import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipsRangeKey, findBestSlipsSnapshot, projectBestSlipsSnapshot, rememberBestSlipsSnapshot } from '../src/domain/best-slips-client.ts';
import { slipStatusCategory } from '../src/domain/slip-status.ts';
import { slipPageSize } from '../src/domain/slip-pagination.ts';

const day = '2026-10-30';
const query = (overrides = {}) => ({ period: 'today', status: 'all', page: 1, ...overrides });
function daily(statuses = ['won', 'lost', 'not-started', 'in-progress', 'pending', 'void', 'cancelled'], entitled = true) {
  const statistics = { total: statuses.length, won: 0, lost: 0, pending: 0, void: 0, cancelled: 0 };
  const slips = statuses.map((status, index) => {
    statistics[slipStatusCategory(status)]++;
    return { id: `row-${index}`, rank: index + 1, matchCount: 2, totalOdds: '4.50', estimatedProbability: .6,
      averageProbability: .7, status, outcome: ['not-started', 'in-progress'].includes(status) ? 'pending'
        : status === 'cancelled' ? 'void' : status };
  });
  return { day, state: 'generated', entitled, slips, statistics, searchLimited: false, partialCoverage: false };
}
const emptyCache = (source, entitled = source.entitled) => ({ source, entitled, snapshots: [] });
function page(source, selected = query(), total = source.slips.length, hasMore = false) {
  return { ...source, browse: { query: selected, total, hasMore, pageSize: slipPageSize, nextCursor: null, from: day, to: day } };
}

test('a complete daily cohort projects every status instantly while pending groups all unsettled progress', () => {
  const source = daily(), snapshot = { query: query(), data: source };
  for (const [status, expected] of [['won', ['won']], ['lost', ['lost']], ['pending', ['not-started', 'in-progress', 'pending']],
    ['void', ['void']], ['cancelled', ['cancelled']]]) {
    const result = projectBestSlipsSnapshot(snapshot, query({ status }));
    assert.deepEqual(result.data.slips.map((view) => view.status), expected);
    assert.equal(result.data.browse.total, expected.length);
    assert.equal(result.data.statistics, source.statistics, 'counts describe the full date range');
    assert.deepEqual(result.query, query({ status }));
  }
});

test('projection paginates the full matching cohort and preserves original ranks rather than filtering one page', () => {
  const source = daily(Array.from({ length: 100 }, (_, index) => index % 4 === 0 ? 'lost' : 'won'));
  const first = projectBestSlipsSnapshot({ query: query(), data: source }, query({ status: 'won' }));
  const second = projectBestSlipsSnapshot({ query: query(), data: source }, query({ status: 'won', page: 2 }));
  const ranks = source.slips.filter((view) => view.status === 'won').map((view) => view.rank);
  assert.equal(first.data.browse.total, 75); assert.equal(first.data.slips.length, 50); assert.equal(first.data.browse.hasMore, true);
  assert.deepEqual(second.data.slips.map((view) => view.rank), ranks.slice(50));
  assert.equal(second.data.slips.length, 25); assert.equal(second.data.browse.hasMore, false);
  assert.deepEqual([...first.data.slips, ...second.data.slips].map((view) => view.rank), ranks);
  assert.equal(second.data.statistics.total, 100);
});

test('only exact complete All responses can create a different result view locally', () => {
  const source = daily(), selected = query({ period: 'custom', from: day, to: day });
  const complete = page(source, selected);
  assert.ok(projectBestSlipsSnapshot({ query: selected, data: complete }, query({ status: 'won' })));
  for (const snapshot of [
    { query: selected, data: page(source, selected, 80, true) },
    { query: selected, data: { ...complete, statistics: { ...source.statistics, total: 80 } } },
    { query: selected, data: { ...complete, statistics: null } },
    { query: selected, data: { ...complete, state: 'data-unavailable' } },
    { query: query({ status: 'won' }), data: page(daily(['won']), query({ status: 'won' })) },
    { query: query({ period: 'all' }), data: page(source, query({ period: 'all' }), null, true) },
  ]) assert.equal(projectBestSlipsSnapshot(snapshot, query({ status: 'lost' })), null);
});

test('an empty known cohort is an immediate exact zero; unavailable daily seeds cannot fabricate empty results', () => {
  const source = daily([]);
  const known = projectBestSlipsSnapshot({ query: query(), data: source }, query({ status: 'won' }));
  assert.equal(known.data.browse.total, 0); assert.deepEqual(known.data.slips, []);
  for (const data of [{ ...source, state: 'model-unavailable' }, { ...source, statistics: undefined }]) {
    assert.equal(projectBestSlipsSnapshot({ query: query(), data }, query({ status: 'won' })), null);
  }
});

test('the bounded cache reuses exact accepted queries, replaces duplicates and evicts the oldest snapshots', () => {
  const source = daily(); let cache = emptyCache(source);
  for (let number = 1; number <= 15; number++) {
    const selected = query({ period: 'all', status: 'won', page: number, cursor: `${day}:${number}` });
    cache = rememberBestSlipsSnapshot(cache, source, selected, page(source, selected, null, true));
  }
  assert.equal(cache.snapshots.length, 12); assert.equal(cache.snapshots[0].query.page, 15); assert.equal(cache.snapshots.at(-1).query.page, 4);
  const selected = cache.snapshots[2].query, replacement = { ...cache.snapshots[2].data, slips: source.slips.slice(0, 1) };
  cache = rememberBestSlipsSnapshot(cache, source, selected, replacement);
  assert.equal(cache.snapshots.length, 12); assert.equal(cache.snapshots[0].data, replacement);
  const visible = findBestSlipsSnapshot(cache, source, true, selected);
  assert.equal(visible.retained, false); assert.equal(visible.data, replacement);
});

test('partial range transitions retain actual old rows and their query, without relabeling a partial page as a full filter', () => {
  const source = daily(), original = query({ period: 'last7', status: 'won', page: 2 });
  const old = page(source, original, 143, true);
  const cache = rememberBestSlipsSnapshot(emptyCache(source), source, original, old);
  const visible = findBestSlipsSnapshot(cache, source, true, query({ period: 'last7', status: 'lost' }));
  assert.equal(visible.retained, true); assert.equal(visible.data, old); assert.equal(visible.query, original);
  assert.equal(findBestSlipsSnapshot(cache, source, true, query({ period: 'yesterday', status: 'lost' })), null);
});

test('changed statistics prevent reuse of a now-stale complete cohort or a stale cached exact result', () => {
  const source = daily(['won', 'pending']);
  const previous = projectBestSlipsSnapshot({ query: query(), data: source }, query({ status: 'won' }));
  let cache = rememberBestSlipsSnapshot(emptyCache(source), source, previous.query, previous.data);
  const selected = query({ status: 'pending' }), latest = page(daily(['won', 'won']), selected, 0, false);
  latest.slips = [];
  cache = rememberBestSlipsSnapshot(cache, source, selected, latest);
  const visible = findBestSlipsSnapshot(cache, source, true, query({ status: 'won' }));
  assert.equal(visible.retained, true); assert.equal(visible.data, latest); assert.equal(visible.query.status, 'pending');
});

test('observed expiry excludes every protected cache and the old entitled daily seed, even while server refresh is held', () => {
  const source = daily(); let cache = rememberBestSlipsSnapshot(emptyCache(source), source, query(), page(source));
  assert.equal(findBestSlipsSnapshot(cache, source, false, query({ period: 'yesterday' })), null);
  assert.equal(findBestSlipsSnapshot(cache, source, false, query({ status: 'won' })), null);
  const locked = { ...page(source, query()), entitled: false, slips: [] };
  cache = rememberBestSlipsSnapshot(cache, source, query(), locked);
  assert.equal(cache.entitled, false); assert.equal(cache.snapshots.length, 1); assert.equal(cache.snapshots[0].data, locked);
  assert.equal(findBestSlipsSnapshot(cache, source, true, query({ period: 'last7' })), null);
  const freeView = findBestSlipsSnapshot(cache, source, false, query());
  assert.deepEqual(freeView.data.slips, []);
});

test('server-source replacement cannot reuse old query snapshots and a different reporting day is never cached', () => {
  const source = daily(), selected = query({ period: 'last7', status: 'lost' });
  const cache = rememberBestSlipsSnapshot(emptyCache(source), source, selected, page(source, selected));
  const refreshed = { ...source };
  assert.equal(findBestSlipsSnapshot(cache, refreshed, true, selected), null);
  assert.equal(rememberBestSlipsSnapshot(cache, source, selected, { ...source, day: '2026-10-31' }), cache);
});

test('equivalent explicit date ranges can reuse a complete cohort, while unrelated ranges remain isolated', () => {
  const source = daily();
  const custom = query({ period: 'custom', from: day, to: day, status: 'won' });
  assert.equal(bestSlipsRangeKey(query(), day), bestSlipsRangeKey(custom, day));
  const visible = findBestSlipsSnapshot(emptyCache(source), source, true, custom);
  assert.equal(visible.retained, false); assert.equal(visible.data.slips.length, 1); assert.equal(visible.query.period, 'custom');
  assert.equal(findBestSlipsSnapshot(emptyCache(source), source, true, query({ period: 'tomorrow' })), null);
});

test('the complete daily All source remains available while every rendered page is limited to 50 slips', () => {
  const source = daily(Array.from({ length: 83 }, () => 'pending'));
  const accepted = projectBestSlipsSnapshot({ query: query(), data: source }, query());
  const cache = rememberBestSlipsSnapshot(emptyCache(source), source, query(), accepted.data);
  const visible = findBestSlipsSnapshot(cache, source, true, query());
  assert.equal(visible.data.slips.length, 50); assert.equal(visible.data.browse.total, 83); assert.equal(visible.data.browse.hasMore, true);
  const second = findBestSlipsSnapshot(cache, source, true, query({ page: 2 }));
  assert.equal(second.retained, false); assert.equal(second.data.slips.length, 33); assert.equal(second.data.slips[0].rank, 51);
  assert.equal(second.data.browse.hasMore, false); assert.equal(source.slips.length, 83);
});

test('returning to All cannot resurrect stale daily counts after a newer filtered response changes the cohort statistics', () => {
  const source = daily(Array.from({ length: 83 }, () => 'pending'));
  const updated = daily(['won', ...Array.from({ length: 82 }, () => 'pending')]);
  const selected = query({ status: 'won' });
  const won = projectBestSlipsSnapshot({ query: query(), data: updated }, selected);
  let cache = rememberBestSlipsSnapshot(emptyCache(source), source, selected, won.data);
  let visible = findBestSlipsSnapshot(cache, source, true, query());
  assert.equal(visible.retained, true); assert.equal(visible.query.status, 'won');
  assert.equal(visible.data.statistics.won, 1); assert.equal(visible.data.statistics.pending, 82);
  const freshAll = projectBestSlipsSnapshot({ query: query(), data: updated }, query());
  cache = rememberBestSlipsSnapshot(cache, source, query(), freshAll.data);
  visible = findBestSlipsSnapshot(cache, source, true, query());
  assert.equal(visible.retained, false); assert.equal(visible.query.status, 'all');
  assert.equal(visible.data, freshAll.data); assert.equal(visible.data.slips.length, 50);
  assert.equal(visible.data.statistics.won, 1); assert.equal(visible.data.statistics.pending, 82);
});

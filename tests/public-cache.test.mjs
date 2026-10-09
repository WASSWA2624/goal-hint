import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReportingDateRange } from '../src/domain/calendar.ts';
import { parseMatchFeedQuery } from '../src/server/matches/feed-service.ts';
import { publicCacheDescriptor, createPublicResponseCache, publicCacheRules } from '../src/server/cache/public-cache.ts';

const start = Date.parse('2026-10-09T20:59:58Z'), parse = value => {
  assert.equal(typeof value.version, 'string'); return value;
};
const descriptor = (options = {}) => publicCacheDescriptor({ kind: 'feed', locale: 'en', now: start,
  query: { market: 'match-result', page: 1 }, parse, ...options });
function memory() {
  let at = start, version = 0, entry, loads = 0, outage = false;
  const store = { async lookup() {
    if (outage) throw new Error('private cache failure');
    return { generations: { shared: String(version) }, value: entry?.stamp === version ? entry.value : null, createdAt: entry?.createdAt ?? null,
      expiresAt: entry?.stamp === version ? entry.expiresAt : null };
  }, async fill(_key, _tags, stamp, value, createdAt, expiresAt) {
    if (outage) throw new Error('private cache failure');
    if (stamp.shared !== String(version)) return false;
    entry = { value: structuredClone(value), stamp: version, createdAt, expiresAt }; return true;
  }, async reconcile() { return { acknowledged: 0, removed: 0 }; } };
  return { cache: createPublicResponseCache(store, () => at), store,
    load: async () => ({ version: String(++loads), synchronizedAt: start - 60_000 }),
    advance: ms => { at += ms; }, invalidate: () => { version++; }, fail: () => { outage = true; },
    get loads() { return loads; } };
}

test('canonical keys resolve relative dates and isolate all allowed query and policy dimensions', () => {
  const today = '2026-10-09';
  const key = (input, extra = {}) => {
    const query = parseMatchFeedQuery(new URLSearchParams(input), today);
    const range = validateReportingDateRange(today, today, 1);
    return descriptor({ query: { ...query, dates: { from: today, to: today } }, range, ...extra }).key;
  };
  assert.equal(key(''), key('date=2026-10-09&page=1&pageSize=30&status=all'));
  assert.equal(key('q=%20Club%20%20One%20'), key('q=Club+One'));
  for (const input of ['page=2','pageSize=50','market=total-goals','status=live','league=abc','q=Club','market=total-goals&sort=probability']) {
    assert.notEqual(key(''), key(input));
  }
  assert.notEqual(key(''), key('', { locale: 'test-long' }));
  assert.notEqual(key(''), key('', { scope: [99] }));
  assert.notEqual(key(''), key('', { kind: 'performance' }));
  const range = validateReportingDateRange('2026-10-01', '2026-10-31', 31);
  assert.equal(descriptor({ range }).tags.length, 33);
  assert.equal(descriptor({ fixtureId: 'ABCD' }).tags.includes('fixture:abcd'), true);
});
test('hits preserve response/source time and never extend expiry', async () => {
  const m = memory(), d = descriptor();
  const first = await m.cache.read(d, m.load); m.advance(1000);
  assert.deepEqual(await m.cache.read(d, m.load), first); assert.equal(m.loads, 1);
  m.advance(1000); // EAT midnight caps the ordinary five-second lifetime.
  assert.notDeepEqual(await m.cache.read(d, m.load), first); assert.equal(m.loads, 2);
});
test('EAT rollover changes explicit and relative envelope keys but not immutable revision identity', () => {
  assert.notEqual(descriptor().key, descriptor({ now: start + 2000 }).key);
  assert.equal(descriptor({ kind: 'revision' }).key, descriptor({ kind: 'revision', now: start + 2000 }).key);
  assert.equal(descriptor({ kind: 'revision' }).lifetimeMs, 21_600_000);
  assert.equal(descriptor({ kind: 'revision', deadlineAt: start + 50 }).deadlineAt, start + 50);
});
test('two readers cannot refill an invalidated generation with an older response', async () => {
  const m = memory(), second = createPublicResponseCache(m.store, () => start);
  let release, began;
  const ready = new Promise(resolve => { began = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const old = m.cache.read(descriptor(), async () => { began(); await gate; return { version: 'old' }; });
  await ready; m.invalidate();
  assert.equal((await second.read(descriptor(), async () => ({ version: 'new' }))).version, 'new');
  release(); await old;
  assert.equal((await m.cache.read(descriptor(), m.load)).version, 'new'); assert.equal(m.loads, 0);
});
test('cache outage falls back, failed reads never populate cache, malformed cache is discarded', async () => {
  const m = memory(); m.fail(); assert.equal((await m.cache.read(descriptor(), m.load)).version, '1');
  await assert.rejects(m.cache.read(descriptor(), async () => { throw new Error('database down'); }), /database down/u);
  const other = memory();
  await assert.rejects(other.cache.read(descriptor(), async () => { throw new Error('not-found'); }));
  assert.equal((await other.cache.read(descriptor(), other.load)).version, '1');
  const store = { ...other.store, lookup: async () => ({ generations: {}, createdAt: start, expiresAt: start + 1000, value: { wrong: true } }) };
  assert.equal((await createPublicResponseCache(store, () => start).read(descriptor(), other.load)).version, '2');
});
test('slow reads and permission expiry cannot create an already stale cache entry', async () => {
  const m = memory(), d = descriptor({ kind: 'revision' });
  await m.cache.read({ ...d, validUntil: () => start + 1 }, m.load); m.advance(1);
  await m.cache.read(d, m.load); assert.equal(m.loads, 2);
  const slow = memory();
  await slow.cache.read(descriptor(), async () => { slow.advance(5000); return { version: 'slow' }; });
  assert.equal((await slow.cache.read(descriptor(), slow.load)).version, '1');
});
test('delayed notification under 15/60-second observations still refreshes within the cache budget', async () => {
  for (const cadence of [15_000, 60_000]) {
    const m = memory(), d = { ...descriptor({ kind: 'revision' }), lifetimeMs: publicCacheRules.mutableMs };
    let observed = '0', sourceAt = start; const load = async () => ({ version: observed, synchronizedAt: sourceAt });
    // Fill immediately before the provider's next observation, without delivering
    // an invalidation notification. Expiry remains the independent upper bound.
    m.advance(cadence - 1); await m.cache.read(d, load);
    m.advance(1); observed = '1'; sourceAt = start + cadence; assert.equal((await m.cache.read(d, load)).version, '0');
    m.advance(publicCacheRules.mutableMs - 1);
    const refreshed = await m.cache.read(d, load);
    assert.equal(refreshed.version, '1'); assert.equal(refreshed.synchronizedAt, start + cadence);
    assert.ok(cadence + publicCacheRules.mutableMs < 120_000);
  }
});
test('replica clock skew cannot extend freshness, and a failed fill preserves the stored read', async () => {
  const m = memory(); await m.cache.read(descriptor(), m.load);
  const behind = createPublicResponseCache(m.store, () => start - 1000);
  assert.equal((await behind.read(descriptor(), async () => ({ version: 'fresh' }))).version, 'fresh');
  const noFill = { ...m.store, lookup: async () => ({ generations: {}, createdAt: null, value: null, expiresAt: null }),
    fill: async () => { throw new Error('cache write outage'); } };
  assert.equal((await createPublicResponseCache(noFill, () => start).read(descriptor(), m.load)).version, '2');
});

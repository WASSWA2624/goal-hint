import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReportingDateRange } from '../src/domain/calendar.ts';
import { parseMatchFeedQuery } from '../src/server/matches/feed-service.ts';
import { publicCacheDescriptor, createPublicReadCoordinator, createPublicResponseCache, publicCacheRules } from '../src/server/cache/public-cache.ts';
import { createMysqlPublicResponseCache } from '../src/server/cache/mysql-public-cache.ts';

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
    get loads() { return loads; }, get now() { return at; } };
}

function deferred() {
  let resolve;
  const promise = new Promise(complete => { resolve = complete; });
  return { promise, resolve };
}

test('canonical keys resolve relative dates and isolate all allowed query and policy dimensions', () => {
  const today = '2026-10-09';
  const key = (input, extra = {}) => {
    const query = parseMatchFeedQuery(new URLSearchParams(input), today);
    const range = validateReportingDateRange(today, today, 1);
    return descriptor({ query: { ...query, dates: { from: today, to: today } }, range, ...extra }).key;
  };
  assert.equal(key(''), key('date=2026-10-09&page=1&pageSize=50&status=all'));
  assert.equal(key('q=%20Club%20%20One%20'), key('q=Club+One'));
  for (const input of ['page=2','pageSize=30','market=total-goals','status=live','league=abc','q=Club','market=total-goals&sort=probability']) {
    assert.notEqual(key(''), key(input));
  }
  assert.notEqual(key(''), key('', { locale: 'test-long' }));
  assert.notEqual(key(''), key('', { scope: [99] }));
  assert.notEqual(key(''), key('', { kind: 'performance' }));
  const range = validateReportingDateRange('2026-10-01', '2026-10-31', 31);
  assert.equal(descriptor({ range }).tags.length, 33);
  assert.equal(descriptor({ fixtureId: 'ABCD' }).tags.includes('fixture:abcd'), true);
});
test('odds bounds (052) isolate feed keys only where provider odds parse them; extremes share the unfiltered key', () => {
  const today = '2026-10-09', range = validateReportingDateRange(today, today, 1);
  const key = (input, providerOdds) => descriptor({ query: { ...parseMatchFeedQuery(new URLSearchParams(input), today, { providerOdds }),
    projection: 8, dates: { from: today, to: today } }, range }).key;
  assert.equal(key('', true), key('', false));
  assert.equal(key('odds=1.01-1000.00', true), key('', false));
  assert.notEqual(key('odds=1.50-3.00', true), key('', true));
  assert.notEqual(key('odds=1.50-3.00', true), key('odds=1.50-3.01', true));
  assert.notEqual(key('odds=1.50-3.00', true), key('prob=50-100', true));
  assert.notEqual(key('market=total-goals&odds=1.50-3.00', true), key('odds=1.50-3.00', true));
  assert.throws(() => key('odds=1.50-3.00', false));
  // Odds writes reuse the existing fixture/date tag families; no new tag type is introduced.
  assert.deepEqual(descriptor({ query: {}, range }).tags, ['date:2026-10-09', 'global:catalog', 'global:progress']);
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

test('simultaneous same-generation reads share unfinished work across wrappers without changing source clocks', async () => {
  const m = memory(), coordinator = createPublicReadCoordinator(), first = createPublicResponseCache(m.store, () => m.now, () => {}, coordinator);
  const second = createPublicResponseCache(m.store, () => m.now, () => {}, coordinator), ready = deferred(), release = deferred();
  let loads = 0;
  const load = async () => { loads++; ready.resolve(); await release.promise; return { version: 'original', asOf: start, sourceAt: start - 60_000 }; };
  const a = first.read(descriptor(), load); await ready.promise;
  m.advance(100);
  const b = second.read(descriptor(), load); await Promise.resolve();
  release.resolve();
  const [left, right] = await Promise.all([a, b]);
  assert.deepEqual(right, left); assert.equal(right.asOf, start); assert.equal(right.sourceAt, start - 60_000);
  assert.equal(loads, 1); assert.equal(coordinator.pending.size, 0);
});

test('an intervening generation change never joins an older pending read', async () => {
  const m = memory(), ready = deferred(), release = deferred();
  const old = m.cache.read(descriptor(), async () => { ready.resolve(); await release.promise; return { version: 'old' }; });
  await ready.promise; m.invalidate();
  assert.equal((await m.cache.read(descriptor(), async () => ({ version: 'new' }))).version, 'new');
  release.resolve(); await old;
  assert.equal((await m.cache.read(descriptor(), m.load)).version, 'new');
});

test('waiting for a slow read does not extend its five-second age or its original permission deadline', async () => {
  for (const lifetime of ['age', 'permission', 'midnight']) {
    const m = memory(), ready = deferred(), release = deferred();
    const d = lifetime === 'age' ? { ...descriptor({ kind: 'revision' }), lifetimeMs: publicCacheRules.mutableMs }
      : lifetime === 'permission' ? { ...descriptor({ kind: 'revision' }), validUntil: () => start + 100 } : descriptor();
    const old = m.cache.read(d, async () => { ready.resolve(); await release.promise; return { version: 'old' }; });
    await ready.promise;
    const fresh = m.cache.read(d, async () => ({ version: 'new' })); await Promise.resolve();
    m.advance(lifetime === 'age' ? 5000 : lifetime === 'permission' ? 100 : 2000);
    release.resolve(); await old;
    assert.equal((await fresh).version, 'new', lifetime);
    assert.equal((await m.cache.read(descriptor({ kind: 'revision' }), m.load)).version, '1');
  }
});

test('nested same-key materialization never waits for its own pending load', { timeout: 3000 }, async () => {
  const m = memory(), coordinator = createPublicReadCoordinator();
  const cache = createPublicResponseCache(m.store, () => m.now, () => {}, coordinator);
  const value = await cache.read(descriptor(), () => cache.read(descriptor(), async () => ({ version: 'nested' })));
  assert.equal(value.version, 'nested'); assert.equal(coordinator.pending.size, 0);
});

test('cache outages and failed loads are not hidden or retained by unfinished-read sharing', async () => {
  const m = memory(), coordinator = createPublicReadCoordinator(), ready = deferred(), release = deferred();
  const cache = createPublicResponseCache(m.store, () => m.now, () => {}, coordinator);
  const old = cache.read(descriptor(), async () => { ready.resolve(); await release.promise; return { version: 'old' }; });
  await ready.promise; m.fail();
  assert.equal((await cache.read(descriptor(), async () => ({ version: 'fallback' }))).version, 'fallback');
  release.resolve(); await old; assert.equal(coordinator.pending.size, 0);
  await assert.rejects(cache.read(descriptor(), async () => { throw new Error('read failed'); }), /read failed/u);
  assert.equal(coordinator.pending.size, 0);
  assert.equal((await cache.read(descriptor(), async () => ({ version: 'recovered' }))).version, 'recovered');
});

test('per-request MySQL cache factories share pending work only for the same database runtime', async () => {
  const database = { transaction: operation => operation({
    publicCacheTag: { findMany: async () => [] },
    publicResponseCache: { findUnique: async () => null, upsert: async () => {} },
  }) };
  const a = createMysqlPublicResponseCache(database, () => start), b = createMysqlPublicResponseCache(database, () => start);
  const ready = deferred(), release = deferred(); let loads = 0;
  const load = async () => { loads++; ready.resolve(); await release.promise; return { version: 'shared' }; };
  const first = a.read(descriptor(), load); await ready.promise;
  const second = b.read(descriptor(), load); await Promise.resolve();
  release.resolve(); await Promise.all([first, second]); assert.equal(loads, 1);
  // No completed value was retained locally: this fake database never stores a fill.
  await b.read(descriptor(), async () => { loads++; return { version: 'next' }; }); assert.equal(loads, 2);
});

test('shared failures preserve each caller loader and its bundle-specific error class', async () => {
  class OwnerError extends Error {}
  class FollowerError extends Error {}
  const m = memory(), coordinator = createPublicReadCoordinator(), ready = deferred(), release = deferred();
  const cache = createPublicResponseCache(m.store, () => m.now, () => {}, coordinator);
  const owner = cache.read(descriptor(), async () => { ready.resolve(); await release.promise; throw new OwnerError('owner'); });
  await ready.promise;
  const follower = cache.read(descriptor(), async () => { throw new FollowerError('follower'); }); await Promise.resolve();
  release.resolve();
  const results = await Promise.allSettled([owner, follower]);
  assert.ok(results[0].reason instanceof OwnerError); assert.ok(results[1].reason instanceof FollowerError);
  assert.equal(coordinator.pending.size, 0);
});

test('an unresolved leader cannot hold a follower beyond the original age, absolute deadline or permission bound', { timeout: 3000 }, async () => {
  for (const bound of ['age', 'deadline', 'permission']) {
    const m = memory(), coordinator = createPublicReadCoordinator(), ready = deferred(), release = deferred();
    const wallStartedAt = Date.now(), now = () => start + Date.now() - wallStartedAt;
    const cache = createPublicResponseCache(m.store, now, () => {}, coordinator);
    const d = { ...descriptor({ kind: 'revision' }), lifetimeMs: bound === 'age' ? 15 : 10_000,
      ...(bound === 'deadline' ? { deadlineAt: start + 15 } : {}),
      ...(bound === 'permission' ? { validUntil: () => start + 15 } : {}) };
    let leaderFinished = false, followerLoads = 0;
    const leader = cache.read(d, async () => {
      ready.resolve(); await release.promise; leaderFinished = true; return { version: 'leader' };
    });
    await ready.promise;
    const follower = await cache.read(d, async () => { followerLoads++; return { version: 'follower' }; });
    assert.equal(follower.version, 'follower', bound);
    assert.equal(followerLoads, 1, bound); assert.equal(leaderFinished, false, bound);
    release.resolve(); await leader; assert.equal(coordinator.pending.size, 0);
  }
});

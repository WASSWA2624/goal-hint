import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFeedPage, applyServerFeedPage, checkedFeedPage, checkedFeedWindow, continueFeedPages, FeedPaginationError, feedPageApiHref, feedPageHref, feedWindowApiHref, initialLoadedFeed, observeFeedPage, replaceFeedPages, supportsFeedWindow } from '../src/domain/feed-pagination.ts';
import { readJson } from '../src/state/refresh-base.ts';
import { readRefreshFeedWindow } from '../src/state/refresh-api.ts';
import { nextLoadedPage } from '../src/domain/browse-period.ts';
import { feedCheckpointSchema, matchingFeedCheckpoint, readFeedCheckpoints, restorationRules, writeFeedCheckpoint } from '../src/domain/feed-navigation.ts';
import { resolveFeedDates, feedQueryKey, feedQueryRules } from '../src/domain/feed-query.ts';
import { matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { fixture, query, today, now } from './helpers/client-state-fixtures.mjs';

const version = 'a'.repeat(64), otherVersion = 'b'.repeat(64), range = resolveFeedDates(query(), today);
function record(id, dataVersion = '9', name = 'Synthetic') {
  return { ...fixture({ fixtureId: id, dataVersion, homeTeam: { id: 'home', name }, forecast: null }), cycle: null,
    unavailableMarkets: ['match-result','double-chance','total-goals','both-teams-to-score'].map(family=>({family,reason:'not-published'})),
    update: {prediction:'unavailable',result:'untracked'},availabilityMessage:null,scorePeriod:null };
}
function page(number, ids, token = version, overrides = {}) {
  const nextPage = number < 3 ? number + 1 : null, previousPage = number > 1 ? number - 1 : null;
  return matchFeedResponseSchema.parse({ access: { tier: "full", signedIn: false }, paginationVersion: token, records: ids.map(id=>record(id)), page: number, nextPage, previousPage,
    pageSize: 2, total: 6, totalPages: 3, links: { next: nextPage ? `/api/matches?page=${nextPage}` : null, previous: previousPage ? `/api/matches?page=${previousPage}` : null },
    asOf: now, today, range: { from: range.startDate,to:range.endDate,...range.window }, state:'insufficient-data', message:null,
    coverage:{partial:false,knownFixtures:6,matchingWithMarket:0,dates:[{date:today,status:'complete',observedAt:now,authoritative:true}]},run:null,...overrides });
}
test('page URLs retain filters/order/size and pin relative reporting dates', () => {
  const q=query('when=next-7-days&q=Alias&league=league-a&status=live&market=total-goals&sort=probability&pageSize=40');
  assert.equal(feedPageHref(q,today,2),'/en/predictions/2026-10-09?to=2026-10-15&q=Alias&league=league-a&status=live&market=total-goals&sort=probability&page=2&pageSize=40&picks=all');
  assert.match(feedPageApiHref(q,today,2),/^\/api\/matches\?from=2026-10-09&to=2026-10-15&q=Alias&league=league-a&status=live&market=total-goals&sort=probability&page=2&pageSize=40$/u);
  assert.throws(()=>feedPageHref(q,today,0));
});

test('rolling default navigation stays on the feed while API appends pin its current range', () => {
  assert.equal(feedPageHref(query(),today,2),'/en/matches?page=2&picks=all&when=last-30-days&sort=kickoff');
  const filtered=query('q=Alias&country=England&status=finished&pageSize=40');
  assert.equal(feedPageHref(filtered,today,2),'/en/matches?q=Alias&country=England&status=finished&page=2&pageSize=40&picks=all&when=last-30-days&sort=kickoff');
  assert.equal(feedPageApiHref(filtered,today,2),'/api/matches?from=2026-09-10&to=2026-10-09&q=Alias&country=England&status=finished&page=2&pageSize=40');
});
test('default Today pages keep stable Matches links while API pagination pins the browsing day', () => {
  const q = query('when=today&sort=live-first');
  assert.equal(feedPageApiHref(q, today, 2), '/api/matches?date=2026-10-09&sort=live-first&page=2');
  assert.equal(feedPageHref(q, today, 2), '/en/matches?page=2');
  assert.throws(() => feedPageHref(q, today, 0));
  assert.equal(feedPageHref(query('date=2026-10-09&sort=live-first'), today, 2), '/en/predictions/2026-10-09?page=2');
  assert.equal(feedPageHref(query('date=2026-10-09&sort=kickoff'), today, 2), '/en/predictions/2026-10-09?page=2&picks=all&sort=kickoff');
  assert.match(feedPageHref(query('when=today&sort=live-first&prob=above-75'), today, 2), /prob=above-75/);
  assert.notEqual(feedQueryKey(q, today), feedQueryKey(query('when=today&sort=kickoff'), today));
});
test('append uses contiguous, stable cohorts and fails atomically on drift or overlap', () => {
  const initial=initialLoadedFeed(page(1,['a','b'])), next=appendFeedPage(initial,page(2,['c','d']));
  assert.deepEqual(next.records.map(r=>r.fixtureId),['a','b','c','d']); assert.equal(next.lastPage,2);
  for (const candidate of [page(2,['b','c']),page(2,['c','d'],otherVersion),page(2,['c','d'],null),page(3,['e','f'])]) {
    assert.throws(()=>appendFeedPage(initial,candidate)); assert.deepEqual(initial.records.map(r=>r.fixtureId),['a','b']);
  }
  assert.throws(()=>checkedFeedPage(page(1,['a','b']),query('pageSize=2'),today,2));
  assert.throws(()=>checkedFeedPage(page(1,['a','b']),query('pageSize=3'),today,1));
  assert.throws(()=>checkedFeedPage(page(1,['a','b']),query('date=2026-10-10&pageSize=2'),today,1));
});
test('rebasing replaces ordered membership atomically and never rolls whole snapshots backwards', () => {
  const old=appendFeedPage(initialLoadedFeed(page(1,['a','b'])),page(2,['c','d']));
  const first=page(1,['e','a'],otherVersion), second=page(2,['b','c'],otherVersion);
  const rebased=replaceFeedPages(old,[first,second]); assert.deepEqual(rebased.records.map(r=>r.fixtureId),['e','a','b','c']);
  const changed=structuredClone(first); changed.records[1]=record('a','9','Conflicting equal version');
  assert.equal(replaceFeedPages(old,[changed,second]).records[1].homeTeam.name,'Synthetic');
  changed.records[1]=record('a','10','New whole snapshot');
  assert.equal(replaceFeedPages(old,[changed,second]).records[1].homeTeam.name,'New whole snapshot');
  changed.records[1]=record('a','8','Older'); assert.throws(()=>replaceFeedPages(old,[changed,second]),e=>e.code==='stale-data');
  assert.throws(()=>replaceFeedPages(old,[first,page(2,['b','c'],version)]),e=>e.code==='changed');
  assert.equal(old.records.length,4);
});
test('Show More retries one unavailable read in place and honors its Retry-After', async () => {
  const initial = initialLoadedFeed(page(1, ['a', 'b']));
  const requested = [], delays = [];
  const next = await continueFeedPages(initial, async number => {
    requested.push(number);
    if (requested.length === 1) throw new FeedPaginationError('unavailable', 5_000);
    return page(number, ['c', 'd']);
  }, async delay => { delays.push(delay); return true; });
  assert.deepEqual(requested, [2, 2]);
  assert.deepEqual(delays, [5_000]);
  assert.deepEqual(next.records.map(row => row.fixtureId), ['a', 'b', 'c', 'd']);
  assert.deepEqual(initial.records.map(row => row.fixtureId), ['a', 'b']);

  for (const error of [new FeedPaginationError('rate-limited'), new FeedPaginationError('subscription-required'),
    new FeedPaginationError('unavailable', 60_000)]) {
    await assert.rejects(continueFeedPages(initial, async () => { throw error; }, async () => assert.fail('Unexpected retry')), error);
  }
  const failed = new FeedPaginationError('unavailable', 5_000);
  await assert.rejects(continueFeedPages(initial, async () => { throw failed; }, async () => false), failed);
  let attempts = 0;
  await assert.rejects(continueFeedPages(initial, async () => { attempts++; throw failed; }, async () => true), failed);
  assert.equal(attempts, 2);
});

test('Show More recovers a changed live generation with contiguous pages and never commits a mismatched rebase', async () => {
  const initial = initialLoadedFeed(page(1, ['a', 'b']));
  for (const conflict of ['generation', 'http']) {
    const requested = [];
    const result = await continueFeedPages(initial, async number => {
      requested.push(number);
      if (requested.length === 1 && conflict === 'http') throw new FeedPaginationError('changed');
      return page(number, number === 1 ? ['e', 'a'] : ['b', 'c'], otherVersion);
    }, async () => assert.fail('A cohort conflict cannot be retried as a transient read'));
    assert.deepEqual(requested, [2, 1, 2]);
    assert.deepEqual(result.records.map(row => row.fixtureId), ['e', 'a', 'b', 'c']);
    assert.equal(result.lastPage, 2);
    assert.equal(result.data.paginationVersion, otherVersion);
  }
  let requests = 0;
  await assert.rejects(continueFeedPages(initial, async number => {
    requests++;
    return page(number, number === 1 ? ['e', 'a'] : ['b', 'c'], requests === 3 ? version : otherVersion);
  }, async () => assert.fail('A cohort conflict cannot be retried as a transient read')), error => error.code === 'changed');
  assert.equal(requests, 3);
  assert.deepEqual(initial.records.map(row => row.fixtureId), ['a', 'b']);
});

test('the refresh transport distinguishes HTTP 409 from temporary outage and wait instructions', async t => {
  const signal = new AbortController().signal;
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 409 }));
  await assert.rejects(readJson('/api/matches', signal), error => error.code === 'changed');
  fetch.mock.mockImplementation(async () => new Response(null, { status: 503, headers: { 'Retry-After': '5' } }));
  await assert.rejects(readJson('/api/matches', signal), error => error.code === 'unavailable' && error.retryAfterMs === 5_000);
});

test('an atomic continuation pins the active cohort and starts at the explicit first page when in bounds', () => {
  assert.equal(supportsFeedWindow(1, 4, 50), true);
  assert.equal(supportsFeedWindow(1, 5, 50), false);
  for (const invalid of [[0, 1, 50], [1, 2, 0], [1, 2.5, 50], [10_000, 10_001, 50]]) {
    assert.equal(supportsFeedWindow(...invalid), false);
  }
  const target = new URL(feedWindowApiHref(query('when=today&result=pending&sort=live-first'), today, 2, 3), 'https://unit.test');
  assert.deepEqual(Object.fromEntries(target.searchParams), {
    result: 'pending', date: today, sort: 'live-first', page: '2', leagues: '0', through: '3',
  });
});

test('an atomic continuation accepts a complete pinned generation or verified real end only', () => {
  const applied = query('pageSize=2');
  const first = page(2, ['a', 'b'], otherVersion), second = page(3, ['c', 'd'], otherVersion);
  const valid = { pages: [first, second] };
  assert.deepEqual(checkedFeedWindow(valid, applied, today, 2, 3), valid.pages);
  assert.deepEqual(checkedFeedWindow(valid, applied, today, 2, 4), valid.pages);
  const empty = page(2, [], otherVersion, { total: 0, totalPages: 0, nextPage: null, state: 'no-filter-matches',
    coverage: { ...first.coverage, knownFixtures: 0 }, links: { next: null, previous: '/api/matches?page=1' } });
  assert.deepEqual(checkedFeedWindow({ pages: [empty] }, applied, today, 2, 3), [empty]);
  const later = page(3, ['c', 'd'], otherVersion, { asOf: now + 1 });
  for (const candidate of [[], [first], [first, first], [first, later],
    [first, page(3, ['b', 'c'], otherVersion)], [first, page(3, ['c', 'd'], version)],
    [first, page(3, ['c', 'd'], otherVersion, { access: { tier: 'full', signedIn: true } })],
    [first, { ...second, pageSize: 1 }], [first, { ...second, range: { ...second.range, from: '2026-10-01' } }]]) {
    assert.throws(() => checkedFeedWindow({ pages: candidate }, applied, today, 2, 3), error => error.code === 'invalid-response');
  }
});

test('a supported continuation reads the validated window in one same-origin request', async t => {
  const applied = query('pageSize=2');
  const pages = [page(2, ['a', 'b'], otherVersion), page(3, ['c', 'd'], otherVersion)];
  const request = t.mock.method(globalThis, 'fetch', async (href, options) => {
    assert.equal(href, feedWindowApiHref(applied, today, 2, 3));
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return Response.json({ pages });
  });
  assert.deepEqual(await readRefreshFeedWindow(applied, today, 2, 3, new AbortController().signal), pages);
  assert.equal(request.mock.callCount(), 1);
});

test('Show More retries a whole atomic window once and keeps verified membership if any record is stale', async () => {
  const initial = initialLoadedFeed(page(1, ['a', 'b']));
  const noLegacyRead = async () => assert.fail('Supported continuation must not read separate pages');
  const revised = [page(1, ['e', 'a'], otherVersion), page(2, ['b', 'c'], otherVersion)];
  const delays = [];
  let calls = 0;
  const result = await continueFeedPages(initial, noLegacyRead, async delay => { delays.push(delay); return true; }, { readWindow: async () => {
    if (++calls === 1) throw new FeedPaginationError('unavailable', 5_000);
    return revised;
  } });
  assert.deepEqual(delays, [5_000]);
  assert.equal(calls, 2);
  assert.deepEqual(result.records.map(row => row.fixtureId), ['e', 'a', 'b', 'c']);
  const stale = structuredClone(revised);
  stale[0].records[1].dataVersion = '8';
  await assert.rejects(continueFeedPages(initial, noLegacyRead, async () => assert.fail('Stale window cannot retry automatically'),
    { readWindow: async () => stale }), error => error.code === 'stale-data');
  assert.deepEqual(initial.records.map(row => row.fixtureId), ['a', 'b']);
});

test('a same-route server refresh shows new fixtures in place and ignores an older poll', () => {
  const previous = initialLoadedFeed(page(1, ['a', 'b']));
  const serverPage = page(1, ['a', 'c'], otherVersion, { asOf: now + 10 });
  const updated = applyServerFeedPage(previous, serverPage);
  assert.deepEqual(updated.records.map(row => row.fixtureId), ['a', 'c']);
  assert.equal(updated.data.asOf, now + 10);
  assert.equal(applyServerFeedPage(updated, previous.data), updated);
  assert.throws(() => replaceFeedPages(updated, [previous.data]), error => error.code === 'stale-data');
});

test('passive browsing rotates one loaded page and accepts observations only for existing fixture IDs', () => {
  let position = null;
  const pages = Array.from({ length: 5 }, () => (position = nextLoadedPage(position, 2, 4)));
  assert.deepEqual(pages, [2, 3, 4, 2, 3]);
  const original = appendFeedPage(initialLoadedFeed(page(1, ['a', 'b'])), page(2, ['c', 'd']));
  const second = page(2, ['c', 'new'], otherVersion, { asOf: now + 10 });
  second.records[0] = record('c', '10', 'Updated');
  const observed = observeFeedPage(original, second);
  assert.deepEqual(observed.records.map(({ fixtureId }) => fixtureId), ['a', 'b', 'c', 'd']);
  assert.equal(observed.records[0], original.records[0]);
  assert.equal(observed.records[2].homeTeam.name, 'Updated');
  assert.equal(observed.data.paginationVersion, version);
  assert.equal(observed.data.nextPage, original.data.nextPage);
  assert.equal(observeFeedPage(observed, original.data), observed);
});
test('continuous browsing retains all appended pages and can restore them after navigation', () => {
  const batch = (number) => page(number, [`a-${number}`, `b-${number}`], version, {
    total: 26, totalPages: 13, coverage: { ...page(1, ["a", "b"]).coverage, knownFixtures: 26 }, nextPage: number < 13 ? number + 1 : null,
    links: { next: number < 13 ? `/api/matches?page=${number + 1}` : null, previous: number > 1 ? `/api/matches?page=${number - 1}` : null },
  });
  let view = initialLoadedFeed(batch(1));
  for (let number = 2; number <= 12; number++) view = appendFeedPage(view, batch(number));
  assert.equal(view.pages, 12); assert.equal(view.firstPage, 1); assert.equal(view.lastPage, 12);
  assert.equal(view.records.length, 24); assert.equal(view.records[0].fixtureId, 'a-1');
  assert.equal(applyServerFeedPage(view, batch(1)), view, 'a single server page cannot discard an appended cohort');
  const checkpoint = { entryId: 'window', queryKey: 'cohort', href: '/en/matches', firstPage: 1, lastPage: 12,
    scrollY: 2500, focusFixtureId: 'a-12', paginationVersion: version, createdAt: now };
  assert.equal(feedCheckpointSchema.safeParse(checkpoint).success, true);
  assert.equal(matchingFeedCheckpoint([checkpoint], 'window', 'cohort', '/en/matches', 1), checkpoint);
  assert.equal(replaceFeedPages(view, Array.from({ length: 12 }, (_, index) => batch(index + 1))).records.length, 24);
});
test('restoration records contain bounded positions only, scoped to entry, query, initial page and expiry', () => {
  const checkpoint={entryId:'entry-a',queryKey:feedQueryKey(query(),today),href:'/en',firstPage:1,lastPage:3,scrollY:15000,
    focusFixtureId:'fixture-70',paginationVersion:version,createdAt:now};
  let encoded=writeFeedCheckpoint([],checkpoint,now), entries=readFeedCheckpoints(encoded,now+1);
  assert.deepEqual(matchingFeedCheckpoint(entries,'entry-a',checkpoint.queryKey,'/en',1),checkpoint);
  for(const [id,key,href,first] of [['another',checkpoint.queryKey,'/en',1],['entry-a','other','/en',1],['entry-a',checkpoint.queryKey,'/en?page=2',2]]) {
    assert.equal(matchingFeedCheckpoint(entries,id,key,href,first),null);
  }
  assert.deepEqual(readFeedCheckpoints(encoded,now+restorationRules.maximumAgeMilliseconds+1),[]);
  assert.deepEqual(readFeedCheckpoints(encoded,now-1),[]);
  for(let i=0;i<25;i++) { encoded=writeFeedCheckpoint(readFeedCheckpoints(encoded,now+i),{...checkpoint,entryId:`entry-${i}`,createdAt:now+i},now+i); }
  assert.equal(readFeedCheckpoints(encoded,now+25).length,20);
  for(const value of [{...checkpoint,lastPage:feedQueryRules.maximumPage + 1},{...checkpoint,scrollY:Infinity},{...checkpoint,records:[]},{...checkpoint,firstPage:0}]) assert.equal(feedCheckpointSchema.safeParse(value).success,false);
  for(const serialized of ['not json','x'.repeat(65537),JSON.stringify({version:1,entries:[checkpoint,checkpoint]})]) assert.deepEqual(readFeedCheckpoints(serialized,now),[]);
});

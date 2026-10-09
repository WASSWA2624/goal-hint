import assert from 'node:assert/strict';
import test from 'node:test';
import { appendFeedPage, checkedFeedPage, feedPageApiHref, feedPageHref, initialLoadedFeed, replaceFeedPages } from '../src/domain/feed-pagination.ts';
import { feedCheckpointSchema, matchingFeedCheckpoint, readFeedCheckpoints, restorationRules, writeFeedCheckpoint } from '../src/domain/feed-navigation.ts';
import { resolveFeedDates, feedQueryKey } from '../src/domain/feed-query.ts';
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
  return matchFeedResponseSchema.parse({ paginationVersion: token, records: ids.map(id=>record(id)), page: number, nextPage, previousPage,
    pageSize: 2, total: 6, totalPages: 3, links: { next: nextPage ? `/api/matches?page=${nextPage}` : null, previous: previousPage ? `/api/matches?page=${previousPage}` : null },
    asOf: now, today, range: { from: today,to:today,...range.window }, state:'insufficient-data', message:null,
    coverage:{partial:false,knownFixtures:6,matchingWithMarket:0,dates:[{date:today,status:'complete',observedAt:now,authoritative:true}]},run:null,...overrides });
}
test('page URLs retain filters/order/size and pin relative reporting dates', () => {
  const q=query('when=next-7-days&q=Alias&league=league-a&status=live&market=total-goals&sort=probability&pageSize=40');
  assert.equal(feedPageHref(q,today,2),'/en/predictions/2026-10-09?to=2026-10-15&q=Alias&league=league-a&status=live&market=total-goals&sort=probability&page=2&pageSize=40');
  assert.match(feedPageApiHref(q,today,2),/^\/api\/matches\?from=2026-10-09&to=2026-10-15&q=Alias&league=league-a&status=live&market=total-goals&sort=probability&page=2&pageSize=40$/u);
  assert.throws(()=>feedPageHref(q,today,0));
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
test('restoration records contain bounded positions only, scoped to entry, query, initial page and expiry', () => {
  const checkpoint={entryId:'entry-a',queryKey:feedQueryKey(query(),today),href:'/en',firstPage:1,lastPage:3,scrollY:15000,
    focusFixtureId:'fixture-70',paginationVersion:version,savedAt:now};
  let encoded=writeFeedCheckpoint([],checkpoint,now), entries=readFeedCheckpoints(encoded,now+1);
  assert.deepEqual(matchingFeedCheckpoint(entries,'entry-a',checkpoint.queryKey,'/en',1),checkpoint);
  for(const [id,key,href,first] of [['another',checkpoint.queryKey,'/en',1],['entry-a','other','/en',1],['entry-a',checkpoint.queryKey,'/en?page=2',2]]) {
    assert.equal(matchingFeedCheckpoint(entries,id,key,href,first),null);
  }
  assert.deepEqual(readFeedCheckpoints(encoded,now+restorationRules.maximumAgeMilliseconds+1),[]);
  assert.deepEqual(readFeedCheckpoints(encoded,now-1),[]);
  for(let i=0;i<25;i++) { encoded=writeFeedCheckpoint(readFeedCheckpoints(encoded,now+i),{...checkpoint,entryId:`entry-${i}`,savedAt:now+i},now+i); }
  assert.equal(readFeedCheckpoints(encoded,now+25).length,20);
  for(const value of [{...checkpoint,lastPage:11},{...checkpoint,scrollY:Infinity},{...checkpoint,records:[]},{...checkpoint,firstPage:0}]) assert.equal(feedCheckpointSchema.safeParse(value).success,false);
  for(const serialized of ['not json','x'.repeat(65537),JSON.stringify({version:1,entries:[checkpoint,checkpoint]})]) assert.deepEqual(readFeedCheckpoints(serialized,now),[]);
});

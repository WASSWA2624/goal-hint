import assert from 'node:assert/strict';
import test from 'node:test';
import { completedFixtureStatuses, isCompletedFixtureStatus, settlementStatuses } from '../src/domain/market-settlement.ts';
import { parseFeedQuery, resolveFeedDates } from '../src/domain/feed-query.ts';
import { gateDetailResponse } from '../src/domain/paywall.ts';
import { matchDetailResponseSchema, storedMatchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { storedMatchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';
import { storedFeedSearch } from '../src/server/matches/feed-search.ts';
import { createMatchFeedService, storedFeedPaginationVersion } from '../src/server/matches/feed-service.ts';
import { createMatchFeedSummaryService } from '../src/server/matches/feed-summary-service.ts';
import { createMatchFeedSummaryHandler } from '../src/server/matches/feed-summary-http.ts';
import { createMatchInsightsHandler } from '../src/server/matches/insights-service.ts';
import { createGatedReads } from '../src/server/members/gated-reads.ts';
import { liveFeed, liveRecord, today, now } from './helpers/live-refresh-fixtures.mjs';
import { scenarios, sentinel } from './helpers/paywall-fixtures.mjs';

const free = { tier: 'free', signedIn: false, mode: 'off' }, full = { ...free, tier: 'full' };
const clock = { now: () => now };
const stored = (records) => { const feed = liveFeed(records); delete feed.access; return storedMatchFeedResponseSchema.parse(feed); };

test('only canonical terminal fixture statuses establish completion, regardless of kickoff date', () => {
  assert.deepEqual(settlementStatuses.filter(isCompletedFixtureStatus), [...completedFixtureStatuses]);
  for (const status of ['scheduled', 'live', 'postponed', 'unknown']) assert.equal(isCompletedFixtureStatus(status), false);
});

test('public SQL restricts the full cohort, counts, ranked picks and search before LIMIT and OFFSET', async () => {
  const query = parseFeedQuery({ from: '2026-10-01', to: today }, { today }), range = resolveFeedDates(query, today);
  const publicSql = feedSql(query, range, [39], false, null, true), memberSql = feedSql(query, range, [39]);
  for (const statement of [publicSql.scope, publicSql.where, publicSql.cohortWhere, publicSql.joins]) {
    assert.match(statement.sql, /f\.status IN \(\?,\?,\?,\?,\?,\?\)/u);
    for (const status of completedFixtureStatuses) assert.ok(statement.values.includes(status));
  }
  assert.doesNotMatch(memberSql.scope.sql, /f\.status IN/u);
  const live = feedSql({ ...query, status: 'live' }, range, [39], false, null, true);
  assert.ok(live.where.values.includes('live'), 'an explicit active filter intersects the completed cohort and returns no active rows');
  let searchSql;
  await storedFeedSearch({ $queryRaw: async (statement) => { searchSql = statement; return []; } }, 'Arsenal', range, [39], 'en', true);
  for (const status of completedFixtureStatuses) assert.ok(searchSql.values.includes(status), 'search catalog excludes unfinished fixture identities too');
});

test('raw caches and pagination versions distinguish completed public cohorts from subscriber cohorts', async () => {
  const query = parseFeedQuery({ date: today }, { today }), range = resolveFeedDates(query, today);
  const tx = { publicCacheTag: { findMany: async () => [] } };
  const member = await storedFeedPaginationVersion(tx, query, today, range, [39], false);
  const guest = await storedFeedPaginationVersion(tx, query, today, range, [39], true);
  assert.notEqual(member, guest);
  for (const create of [createMatchFeedService, createMatchFeedSummaryService]) {
    const keys = [], service = create({ database: {}, competitionIds: [39], clock,
      cache: { read: async (descriptor) => { keys.push(descriptor.key); return {}; } } });
    await service.query(new URLSearchParams({ date: today }), { completedOnly: false });
    await service.query(new URLSearchParams({ date: today }), { completedOnly: true });
    assert.notEqual(keys[0], keys[1]);
  }
});

test('guests and unsubscribed members read completed fixtures only, while subscribers retain active fixtures', async () => {
  const records = ['scheduled', 'live', 'finished-regulation', 'canceled'].map((status, index) => liveRecord({
    fixtureId: `fixture-${index}`, status, kickoffAt: now - 2 * 86400000,
  }));
  for (const access of [free, { ...free, signedIn: true }, full]) {
    const contexts = [];
    const result = await createGatedReads({ resolveAccess: async () => access, readFeed: async (_query, context) => {
      contexts.push(context); return stored(records.filter((record) => !context.completedOnly || isCompletedFixtureStatus(record.status)));
    } }).feed(new URLSearchParams({ from: '2026-10-01', to: today }), {}, clock);
    assert.equal(contexts[0].completedOnly, access.tier === 'free');
    assert.deepEqual(result.records.map((record) => record.status), access.tier === 'full'
      ? ['scheduled', 'live', 'finished-regulation', 'canceled'] : ['finished-regulation', 'canceled']);
    assert.equal(result.total, result.records.length);
  }
});

test('an expired subscription re-reads the completed cohort rather than relabeling cached active rows as public', async () => {
  let checks = 0; const contexts = [], records = [liveRecord({ status: 'live' })];
  const response = await createGatedReads({ resolveAccess: async () => checks++ === 0 ? full : free,
    readFeed: async (_query, context) => { contexts.push(context.completedOnly); return stored(context.completedOnly ? [] : records); },
  }).feed(new URLSearchParams({ date: today }), {}, clock);
  assert.deepEqual(contexts, [false, true]); assert.equal(response.total, 0); assert.deepEqual(response.records, []);
  assert.equal(response.access.tier, 'free');
  await assert.rejects(createGatedReads({ resolveAccess: async () => free, readFeed: async () => stored(records) })
    .feed(new URLSearchParams({ date: today }), {}, clock), (error) => error.code === 'unavailable');
});

test('unfinished current and historical details withhold every forecast chance, history and live envelope', () => {
  for (const scenario of [scenarios.scheduled, scenarios.live, scenarios.postponed, scenarios['prior-cycle']]) {
    for (const source of [scenario.detail, scenario.prior]) {
      const result = matchDetailResponseSchema.parse(gateDetailResponse(source, free));
      assert.deepEqual(result.history, { gated: true }); assert.equal(result.odds, undefined); assert.equal(result.liveMatch ?? null, null);
      assert.ok(!result.snapshot || result.snapshot.probabilities.length === 0);
      assert.ok(!result.fixture.forecast || result.fixture.forecast.probabilities.length === 0);
      assert.doesNotMatch(JSON.stringify(result), /SENTINEL-|7\.73|0\.6173|"home-win"/u);
      if (result.snapshot) assert.equal(matchDetailResponseSchema.safeParse({ ...result,
        snapshot: { ...result.snapshot, probabilities: [{ family: 'match-result', probability: sentinel.probability }] } }).success, false);
    }
  }
  const completedToday = storedMatchDetailResponseSchema.parse({ ...scenarios['finished-regulation'].detail,
    fixture: { ...scenarios['finished-regulation'].detail.fixture, kickoffAt: now - 3600000 } });
  assert.deepEqual(gateDetailResponse(completedToday, free).snapshot, completedToday.snapshot, 'current-day completion is public too');
});

test('public summaries use the completed scope and re-read it on expiry so counts match public lists', async () => {
  for (const expires of [false, true]) {
    let checks = 0; const scopes = [];
    const response = await createMatchFeedSummaryHandler(async (_parameters, context) => {
      scopes.push(context.completedOnly); const total = context.completedOnly ? 2 : 5;
      return { performance: { total, won: total, lost: 0, pending: 0, void: 0, unavailable: 0 }, paginationVersion: 'a'.repeat(64), asOf: now };
    }, clock, async () => expires && checks++ === 0 ? full : free)(new Request(`https://example.test/api/matches/summary?date=${today}`));
    assert.equal(response.status, 200); assert.deepEqual(scopes, expires ? [false, true] : [true]);
    assert.equal((await response.json()).performance.total, 2);
  }
});

test('a build finishing after subscription expiry cannot release predictions', async () => {
  let checks = 0;
  await assert.rejects(createGatedReads({ resolveAccess: async () => checks++ === 0 ? full : free,
    readSlips: async () => ({ state: 'generated', data: { slips: ['private-prediction'] } }),
  }).slips({}), (error) => error.code === 'subscription-required');
  assert.equal(checks, 2);
});

test('unfinished match insights have no public section API bypass, including after expiry and failed status verification', async () => {
  const fixture = scenarios.scheduled;
  for (const status of ['scheduled', 'live', 'postponed', 'unknown']) {
    for (const signedIn of [false, true]) {
      const response = await createMatchInsightsHandler(async () => fixture.insights, {
        resolveAccess: async () => ({ ...free, signedIn }), readStatus: async () => status,
      })(new Request(`https://example.test/api/matches/${fixture.detail.fixture.fixtureId}/insights?section=form`),
        { params: Promise.resolve({ id: fixture.detail.fixture.fixtureId }) });
      assert.equal(response.status, 403); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json(); assert.equal(body.error.code, 'subscription-required');
      assert.doesNotMatch(JSON.stringify(body), /sections|fixtureId|form|SENTINEL/u);
    }
  }
  let expired = false;
  await assert.rejects(createGatedReads({ resolveAccess: async () => expired ? free : full,
    readInsights: async () => { expired = true; return fixture.insights; }, readStatus: async () => 'live',
  }).insights(fixture.detail.fixture.fixtureId), (error) => error.code === 'subscription-required');
  const member = await createGatedReads({ resolveAccess: async () => full, readInsights: async () => fixture.insights,
    readStatus: async () => { assert.fail('subscribers do not need a completed fixture'); },
  }).insights(fixture.detail.fixture.fixtureId);
  assert.deepEqual(member.sections, fixture.insights.sections);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { storedLiveMatchSnapshot } from '../src/server/live-match/live-match-read.ts';
import { matchDetailResponseSchema, storedMatchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { gateDetailResponse } from '../src/domain/paywall.ts';
import { mergeLiveDetail } from '../src/domain/live-refresh.ts';
import { liveDetail } from './helpers/live-refresh-fixtures.mjs';
import { liveMatchViewSnapshot, liveMatchViewIdentity, liveMatchViewNow } from './helpers/live-match-view-fixtures.mjs';

const scope = { ...liveMatchViewIdentity, asOf: liveMatchViewNow };
const row = (body = liveMatchViewSnapshot()) => ({ receivedAt: new Date(body.collectedAt), bodyJson: body, sealed: 1 });

test('future scheduled detail skips optional observation reads while an explicit historical selection can inspect retained data', async () => {
  const wire = liveDetail(), { access: _access, ...body } = wire;
  void _access;
  const stored = storedMatchDetailResponseSchema.parse(body);
  stored.fixture.kickoffAt = stored.asOf + 86_400_000;
  let optionalReads = 0;
  const database = { transaction: async () => { throw new Error('The stored projection should be cached.'); },
    query: async (operation) => { optionalReads++; return operation({ async $queryRaw() { return []; } }); } };
  const cache = { read: async () => stored };
  const service = createMatchDetailService({ database, cache, clock: { now: () => stored.asOf }, allowLiveMatch: true });
  const response = await service.query(stored.fixture.fixtureId);
  assert.equal(stored.fixture.status, 'scheduled'); assert.equal(optionalReads, 0);
  assert.equal('liveMatch' in response, false); assert.equal(response.snapshot, stored.snapshot);
  assert.deepEqual(response.snapshot.markets, wire.snapshot.markets);
  stored.selection = 'cycle';
  const historical = await service.query(stored.fixture.fixtureId, new URLSearchParams({ cycle: stored.selectedCycle.id }));
  assert.equal(optionalReads, 1); assert.equal(historical.liveMatch, null);
});
test('stored match reader preserves exact observations, zeroes, null missingness and independent clocks', async () => {
  const snapshot = liveMatchViewSnapshot({ statistics: { ...liveMatchViewSnapshot().statistics, state: 'partial', reason: 'incomplete-response',
    items: [{ metric: 'corners', unit: 'count', home: 0, away: null }] } });
  let queries = 0;
  const result = await storedLiveMatchSnapshot({ async $queryRaw(_query, ...parameters) {
    queries++; assert.equal(parameters[0], scope.fixtureId); assert.equal(parameters[1], scope.cycleId);
    assert.equal(parameters[2].getTime(), scope.kickoffAt); return [row(snapshot)];
  } }, scope);
  assert.equal(queries, 1); assert.deepEqual(result, snapshot);
  assert.equal(result.statistics.items[0].home, 0); assert.equal(result.statistics.items[0].away, null);
  assert.equal(result.statistics.providerUpdatedAt, null); assert.notEqual(result.events.retrievedAt, result.statistics.retrievedAt);
});
test('reader withholds corrupt, future, oversized, duplicate and foreign occurrence bodies and fails soft on storage outage', async () => {
  const original = row();
  for (const rows of [[], [original, original], [{ ...original, sealed: 0 }], [{ ...original, receivedAt: null }],
    [{ ...original, receivedAt: new Date(original.receivedAt.getTime() - 1) }],
    [row({ ...original.bodyJson, fixtureId: randomUUID() })], [row({ ...original.bodyJson, cycleId: randomUUID() })],
    [row({ ...original.bodyJson, kickoffAt: scope.kickoffAt - 1 })], [row({ ...original.bodyJson, collectedAt: scope.asOf + 1 })],
    [{ ...original, bodyJson: '{malformed' }], [{ ...original, bodyJson: { private: 'x'.repeat(300_001) } }]]) {
    assert.equal(await storedLiveMatchSnapshot({ async $queryRaw() { return rows; } }, scope), null);
  }
  assert.equal(await storedLiveMatchSnapshot({ async $queryRaw() { throw new Error('private database diagnostic'); } }, scope), null);
});
test('public detail withholds unfinished match observations and releases them once the fixture completes', () => {
  const detail = liveDetail(), liveMatch = liveMatchViewSnapshot({ fixtureId: detail.fixture.fixtureId, cycleId: detail.fixture.cycleId,
    kickoffAt: detail.fixture.kickoffAt, collectedAt: detail.asOf, statistics: { ...liveMatchViewSnapshot().statistics, retrievedAt: detail.asOf - 20_000 },
    events: { ...liveMatchViewSnapshot().events, retrievedAt: detail.asOf - 10_000, providerUpdatedAt: null } });
  const full = matchDetailResponseSchema.parse({ ...detail, liveMatch });
  const free = matchDetailResponseSchema.parse(gateDetailResponse(full, { tier: 'free', signedIn: false }));
  assert.equal(free.liveMatch, null); assert.equal(free.snapshot.gated, true); assert.equal(free.fixture.forecast.gated, true);
  assert.deepEqual(free.snapshot.probabilities, []); assert.deepEqual(free.fixture.forecast.probabilities, []);
  const completed = matchDetailResponseSchema.parse(gateDetailResponse({ ...full,
    fixture: { ...full.fixture, status: 'finished-regulation' } }, { tier: 'free', signedIn: false }));
  assert.deepEqual(completed.liveMatch, full.liveMatch); assert.deepEqual(completed.snapshot, full.snapshot);
  assert.equal(full.snapshot.revisionId, detail.snapshot.revisionId); assert.deepEqual(full.snapshot.markets, detail.snapshot.markets);
  for (const replacement of [{ ...liveMatch, cycleId: randomUUID() }, { ...liveMatch, fixtureId: randomUUID() },
    { ...liveMatch, kickoffAt: liveMatch.kickoffAt - 1 }, { ...liveMatch, collectedAt: detail.asOf + 1 }]) {
    assert.equal(matchDetailResponseSchema.safeParse({ ...full, liveMatch: replacement }).success, false);
  }
});
test('live detail accepts independent match updates without revising forecasts and never restores older same-occurrence data', () => {
  const previous = liveDetail(), base = liveMatchViewSnapshot({ fixtureId: previous.fixture.fixtureId, cycleId: previous.fixture.cycleId,
    kickoffAt: previous.fixture.kickoffAt, collectedAt: previous.asOf - 1, statistics: { ...liveMatchViewSnapshot().statistics, retrievedAt: previous.asOf - 20_000 },
    events: { ...liveMatchViewSnapshot().events, retrievedAt: previous.asOf - 10_000, providerUpdatedAt: null } });
  previous.liveMatch = base;
  const next = structuredClone(previous); next.asOf++; next.liveMatch.collectedAt++;
  next.liveMatch.statistics.items[1].home = 1;
  const accepted = mergeLiveDetail(previous, next);
  assert.equal(accepted.snapshot, previous.snapshot); assert.equal(accepted.fixture.forecast.publishedAt, previous.fixture.forecast.publishedAt);
  assert.equal(accepted.liveMatch.statistics.items[1].home, 1);
  const late = structuredClone(previous); late.asOf = next.asOf + 1;
  assert.equal(mergeLiveDetail(accepted, late).liveMatch, accepted.liveMatch);
  const disabled = { ...next }; delete disabled.liveMatch;
  assert.equal(mergeLiveDetail(accepted, disabled).liveMatch, undefined);
  assert.equal(mergeLiveDetail(accepted, { ...next, liveMatch: null }).liveMatch, null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { fixtureUpdateSchema } from '../src/domain/fixture-snapshot.ts';
import { settleMarketSelection } from '../src/domain/market-settlement.ts';
import { coordinatedResultDefaults } from '../src/server/results/result-sync-policy.ts';
import { projectFixtureStatusFreshness } from '../src/server/results/result-status-freshness.ts';

const asOf = Date.parse('2026-11-20T23:00:00Z'), minute = 60_000;
const scheduled = { status: 'scheduled', providerStatus: 'NS', kickoffAt: asOf, asOf,
  canonicalRetrievedAt: asOf - 30 * minute, lastVerifiedAt: null, nextCheckAt: asOf + minute,
  hasVerifiedRegulation: false, delayed: false };

test('a passed scheduled kickoff is awaiting an update while its source status and settlement stay independent', () => {
  assert.equal(projectFixtureStatusFreshness({ ...scheduled, asOf: asOf - 1 }).state, 'current');
  assert.equal(projectFixtureStatusFreshness({ ...scheduled, asOf: asOf - 1, providerStatus: 'TBD' }).state, 'awaiting-update');
  const freshness = projectFixtureStatusFreshness(scheduled);
  assert.deepEqual(freshness, { state: 'awaiting-update', providerStatus: 'NS',
    lastVerifiedAt: scheduled.canonicalRetrievedAt, nextCheckAt: scheduled.nextCheckAt });
  const settlement = settleMarketSelection('match-result', 'away-win', { status: scheduled.status,
    cycleEligibility: { eligible: true }, regulationScore: null });
  assert.equal(settlement.status, 'pending');
  assert.ok(Object.isFrozen(freshness));
});

test('live status freshness uses the verified clock and keeps the persisted retry separate', () => {
  const live = { ...scheduled, status: 'live', providerStatus: '2H', nextCheckAt: asOf - minute,
    canonicalRetrievedAt: asOf - 2 * minute, lastVerifiedAt: asOf - coordinatedResultDefaults.liveMs };
  const fresh = projectFixtureStatusFreshness(live);
  assert.equal(fresh.state, 'current');
  assert.equal(fresh.lastVerifiedAt, live.lastVerifiedAt);
  assert.deepEqual(projectFixtureStatusFreshness({ ...live, asOf: asOf + 1 }), { ...fresh, state: 'awaiting-update' });
  assert.equal(projectFixtureStatusFreshness({ ...live, delayed: true }).state, 'awaiting-update');
  assert.equal(projectFixtureStatusFreshness({ ...live, lastVerifiedAt: asOf + minute }).lastVerifiedAt, live.canonicalRetrievedAt);
});

test('played-final status is retained while regulation evidence is awaited and administrative status stays authoritative', () => {
  const finished = { ...scheduled, status: 'finished-extra-time', providerStatus: 'AET', nextCheckAt: 0,
    canonicalRetrievedAt: asOf - 1000 };
  assert.deepEqual(projectFixtureStatusFreshness(finished), { state: 'awaiting-update', providerStatus: 'AET',
    lastVerifiedAt: finished.canonicalRetrievedAt, nextCheckAt: null });
  assert.equal(projectFixtureStatusFreshness({ ...finished, hasVerifiedRegulation: true }).state, 'current');
  assert.equal(projectFixtureStatusFreshness({ ...finished, status: 'canceled', providerStatus: 'CANC' }).state, 'current');
  assert.equal(projectFixtureStatusFreshness({ ...finished, status: 'unknown', providerStatus: 'TBD' }).state, 'unverified');
});

test('the wire schema accepts old records and rejects impossible new assertions of verified freshness', () => {
  const old = { prediction: 'locked', result: 'delayed' };
  assert.deepEqual(fixtureUpdateSchema.parse(old), old);
  assert.deepEqual(fixtureUpdateSchema.parse({ ...old, statusFreshness: projectFixtureStatusFreshness(scheduled) }).statusFreshness,
    projectFixtureStatusFreshness(scheduled));
  assert.equal(fixtureUpdateSchema.safeParse({ ...old, statusFreshness: { state: 'current', providerStatus: 'NS',
    lastVerifiedAt: null, nextCheckAt: null } }).success, false);
});

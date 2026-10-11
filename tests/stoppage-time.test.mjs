import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { liveClockFromProvider } from '../src/domain/match-card.ts';
import { normalizeFixture } from '../src/server/football/api-football-normalize.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { lifecycleContentHash } from '../src/server/predictions/lifecycle-policy.ts';
import { fixtureResultFromRow } from '../src/server/results/result-read.ts';
import { makeStore, beginFeedRequest } from '../src/state/store.ts';
import { pageReceived } from '../src/state/feed.ts';
import { catalogFixture } from './helpers/catalog-fixtures.mjs';
import { cardFixture } from './helpers/match-card-fixtures.mjs';
import { bootstrap } from './helpers/client-state-fixtures.mjs';

const at = Date.parse('2026-10-11T12:00:00Z');
const fixtureId = '10000000-0000-4000-8000-000000000001';
function normalized(extra) {
  const raw = catalogFixture(101, { status: 'LIVE' });
  raw.fixture.status.elapsed = 90;
  if (extra !== undefined) raw.fixture.status.extra = extra;
  return normalizeFixture(raw, { retrievedAt: at, endpoint: '/fixtures' });
}
function observation(extra) {
  const result = normalized(extra);
  assert.equal(result.valid, true);
  return parseLifecycleInput({ fixtureId, fixture: result.data, actualStartedAt: null,
    actor: 'synthetic-clock-test', evidenceRef: 'synthetic-clock-evidence' });
}

test('provider additional minutes survive normalization and lifecycle without changing absent legacy fields', () => {
  assert.equal(normalized(4).data.stoppageMinutes, 4);
  assert.equal(observation(4).stoppageMinutes, 4);
  assert.equal(observation(null).stoppageMinutes, null);
  assert.equal(Object.hasOwn(observation(), 'stoppageMinutes'), false);
  assert.notEqual(lifecycleContentHash(observation(4)), lifecycleContentHash(observation(5)));
  for (const invalid of [-1, 1.5, 1001, '4']) assert.equal(normalized(invalid).valid, false);
});

test('running clocks retain supplied stoppage notation and paused clocks never display stale minutes', () => {
  assert.deepEqual(liveClockFromProvider('2H', 90, 4), { phase: 'second-half', minute: 90, stoppageMinutes: 4 });
  assert.deepEqual(liveClockFromProvider('1H', 45, 2), { phase: 'first-half', minute: 45, stoppageMinutes: 2 });
  assert.deepEqual(liveClockFromProvider('ET', 120, 1), { phase: 'extra-time', minute: 120, stoppageMinutes: 1 });
  for (const extra of [undefined, null, 0, -1, 1.5, 1001]) {
    assert.deepEqual(liveClockFromProvider('2H', 90, extra), { phase: 'second-half', minute: 90 });
  }
  assert.deepEqual(liveClockFromProvider('HT', 45, 2), { phase: 'half-time', minute: null });
  assert.deepEqual(liveClockFromProvider('2H', null, 2), { phase: 'second-half', minute: null });
});

test('sealed result hashes accept legacy bodies and protect newly supplied stoppage minutes', () => {
  const legacy = { id: 'a'.repeat(64), fixtureId, fixtureVersion: 8n, previousId: null,
    observationId: 'b'.repeat(64), observedAt: at, providerUpdatedAt: null, regulationVerifiedAt: null,
    status: 'live', providerStatus: '2H', elapsedMinutes: 90, reportedGoals: { home: 1, away: 0 },
    extraTimeScore: { home: null, away: null }, penaltyScore: { home: null, away: null },
    regulation: { verified: false, home: null, away: null, evidenceRef: null } };
  for (const body of [legacy, { ...legacy, stoppageMinutes: 4 }, { ...legacy, stoppageMinutes: null }]) {
    const contentKeys = ['status', 'providerStatus', 'elapsedMinutes', 'reportedGoals', 'extraTimeScore', 'penaltyScore', 'regulation',
      ...(Object.hasOwn(body, 'stoppageMinutes') ? ['stoppageMinutes'] : [])];
    const content = Object.fromEntries(contentKeys.map((key) => [key, body[key]]));
    const row = { id: body.id, fixtureId, fixtureVersion: body.fixtureVersion, observedAt: new Date(at), status: body.status,
      regulationVerified: 0, regulationHome: null, regulationAway: null, contentHash: evidenceFingerprint(content),
      body: evidenceSerialize(body), validIntegrity: 1n };
    const result = fixtureResultFromRow(row);
    assert.deepEqual(result, body);
    assert.deepEqual(liveClockFromProvider(result.providerStatus, result.elapsedMinutes, result.stoppageMinutes),
      liveClockFromProvider('2H', 90, body.stoppageMinutes));
    assert.throws(() => fixtureResultFromRow({ ...row, body: evidenceSerialize({ ...body, stoppageMinutes: 5 }) }));
  }
});

test('public live payloads accept stoppage time and versioned refresh replaces the complete clock', () => {
  const previous = cardFixture({ fixtureId, status: 'live', score: { home: 1, away: 0 }, dataVersion: '8',
    liveClock: liveClockFromProvider('2H', 90, 4) }, 'ai', null);
  assert.equal(parseFixtureSnapshot(previous).liveClock.stoppageMinutes, 4);
  const next = { ...previous, dataVersion: '9', liveClock: liveClockFromProvider('2H', 90, 5) };
  const store = makeStore({ ...bootstrap(), data: { records: [previous], page: 1, nextPage: null } });
  for (const record of [next, previous]) {
    const request = beginFeedRequest(store, { page: 1, mode: 'refresh' });
    store.dispatch(pageReceived({ request, data: { records: [record], page: 1, nextPage: null } }));
    assert.equal(store.getState().feed.records[fixtureId].liveClock.stoppageMinutes, 5);
  }
  assert.throws(() => parseFixtureSnapshot({ ...previous, liveClock: { ...previous.liveClock, stoppageMinutes: -1 } }));
});

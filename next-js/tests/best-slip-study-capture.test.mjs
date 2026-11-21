import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipCombinationIdentity } from '../src/domain/best-slips.ts';
import { getReportingDate, getReportingDayBounds } from '../src/domain/calendar.ts';
import { preMatchReferenceOddsFreshMs } from '../src/domain/reference-odds.ts';
import { captureBestSlipStudy } from '../src/server/slips/best-slip-study-capture.ts';
import { parseBestSlipStudyCapture } from '../src/server/slips/best-slip-study-contract.ts';

const now = Date.parse('2026-11-21T10:00:00Z');
const uuid = (id) => `a0000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

function original(id, odds, bookmakerId, overrides = {}) {
  const bookmakerName = `Book ${bookmakerId}`;
  return {
    fixtureId: uuid(id), kickoffAt: now + 3_600_000, source: 'local-engine',
    homeTeam: { id: uuid(1000 + id), name: `Home ${id}` }, awayTeam: { id: uuid(2000 + id), name: `Away ${id}` },
    competition: { id: uuid(301), name: 'Synthetic league', country: 'Uganda' },
    family: 'total-goals', selection: 'under-1.5', probability: 0.8, odds, oddsBasis: 'bookmaker',
    bookmaker: { id: bookmakerId, name: bookmakerName },
    forecast: { cycleId: uuid(3000 + id), revisionId: uuid(4000 + id), publishedAt: now - 20_000 },
    offer: { bookmakerId, bookmakerName, betId: 5, betName: 'Goals Over/Under', providerSelection: 'Under 1.5',
      decimal: odds, observedAt: now - 10_000, checkedAt: now - 5000, providerUpdatedAt: null,
      snapshotId: String(id).padStart(64, '0'), receiptId: String(id + 1).padStart(64, '0') },
    ...overrides,
  };
}

function scenario(selections, times = [now, now + 1000]) {
  const probes = [], day = getReportingDate(times[0]), window = getReportingDayBounds(day);
  let next = 0;
  const database = { async query(operation) {
    return operation({ async $queryRaw(parts) {
      probes.push(parts.join(''));
      return [{ at: new Date(times[next++]) }];
    } });
  } };
  const read = async (query, context, clock) => {
    assert.equal(query.get('from'), day);
    assert.equal(query.get('to'), day);
    assert.equal(query.get('status'), 'scheduled');
    assert.deepEqual(context, { featured: true });
    assert.equal(clock.now(), times[0]);
    return { asOf: times[0], today: day, range: { from: day, to: day, ...window },
      records: selections.map(({ fixtureId }) => ({ fixtureId })), featuredSelections: selections,
      searchLimited: false, partialCoverage: false };
  };
  return { probes, database, read, window };
}

test('study uses original exact quotes with disjoint fixtures and no whole-slip estimate', async () => {
  const a = original(1, '1.44', 1), b = original(2, '3.47', 1);
  const c = original(3, '2.53', 2), d = original(4, '3.12', 2);
  const sharedTeam = original(5, '1.86', 3);
  const tomorrow = getReportingDayBounds(getReportingDate(now)).endExclusive;
  const selections = [a, b, c, d, sharedTeam, original(6, '1.86', 3, { awayTeam: sharedTeam.homeTeam }),
    original(7, '3.75', 4, { source: 'api-football' }), original(8, '3.75', 4, { probability: 0.7499 }),
    original(9, '3.75', 4, { kickoffAt: tomorrow })];
  const fixture = scenario(selections);
  const capture = await captureBestSlipStudy(fixture.database, [2, 1], { environment: 'production', read: fixture.read });
  assert.deepEqual(fixture.probes, ['SELECT UTC_TIMESTAMP(3) AS at', 'SELECT UTC_TIMESTAMP(3) AS at']);
  assert.equal(capture.examined, 9);
  assert.equal(capture.eligible, 6);
  assert.deepEqual(capture.slates.map(({ band, slip }) => [band, slip.totalOdds]), [['1.5-5', '5.00'], ['5-10', '7.89']]);
  assert.deepEqual(capture.slates[0].slip.selections, [a, b]);
  assert.ok(capture.slates.every(({ slip }) => slip.id === bestSlipCombinationIdentity(slip.selections)
    && !Object.hasOwn(slip, 'estimatedProbability')));
  assert.equal(new Set(capture.slates.flatMap(({ slip }) => slip.selections.map(({ fixtureId }) => fixtureId))).size, 4);
  assert.deepEqual(parseBestSlipStudyCapture(JSON.parse(JSON.stringify(capture))), capture);

  const reversed = scenario(selections.toReversed());
  const repeated = await captureBestSlipStudy(reversed.database, [1, 2], { environment: 'production', read: reversed.read });
  assert.deepEqual(repeated, capture);

  const primary = scenario(selections);
  const selected = await captureBestSlipStudy(primary.database, [1, 2], { environment: 'production', primaryBookmakerId: 2, read: primary.read });
  assert.notEqual(selected.scopeHash, capture.scopeHash);
  assert.equal(selected.eligible, 2);
  assert.deepEqual(selected.slates.map(({ band }) => band), ['5-10']);
  assert.ok(selected.slates[0].slip.selections.every(({ bookmaker, offer }) => bookmaker.id === 2 && offer.bookmakerId === 2));
});

test('quotes or fixtures that expire before the database capture clock leave honest empty slates', async () => {
  const nowCutoff = now + 5000;
  const atCutoff = original(2, '1.86', 1, { kickoffAt: nowCutoff + 5 * 60_000 });
  const stale = original(4, '1.86', 2);
  stale.offer.observedAt = now - preMatchReferenceOddsFreshMs;
  const fixture = scenario([original(1, '1.86', 1), atCutoff, original(3, '1.86', 2), stale], [now, nowCutoff]);
  const capture = await captureBestSlipStudy(fixture.database, [1], { read: fixture.read });
  assert.equal(capture.observedAt, now);
  assert.equal(capture.capturedAt, nowCutoff);
  assert.equal(capture.examined, 4);
  assert.equal(capture.eligible, 2);
  assert.deepEqual(capture.slates, []);
});

test('a stale read, backwards database clock or Kampala rollover cannot seal a cohort', async () => {
  const midnight = Date.parse('2026-11-21T21:00:00Z');
  for (const times of [[now, now + 30_001], [now, now - 1], [midnight - 1, midnight]]) {
    const fixture = scenario([], times);
    await assert.rejects(() => captureBestSlipStudy(fixture.database, [1], { read: fixture.read }), /time boundary/);
  }
  const empty = scenario([]);
  const capture = await captureBestSlipStudy(empty.database, [1], { read: empty.read });
  assert.deepEqual([capture.examined, capture.eligible, capture.slates], [0, 0, []]);
});

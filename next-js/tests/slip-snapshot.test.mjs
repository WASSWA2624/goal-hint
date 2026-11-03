import assert from 'node:assert/strict';
import test from 'node:test';
import { indexSlipResults, slipSnapshotOutcome, slipResultView, slipSnapshotSchema, slipSnapshotRules } from '../src/domain/slip-snapshot.ts';
import { liveRecord, now } from './helpers/live-refresh-fixtures.mjs';

const record = liveRecord(), id = '10000000-0000-4000-8000-000000000099';
const slip = { id: 'server-generated-selection', selections: [{ fixtureId: id, kickoffAt: now + 3600000,
  homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition,
  family: 'match-result', selection: 'home-win', probability: 0.7, odds: '2.00', oddsBasis: 'bookmaker' }],
  totalOdds: '2.00', oddsBasis: 'bookmaker', averageProbability: 0.7 };
const result = { fixtureId: id, status: 'finished-regulation', regulationVerified: true, regulationHome: 2, regulationAway: 1 };

test('history result indexing stays linear and preserves multiple original cycles and first-match order', () => {
  let reads = 0;
  const results = Array.from({ length: 5_000 }, (_, index) => ({ ...result,
    get fixtureId() { reads++; return String(index); } }));
  const forecast = { cycleId: '10000000-0000-4000-8000-000000000001', revisionId: '10000000-0000-4000-8000-000000000002', publishedAt: now };
  const bound = { ...slip, selections: [{ ...slip.selections[0], forecast }] };
  const foreign = { ...result, forecast: { ...forecast, cycleId: 'replacement' }, family: 'match-result', selection: 'home-win', completed: true };
  const original = { ...foreign, forecast, regulationHome: 0 }, duplicate = { ...original, regulationHome: 5 };
  results.push(foreign, original, duplicate);
  const resultsFor = indexSlipResults(results);
  for (let index = 0; index < 5_000; index++) assert.equal(resultsFor({ ...slip, selections: [{ ...slip.selections[0], fixtureId: String(index) }] }).length, 1);
  assert.ok(reads <= 10_000, `${reads} fixture reads must grow with the batch, not slip count times batch size.`);
  assert.deepEqual(resultsFor(bound), [foreign, original, duplicate]);
  assert.deepEqual(slipResultView('original', '', bound, resultsFor(bound)), slipResultView('original', '', bound, results));
  assert.equal(slipResultView('original', '', bound, resultsFor(bound)).outcome, 'lost');
});

test('slip snapshots preserve long slips and exact uncapped totals within independent storage bounds', () => {
  const long = { ...slip, id: 'source:'.repeat(1000),
    selections: Array.from({ length: 9 }, (_, index) => ({ ...slip.selections[0],
      fixtureId: '10000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'), odds: '2000.00' })),
    totalOdds: String(2000n ** 9n) + '.00' };
  assert.deepEqual(slipSnapshotSchema.parse(JSON.parse(JSON.stringify(long))), long);
  assert.equal(slipSnapshotSchema.safeParse({ ...long, id: 'x'.repeat(slipSnapshotRules.maximumIdentityLength + 1) }).success, false);
  assert.equal(slipSnapshotSchema.safeParse({ ...long, totalOdds: '1'.repeat(slipSnapshotRules.maximumTotalOddsDigits + 1) + '.00' }).success, false);
  assert.equal(slipSnapshotSchema.safeParse({ ...long, selections: long.selections.map((selection) => ({ ...selection, odds: '0.50' })) }).success, false);
});

test('completed slips expose original odds and picks without account identity, adjudicated from verified regulation scores', () => {
  assert.ok(slipSnapshotSchema.safeParse(slip).success);
  const won = slipResultView('snapshot-id', new Date(now).toISOString(), slip, [result]);
  assert.equal(won.outcome, 'won'); assert.deepEqual(won.slip, slip); assert.equal('accountId' in won, false);
  assert.equal(slipResultView('snapshot-id', '', slip, [{ ...result, regulationHome: 0 }]).outcome, 'lost');
  const unverified = slipResultView('snapshot-id', '', slip, [{ ...result, regulationVerified: false }]);
  assert.equal(unverified.outcome, 'pending'); assert.equal(unverified.results[0].home, null);
});

test('missing or active legs never expose a public slip, even if another leg already lost', () => {
  for (const status of ['scheduled', 'live', 'unknown', 'postponed'])
    assert.equal(slipResultView('snapshot-id', '', slip, [{ ...result, status }]), null);
  assert.equal(slipResultView('snapshot-id', '', slip, []), null);
  const two = { ...slip, selections: [...slip.selections, { ...slip.selections[0], fixtureId: '10000000-0000-4000-8000-000000000098' }] };
  assert.equal(slipResultView('snapshot-id', '', two, [{ ...result, regulationHome: 0 }]), null);
  assert.equal(slipResultView('snapshot-id', '', { ...slip, selections: [...slip.selections, ...slip.selections] }, [result]), null);
});

test('slip aggregate establishes a known loss while unfinished selections remain private', () => {
  const active = { ...slip.selections[0], fixtureId: '10000000-0000-4000-8000-000000000098' };
  const mixed = { ...slip, selections: [...slip.selections, active] };
  const loss = { ...result, regulationHome: 0 };
  assert.equal(slipSnapshotOutcome(mixed, [loss]), 'lost');
  assert.equal(slipResultView('snapshot-id', '', mixed, [loss]), null);
  assert.equal(slipSnapshotOutcome(mixed, [result]), 'pending');
  assert.equal(slipSnapshotOutcome(mixed, [{ ...result, status: 'canceled' }]), 'pending');
  assert.equal(slipSnapshotOutcome(mixed, [{ ...loss, regulationVerified: false }]), 'pending');
});

test('canceled, abandoned and awarded forecasts are void without claiming a winning slip', () => {
  for (const status of ['canceled', 'abandoned', 'awarded']) {
    const view = slipResultView('snapshot-id', '', slip, [{ ...result, status }]);
    assert.equal(view.outcome, 'void');
    assert.deepEqual(view.results, [{ fixtureId: id, home: null, away: null, outcome: 'void' }]);
    assert.equal(view.slip.totalOdds, '2.00');
  }
  const other = '10000000-0000-4000-8000-000000000098';
  const two = { ...slip, selections: [...slip.selections, { ...slip.selections[0], fixtureId: other }] };
  const voidLeg = { ...result, fixtureId: other, status: 'canceled' };
  assert.equal(slipResultView('snapshot-id', '', two, [result, voidLeg]).outcome, 'void');
  assert.equal(slipResultView('snapshot-id', '', two, [{ ...result, regulationHome: 0 }, voidLeg]).outcome, 'lost');
  assert.equal(slipResultView('snapshot-id', '', two, [{ ...result, regulationVerified: false }, voidLeg]).outcome, 'pending');
  assert.equal(slipResultView('snapshot-id', '', two, [{ ...result, status: 'live' }, voidLeg]), null);
});

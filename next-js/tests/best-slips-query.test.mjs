import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { bestSlipBandRank, bestSlipOddsBands, bestSlipPublicRank, maximumBestSlipLocalRank, maximumBestSlipPublicRank } from '../src/domain/best-slip-odds-bands.ts';
import { BestSlipsQueryError, bestSlipsPageSearch, bestSlipsQueryRules, defaultBestSlipsQuery, matchesBestSlipsRanges,
  parseBestSlipsQuery, resolveBestSlipsDates, selectBestSlipsDates, selectSlipSummaryResult, serializeBestSlipsQuery } from '../src/domain/best-slips-query.ts';

const today = parseReportingDate('2026-10-29');
test('slip presets resolve inclusive EAT publication dates across month and year boundaries', () => {
  const expected = {
    today: ['2026-10-29', '2026-10-29'], yesterday: ['2026-10-28', '2026-10-28'], tomorrow: ['2026-10-30', '2026-10-30'],
    last3: ['2026-10-27', '2026-10-29'], last7: ['2026-10-23', '2026-10-29'], last30: ['2026-09-30', '2026-10-29'],
    next3: ['2026-10-30', '2026-11-01'], next7: ['2026-10-30', '2026-11-05'], next30: ['2026-10-30', '2026-11-28'], all: [null, null],
  };
  assert.deepEqual(parseBestSlipsQuery({}, today), defaultBestSlipsQuery());
  assert.deepEqual(defaultBestSlipsQuery(), { period: 'today', status: 'pending', page: 1, oddsBand: '1.5-5' });
  for (const [period, [from, to]] of Object.entries(expected)) {
    assert.deepEqual(resolveBestSlipsDates(parseBestSlipsQuery({ period }, today), today), { from, to });
  }
  assert.deepEqual(resolveBestSlipsDates({ ...defaultBestSlipsQuery(), period: 'last3' }, parseReportingDate('2027-01-01')),
    { from: '2026-12-30', to: '2027-01-01' });
  for (const [day, from, to] of [['2026-12-31', '2027-01-01', '2027-01-03'], ['2028-02-28', '2028-02-29', '2028-03-02']]) {
    assert.deepEqual(resolveBestSlipsDates({ ...defaultBestSlipsQuery(), period: 'next3' }, parseReportingDate(day)), { from, to });
  }
  const nextThree = parseBestSlipsQuery(new URLSearchParams('period=next3&status=won&page=2'), today);
  assert.deepEqual(nextThree, { period: 'next3', status: 'won', page: 2, oddsBand: '1.5-5', });
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(nextThree), today), nextThree);
});

test('custom ranges accept same-day and a full leap year, while serialization retains both filters and pagination', () => {
  const query = parseBestSlipsQuery({ period: 'custom', status: 'lost', from: '2024-01-01', to: '2024-12-31', page: '3' }, today);
  assert.equal(bestSlipsQueryRules.maximumDays, 366);
  assert.deepEqual(resolveBestSlipsDates(query, today), { from: '2024-01-01', to: '2024-12-31' });
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query), today), query);
  assert.deepEqual(parseBestSlipsQuery({ period: 'custom', from: today, to: today }, today),
    { period: 'custom', status: 'pending', page: 1, oddsBand: '1.5-5', from: today, to: today });
});

test('invalid or repeated values fail before reading publications', () => {
  for (const input of [{ period: 'unknown' }, { status: 'unknown' }, { page: '0' }, { page: '1.5' }, { page: '10000' },
    { period: ['today', 'all'] }, new URLSearchParams('status=won&status=lost'), { period: 'custom' },
    { period: 'custom', from: '2026-02-30', to: today }, { period: 'custom', from: today, to: '2026-10-28' },
    { period: 'custom', from: '2024-01-01', to: '2025-01-01' }]) {
    assert.throws(() => parseBestSlipsQuery(input, today), BestSlipsQueryError);
  }
  const invalid = (input, code) => assert.throws(() => parseBestSlipsQuery(input, today), (error) => error.code === code);
  invalid({ period: 'custom' }, 'invalid-date');
  invalid({ period: 'custom', from: today, to: '2026-10-28' }, 'invalid-range');
  invalid({ period: 'custom', from: '2024-01-01', to: '2025-01-01' }, 'range-too-large');
});

test('void and cancelled result filters survive parsing and serialization', () => {
  for (const status of ['void', 'cancelled']) {
    const query = parseBestSlipsQuery({ period: 'last30', status, page: '2' }, today);
    assert.equal(query.status, status);
    assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query), today), query);
  }
});

test('inclusive average probability and match ranges survive deep links and outcome drilldowns', () => {
  const selected = parseBestSlipsQuery(new URLSearchParams('period=yesterday&probMin=75.125&probMax=90&matchesMin=2&matchesMax=5&status=cancelled&page=3'), today);
  assert.equal(bestSlipsPageSearch(defaultBestSlipsQuery()), '');
  const all = selectSlipSummaryResult(defaultBestSlipsQuery(), 'all');
  assert.equal(new URLSearchParams(bestSlipsPageSearch(all)).get('status'), 'all');
  assert.deepEqual(parseBestSlipsQuery(new URLSearchParams(bestSlipsPageSearch(all)), today), all);
  assert.deepEqual(parseBestSlipsQuery(new URLSearchParams(bestSlipsPageSearch(selected)), today), selected);
  assert.deepEqual(selectSlipSummaryResult(selected, 'won'), { ...selected, status: 'won', page: 1 });
  const matches = (averageProbability, matchCount) => matchesBestSlipsRanges(selected, { averageProbability, matchCount });
  assert.equal(matches(75.125 / 100, 2), true);
  assert.equal(matches(0.9, 5), true);
  assert.equal(matches(0.751, 2), false);
  assert.equal(matches(0.8, 1), false);
  assert.equal(serializeBestSlipsQuery(parseBestSlipsQuery({ probMin: '0.00000001' }, today)).get('probMin'), '0.00000001');
  for (const invalid of [{ probMin: '101' }, { probMax: 'NaN' }, { probMin: '80', probMax: '70' }, { matchesMin: '0' },
    { matchesMax: '4.5' }, { matchesMin: '6', matchesMax: '4' }, { matchesMax: ['2', '4'] }]) {
    assert.throws(() => parseBestSlipsQuery(invalid, today), BestSlipsQueryError);
  }
});

test('All dates cursors retain within-publication ranks and reject arbitrary cursor data', () => {
  const query = parseBestSlipsQuery({ period: 'all', status: 'pending', page: '2', cursor: '2026-10-28:120' }, today);
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query), today), query);
  for (const rank of [121, 1000, maximumBestSlipPublicRank]) {
    assert.equal(parseBestSlipsQuery({ period: 'all', cursor: `2026-10-28:${rank}` }, today).cursor, `2026-10-28:${rank}`);
  }
  for (const cursor of ['2026-10-28:0', `2026-10-28:${maximumBestSlipPublicRank + 1}`, '2026-02-30:3', '2026-10-28:1;DROP TABLE', '2026-10-28:01']) {
    assert.throws(() => parseBestSlipsQuery({ period: 'all', cursor }, today), BestSlipsQueryError);
  }
  assert.throws(() => parseBestSlipsQuery({ period: 'today', cursor: '2026-10-28:1' }, today), BestSlipsQueryError);
});

test('extended band ranks decode without moving or colliding with any original address', () => {
  const ranks = new Set();
  for (const [index, { id: band }] of bestSlipOddsBands.entries()) {
    for (const rank of [...Array.from({ length: 200 }, (_, offset) => offset + 1), maximumBestSlipLocalRank]) {
      const address = bestSlipPublicRank(band, rank);
      if (rank <= 20) assert.equal(address, index * 20 + rank);
      else assert.ok(address > 120);
      assert.ok(!ranks.has(address));
      ranks.add(address);
      assert.deepEqual(bestSlipBandRank(address), { band, rank });
    }
  }
});

test('the date picker keeps the filters, clears the archive cursor and links to absolute publication dates', () => {
  const archive = parseBestSlipsQuery(new URLSearchParams('period=all&page=3&cursor=2026-10-28:5&oddsBand=5-10&status=lost&probMin=80&matchesMax=4'), today);
  const from = parseReportingDate('2026-10-28'), to = parseReportingDate('2026-11-01');
  const single = selectBestSlipsDates(archive, from, from, today);
  assert.deepEqual(single, { period: 'custom', status: 'lost', oddsBand: '5-10', from, to: from, page: 1, probMin: 80, matchesMax: 4 });
  const range = selectBestSlipsDates(single, from, to, today);
  assert.deepEqual(parseBestSlipsQuery(new URLSearchParams(bestSlipsPageSearch(range)), to), range);
  assert.deepEqual(resolveBestSlipsDates(range, to), { from, to });
  assert.deepEqual(selectBestSlipsDates(range, today, today, today),
    { period: 'today', status: 'lost', oddsBand: '5-10', page: 1, probMin: 80, matchesMax: 4 });
  assert.equal(bestSlipsPageSearch(selectBestSlipsDates(defaultBestSlipsQuery(), today, today, today)), '');
});

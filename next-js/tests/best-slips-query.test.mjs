import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { BestSlipsQueryError, bestSlipsQueryRules, defaultBestSlipsQuery, parseBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery } from '../src/domain/best-slips-query.ts';

const today = parseReportingDate('2026-10-29');
test('slip presets resolve inclusive EAT publication dates across month and year boundaries', () => {
  const expected = {
    today: ['2026-10-29', '2026-10-29'], yesterday: ['2026-10-28', '2026-10-28'], tomorrow: ['2026-10-30', '2026-10-30'],
    last3: ['2026-10-27', '2026-10-29'], last7: ['2026-10-23', '2026-10-29'], last30: ['2026-09-30', '2026-10-29'],
    next3: ['2026-10-30', '2026-11-01'], next7: ['2026-10-30', '2026-11-05'], next30: ['2026-10-30', '2026-11-28'], all: [null, null],
  };
  assert.deepEqual(parseBestSlipsQuery({}, today), defaultBestSlipsQuery());
  for (const [period, [from, to]] of Object.entries(expected)) {
    assert.deepEqual(resolveBestSlipsDates(parseBestSlipsQuery({ period }, today), today), { from, to });
  }
  assert.deepEqual(resolveBestSlipsDates({ ...defaultBestSlipsQuery(), period: 'last3' }, parseReportingDate('2027-01-01')),
    { from: '2026-12-30', to: '2027-01-01' });
  for (const [day, from, to] of [['2026-12-31', '2027-01-01', '2027-01-03'], ['2028-02-28', '2028-02-29', '2028-03-02']]) {
    assert.deepEqual(resolveBestSlipsDates({ ...defaultBestSlipsQuery(), period: 'next3' }, parseReportingDate(day)), { from, to });
  }
  const nextThree = parseBestSlipsQuery(new URLSearchParams('period=next3&status=won&page=2'), today);
  assert.deepEqual(nextThree, { period: 'next3', status: 'won', page: 2 });
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(nextThree), today), nextThree);
});

test('custom ranges accept same-day and a full leap year, while serialization retains both filters and pagination', () => {
  const query = parseBestSlipsQuery({ period: 'custom', status: 'lost', from: '2024-01-01', to: '2024-12-31', page: '3' }, today);
  assert.equal(bestSlipsQueryRules.maximumDays, 366);
  assert.deepEqual(resolveBestSlipsDates(query, today), { from: '2024-01-01', to: '2024-12-31' });
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query), today), query);
  assert.deepEqual(parseBestSlipsQuery({ period: 'custom', from: today, to: today }, today),
    { period: 'custom', status: 'all', page: 1, from: today, to: today });
});

test('invalid or repeated values fail before reading publications', () => {
  for (const input of [{ period: 'unknown' }, { status: 'void' }, { page: '0' }, { page: '1.5' }, { page: '10000' },
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

test('All dates cursors retain within-publication ranks and reject arbitrary cursor data', () => {
  const query = parseBestSlipsQuery({ period: 'all', status: 'pending', page: '2', cursor: '2026-10-28:100' }, today);
  assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query), today), query);
  for (const cursor of ['2026-10-28:0', '2026-10-28:101', '2026-02-30:3', '2026-10-28:1;DROP TABLE', '2026-10-28:01']) {
    assert.throws(() => parseBestSlipsQuery({ period: 'all', cursor }, today), BestSlipsQueryError);
  }
  assert.throws(() => parseBestSlipsQuery({ period: 'today', cursor: '2026-10-28:1' }, today), BestSlipsQueryError);
});

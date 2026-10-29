import assert from 'node:assert/strict';
import test from 'node:test';
import { slipBuilderRules } from '../src/domain/slip-builder.ts';
import {
  formatSlipMatchCount, guardSlipDateTime, guardSlipNumber, normalizeSlipMatchCount,
  slipDateBounds, slipNumberRangeIssue, slipNumericRule, stepSlipNumber,
} from '../src/domain/slip-input-guards.ts';

test('numeric rules retain approved build caps, exact odds steps, and unrestricted match counts', () => {
  assert.equal(slipNumericRule('slips').maximum, String(slipBuilderRules.maximumSlips));
  for (const field of ['totalMin', 'totalMax', 'oddsMin', 'oddsMax']) {
    assert.equal(slipNumericRule(field).minimum, '0.01');
    assert.equal(slipNumericRule(field).precision, 2);
    assert.equal(slipNumericRule(field).step, '0.01');
  }
  assert.equal(slipNumericRule('teamsMax').maximum, String(Number.MAX_SAFE_INTEGER));
  assert.equal(slipNumericRule('probMax').maximum, '100');
  assert.equal(slipNumericRule('totalProbMax').precision, 3);
});

test('typing guards reject impossible pasted values and precision or ceiling violations', () => {
  for (const field of ['slips', 'teamsMin', 'teamsMax', 'totalMin', 'oddsMax', 'probMin', 'totalProbMax']) {
    for (const raw of ['-1', '+1', '1e2', 'Infinity', 'NaN', '1 2', '1\n', '１２', '<script>', '1..2']) {
      assert.equal(guardSlipNumber(field, raw).accepted, false, `${field} rejects ${JSON.stringify(raw)}`);
    }
  }
  assert.deepEqual(guardSlipNumber('slips', '101'), { accepted: false, issue: 'maximum', limit: '100' });
  assert.equal(guardSlipNumber('teamsMin', '1.5').issue, 'whole-number');
  assert.equal(guardSlipNumber('oddsMin', '1.001').issue, 'precision');
  assert.equal(guardSlipNumber('probMax', '101').issue, 'maximum');
  assert.equal(guardSlipNumber('probMax', '100.001').issue, 'maximum');
  assert.equal(guardSlipNumber('probMax', '0.0001').issue, 'precision');
  assert.equal(guardSlipNumber('teamsMax', '9007199254740992').issue, 'maximum');
  assert.equal(guardSlipNumber('totalMax', '90071992547409.92').issue, 'maximum');
});

test('intermediate decimal editing stays usable while commit validation enforces floors and required counts', () => {
  for (const [raw, expected] of [['.', '0.'], ['0.', '0.'], ['000.01', '0.01'], ['.01', '0.01'], ['01.', '1.']]) {
    const result = guardSlipNumber('totalMin', raw);
    assert.equal(result.accepted, true);
    assert.equal(result.value, expected);
  }
  assert.equal(guardSlipNumber('totalMin', '0').complete, false);
  for (const field of ['slips', 'teamsMin', 'teamsMax']) {
    assert.equal(guardSlipNumber(field, '0').issue, 'minimum', `${field} rejects zero while typing`);
    assert.equal(guardSlipNumber(field, '0', true).issue, 'minimum', `${field} rejects zero on commit`);
    assert.equal(guardSlipNumber(field, '000').issue, 'minimum', `${field} rejects a padded zero`);
    assert.deepEqual(guardSlipNumber(field, '001'), { accepted: true, value: '1', complete: true }, `${field} normalizes a positive padded count`);
  }
  assert.equal(guardSlipNumber('slips', '').complete, false);
  assert.equal(guardSlipNumber('slips', '', true).issue, 'minimum');
  assert.equal(guardSlipNumber('teamsMin', '0', true).issue, 'minimum');
  assert.equal(guardSlipNumber('totalMin', '0.00', true).issue, 'minimum');
  assert.deepEqual(guardSlipNumber('totalMin', '1.', true), { accepted: true, value: '1', complete: true });
  for (const field of ['teamsMin', 'teamsMax', 'totalMin', 'totalMax', 'oddsMax', 'probMin', 'probMax', 'totalProbMin']) {
    assert.deepEqual(guardSlipNumber(field, '', true), { accepted: true, value: '', complete: true }, `${field} preserves blank bounds`);
  }
});

test('decimal and whole-number steppers remain exact and cannot cross hard limits', () => {
  let value = '0.01';
  for (let index = 0; index < 1000; index++) {
    const result = stepSlipNumber('totalMin', value, 1);
    assert.equal(result.accepted, true);
    value = result.value;
  }
  assert.equal(value, '10.01');
  assert.equal(stepSlipNumber('totalMin', '0.01', -1).issue, 'minimum');
  assert.equal(stepSlipNumber('totalMin', '0.', 1).value, '0.01');
  assert.equal(stepSlipNumber('totalMin', '1.', 1).value, '1.01');
  assert.equal(stepSlipNumber('totalMin', '90071992547409.90', 1).value, '90071992547409.91');
  assert.equal(stepSlipNumber('totalMin', '90071992547409.91', 1).issue, 'maximum');
  assert.equal(stepSlipNumber('slips', '100', 1).issue, 'maximum');
  assert.equal(stepSlipNumber('teamsMin', '999', 1).value, '1000');
  assert.equal(stepSlipNumber('teamsMin', '1', -1).issue, 'minimum');
  assert.equal(stepSlipNumber('probMax', '99.999', 1).value, '100.000');
  assert.equal(stepSlipNumber('probMax', '100', 1).issue, 'maximum');
  assert.equal(stepSlipNumber('oddsMax', '', -1).value, '0.01');
  assert.equal(stepSlipNumber('teamsMax', '', 1).value, '1');
});

test('match count formatting and copied grouped text never lose safe-integer precision', () => {
  for (const raw of ['', '1', '999', '1000', '99999', '9007199254740991']) {
    const displayed = formatSlipMatchCount(raw);
    assert.equal(normalizeSlipMatchCount(displayed), raw);
  }
  assert.equal(formatSlipMatchCount('1000'), '1,000');
  assert.equal(formatSlipMatchCount('9007199254740991'), '9,007,199,254,740,991');
  assert.equal(normalizeSlipMatchCount('9,007,199,254,740,991'), '9007199254740991');
  for (const raw of [',100', '1,00', '1,,000', '1.000', '1 000', '1,000.00', '-1,000']) {
    assert.equal(normalizeSlipMatchCount(raw), null, raw);
  }
});

test('pair ordering feedback uses exact decimal bounds and preserves blank Any ceilings', () => {
  assert.equal(slipNumberRangeIssue('totalMin', { totalMin: '90071992547409.91', totalMax: '90071992547409.90' }), 'range');
  assert.equal(slipNumberRangeIssue('totalMax', { totalMin: '90071992547409.90', totalMax: '90071992547409.91' }), null);
  assert.equal(slipNumberRangeIssue('teamsMin', { teamsMin: '9007199254740991', teamsMax: '' }), null);
  assert.equal(slipNumberRangeIssue('teamsMin', { teamsMin: '2', teamsMax: '1' }), 'range');
  assert.equal(slipNumberRangeIssue('probMin', { probMin: '80', probMax: '75' }), 'range');
  assert.equal(slipNumberRangeIssue('probMin', { probMin: '', probMax: '0' }), null);
  assert.equal(slipNumberRangeIssue('totalMin', { totalMin: '.', totalMax: '10' }), null);
});

test('date guards enforce real dates, ordering and the inclusive 31-day window without inventing a future-only rule', () => {
  const draft = { dateFrom: '2026-10-01', dateTo: '2026-10-31' };
  assert.equal(guardSlipDateTime('dateTo', '2026-10-31', draft).accepted, true);
  assert.equal(guardSlipDateTime('dateTo', '2026-11-01', draft).issue, 'date-window');
  assert.equal(guardSlipDateTime('dateTo', '2026-09-30', draft).issue, 'date-order');
  assert.equal(guardSlipDateTime('dateFrom', '2026-11-02', draft).issue, 'date-order');
  assert.equal(guardSlipDateTime('dateFrom', '2026-11-02', draft, true, false).accepted, true, 'validate From alone before aligning To');
  assert.equal(guardSlipDateTime('dateFrom', '0001-01-01', {}, true).accepted, true);
  for (const raw of ['0000-01-01', '10000-01-01', '2026-02-29', '2026-13-01', '2026-04-31', '2026-1-01']) {
    assert.equal(guardSlipDateTime('dateFrom', raw, {}).issue, 'date', raw);
  }
  assert.equal(guardSlipDateTime('dateFrom', '2028-02-29', {}).accepted, true);
  assert.equal(guardSlipDateTime('dateFrom', '', draft).complete, false);
  assert.equal(guardSlipDateTime('dateFrom', '', draft, true).issue, 'required');
});

test('date picker bounds remain valid at year edges and time guards reject malformed or reversed windows', () => {
  assert.deepEqual(slipDateBounds('dateTo', { dateFrom: '2026-10-01' }), { min: '2026-10-01', max: '2026-10-31' });
  assert.deepEqual(slipDateBounds('dateFrom', { dateTo: '2026-10-31' }), { min: '2026-10-01', max: '2026-10-31' });
  assert.deepEqual(slipDateBounds('dateFrom', { dateTo: '0001-01-02' }), { min: '0001-01-01', max: '0001-01-02' });
  assert.deepEqual(slipDateBounds('dateTo', { dateFrom: '9999-12-30' }), { min: '9999-12-30', max: '9999-12-31' });
  assert.deepEqual(slipDateBounds('dateTo', { dateFrom: 'invalid' }), { min: '0001-01-01', max: '9999-12-31' });
  assert.equal(guardSlipDateTime('timeFrom', '10:00', { timeTo: '10:00' }).accepted, true);
  assert.equal(guardSlipDateTime('timeFrom', '10:01', { timeTo: '10:00' }).issue, 'time-order');
  assert.equal(guardSlipDateTime('timeTo', '09:59', { timeFrom: '10:00' }).issue, 'time-order');
  for (const raw of ['24:00', '23:60', '2:00', '12:00:01', 'abc']) {
    assert.equal(guardSlipDateTime('timeTo', raw, {}).issue, 'time', raw);
  }
  assert.equal(guardSlipDateTime('timeFrom', '23:59', { timeTo: '10:00' }, true, false).accepted, true);
  assert.equal(guardSlipDateTime('timeFrom', '10:00', { timeTo: '25:00' }).complete, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { dateEntryFormat, formatDateEntry, parseDateEntry, shortMonths } from '../src/domain/date-entry.ts';
import { searchFilterOptions } from '../src/domain/filter-option-search.ts';
import { constrainDatePicker, datePickerPartBounds, datePickerParts, datePickerValue, daysInPickerMonth } from '../src/domain/date-picker.ts';
import { changeDateEntryPart, normalizeDateEntryParts, parseDateEntryParts, splitDateEntry } from '../src/domain/date-entry-segments.ts';

test('scroll columns clamp leap days and narrow every column at the allowed boundaries', () => {
  const january = datePickerParts('2026-01-31T23:59', 'datetime');
  assert.equal(datePickerValue(constrainDatePicker({ ...january, month: 2 }, 'datetime'), 'datetime'), '2026-02-28T23:59');
  assert.equal(daysInPickerMonth(2000, 2), 29);
  assert.equal(daysInPickerMonth(1900, 2), 28);
  const min = '2026-01-04T09:15', max = '2026-02-06T17:30';
  const first = constrainDatePicker(datePickerParts('2025-01-01T00:00', 'datetime'), 'datetime', min, max);
  assert.equal(datePickerValue(first, 'datetime'), min);
  assert.deepEqual(datePickerPartBounds(first, 'year', 'datetime', min, max), [2026, 2026]);
  assert.deepEqual(datePickerPartBounds(first, 'minute', 'datetime', min, max), [15, 59]);
  const last = datePickerParts(max, 'datetime');
  assert.deepEqual(datePickerPartBounds(last, 'day', 'datetime', min, max), [1, 6]);
  assert.deepEqual(datePickerPartBounds(last, 'minute', 'datetime', min, max), [0, 30]);
  assert.equal(datePickerValue(constrainDatePicker(datePickerParts('2026-12-31T23:59', 'datetime'), 'datetime', min, max), 'datetime'), max);
  assert.equal(datePickerValue(constrainDatePicker(datePickerParts('23:59', 'time'), 'time', '09:30', '17:15'), 'time'), '17:15');
});

test('dates display day first with an uppercase three-letter month and optional 24-hour time', () => {
  assert.equal(formatDateEntry('2026-01-04', 'date'), '04-JAN-2026');
  assert.equal(formatDateEntry('2026-01-04T14:05', 'datetime'), '04-JAN-2026 14:05');
  assert.equal(formatDateEntry('09:00', 'time'), '09:00');
  for (const [index, month] of shortMonths.entries()) {
    const value = `2026-${String(index + 1).padStart(2, '0')}-04`;
    assert.equal(formatDateEntry(value, 'date'), `04-${month}-2026`);
    assert.deepEqual(parseDateEntry(`4-${month.toLowerCase()}-2026`, 'date'), { value, issue: null });
  }
  assert.equal(dateEntryFormat('datetime'), 'DD-MMM-YYYY HH:mm');
});

test('partial edits including a leading zero do not become invalid completed dates', () => {
  for (const text of ['0', '04', '04-', '04-J', '04-JAN-2']) assert.equal(parseDateEntry(text, 'date').issue, 'incomplete');
  assert.equal(parseDateEntry('00', 'date').issue, 'day');
  assert.equal(parseDateEntry('32-JAN-2026', 'date').issue, 'day');
  assert.equal(parseDateEntry('04-13-2026', 'date').issue, 'month');
  assert.equal(parseDateEntry('04-XYZ-2026', 'date').issue, 'month');
  assert.equal(parseDateEntry('31-APR-2026', 'date').issue, 'date');
  assert.equal(parseDateEntry('29-FEB-2026', 'date').issue, 'date');
  assert.equal(parseDateEntry('29-FEB-2028', 'date').value, '2028-02-29');
});

test('ISO paste and compact entry normalize without accepting impossible clock values', () => {
  assert.equal(parseDateEntry('2026-01-04', 'date').value, '2026-01-04');
  assert.equal(parseDateEntry('04-5-2026 14:30', 'datetime').value, '2026-05-04T14:30');
  assert.equal(parseDateEntry('04JAN2026 1430', 'datetime').value, '2026-01-04T14:30');
  assert.equal(parseDateEntry('04-JAN-2026 00:00', 'datetime').value, '2026-01-04T00:00');
  assert.equal(parseDateEntry('04-JAN-2026 23:59', 'datetime').value, '2026-01-04T23:59');
  assert.equal(parseDateEntry('04-JAN-2026 24:00', 'datetime').issue, 'time');
  assert.equal(parseDateEntry('04-JAN-2026 12:60', 'datetime').issue, 'time');
  assert.equal(parseDateEntry('04-JAN-2026', 'datetime').issue, 'incomplete');
});

test('segmented editing rejects impossible values and normalizes numeric months', () => {
  const parts = splitDateEntry('2028-02-29T14:05', 'datetime');
  for (const [part, value] of [['day', '30'], ['day', '00'], ['month', '13'], ['month', 'XY'], ['year', '0000'], ['hour', '24'], ['minute', '60']]) {
    assert.equal(changeDateEntryPart(parts, part, value), null, `${part} ${value}`);
  }
  assert.equal(parseDateEntryParts(changeDateEntryPart(parts, 'day', '0'), 'datetime').issue, 'incomplete');
  assert.equal(parseDateEntryParts(changeDateEntryPart(parts, 'year', '2027'), 'datetime').value, '2027-02-28T14:05');
  const may = changeDateEntryPart(parts, 'month', '5');
  assert.equal(parseDateEntryParts(may, 'datetime').value, '2028-05-29T14:05');
  assert.equal(normalizeDateEntryParts(may).month, 'MAY');
});

test('country and league searches respond from the first character and retain useful partial matches', () => {
  const options = [{ label: 'Algeria' }, { label: 'Egypt' }, { label: 'England' }, { label: 'Côte d’Ivoire' }];
  const first = searchFilterOptions(options, 'E').exact;
  assert.deepEqual(first.slice(0, 2).map(option => option.label), ['Egypt', 'England']);
  assert.ok(first.some(option => option.label === 'Algeria'));
  assert.deepEqual(searchFilterOptions(options, 'EG').exact.map(option => option.label), ['Egypt']);
  assert.equal(searchFilterOptions(options, 'cote').exact[0].label, 'Côte d’Ivoire');
  assert.equal(searchFilterOptions(options, '').exact.length, options.length);
  const leagues = [{ label: 'Premier League', detail: 'England' }, { label: 'Ligue 1', detail: 'France' }];
  assert.equal(searchFilterOptions(leagues, 'eng').exact[0].label, 'Premier League');
  assert.equal(searchFilterOptions(leagues, 'remier').exact[0].label, 'Premier League');
});

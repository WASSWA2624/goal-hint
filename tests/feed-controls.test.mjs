import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFeedDraft, parseProbabilityInputs, resetFeedFilters } from '../src/domain/feed-controls.ts';
import { defaultMarkets, feedQueryHref, panelFilterCount, parseFeedQuery } from '../src/domain/feed-query.ts';
import { makeStore } from '../src/state/store.ts';
import { draftChanged } from '../src/state/feed.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';

const today = parseReportingDate('2026-10-09');
test('typing preserves spaces in Redux; Apply normalizes once and resets page', () => {
  const query = parseFeedQuery({ when: 'next-7-days', page: '4' }, { today });
  const store = makeStore({ query, today, data: null });
  for (const search of [' Manchester ', ' Manchester  United ']) {
    store.dispatch(draftChanged({ ...query, search }));
    assert.equal(store.getState().feed.draft.search, search);
    assert.deepEqual(store.getState().feed.query, query);
  }
  const applied = applyFeedDraft(store.getState().feed.draft, today);
  assert.equal(applied.search, 'Manchester United'); assert.equal(applied.page, 1);
  assert.deepEqual(applied.dates, query.dates);
  assert.throws(() => applyFeedDraft({ ...query, search: '\u0000' }, today));
  assert.throws(() => applyFeedDraft({ ...query, search: 'a'.repeat(121) }, today));
});
test('native GET controls and canonical URLs produce the same applied query', () => {
  const query = parseFeedQuery(new URLSearchParams('when=next-7-days&q=++bEyOnD+++Alias+&league=&status=all&market=total-goals&sort=probability&pageSize=40'), { today });
  assert.deepEqual(query.leagues, []); assert.equal(query.search, 'bEyOnD Alias');
  assert.deepEqual(query.markets, ['total-goals']);
  assert.deepEqual(query.sort, { by: 'probability', direction: 'desc' });
  assert.deepEqual(parseFeedQuery(new URL(feedQueryHref(query, today), 'http://localhost').searchParams, { today }), query);
  assert.throws(() => applyFeedDraft({ ...query, markets: [] }, today));
  assert.throws(() => applyFeedDraft({ ...query, probability: { min: 80, max: 20 } }, today));
});
test('Clear filters resets every date selection to Today and Any, retaining the navigation section and page size', () => {
  for (const dates of [{ date: today }, { from: today, to: '2026-10-15' }, { when: 'tomorrow' }, { when: 'next-30-days' }]) {
    const query = parseFeedQuery({ ...dates, q: 'team', league: 'league-a,league-b', country: 'Spain', status: 'live', market: 'total-goals,both-teams-to-score',
      prob: '60-100', timeFrom: '12:00', timeTo: '18:00', tz: 'Africa/Kampala', picks: 'only', sort: 'probability', dir: 'asc', page: '3', pageSize: '40' }, { today });
    const reset = resetFeedFilters(query);
    assert.deepEqual(reset.dates, { kind: 'today' }); assert.equal(reset.pageSize, 40); assert.equal(reset.page, 1);
    assert.equal(reset.time, undefined); assert.equal(reset.zone, query.zone);
    assert.equal(reset.search, ''); assert.deepEqual(reset.leagues, []); assert.deepEqual(reset.countries, []);
    assert.equal(reset.status, 'live', 'Live and Results are navigation sections, not filters');
    assert.deepEqual(reset.markets, defaultMarkets); assert.deepEqual(reset.probability, { min: 0, max: 100 }); assert.equal(reset.picks, 'all');
    assert.deepEqual(reset.sort, { by: 'kickoff', direction: 'asc' });
    assert.equal(reset.odds, null);
    assert.equal(panelFilterCount(reset), 0);
    assert.deepEqual(applyFeedDraft(reset, today), reset);
  }
});

test('Any probability inputs accept open bounds while incomplete or invalid numeric drafts cannot apply', () => {
  for (const [values, expected] of [
    [{ min: '', max: '' }, { min: 0, max: 100 }],
    [{ min: '58.2', max: '' }, { min: 58.2, max: 100 }],
    [{ min: '', max: '58.2' }, { min: 0, max: 58.2 }],
    [{ min: '58.2', max: '58.2' }, { min: 58.2, max: 58.2 }],
  ]) assert.deepEqual(parseProbabilityInputs(values), expected);
  for (const values of [{ min: '1.', max: '' }, { min: '.', max: '' }, { min: '', max: '100.1' },
    { min: '80', max: '20' }, { min: 'NaN', max: '' }]) assert.equal(parseProbabilityInputs(values), null);
});
test('Reset clears odds bounds (052); Apply never carries them while provider odds are off', () => {
  const query = parseFeedQuery({ odds: '1.50-3.00', prob: '60-100' }, { today, providerOdds: true });
  assert.deepEqual(query.odds, { min: 150, max: 300 });
  const reset = resetFeedFilters(query);
  assert.equal(reset.odds, null); assert.equal(feedQueryHref(reset, today), '/en');
  // The odds controls stay disabled while publicPolicy.features.providerOdds is false; a forged draft fails closed.
  assert.throws(() => applyFeedDraft(query, today));
  assert.equal(applyFeedDraft(reset, today).odds, null);
});

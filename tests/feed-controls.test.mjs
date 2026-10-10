import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFeedDraft, resetFeedFilters } from '../src/domain/feed-controls.ts';
import { feedQueryHref, parseFeedQuery } from '../src/domain/feed-query.ts';
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
test('Reset preserves dates, status entry and page size with consistent defaults', () => {
  for (const dates of [{ date: today }, { from: today, to: '2026-10-15' }, { when: 'tomorrow' }, { when: 'next-30-days' }]) {
    const query = parseFeedQuery({ ...dates, q: 'team', league: 'league-a,league-b', country: 'Spain', status: 'live', market: 'total-goals,both-teams-to-score',
      prob: '60-100', sort: 'probability', dir: 'asc', page: '3', pageSize: '40' }, { today });
    const reset = resetFeedFilters(query);
    assert.deepEqual(reset.dates, query.dates); assert.equal(reset.pageSize, 40); assert.equal(reset.page, 1);
    assert.equal(reset.search, ''); assert.deepEqual(reset.leagues, []); assert.deepEqual(reset.countries, []);
    assert.equal(reset.status, 'live', 'Live and Results are navigation sections, not filters');
    assert.deepEqual(reset.markets, ['match-result']); assert.deepEqual(reset.probability, { min: 0, max: 100 });
    assert.deepEqual(reset.sort, { by: 'kickoff', direction: 'asc' });
  }
});

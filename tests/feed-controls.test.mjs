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
  assert.equal(query.league, null); assert.equal(query.search, 'bEyOnD Alias');
  assert.deepEqual(query.sort, { by: 'probability', market: 'total-goals' });
  assert.deepEqual(parseFeedQuery(new URL(feedQueryHref(query, today), 'http://localhost').searchParams, { today }), query);
  assert.throws(() => applyFeedDraft({ ...query, market: 'match-result' }, today));
});
test('Reset preserves absolute/range/relative dates and page size with consistent defaults', () => {
  for (const dates of [{ date: today }, { from: today, to: '2026-10-15' }, { when: 'tomorrow' }]) {
    const query = parseFeedQuery({ ...dates, q: 'team', league: 'league-a', status: 'live', market: 'total-goals', sort: 'probability', page: '3', pageSize: '40' }, { today });
    const reset = resetFeedFilters(query);
    assert.deepEqual(reset.dates, query.dates); assert.equal(reset.pageSize, 40); assert.equal(reset.page, 1);
    assert.equal(reset.search, ''); assert.equal(reset.league, null); assert.equal(reset.status, 'all');
    assert.equal(reset.market, 'match-result'); assert.deepEqual(reset.sort, { by: 'kickoff' });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { liveFeedSearchQuery, restoredLiveFeedSearch } from '../src/domain/feed-live-search.ts';
import { feedQueryHref, FeedQueryError, parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';

const today = parseReportingDate('2026-11-12');
const applied = (parameters = {}) => parseFeedQuery(parameters, { today });

test('live search uses the applied filters and shares SSR normalization while returning to page one', () => {
  const query = applied({ when: 'today', status: 'finished', marketPick: 'match-result:home-win', result: 'won',
    league: 'league-123', prob: '61-90', sort: 'probability', dir: 'asc', page: '3' });
  const raw = '  Cafe\u0301    United  ';
  const next = liveFeedSearchQuery(query, raw);
  assert.deepEqual(next, { ...query, search: applied({ q: raw }).search, page: 1 });
  assert.deepEqual(liveFeedSearchQuery(next, '   '), { ...next, search: '' });
  assert.throws(() => liveFeedSearchQuery(query, 'invalid\u0000text'), FeedQueryError);
});

test('a shallow history entry restores the exact search within its current server scope', () => {
  const query = applied({ when: 'today', country: 'Uganda', sort: 'live-first', page: '2' });
  const accepted = liveFeedSearchQuery(query, 'Kampala'), href = feedQueryHref(accepted, today);
  assert.equal(restoredLiveFeedSearch(href, query, today), 'Kampala');
  assert.equal(restoredLiveFeedSearch(href, accepted, today), null, 'direct SSR already represents the search');
  assert.equal(restoredLiveFeedSearch(feedQueryHref(liveFeedSearchQuery(accepted, ''), today), accepted, today), '');
  assert.equal(restoredLiveFeedSearch(href, { ...query, countries: ['Kenya'] }, today), null);
  assert.equal(restoredLiveFeedSearch(`${href}&page=2`, query, today), null);
  assert.equal(restoredLiveFeedSearch(`${href}&q=duplicate`, query, today), null);
  assert.equal(restoredLiveFeedSearch(`/en/matches?q=Kampala`, query, today), null);
});

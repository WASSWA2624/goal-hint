import assert from 'node:assert/strict';
import test from 'node:test';
import { loadMatchDetailPage, matchDetailPageParameters, matchDetailMetadata } from '../src/server/matches/detail-page.ts';
import { historyNextHref, historySelectionHref, publicationStatus } from '../src/server/matches/history-page.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const data = { fixture: { fixtureId: id, homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' } },
  route: { path: `/en/matches/${id}/home-v-away` }, history: { revisions: { anchor: 30 }, cycles: { anchor: 2 } } };
test('history page links keep both anchors, selection and independent cursors on the canonical fixture', () => {
  const parameters = matchDetailPageParameters({ limit: '1', revisionBefore: '10', revisionAnchor: '30', cycleAnchor: '2', ignored: undefined });
  const href = historySelectionHref(data, parameters, 'revision', other), url = new URL(href, 'https://goalhint.com');
  assert.equal(url.pathname, data.route.path); assert.equal(url.hash, '#revision-history');
  assert.equal(url.searchParams.get('revision'), other); assert.equal(url.searchParams.get('cycle'), null);
  assert.equal(url.searchParams.get('revisionBefore'), '10'); assert.equal(url.searchParams.get('cycleAnchor'), '2');
  const cycle = new URL(historySelectionHref(data, url.searchParams, 'cycle', other), url.origin);
  assert.equal(cycle.searchParams.get('revision'), null); assert.equal(cycle.searchParams.get('cycle'), other);
  const next = `/api/matches/${id}?${url.searchParams}&cycleBefore=2`;
  assert.equal(historyNextHref(data, next), `${data.route.path}?${url.searchParams}&cycleBefore=2#revision-history`);
  for (const unsafe of [`/api/matches/${other}?limit=1`, 'https://external.example.com/api/matches/'+id, '//evil.example.com/', '/api/matches/'+id+'#secret']) {
    assert.equal(historyNextHref(data, unsafe), null);
  }
  assert.equal(historyNextHref(data, null), null);
  assert.throws(() => historyNextHref(data, `/api/matches/${id}?limit=21`), e => e.code === 'invalid-query');
  assert.throws(() => matchDetailPageParameters({ revision: [other, other] }), e => e.code === 'invalid-query');
});
test('publication labels follow persisted current/locked references and void state without sorting opaque IDs', () => {
  const cycle = { currentRevisionId: id, lockedRevisionId: null, state: 'open' }, entry = { revisionId: id, cycle };
  assert.deepEqual(publicationStatus(entry, id), { current: true, locked: false, void: false, superseded: false });
  assert.deepEqual(publicationStatus({ ...entry, cycle: { ...cycle, lockedRevisionId: id, state: 'closed' } }, id),
    { current: false, locked: true, void: false, superseded: false });
  assert.equal(publicationStatus({ ...entry, revisionId: other }, id).superseded, true);
  assert.equal(publicationStatus({ ...entry, cycle: { ...cycle, state: 'void' } }, other).void, true);
});
test('failed historical loads preserve the independently loaded primary projection and sanitize errors', async () => {
  const clock = { now: () => 1234 }, primary = await loadMatchDetailPage(id, clock, async () => data);
  for (const [error, code] of [[new Error('private prompt mysql://secret'), 'unavailable'], [new MatchFeedError('rate-limited'), 'rate-limited'],
    [new MatchFeedError('not-found'), 'not-found']]) {
    const failed = await loadMatchDetailPage(id, clock, async (fixture, query, receivedClock) => {
      assert.equal(fixture, id); assert.equal(query.get('revision'), other); assert.equal(receivedClock, clock); throw error;
    }, new URLSearchParams({ revision: other }));
    assert.equal(failed.error, code); assert.doesNotMatch(JSON.stringify(failed), /private|prompt|secret/);
    assert.equal(primary.data, data);
  }
  const metadata = matchDetailMetadata(primary);
  assert.equal(metadata.robots.index, false); assert.equal(metadata.alternates.canonical, `https://goalhint.com${data.route.path}`);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { maximumCompetitionScope } from '../src/domain/feed-query.ts';
import { matchFeedErrorSchema, matchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { parseMatchFeedQuery, createMatchFeedService } from '../src/server/matches/feed-service.ts';
import { createMatchFeedHandler } from '../src/server/matches/feed-http.ts';

const today = parseReportingDate('2026-10-09');
const request = (query = '') => new Request(`http://localhost/api/matches${query ? `?${query}` : ''}`);
function emptyPage() {
  return { records: [], page: 1, nextPage: null, previousPage: null, pageSize: 30, total: 0, totalPages: 0,
    links: { next: null, previous: null }, asOf: Date.parse('2026-10-09T08:00:00Z'), today,
    range: { from: today, to: today, startInclusive: Date.parse('2026-10-08T21:00:00Z'), endExclusive: Date.parse('2026-10-09T21:00:00Z') },
    state: 'no-fixtures', message: 'No fixtures.', coverage: { partial: false, knownFixtures: 0, matchingWithMarket: 0,
      dates: [{ date: today, status: 'complete', observedAt: Date.parse('2026-10-09T08:00:00Z'), authoritative: true }] }, run: null };
}

for (const query of ['date=2026-02-30', 'date=0999-12-31', 'date=1000-01-01', 'from=2026-10-09&to=2026-11-09',
  'from=2026-10-09', 'from=2026-10-10&to=2026-10-09', 'date=2026-10-09&when=today',
  'date=2026-10-09&date=2026-10-10', 'status=FT', 'status=untrusted', 'market=corners',
  'sort=probability&dir=up', 'market=match-result&sort=probability&sortMarket=total-goals', 'sort=score', 'prob=90-10', 'country=x%3Cscript%3E',
  'page=0', 'page=10001', 'page=01', 'pageSize=101', 'pageSize=0', 'pageSize=1.5',
  'league=x%27+OR+1=1', 'q=%00', `q=${'x'.repeat(121)}`, `q=${'%F0%9F%98%80'.repeat(240)}`, 'token=anonymous',
  'leagues=1', 'leagues=', 'leagues=0&leagues=0', 'leagues=0&token=anonymous']) {
  test(`public query rejects ${query.slice(0, 70)}`, async () => {
    let reads = 0;
    const response = await createMatchFeedHandler(async () => { reads++; return emptyPage(); })(request(query));
    assert.equal(response.status, 400); assert.equal(reads, 0);
    const body = matchFeedErrorSchema.parse(await response.json());
    assert.equal(body.error.code, 'invalid-query'); assert.equal(body.error.recoverable, false);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  });
}
test('public parsing preserves shared URL defaults, historical dates and SSR route context', () => {
  const defaults = parseMatchFeedQuery(new URLSearchParams(), today);
  assert.equal(defaults.pageSize, 30); assert.equal(defaults.page, 1); assert.deepEqual(defaults.markets, ['match-result']);
  assert.deepEqual(defaults.sort, { by: 'kickoff', direction: 'asc' }); assert.deepEqual(defaults.probability, { min: 0, max: 100 });
  assert.equal(parseMatchFeedQuery(new URLSearchParams('from=2026-10-09&to=2026-11-08'), today).dates.kind, 'range');
  assert.equal(parseMatchFeedQuery(new URLSearchParams('date=1000-01-02'), today).dates.date, '1000-01-02');
  assert.equal(parseMatchFeedQuery({ to: '2026-10-15', pageSize: '100' }, today, { routeDate: today }).dates.kind, 'range');
  assert.throws(() => parseMatchFeedQuery({ page: ['1', '2'] }, today), MatchFeedError);
});
test('anonymous GET uses no account, authentication cookie, token or cache', async () => {
  const response = await createMatchFeedHandler(async () => emptyPage())(request('date=2026-10-09'));
  assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(matchFeedResponseSchema.parse(await response.json()).state, 'no-fixtures');
});
test('leagues=0 omits filter options and never reaches the feed query parser', async () => {
  const league = { id: 'league-a', name: 'Example', country: null, logoUrl: null, fixtures: 1 }, seen = [];
  const handler = createMatchFeedHandler(async (parameters) => { seen.push(parameters.toString()); return { ...emptyPage(), leagues: [league] }; });
  const lean = await handler(request('date=2026-10-09&leagues=0'));
  assert.equal(lean.status, 200); assert.deepEqual(matchFeedResponseSchema.parse(await lean.json()).leagues, []);
  const full = await handler(request('date=2026-10-09'));
  assert.deepEqual(matchFeedResponseSchema.parse(await full.json()).leagues, [league]);
  assert.deepEqual(seen, ['date=2026-10-09', 'date=2026-10-09']);
});
test('leagues=0 is not charged to the 2 KiB query limit', async () => {
  const handler = createMatchFeedHandler(async () => emptyPage());
  const base = `date=2026-10-09&league=${Array.from({ length: 19 }, (_, index) => `league-${index}`.padEnd(100, 'x')).join('%2C')}&q=`;
  // "?" plus this query is exactly 2,048 bytes, as sent and as re-serialized.
  const largest = base + 'a'.repeat(2047 - base.length);
  assert.equal((await handler(request(largest))).status, 200);
  assert.equal((await handler(request(`${largest}&leagues=0`))).status, 200);
  assert.equal((await handler(request(`${largest}a&leagues=0`))).status, 400);
});
for (const [error, status, code, retry] of [[new Error('mysql://private:password@internal/prompt-log'), 503, 'unavailable', '5'],
  [new MatchFeedError('rate-limited', 17), 429, 'rate-limited', '17']]) {
  test(`HTTP ${status} is structured, recoverable and excludes private diagnostics`, async () => {
    const response = await createMatchFeedHandler(async () => { throw error; })(request());
    assert.equal(response.status, status); assert.equal(response.headers.get('retry-after'), retry);
    const serialized = await response.text(), body = matchFeedErrorSchema.parse(JSON.parse(serialized));
    assert.equal(body.error.code, code); assert.equal(body.error.recoverable, true);
    assert.doesNotMatch(serialized, /password|internal|prompt-log|mysql:/u);
  });
}
test('missing competition configuration and database failure never masquerade as empty data', async () => {
  assert.throws(() => createMatchFeedService({ database: {}, competitionIds: [] }), MatchFeedError);
  const service = createMatchFeedService({ database: { transaction: async () => { throw new Error('private'); } }, competitionIds: [39] });
  await assert.rejects(service.query({ date: '2026-10-09' }), (error) => error.code === 'unavailable');
});
test('public response schema rejects unknown internals and incoherent counts', () => {
  assert.equal(matchFeedResponseSchema.safeParse({ ...emptyPage(), workerLogs: [] }).success, false);
  assert.equal(matchFeedResponseSchema.safeParse({ ...emptyPage(), total: 1 }).success, false);
  assert.equal(matchFeedResponseSchema.safeParse({ ...emptyPage(), nextPage: 3 }).success, false);
  const league = { id: 'league-a', name: 'Example', country: null };
  // Older cached pages without logos or counts still parse, with explicit defaults.
  assert.deepEqual(matchFeedResponseSchema.parse({ ...emptyPage(), leagues: [league] }).leagues, [{ ...league, logoUrl: null, fixtures: 0 }]);
  const logo = { ...league, logoUrl: 'https://media.example.test/league.png', fixtures: 12 };
  assert.deepEqual(matchFeedResponseSchema.parse({ ...emptyPage(), leagues: [logo] }).leagues, [logo]);
  for (const leagues of [[league, league], [{ ...league, providerCredentials: 'private' }], [{ ...league, id: '../x' }],
    [{ ...league, logoUrl: 'http://media.example.test/a.png' }], [{ ...league, fixtures: -1 }],
    Array.from({ length: maximumCompetitionScope + 1 }, (_, index) => ({ ...league, id: `league-${index}` }))]) {
    assert.equal(matchFeedResponseSchema.safeParse({ ...emptyPage(), leagues }).success, false);
  }
});

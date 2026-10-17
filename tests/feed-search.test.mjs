import assert from 'node:assert/strict';
import test from 'node:test';
import { validateReportingDateRange } from '../src/domain/calendar.ts';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';
import { feedSearchRules, storedFeedSearch } from '../src/server/matches/feed-search.ts';

const range = validateReportingDateRange('2026-10-09', '2026-10-09', 31);
const row = (id, name, extra = {}) => ({ kind: 'team', id, name, country: null, alias: null, ...extra });
const resolve = (search, rows, statements = []) => storedFeedSearch({ $queryRaw: async (sql) => {
  statements.push(sql); return rows;
} }, search, range, [39]);
const unavailable = (error) => error.code === 'unavailable';

test('empty search performs no catalog read; punctuation cannot widen the fixture cohort', async () => {
  const statements = [];
  assert.equal(await resolve('', [], statements), null);
  const search = await resolve('%_!', [row('team-a', 'Example FC')], statements);
  assert.deepEqual(search, { query: '%_!', teams: [], competitions: [] });
  assert.equal(statements.length, 0);
  const query = parseFeedQuery({ date: '2026-10-09', q: '%_!' }, { today: '2026-10-09' });
  assert.match(feedSql(query, range, [39], false, search).where.sql, /AND FALSE$/u);
});

test('one catalog read preserves the date/provider/historical cohort and deduplicates alias identities', async () => {
  const statements = [];
  const search = await resolve('man utd', [
    row('team-a', 'Manchester United', { alias: 'Man Utd', country: 'England' }),
    row('team-a', 'Manchester United', { alias: 'Manchester Utd', country: 'England' }),
    row('team-b', 'Manchester City', { country: 'England' }),
  ], statements);
  assert.deepEqual(search.teams, [{ id: 'team-a', score: 1000 }]);
  assert.deepEqual(search.competitions, []);
  assert.equal(statements.length, 1);
  const sql = statements[0];
  assert.match(sql.sql, /WITH cohort AS/u);
  assert.match(sql.sql, /SELECT homeTeamId AS id FROM cohort UNION SELECT awayTeamId AS id FROM cohort/u);
  assert.match(sql.sql, /c\.state IN \('closed','void'\)/u);
  assert.match(sql.sql, /c\.state='void' AND EXISTS/u);
  assert.match(sql.sql, /LEFT JOIN FootballTeamAlias ta ON ta\.teamId=t\.id/u);
  assert.match(sql.sql, /LEFT JOIN FootballCompetitionAlias ca ON ca\.competitionId=l\.id/u);
  assert.ok(sql.values.some((value) => value instanceof Date && value.getTime() === range.window.startInclusive));
  assert.ok(sql.values.some((value) => value instanceof Date && value.getTime() === range.window.endExclusive));
  assert.ok(sql.values.includes(39));
  assert.equal(sql.values.at(-1), feedSearchRules.maximumCatalogRows + 1);
  assert.ok(!sql.values.includes('man utd'), 'User search text never becomes catalog SQL.');
});

test('canonical names, team countries, competition countries and retained aliases all resolve identities', async () => {
  const rows = [row('team-a', 'Bayern München', { country: 'Germany' }),
    row('team-b', 'Renamed Club', { alias: 'Beyond Page Alias', country: 'England' }),
    row('league-a', 'Premier League', { kind: 'competition', country: 'England', alias: 'Old English League' })];
  assert.deepEqual((await resolve('germany', rows)).teams, [{ id: 'team-a', score: 1000 }]);
  assert.deepEqual((await resolve('beyond page alias', rows)).teams, [{ id: 'team-b', score: 1000 }]);
  assert.deepEqual((await resolve('old english league', rows)).competitions, [{ id: 'league-a', score: 1000 }]);
  const country = await resolve('england', rows);
  assert.deepEqual(country.teams, [{ id: 'team-b', score: 1000 }]);
  assert.deepEqual(country.competitions, [{ id: 'league-a', score: 1000 }]);
  const fuzzy = await resolve('bayren munich', rows);
  assert.equal(fuzzy.teams[0].id, 'team-a');
  assert.ok(fuzzy.teams[0].score > 0 && fuzzy.teams[0].score < 1000);
});

test('unknown words and adjacent numeric identities return no broad fallback', async () => {
  const rows = [row('team-3901', 'Synthetic Club 3901'), row('team-3902', 'Synthetic Club 3902')];
  assert.deepEqual((await resolve('synthetic club 3901', rows)).teams, [{ id: 'team-3901', score: 1000 }]);
  assert.deepEqual((await resolve('unrelated unknown side', rows)).teams, []);
});

test('SQL filters matching identities before pagination and puts max relevance ahead of stable sort ties', async () => {
  const query = parseFeedQuery({ date: '2026-10-09', q: 'united', league: 'league-a', status: 'scheduled',
    sort: 'probability', dir: 'asc', page: '2' }, { today: '2026-10-09' });
  const search = { query: query.search, teams: [{ id: "team-a' OR 1=1", score: 1000 }, { id: 'team-b', score: 700 }, { id: 'team-c', score: 1000 }],
    competitions: [{ id: 'league-a', score: 600 }] };
  const sql = feedSql(query, range, [39], false, search);
  assert.match(sql.where.sql, /h\.id IN \(\?,\?,\?\) OR a\.id IN \(\?,\?,\?\) OR l\.id IN \(\?\)/u);
  assert.match(sql.where.sql, /l\.id IN \(\?\).*f\.status=\?/su);
  assert.doesNotMatch(sql.where.sql, /LIKE|team-a'|united/u);
  assert.ok(sql.where.values.includes(search.teams[0].id));
  assert.match(sql.order.sql, /^GREATEST\(CASE WHEN h\.id IN \(\?,\?\) THEN \? WHEN h\.id IN \(\?\) THEN \?/u);
  assert.match(sql.order.sql, /CASE WHEN a\.id IN/u);
  assert.match(sql.order.sql, /CASE WHEN l\.id IN/u);
  assert.match(sql.order.sql, /\) DESC, m\.selectedProbability IS NULL ASC, m\.selectedProbability ASC, f\.kickoff ASC, f\.id ASC$/u);
  assert.ok(sql.order.values.includes(1000) && sql.order.values.includes(700) && sql.order.values.includes(600));
  assert.doesNotMatch(sql.scope.sql, /CASE|h\.id IN/u, 'Known counts and league options retain the full date cohort.');
  assert.throws(() => feedSql(query, range, [39]), unavailable);
  assert.throws(() => feedSql(query, range, [39], false, { ...search, query: 'other' }), unavailable);
  const ordinary = feedSql(parseFeedQuery({ date: '2026-10-09' }, { today: '2026-10-09' }), range, [39]);
  assert.equal(ordinary.order.sql, 'f.kickoff DESC, f.id DESC');
  const earliest = feedSql({ ...query, search: '', sort: { by: 'kickoff', direction: 'asc' } }, range, [39]);
  assert.equal(earliest.order.sql, 'f.kickoff ASC, f.id ASC');
});

test('catalog and identity limits fail explicitly instead of truncating search results', async () => {
  await assert.rejects(resolve('united', Array(feedSearchRules.maximumCatalogRows + 1).fill(row('team-a', 'United'))), unavailable);
  await assert.rejects(resolve('united', Array.from({ length: feedSearchRules.maximumIdentities + 1 }, (_, index) =>
    row(`team-${index}`, 'United'))), unavailable);
});

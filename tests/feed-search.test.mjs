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
const scores = (identities) => identities.map(({ id, score }) => ({ id, score }));

test('empty search performs no catalog read; punctuation cannot widen the fixture cohort', async () => {
  const statements = [];
  assert.equal(await resolve('', [], statements), null);
  const search = await resolve('%_!', [row('team-a', 'Example FC')], statements);
  assert.deepEqual(search, { query: '%_!', words: 0, distinctive: 0, teams: [], competitions: [] });
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
  assert.deepEqual(search.teams, [{ id: 'team-a', score: 1000, covered: 0b11, direct: 0b11, anchor: 0b11 }]);
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
  assert.deepEqual((await resolve('germany', rows)).teams, [{ id: 'team-a', score: 1000, covered: 1, direct: 1, anchor: 0 }], 'a country covers words but anchors none');
  assert.deepEqual(scores((await resolve('beyond page alias', rows)).teams), [{ id: 'team-b', score: 1000 }]);
  assert.deepEqual(scores((await resolve('old english league', rows)).competitions), [{ id: 'league-a', score: 1000 }]);
  const country = await resolve('england', rows);
  assert.deepEqual(scores(country.teams), [{ id: 'team-b', score: 1000 }]);
  assert.deepEqual(scores(country.competitions), [{ id: 'league-a', score: 1000 }]);
  const fuzzy = await resolve('bayren munich', rows);
  assert.equal(fuzzy.teams[0].id, 'team-a');
  assert.ok(fuzzy.teams[0].score > 0 && fuzzy.teams[0].score < 700, 'a corrected spelling is a similar result');
  assert.equal(fuzzy.teams[0].direct, 0b10, 'only Munich matched directly');
});

test('unknown words and adjacent numeric identities return no broad fallback', async () => {
  const rows = [row('team-3901', 'Synthetic Club 3901'), row('team-3902', 'Synthetic Club 3902')];
  assert.deepEqual(scores((await resolve('synthetic club 3901', rows)).teams), [{ id: 'team-3901', score: 1000 }]);
  assert.deepEqual((await resolve('unrelated unknown side', rows)).teams, []);
});

const identity = (id, score, covered, direct = covered, anchor = covered) => ({ id, score, covered, direct, anchor });
const packed = ({ score, covered, direct, anchor }) => BigInt(score) << 48n | BigInt(anchor) << 32n | BigInt(direct) << 16n | BigInt(covered);

test('SQL filters matching fixtures before pagination and ranks exact, then wider, then stronger matches ahead of the chosen sort', async () => {
  const query = parseFeedQuery({ date: '2026-10-09', q: 'united', league: 'league-a', status: 'scheduled',
    sort: 'probability', dir: 'asc', page: '2' }, { today: '2026-10-09' });
  const search = { query: query.search, words: 1, distinctive: 0,
    teams: [identity("team-a' OR 1=1", 1000, 1), identity('team-b', 640, 1, 0), identity('team-c', 1000, 1)],
    competitions: [identity('league-a', 600, 1, 0, 0)] };
  const sql = feedSql(query, range, [39], false, search);
  assert.match(sql.searchJoin.sql, /sf\.homeTeamId IN \(\?,\?,\?\) OR sf\.awayTeamId IN \(\?,\?,\?\) OR ss\.competitionId IN \(\?\)/u);
  assert.match(sql.searchJoin.sql, /CASE WHEN sf\.homeTeamId IN \(\?,\?\) THEN \? WHEN sf\.homeTeamId IN \(\?\) THEN \?/u, 'equal identities share one branch');
  assert.match(sql.searchJoin.sql, /sf\.kickoff>=\? AND sf\.kickoff<\?/u);
  assert.ok(sql.searchJoin.values.includes(search.teams[0].id));
  assert.ok(sql.searchJoin.values.includes(packed(search.teams[0])) && sql.searchJoin.values.includes(packed(search.competitions[0])));
  assert.match(sql.where.sql, /l\.id IN \(\?\).*f\.status=\?.*\(\(sm\.home \| sm\.away \| sm\.competition\) & \?\)=\?$/su,
    'without a distinctive word a fixture must cover every word');
  assert.doesNotMatch(`${sql.where.sql} ${sql.searchJoin.sql}`, /LIKE|team-a'|united/u);
  assert.match(sql.order.sql, /^\(\(\(sm\.home \| sm\.away \| sm\.competition\) >> 16\) & \?\)=\? DESC, BIT_COUNT\(.*\) DESC, GREATEST\(sm\.home >> 48, sm\.away >> 48, sm\.competition >> 48\) DESC, /su);
  assert.match(sql.order.sql, /m\.selectedProbability IS NULL ASC, m\.selectedProbability ASC, f\.kickoff ASC, f\.id ASC$/u);
  assert.match(sql.exact.sql, /^\(\(\(sm\.home \| sm\.away \| sm\.competition\) >> 16\) & \?\)=\?$/u);
  assert.doesNotMatch(`${sql.scope.sql} ${sql.joins.sql} ${sql.cohortJoins.sql}`, /sm\.|sf\./u, 'Known counts and league options retain the full date cohort.');
  assert.ok(sql.joins.sql.startsWith(sql.cohortJoins.sql), 'filtered reads extend the cohort joins');
  assert.doesNotMatch(`${sql.scope.sql} ${sql.cohortJoins.sql}`, /\bm\.|\bop\.|MarketPrediction|FixtureOddsPrice/u, 'cohort counts never evaluate the shown pick');
  assert.throws(() => feedSql(query, range, [39]), unavailable);
  assert.throws(() => feedSql(query, range, [39], false, { ...search, query: 'other' }), unavailable);
  const ordinary = feedSql(parseFeedQuery({ date: '2026-10-09' }, { today: '2026-10-09' }), range, [39]);
  assert.equal(ordinary.order.sql, 'f.kickoff DESC, f.id DESC');
  const earliest = feedSql({ ...query, search: '', sort: { by: 'kickoff', direction: 'asc' } }, range, [39]);
  assert.equal(earliest.order.sql, 'f.kickoff ASC, f.id ASC');
});

test('a fixture combines the words its teams and competition cover, and a lone mention needs another named team', async () => {
  const rows = [row('team-barca', 'Barcelona', { country: 'Spain' }), row('team-real', 'Real Madrid', { country: 'Spain' }),
    row('team-getafe', 'Getafe', { country: 'Spain' }), row('team-city', 'Manchester City', { country: 'England' }),
    row('league-liga', 'La Liga', { kind: 'competition', country: 'Spain' })];
  const derby = await resolve('Barcelona vs Real Madrid', rows);
  assert.equal(derby.words, 3);
  assert.equal(derby.distinctive, 0b101, 'Barcelona and Madrid identify teams; Real does not');
  assert.deepEqual(derby.teams.map(({ id, covered, direct, anchor }) => ({ id, covered, direct, anchor })),
    [{ id: 'team-barca', covered: 0b001, direct: 0b001, anchor: 0b001 }, { id: 'team-real', covered: 0b110, direct: 0b110, anchor: 0b110 }]);
  const query = parseFeedQuery({ date: '2026-10-09', q: 'Barcelona vs Real Madrid' }, { today: '2026-10-09' });
  const sql = feedSql(query, range, [39], false, derby);
  assert.match(sql.where.sql, /\(\(\(sm\.home \| sm\.away \| sm\.competition\) & \?\)=\? OR \(\(\(sm\.home \| sm\.away \| sm\.competition\) >> 32\) & \?\)<>0\)$/u);
  assert.deepEqual(sql.where.values.slice(-3), [7, 7, 5], 'every word, or a distinctive word covered by a name');
  const spanish = await resolve('spanish league', rows);
  assert.deepEqual(spanish.competitions.map(({ id, covered, anchor }) => ({ id, covered, anchor })), [{ id: 'league-liga', covered: 0b11, anchor: 0b10 }],
    'La Liga covers "league" by name and "spain" by country');
  assert.deepEqual(spanish.teams.map(({ id, anchor }) => ({ id, anchor })), [{ id: 'team-barca', anchor: 0 }, { id: 'team-getafe', anchor: 0 }, { id: 'team-real', anchor: 0 }]);
  assert.deepEqual((await resolve('Manchester United', rows)).teams, [], 'City is never a mention of United');
  // "Reading" resembles "racing"; a catalog name containing it confirms it as a team, so either side may stand alone.
  const reading = await resolve('Reading vs Arsenal', [row('team-reading', 'Reading'), row('team-arsenal', 'Arsenal')]);
  assert.equal(reading.distinctive, 0b11);
  assert.equal((await resolve('Reading vs Arsenal', [row('team-arsenal', 'Arsenal')])).distinctive, 0b10, 'unconfirmed, it stays a qualifier');
});

test('long queries search their first sixteen words, and an empty identity set is an ordinary empty result', async () => {
  const q = 'arsenal chelsea liverpool spurs man city man united newcastle aston villa brighton west ham everton wolves fulham';
  const search = await resolve(q, [row('team-arsenal', 'Arsenal'), row('team-fulham', 'Fulham')]);
  assert.equal(search.words, 16);
  assert.deepEqual(search.teams.map(({ id }) => id), ['team-arsenal']);
  const query = parseFeedQuery({ date: '2026-10-09', q }, { today: '2026-10-09' });
  assert.doesNotThrow(() => feedSql(query, range, [39], false, search));
  assert.match(feedSql(query, range, [39], false, { ...search, words: 17, teams: [] }).where.sql, /AND FALSE$/u);
  assert.throws(() => feedSql(query, range, [39], false, { ...search, words: 17 }), unavailable, 'masks never exceed sixteen words');
});

test('catalog and identity limits fail explicitly instead of truncating search results', async () => {
  await assert.rejects(resolve('united', Array(feedSearchRules.maximumCatalogRows + 1).fill(row('team-a', 'United'))), unavailable);
  await assert.rejects(resolve('united', Array.from({ length: feedSearchRules.maximumIdentities + 1 }, (_, index) =>
    row(`team-${index}`, 'United'))), unavailable);
});

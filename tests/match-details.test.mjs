import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseFeedQuery } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import {
  defaultMatchView, openItem, openSection, parseMatchView, serializeMatchView, splitMatchViewParameters,
} from '../src/domain/match-view.ts';
import {
  formRecords, headToHead, insightsPreview, matchInsightsSchema, pageOf, perMatchValue, previewRules, resultFor, summarize, teamComparison,
} from '../src/domain/match-insights.ts';
import {
  featuredFamily, formLetters, goalTotals, marketCategoryMembers, marketOutcomes, marketRow, parsePlayerKey, pitchRows, playerKey,
  positionGroup, visibleMarkets,
} from '../src/domain/match-details.ts';
import { makeStore } from '../src/state/store.ts';
import { refreshApi } from '../src/state/refresh-api.ts';

const home = 'home-team', away = 'away-team', other = 'other-team';
const team = (id, name = id) => ({ id, name, logoUrl: null });
const competition = { id: 'league', name: 'League', logoUrl: null };
let sequence = 0;
/** A stored verified regulation result; kickoff decreases so arrays stay newest first. */
function result(homeId, awayId, homeGoals, awayGoals, extra = {}) {
  sequence += 1;
  return { fixtureId: `fixture-${sequence}`, slug: 'a-vs-b', kickoffAt: 1_790_000_000_000 - sequence * 86_400_000, competition,
    home: team(homeId), away: team(awayId), homeGoals, awayGoals, status: 'finished-regulation', ...extra };
}

test('match view parses leniently, drops section-scoped keys without a section and keeps unrelated query keys', () => {
  assert.deepEqual(parseMatchView(new URLSearchParams()), defaultMatchView);
  const odd = parseMatchView(new URLSearchParams('section=nope&tab=x&item=y&page=4&mcat=bogus&market=corners&mk=open&window=7'));
  assert.equal(odd.section, null); assert.equal(odd.tab, null); assert.equal(odd.item, null); assert.equal(odd.page, 1);
  assert.equal(odd.marketCategory, 'popular'); assert.equal(odd.market, null); assert.equal(odd.marketsOpen, true); assert.equal(odd.window, 5);
  const view = parseMatchView({ section: 'h2h', item: 'fixture-1', page: '3', venue: 'home', comp: 'league', window: '10', mk: 'closed', market: 'total-goals' });
  assert.equal(view.section, 'h2h'); assert.equal(view.item, 'fixture-1'); assert.equal(view.page, 3); assert.equal(view.venue, 'home');
  assert.equal(view.competition, 'league'); assert.equal(view.window, 10); assert.equal(view.marketsOpen, false); assert.equal(view.market, 'total-goals');
  for (const item of ['../x', '<script>', 'a'.repeat(200)]) assert.equal(parseMatchView({ section: 'news', item }).item, null);
  const base = new URLSearchParams('revision=abc&section=form&page=2&cycleAnchor=3');
  const next = serializeMatchView({ ...view, page: 2 }, base);
  assert.equal(next.get('revision'), 'abc'); assert.equal(next.get('cycleAnchor'), '3'); assert.equal(next.get('section'), 'h2h');
  assert.equal(next.get('page'), '2'); assert.equal(next.get('mk'), 'closed');
  assert.equal(serializeMatchView(defaultMatchView).toString(), '');
  assert.deepEqual(parseMatchView(serializeMatchView(view)), view);
});

test('opening another section resets its filters, items open their section first, and history keys split from view keys', () => {
  const view = parseMatchView({ section: 'form', team: 'away', venue: 'away', window: '0', page: '2', item: 'fixture-9' });
  const switched = openSection(view, 'players');
  assert.equal(switched.section, 'players'); assert.equal(switched.team, 'both'); assert.equal(switched.venue, 'all');
  assert.equal(switched.window, 5); assert.equal(switched.page, 1); assert.equal(switched.item, null);
  assert.deepEqual(openItem(view, 'form', 'fixture-2'), { ...view, item: 'fixture-2' });
  const fromPreview = openItem(defaultMatchView, 'news', 'analysis-1');
  assert.equal(fromPreview.section, 'news'); assert.equal(fromPreview.item, 'analysis-1');
  const { view: split, rest } = splitMatchViewParameters({ section: 'h2h', revision: 'r', limit: '5', item: 'x' });
  assert.equal(split.section, 'h2h'); assert.equal(split.item, 'x'); assert.deepEqual(rest, { revision: 'r', limit: '5' });
});

test('form, head-to-head and comparison totals come from stored verified results only', () => {
  const homeForm = [result(home, other, 2, 0), result(other, home, 1, 1), result(home, other, 0, 3), result(other, home, 0, 2)];
  const summary = summarize(homeForm, home);
  assert.deepEqual({ ...summary }, { matches: 4, wins: 2, draws: 1, losses: 1, goalsFor: 5, goalsAgainst: 4,
    bttsRate: 0.25, over25Rate: 0.25, cleanSheetRate: 0.5, failedToScoreRate: 0.25 });
  assert.equal(summarize([], home).bttsRate, null);
  assert.equal(formRecords(homeForm, home, 'home', 0).length, 2); assert.equal(formRecords(homeForm, home, 'away', 1).length, 1);
  assert.equal(resultFor(homeForm[1], home), 'D');
  assert.deepEqual(formLetters(homeForm, home, 3), ['L', 'D', 'W']);
  assert.deepEqual(goalTotals(homeForm.slice(0, 2), home), { scored: 3, conceded: 1, series: [1, 2] });
  const meetings = [result(home, away, 2, 1), result(away, home, 3, 3), result(away, home, 1, 0)];
  assert.deepEqual(headToHead(meetings, home), { meetings: 3, homeWins: 1, draws: 1, awayWins: 1, averageGoals: 10 / 3, bttsRate: 2 / 3, over25Rate: 2 / 3 });
  assert.equal(headToHead([], home).averageGoals, null);
  const comparison = teamComparison(homeForm, [], home, away);
  const points = comparison.rows.find((row) => row.metric === 'pointsPerGame');
  assert.equal(points.home, 7 / 4); assert.equal(points.away, null); assert.equal(points.kind, 'average');
  assert.equal(comparison.rows.find((row) => row.metric === 'winRate').kind, 'rate');
  assert.equal(perMatchValue(homeForm[0], home, 'goalsFor'), 2); assert.equal(perMatchValue(homeForm[1], home, 'pointsPerGame'), 1);
  assert.equal(perMatchValue(homeForm[2], home, 'cleanSheetRate'), 0);
});

test('pagination exposes every page of a complete collection, clamping out-of-range pages', () => {
  const items = Array.from({ length: 23 }, (_, index) => index);
  assert.deepEqual(pageOf(items, 3, 10), { items: [20, 21, 22], page: 3, pages: 3, total: 23 });
  assert.deepEqual(pageOf(items, 99, 10).page, 3); assert.deepEqual(pageOf([], 2, 10), { items: [], page: 1, pages: 1, total: 0 });
});

function insights() {
  const form = Array.from({ length: 14 }, (_, index) => result(home, other, index % 3, 1));
  return matchInsightsSchema.parse({ fixtureId: 'fixture-main', asOf: 1, home: team(home), away: team(away), sections: {
    form: { home: form, away: form.slice(0, 3).map((entry) => ({ ...entry, home: team(away) })) },
    h2h: { meetings: Array.from({ length: 8 }, () => result(home, away, 1, 0)) },
    stats: { evidence: Array.from({ length: 9 }, (_, index) => ({ metric: `metric-${index}`, unit: null, home: { average: 1, samples: 2 }, away: null })),
      evidenceRetrievedAt: 5 },
    lineups: { home: null, away: null },
    players: { players: Array.from({ length: 10 }, (_, index) => ({ id: index + 1, team: 'home', name: `P${index}`, number: index, position: 'M', grid: null, role: 'starting' })) },
    injuries: { injuries: [] },
    news: { items: Array.from({ length: 5 }, (_, index) => ({ id: `n${index}`, kind: 'report', publisher: 'P', title: 'T', url: null, publishedAt: null, retrievedAt: 1, details: [] })),
      limitedNews: true },
    context: { competition: { ...competition, country: null, round: 'R1' }, kickoffAt: 2, restDays: { home: 3.5, away: null },
      lastResults: { home: null, away: null }, nextFixtures: { home: null, away: null } },
    referee: { state: 'not-available' }, history: { state: 'available' },
  } });
}

test('overview previews truncate each collection and keep complete totals for View all', () => {
  const full = insights(), preview = insightsPreview(full);
  assert.equal(preview.sections.form.home.length, previewRules.form); assert.equal(preview.totals.formHome, 14);
  assert.equal(preview.sections.h2h.meetings.length, previewRules.meetings); assert.equal(preview.totals.meetings, 8);
  assert.equal(preview.sections.players.players.length, previewRules.players); assert.equal(preview.totals.players, 10);
  assert.equal(preview.sections.news.items.length, previewRules.news); assert.equal(preview.totals.news, 5);
  assert.equal(preview.sections.news.limitedNews, true); assert.equal(preview.sections.stats.evidence.length, previewRules.stats);
  assert.equal(preview.sections.context.restDays.home, 3.5); assert.deepEqual(preview.sections.referee, { state: 'not-available' });
  // The source collections are not mutated.
  assert.equal(full.sections.form.home.length, 14);
});

const market = (family, selection, probabilities) => ({ market: { family, selection, selectedProbability: probabilities[selection], probabilities, source: 'api-football' },
  alternatives: [], source: { kind: 'api-football', provisional: true, fallbackReason: null, sourceIds: [] }, timestamps: { generatedAt: null, retrievedAt: 1, providerUpdatedAt: null } });
function detail(markets, unavailable = []) {
  return { fixture: { unavailableMarkets: unavailable }, snapshot: { revisionId: 'r', cycleId: 'c', markets, outcomes: [], unavailableMarkets: unavailable } };
}

test('the featured pick is the highest stored probability; missing markets keep their stored reason', () => {
  const data = detail([market('match-result', 'draw', { 'home-win': 0.1, draw: 0.45, 'away-win': 0.45 }),
    market('double-chance', 'away-or-draw', { 'home-or-draw': 0.55, 'away-or-draw': 0.9, 'home-or-away': 0.55 })],
  [{ family: 'total-goals', reason: 'unsupported' }, { family: 'both-teams-to-score', reason: 'unsupported' }]);
  assert.equal(featuredFamily(data), 'double-chance');
  assert.equal(featuredFamily(detail([])), null);
  assert.equal(marketRow(data, 'total-goals').item, null); assert.equal(marketRow(data, 'total-goals').reason, 'unsupported');
  assert.equal(marketRow({ fixture: { unavailableMarkets: [] }, snapshot: null }, 'match-result').reason, 'not-published');
  assert.deepEqual(marketOutcomes({ draw: 0.45, 'home-win': 0.1, 'away-win': 0.45 }, 'match-result').map((entry) => entry.selection), ['home-win', 'draw', 'away-win']);
  assert.equal(marketOutcomes({}, 'both-teams-to-score')[0].probability, null);
});

test('market categories and search reach every supported family; unsupported categories are honestly empty', () => {
  const label = (family) => ({ 'match-result': 'Match result 1X2', 'double-chance': 'Double chance DC', 'total-goals': 'Over/Under 2.5 O/U 2.5',
    'both-teams-to-score': 'Both teams to score BTTS' })[family];
  assert.equal(visibleMarkets('popular', '', label).length, 4);
  assert.deepEqual(visibleMarkets('goals', '', label), ['total-goals', 'both-teams-to-score']);
  assert.deepEqual(visibleMarkets('corners', '', label), []); assert.deepEqual(marketCategoryMembers.handicaps, []);
  assert.deepEqual(visibleMarkets('corners', 'btts', label), ['both-teams-to-score']);
  assert.deepEqual(visibleMarkets('popular', '  zzz ', label), []);
});

test('player keys, position groups and formation rows are derived without guessing', () => {
  assert.equal(playerKey('away', 42), 'away-42'); assert.deepEqual(parsePlayerKey('home-7'), { team: 'home', id: 7 });
  for (const bad of [null, 'home-0', 'side-7', 'home-7x']) assert.equal(parsePlayerKey(bad), null);
  assert.equal(positionGroup('G'), 'G'); assert.equal(positionGroup('Defender'), 'D'); assert.equal(positionGroup('Attacker'), 'F'); assert.equal(positionGroup(null), null);
  const players = [{ id: 1, grid: '1:1' }, { id: 3, grid: '2:2' }, { id: 2, grid: '2:1' }, { id: 4, grid: '3:1' }];
  assert.deepEqual(pitchRows(players).map((row) => row.map((player) => player.id)), [[1], [2, 3], [4]]);
  assert.equal(pitchRows([{ id: 1, grid: null }]), null); assert.equal(pitchRows([]), null);
});

test('section data loads once per fixture and section, shared by simultaneous consumers, and rejects mismatched payloads', async (t) => {
  const today = parseReportingDate('2026-10-10'), id = randomUUID(), original = globalThis.fetch, calls = [], pending = [];
  globalThis.fetch = async (href, options) => { calls.push({ href, options }); return new Promise((resolve) => pending.push(resolve)); };
  const store = makeStore({ today, query: parseFeedQuery(new URLSearchParams(), { today }), data: null });
  t.after(() => { globalThis.fetch = original; store.dispatch(refreshApi.util.resetApiState()); });
  const first = store.dispatch(refreshApi.endpoints.insights.initiate({ id, section: 'h2h' }));
  const second = store.dispatch(refreshApi.endpoints.insights.initiate({ id, section: 'h2h' }));
  assert.equal(calls.length, 1); assert.equal(calls[0].href, `/api/matches/${id}/insights?section=h2h`);
  assert.equal(calls[0].options.credentials, 'omit');
  pending.shift()(Response.json({ fixtureId: id, asOf: 7, section: 'h2h', data: { meetings: [] } }));
  assert.deepEqual((await first.unwrap()).data, { meetings: [] }); assert.deepEqual((await second.unwrap()).data, { meetings: [] });
  // A cached section is reused instead of refetched.
  const again = store.dispatch(refreshApi.endpoints.insights.initiate({ id, section: 'h2h' }));
  await again.unwrap(); assert.equal(calls.length, 1);
  first.unsubscribe(); second.unsubscribe(); again.unsubscribe();
  for (const body of [{ fixtureId: randomUUID(), asOf: 1, section: 'news', data: { items: [], limitedNews: false } },
    { fixtureId: id, asOf: 1, section: 'h2h', data: { items: [] } }, { fixtureId: id, asOf: 1, section: 'news', data: { items: 'x', limitedNews: false } }]) {
    globalThis.fetch = async () => Response.json(body);
    const request = store.dispatch(refreshApi.endpoints.insights.initiate({ id, section: 'news' }, { forceRefetch: true }));
    await assert.rejects(request.unwrap(), (error) => error.code === 'invalid-response'); request.unsubscribe();
  }
});

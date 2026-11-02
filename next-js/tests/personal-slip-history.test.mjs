import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersonalSlipHistory } from '../src/server/slips/personal-history.ts';
import { createPersonalSlipHistoryHandler } from '../src/server/slips/personal-history-http.ts';
import { defaultBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { liveRecord } from './helpers/live-refresh-fixtures.mjs';

const today = parseReportingDate('2026-11-03'), now = Date.parse(`${today}T12:00:00+03:00`), fixture = liveRecord();
const selection = { fixtureId: fixture.fixtureId, kickoffAt: now + 10000, homeTeam: fixture.homeTeam, awayTeam: fixture.awayTeam,
  competition: fixture.competition, family: 'match-result', selection: 'home-win', probability: .7, odds: '2.00', oddsBasis: 'bookmaker' };
const snapshot = { id: 'saved-original', selections: [selection], totalOdds: '2.00', averageProbability: .7, oddsBasis: 'bookmaker' };
test('personal saved browsing scopes every SQL batch to its owner and separates yesterday from today', async () => {
  const statements = [], rows = Array.from({ length: 26 }, (_, index) => ({ id: `save-${String(index).padStart(2, '0')}`,
    createdAt: new Date(index < 22 ? now - index * 1000 : now - 86_400_000 - index * 1000), snapshotJson: snapshot }));
  const tx = { async $queryRaw(sql) {
    statements.push(sql); assert.match(sql.sql, /s.accountId=\?/); assert.equal(sql.values[0], 'owner-only');
    return rows;
  } };
  const read = createPersonalSlipHistory({ transaction: async (run) => run(tx) }, { now: () => now,
    resolveResults: async () => [] });
  const result = await read('owner-only', defaultBestSlipsQuery(), today);
  assert.equal(result.browse.total, 26); assert.equal(result.slips.length, 20); assert.equal(result.browse.hasMore, true);
  assert.equal(result.statistics.pending, 26); assert.equal(result.summary.statistics.pending, 4);
  assert.equal(result.summary.from, '2026-11-02'); assert.equal(result.slips[0].publicationDay, today);
  assert.ok(result.slips.every((row) => row.slip && !('estimatedProbability' in row)));
  const second = await read('owner-only', { ...defaultBestSlipsQuery(), page: 2 }, today);
  assert.equal(second.slips.length, 6); assert.equal(second.browse.hasMore, false);
  assert.equal(second.slips[0].id, rows[20].id); assert.equal(second.browse.version, result.browse.version);
});

const identity = { accountId: 'owner', tokenHash: 'session', blocked: false };
function dependencies({ before = identity, after = identity, tier = 'free' } = {}) {
  let checks = 0, reads = 0;
  return { get reads() { return reads; }, options: { now: () => now,
    members: async () => ({ config: { production: false }, sessions: { verify: async () => checks++ === 0 ? before : after } }),
    services: async () => ({ database: {} }), access: async () => ({ tier, signedIn: true, mode: 'off' }),
    read: () => async (accountId, query) => { reads++; assert.equal(accountId, 'owner');
      return { day: today, state: 'generated', slips: [{ rank: 1, totalOdds: '2.00', averageProbability: .7, matchCount: 1, slip: snapshot, completed: false }],
        searchLimited: false, partialCoverage: false, browse: { query, total: 1, pageSize: 20, hasMore: false, nextCursor: null, from: today, to: today } }; } } };
}
test('private history denies guests and changed sessions, with no owner identifiers or unfinished picks in a free response', async () => {
  for (const condition of [{ before: null }, { after: null }, { after: { ...identity, accountId: 'another' } }, { after: { ...identity, blocked: true } }]) {
    const deps = dependencies(condition), response = await createPersonalSlipHistoryHandler(deps.options)(new Request('https://goalhint.com/api/slips/history'));
    assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /saved-original|home-win/);
    if (condition.before === null) assert.equal(deps.reads, 0);
  }
  const deps = dependencies(), response = await createPersonalSlipHistoryHandler(deps.options)(new Request('https://goalhint.com/api/slips/history'));
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const data = await response.json(); assert.equal(data.entitled, false); assert.equal(data.slips[0].preview[0].pick, null);
  assert.doesNotMatch(JSON.stringify(data), /accountId|tokenHash|home-win|saved-original|completedFixtureIds/);
  const full = dependencies({ tier: 'full' }), fullResponse = await createPersonalSlipHistoryHandler(full.options)(new Request('https://goalhint.com/api/slips/history'));
  assert.equal((await fullResponse.json()).slips[0].slip.selections[0].selection, 'home-win');
});

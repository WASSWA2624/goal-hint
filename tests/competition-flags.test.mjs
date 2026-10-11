import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { parseUtcInstant } from '../src/domain/calendar.ts';
import { checkedFeedPage } from '../src/domain/feed-pagination.ts';
import { parseFixtureSnapshot } from '../src/domain/fixture-snapshot.ts';
import { matchFeedRecordSchema } from '../src/domain/match-feed.ts';
import { matchDetailResponseSchema } from '../src/domain/match-detail.ts';
import { API_FOOTBALL_CONTRACT_VERSION } from '../src/server/football/api-football-contract.ts';
import { normalizeCompetition, normalizeFixture } from '../src/server/football/api-football-normalize.ts';
import { validateCatalogBatch } from '../src/server/football/catalog-input.ts';
import { isApiFootballMediaUrl } from '../src/server/live/live-authorities.ts';
import { fixture } from './helpers/client-state-fixtures.mjs';
import { liveDetail, liveFeed, liveRecord, query, today } from './helpers/live-refresh-fixtures.mjs';

// Country flags beside competitions. Synthetic direct-v3 rows shaped like the official v3 examples (/fixtures
// `league.flag`, /leagues `country.flag`, null for "World" competitions); no provider, media or database access.
const NOW = parseUtcInstant('2026-10-11T08:00:00.000Z');
const FLAG = 'https://media.api-sports.io/flags/gb-eng.svg';
const context = (endpoint, overrides = {}) => ({ retrievedAt: NOW - 1000, endpoint, ...overrides });
const approve = { verifyLogo: () => true, verifyRegulationScore: () => true };
function providerFixture(league = {}) {
  return { fixture: { id: 901, date: '2026-10-11T18:00:00+00:00', timezone: 'UTC', timestamp: Date.parse('2026-10-11T18:00:00Z') / 1000,
    status: { short: 'NS', elapsed: null } },
  league: { id: 39, name: 'Premier League', country: 'England', logo: 'https://media.api-sports.io/football/leagues/39.png',
    season: 2026, round: 'Regular Season - 8', ...league },
  teams: { home: { id: 33, name: 'Synthetic Home' }, away: { id: 34, name: 'Synthetic Away' } },
  goals: { home: null, away: null }, score: { fulltime: null, extratime: null, penalty: null } };
}
const normalized = (league, extra = approve) => {
  const result = normalizeFixture(providerFixture(league), context('/fixtures', extra));
  assert.equal(result.valid, true);
  return result;
};

test('/fixtures league.flag is kept under the logo rights check; absent, null and malformed flags never reject the row', () => {
  const approved = normalized({ flag: FLAG });
  assert.deepEqual(approved.data.competition.countryFlag, { url: FLAG, rights: 'approved' });
  assert.equal(approved.missingCoverage.some((entry) => entry.startsWith('competition-country-flag')), false);
  let checked;
  normalized({ flag: FLAG }, { verifyLogo: (url) => { checked = url; return true; } });
  assert.equal(checked, FLAG, 'the flag goes through the same rights verifier as logos');

  const unreviewed = normalized({ flag: FLAG }, {});
  assert.deepEqual(unreviewed.data.competition.countryFlag, { url: null, rights: 'review-required' });
  assert.ok(unreviewed.missingCoverage.includes('competition-country-flag-rights-review'));

  // International competitions report `flag: null`; the repository's recorded synthetic rows omit the key entirely.
  for (const league of [{ flag: null, country: 'World' }, {}, { flag: 42 }, { flag: { url: FLAG } }, { flag: '' }]) {
    const result = normalized(league);
    assert.deepEqual(result.data.competition.countryFlag, { url: null, rights: 'unavailable' }, JSON.stringify(league));
    assert.ok(result.missingCoverage.includes('competition-country-flag'));
  }
  for (const flag of ['http://media.api-sports.io/flags/gb.svg', 'https://media.api-sports.io/flags/gb.svg?key=secret',
    'https://user:secret@media.api-sports.io/flags/gb.svg', 'https://media.api-sports.io/flags/gb.svg#x', ' https://media.api-sports.io/flags/gb.svg',
    `https://media.api-sports.io/${'a'.repeat(2048)}.svg`]) {
    assert.deepEqual(normalized({ flag }).data.competition.countryFlag, { url: null, rights: 'review-required' }, flag.slice(0, 60));
  }
});

test('/leagues country.flag (or a league-level flag) fills the competition flag', () => {
  const row = (country, league = {}) => normalizeCompetition({ league: { id: 39, name: 'Premier League', type: 'League',
    logo: 'https://media.api-sports.io/football/leagues/39.png', ...league }, country, seasons: [{ year: 2026, current: true }] },
  context('/leagues', approve));
  assert.deepEqual(row({ name: 'England', code: 'GB-ENG', flag: FLAG }).data.countryFlag, { url: FLAG, rights: 'approved' });
  assert.equal(row({ name: 'England', code: 'GB-ENG', flag: FLAG }).data.country, 'England');
  assert.deepEqual(row({ name: 'World', code: null, flag: null }).data.countryFlag, { url: null, rights: 'unavailable' });
  assert.deepEqual(row({ name: 'England', flag: 7 }, { flag: FLAG }).data.countryFlag, { url: FLAG, rights: 'approved' });
  assert.deepEqual(row(null).data.countryFlag, { url: null, rights: 'unavailable' });
});

test('the catalog batch re-checks flag rights and drops a denied flag like a denied logo', () => {
  const row = normalized({ flag: FLAG }).data;
  const request = { id: randomUUID(), selection: { kind: 'fixtures', query: { date: '2026-10-11' } },
    bounds: { priority: 'live-date-sync', deadlineAt: NOW + 60_000, timeoutMs: 1000, maxRequests: 1, maxPages: 1, maxRows: 10,
      maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 },
    retentionEvidenceRef: 'synthetic-retention' };
  const result = { status: 'complete', data: [row], completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [], invalidRows: 0 },
    provenance: [{ provider: 'api-football', endpoint: 'fixtures', requestParameters: { date: '2026-10-11', timezone: 'Africa/Kampala' },
      contractVersion: API_FOOTBALL_CONTRACT_VERSION, retrievedAt: NOW - 1000, providerUpdatedAt: null, fromCache: false, currentPage: 1, totalPages: 1,
      quota: { kind: 'success' } }], requestsDispatched: 1, error: null };
  const authority = (verifyLogo) => ({ authorize() {}, verifyRetention: () => true, verifyObservation: () => true, verifyLogo,
    verifyRegulationScore: () => true, verifyMapping: () => false, regulationEvidenceRef: () => null, verifyKnownSubset: () => false });
  const clock = { now: () => NOW };
  assert.equal(validateCatalogBatch(request, result, authority(() => true), clock).rows.fixtures[0].competition.countryFlag.url, FLAG);
  const denied = validateCatalogBatch(request, result, authority((url) => url !== FLAG), clock);
  assert.deepEqual(denied.rows.fixtures[0].competition.countryFlag, { url: null, rights: 'review-required' });
  assert.equal(denied.rows.fixtures[0].competition.logo.url, 'https://media.api-sports.io/football/leagues/39.png', 'the logo is judged on its own');
  assert.ok(denied.missingCoverage.includes('logo-rights-review'));
});

test('the live rights verifier accepts provider flags as well as logos, and nothing else', () => {
  for (const url of [FLAG, 'https://media.api-sports.io/flags/gb.svg', 'https://media-4.api-sports.io/flags/br.svg',
    'https://media.api-sports.io/flags/gb-wls.svg', 'https://media.api-sports.io/football/leagues/39.png',
    'https://media.api-sports.io/football/teams/33.png']) assert.equal(isApiFootballMediaUrl(url), true, url);
  for (const url of ['https://media.api-sports.io/flags/GB.svg', 'https://media.api-sports.io/flags/gb.png',
    'https://media.api-sports.io/flags/../football/teams/1.png', 'https://media.api-sports.io/flags/gb.svg?x=1',
    'https://example.com/flags/gb.svg', 'http://media.api-sports.io/flags/gb.svg', 'https://media.api-sports.io/flags/g.svg',
    'https://media.api-sports.io.example.com/flags/gb.svg']) assert.equal(isApiFootballMediaUrl(url), false, url);
});

test('fixture snapshots, feed and detail responses and the client refresh carry an optional nullable country flag', () => {
  const old = fixture();
  assert.equal('countryFlagUrl' in old.competition, false, 'payloads cached before flags still parse unchanged');
  const flagged = parseFixtureSnapshot({ ...old, competition: { ...old.competition, country: 'England', countryFlagUrl: FLAG } });
  assert.equal(flagged.competition.countryFlagUrl, FLAG);
  assert.equal(parseFixtureSnapshot({ ...old, competition: { ...old.competition, countryFlagUrl: null } }).competition.countryFlagUrl, null);
  for (const countryFlagUrl of ['http://media.api-sports.io/flags/gb.svg', 'https://user:pw@media.api-sports.io/flags/gb.svg',
    'https://media.api-sports.io/flags/gb.svg?key=1', 'javascript:alert(1)', '', 42]) {
    assert.throws(() => parseFixtureSnapshot({ ...old, competition: { ...old.competition, countryFlagUrl } }), undefined, String(countryFlagUrl));
  }
  const record = liveRecord({ competition: { id: 'league-a', name: 'Premier League', country: 'England', logoUrl: null, countryFlagUrl: FLAG } });
  assert.equal(record.competition.countryFlagUrl, FLAG);
  assert.equal(matchFeedRecordSchema.parse(liveRecord()).competition.countryFlagUrl, undefined);
  // The feed page and the detail response reuse the record schema; the client refresh parses the feed page as JSON.
  const feed = JSON.parse(JSON.stringify(liveFeed([record])));
  assert.equal(checkedFeedPage(feed, query(), today, 1).records[0].competition.countryFlagUrl, FLAG);
  assert.equal(liveDetail(record).fixture.competition.countryFlagUrl, FLAG);
  const unsafe = { ...record, competition: { ...record.competition, countryFlagUrl: 'https://media.api-sports.io/flags/gb.svg#x' } };
  assert.equal(matchDetailResponseSchema.safeParse({ ...liveDetail(record), fixture: unsafe }).success, false);
});

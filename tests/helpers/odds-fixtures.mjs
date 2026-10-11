import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getReportingDate } from '../../src/domain/calendar.ts';
import { DE_MARGIN_METHOD } from '../../src/domain/odds.ts';
import { ODDS_MAPPING_VERSION } from '../../src/domain/odds-markets.ts';
import { evidenceFingerprint } from '../../src/server/evidence/evidence-input.ts';
import { createApiFootballAdapter } from '../../src/server/football/api-football-adapter.ts';
import { ODDS_CONTRACT_VERSION } from '../../src/server/football/api-football-contract.ts';
import { createQuotaGateway } from '../../src/server/football/quota-gateway.ts';

// Prompt 052 odds fixtures. Every bookmaker, bet, price and approval here is synthetic and labelled;
// no recorded provider payload is used, and the transport never reaches the network.
const HOUR = 3_600_000, DAY = 24 * HOUR;
export const oddsHash = (value) => createHash('sha256').update(value).digest('hex');
export const ODDS_BOOKMAKER = 8;

export function oddsPolicy(overrides = {}) {
  return { version: 1, evidenceRef: 'synthetic-odds-policy', retentionEvidenceRef: 'synthetic-private-use', basis: 'bookmaker',
    bookmakerId: ODDS_BOOKMAKER, method: DE_MARGIN_METHOD, mappingVersion: ODDS_MAPPING_VERSION, contractVersion: ODDS_CONTRACT_VERSION,
    freshnessMs: 12 * HOUR, retainAfterKickoffMs: 30 * DAY, horizonDays: 7, sweepMs: 3 * HOUR, ...overrides };
}

/** Synthetic trusted bindings; `state.publicDisplay` stands in for owner-recorded odds display rights. */
export function oddsAuthority(state = { publicDisplay: false }, policy = oddsPolicy()) {
  return {
    authorize() {},
    verifyPolicy: (value) => evidenceFingerprint(value) === evidenceFingerprint(policy),
    verifyRetention: (permission) => permission.evidenceRef === policy.retentionEvidenceRef && permission.purpose === 'structured-odds-history' &&
      permission.rawPayloadsStored === false,
    verifyObservation: () => true,
    verifyPublicDisplay: () => state.publicDisplay === true,
  };
}

export function oddsRequest(kind, slot, { date = null, policy = oddsPolicy(), id } = {}) {
  return { id: id ?? oddsHash(`odds-request:${kind}:${slot}:${date}`), kind, slot, date, policy };
}

export function oddsBounds(now, overrides = {}) {
  return { priority: 'enrichment', deadlineAt: now + 120_000, timeoutMs: 1000, maxRequests: 4, maxPages: 3, maxRows: 30,
    maxResponseBytes: 1_000_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0, ...overrides };
}

/** Provider wall time in Kampala with an explicit +03:00 offset (whole seconds). */
export function kampalaTime(at) {
  return `${new Date(at + 3 * HOUR).toISOString().slice(0, 19)}+03:00`;
}
export const offsetTime = (at) => `${new Date(at).toISOString().slice(0, 19)}+00:00`;

/** The four launch bets plus one unmapped bet. Labels are verbatim provider-style strings. */
export function launchBets(overrides = {}) {
  const price = { home: '1.85', draw: '3.40', away: '4.20', homeDraw: '1.25', homeAway: '1.30', drawAway: '1.80',
    over: '1.90', under: '1.95', yes: '1.80', no: '2.00', ...overrides };
  return [
    { id: 1, name: price.matchWinnerName ?? 'Match Winner', values: [{ value: 'Home', odd: price.home }, { value: 'Draw', odd: price.draw },
      { value: 'Away', odd: price.away }] },
    { id: 5, name: 'Goals Over/Under', values: price.overUnder ?? [{ value: 'Over 1.5', odd: '1.30' }, { value: 'Under 1.5', odd: '3.50' },
      { value: 'Over 2.5', odd: price.over }, { value: 'Under 2.5', odd: price.under }] },
    { id: 8, name: 'Both Teams Score', values: price.btts ?? [{ value: 'Yes', odd: price.yes }, { value: 'No', odd: price.no }] },
    { id: 12, name: 'Double Chance', values: [{ value: 'Home/Draw', odd: price.homeDraw }, { value: 'Home/Away', odd: price.homeAway },
      { value: 'Draw/Away', odd: price.drawAway }] },
    { id: 99, name: 'Synthetic special', values: [{ value: 'Alpha', odd: '7.5' }] },
  ];
}

export function rawOddsRow(fixtureId, kickoff, { update = null, bookmakerId = ODDS_BOOKMAKER, bookmakerName = 'Synthetic bookmaker',
  bets = launchBets(), competitionId = 39 } = {}) {
  return { league: { id: competitionId, name: `Synthetic competition ${competitionId}`, country: 'Synthetic country', season: 2026 },
    fixture: { id: fixtureId, timezone: 'Africa/Kampala', date: kampalaTime(kickoff), timestamp: kickoff / 1000 },
    update, bookmakers: [{ id: bookmakerId, name: bookmakerName, bets }] };
}

/** A direct-v3 style envelope: /odds pages hold 10 rows; catalogs are one unpaginated page. */
export function oddsResponse(url, rows, options = {}) {
  const paginated = url.pathname === '/odds', page = Number(url.searchParams.get('page') ?? 1);
  const total = options.total ?? (paginated ? Math.max(1, Math.ceil(rows.length / 10)) : 1);
  const response = paginated ? rows.slice((page - 1) * 10, page * 10) : rows;
  return new Response(JSON.stringify({ get: url.pathname.slice(1), parameters: Object.fromEntries(url.searchParams), errors: [],
    results: response.length, paging: { current: paginated ? page : 1, total }, response }),
  { status: options.status ?? 200, headers: { 'content-type': 'application/json' } });
}

/** The real adapter and quota gateway over a synthetic limiter and transport. `state.rows` are raw /odds rows;
 * date queries return rows whose Kampala kickoff date matches. Only /odds endpoints may be requested. */
export function createSyntheticOddsAdapter(clock, { setTime = () => {} } = {}) {
  const network = [], reservations = [];
  const state = {
    rows: [], bets: [], bookmakers: [{ id: ODDS_BOOKMAKER, name: 'Synthetic bookmaker' }], respond: null,
  };
  const limiter = {
    async reserve(request) {
      reservations.push(request);
      return { status: 'reserved', permit: { requestId: request.requestId, periodId: oddsHash('synthetic-odds-period'),
        ownerToken: oddsHash(request.requestId), dispatchedAt: clock.now(), launchBefore: clock.now() + 1000 } };
    },
    async claimLaunch() { return { status: 'claimed', timeoutMs: 1000 }; },
    async complete() { return { status: 'recorded' }; },
  };
  const adapter = createApiFootballAdapter({ accountId: oddsHash('synthetic-odds-account'), credential: { read: () => 'synthetic-odds-private-key' },
    gateway: createQuotaGateway({ limiter, authorize() {} }), authorize() {}, clock, random: () => 0.5,
    sleep: async (ms) => setTime(clock.now() + ms),
    fetcher: async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      assert.equal(url.origin, 'https://v3.football.api-sports.io');
      assert.ok(['/odds', '/odds/bets', '/odds/bookmakers'].includes(url.pathname), 'odds imports fetch only odds endpoints');
      assert.equal(init.redirect, 'error');
      network.push(url);
      if (state.respond) return state.respond(url, network.length);
      if (url.pathname === '/odds/bets') return oddsResponse(url, state.bets);
      if (url.pathname === '/odds/bookmakers') return oddsResponse(url, state.bookmakers);
      const date = url.searchParams.get('date'), fixture = url.searchParams.get('fixture');
      return oddsResponse(url, state.rows.filter((row) => date !== null ? getReportingDate(row.fixture.timestamp * 1000) === date
        : String(row.fixture.id) === fixture));
    } });
  return { adapter, state, network, reservations };
}

/** The documented launch bet catalog plus one unmapped bet. */
export const launchBetCatalog = () => [{ id: 1, name: 'Match Winner' }, { id: 5, name: 'Goals Over/Under' }, { id: 8, name: 'Both Teams Score' },
  { id: 12, name: 'Double Chance' }, { id: 99, name: 'Synthetic special' }];

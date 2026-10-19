import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFeedDates, parseFeedQuery } from '../src/domain/feed-query.ts';
import { storedMatchFeedResponseSchema } from '../src/domain/match-feed.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { defaultSlipCriteria } from '../src/domain/slip-builder.ts';
import { MatchFeedError } from '../src/server/matches/feed-error.ts';
import { readPublicSlipBuild } from '../src/server/slips/public-slips.ts';
import { createSlipBuildService, slipReadRules } from '../src/server/slips/slip-service.ts';
import { storedSlipPricePools } from '../src/server/slips/price-read.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

const clock = { now: () => now }, token = 'a'.repeat(64);
function criteria(overrides = {}) {
  return { ...defaultSlipCriteria(today), dateTo: today, probMin: 50, oddsMin: 101, oddsMax: 100000,
    totalMin: 300, totalMax: 600, teamsMin: 2, teamsMax: 2, ...overrides };
}
function record(id, overrides = {}) {
  const value = liveRecord({ fixtureId: id, kickoffAt: now + 3600000 });
  return { ...value, homeTeam: { id: `${id}-home`, name: `${id} home` }, awayTeam: { id: `${id}-away`, name: `${id} away` },
    forecast: { ...value.forecast, provisional: false, updateDelayed: false },
    prices: [{ family: 'match-result', selection: 'home-win', price: '2.00', basis: 'bookmaker', retrievedAt: now - 1000, providerUpdatedAt: null }], ...overrides };
}
function page(parameters, records, overrides = {}) {
  const query = parseFeedQuery(parameters, { today }), range = resolveFeedDates(query, today), total = records.length;
  const totalPages = Math.ceil(total / query.pageSize), nextPage = query.page < totalPages ? query.page + 1 : null;
  const previousPage = query.page > 1 ? query.page - 1 : null;
  return storedMatchFeedResponseSchema.parse({ paginationVersion: token,
    records: records.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
    page: query.page, pageSize: query.pageSize, total, totalPages, nextPage, previousPage,
    links: { next: nextPage ? `/api/matches?page=${nextPage}` : null, previous: previousPage ? `/api/matches?page=${previousPage}` : null },
    asOf: now, today, range: { from: range.startDate, to: range.endDate, ...range.window }, state: total ? 'ready' : 'no-fixtures', message: null,
    coverage: { partial: false, knownFixtures: total, matchingWithMarket: total,
      dates: [{ date: today, status: 'complete', observedAt: now, authoritative: true }] }, run: null, ...overrides });
}
function service(read, overrides = {}) {
  return createSlipBuildService({ read, consume: async () => {}, providerOdds: true, clock, ...overrides });
}

test('disabled public odds policy makes no stored-price, database or rate-limit reads', async () => {
  let reads = 0, consumes = 0;
  const result = await service(async () => { reads++; throw new Error('should not read'); }, {
    providerOdds: false, consume: async () => { consumes++; throw new Error('should not consume'); },
  }).query(criteria());
  assert.equal(result.state, 'odds-unavailable'); assert.equal(result.data, null);
  assert.equal(reads, 0); assert.equal(consumes, 0);
  assert.equal((await readPublicSlipBuild(criteria(), clock)).state, 'odds-unavailable');
});

test('build uses one EAT stored cohort, all requested families, one budget charge and a final uncached probe', async () => {
  const records = [record('fixture-1'), record('fixture-2')], supplied = criteria({ markets: ['match-result', 'double-chance'], timeFrom: '12:00', timeTo: '16:00' });
  let reads = 0, consumes = 0;
  const result = await service(async (parameters, context, suppliedClock) => {
    reads++;
    const query = parseFeedQuery(parameters, { today, ...context });
    assert.deepEqual(query.markets, supplied.markets); assert.equal(query.status, 'scheduled');
    assert.deepEqual(query.time, { from: '12:00', to: '16:00', zone: 'Africa/Kampala' });
    assert.deepEqual(query.probability, { min: 0, max: 100 }); assert.equal(query.odds, null);
    assert.equal(query.picks, 'all'); assert.deepEqual(query.sort, { by: 'probability', direction: 'desc' });
    assert.equal(query.pageSize, 100); assert.equal(context.locale, 'en'); assert.equal(suppliedClock.now(), now);
    return page(parameters, records);
  }, { consume: async () => { consumes++; } }).query(supplied);
  assert.equal(consumes, 1); assert.equal(reads, 2); assert.equal(result.state, 'generated');
  assert.equal(result.examined, 2); assert.equal(result.searchLimited, false);
  assert.equal(result.data.slips[0].totalOdds, '4.00'); assert.equal(result.data.slips[0].averageProbability, 0.6);
});

test('blank kickoff times are omitted from feed queries and per-selection criteria decide qualification', async () => {
  let reads = 0;
  const records = [record('fixture-1'), record('fixture-2')];
  const result = await service(async (parameters) => {
    reads++; assert.equal(parameters.has('timeFrom'), false); assert.equal(parameters.has('timeTo'), false); assert.equal(parameters.has('tz'), false);
    return page(parameters, records);
  }).query(criteria({ oddsMin: 210 }));
  assert.equal(reads, 2); assert.equal(result.state, 'no-qualifying'); assert.equal(result.data.slips.length, 0);
  const noCombination = await service(async (parameters) => page(parameters, records)).query(criteria({ totalMin: 500, totalMax: 600 }));
  assert.equal(noCombination.state, 'no-combinations'); assert.equal(noCombination.data.qualifyingMatches, 2);
});

test('bounded pagination marks a truncated cohort explicitly and does not scan beyond 500 records', async () => {
  const records = Array.from({ length: slipReadRules.maximumRecords + 1 }, (_, index) => record(`fixture-${index}`, { prices: [] })), visited = [];
  const result = await service(async (parameters) => {
    visited.push(Number(parameters.get('page'))); return page(parameters, records);
  }).query(criteria());
  assert.deepEqual(visited, [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]); assert.equal(result.examined, 500);
  assert.equal(result.searchLimited, true); assert.equal(result.state, 'no-qualifying');
});

test('changed cohorts, overlapping pages and stale or malformed page envelopes fail atomically', async () => {
  const records = Array.from({ length: 101 }, (_, index) => record(`fixture-${index}`, { prices: [] }));
  for (const kind of ['version', 'total', 'overlap', 'null-version', 'as-of', 'range', 'page-size', 'final-probe']) {
    let reads = 0;
    const result = await service(async (parameters) => {
      reads++; const response = page(parameters, records), number = Number(parameters.get('page'));
      if (kind === 'version' && number === 2) return { ...response, paginationVersion: 'b'.repeat(64) };
      if (kind === 'total' && number === 2) return page(parameters, records.slice(0, 100));
      if (kind === 'overlap' && number === 2) return { ...response, records: [records[0]] };
      if (kind === 'null-version') return { ...response, paginationVersion: null };
      if (kind === 'as-of') return { ...response, asOf: now - 1 };
      if (kind === 'range') return { ...response, range: { ...response.range, from: '2026-10-10' } };
      if (kind === 'page-size') return { ...response, pageSize: 99 };
      if (kind === 'final-probe' && reads === 3) return { ...response, records: response.records.map(value => ({ ...value, dataVersion: '10' })) };
      return response;
    }).query(criteria());
    assert.equal(result.state, 'data-unavailable', kind); assert.equal(result.data, null, kind); assert.equal(result.examined, 0, kind);
  }
});

test('matches entering kickoff cutoff during the scan are excluded at completion', async () => {
  const records = [record('fixture-1', { kickoffAt: now + 330000 }), record('fixture-2', { kickoffAt: now + 330000 })];
  let ticks = 0;
  const result = await service(async (parameters) => page(parameters, records), {
    clock: { now: () => ticks++ === 0 ? now : now + 60000 },
  }).query(criteria());
  assert.equal(result.state, 'no-qualifying'); assert.equal(result.asOf, now + 60000); assert.equal(result.examined, 2);
});

test('a later-page progress flag change is rejected even when the pagination generation is unchanged', async () => {
  const records = Array.from({ length: 101 }, (_, index) => record(`fixture-${index}`, { prices: [] }));
  let reads = 0;
  const result = await service(async (parameters) => {
    reads++; const response = page(parameters, records);
    return reads === 4 ? { ...response, records: response.records.map(value => ({ ...value,
      update: { ...value.update, prediction: 'delayed' },
    })) } : response;
  }).query(criteria());
  assert.equal(reads, 4); assert.equal(result.state, 'data-unavailable'); assert.equal(result.data, null);
});

test('clock rollback or EAT day rollover during a build requires a new coherent request', async () => {
  for (const completedAt of [now - 1, now + 86400000]) {
    let ticks = 0;
    const result = await service(async (parameters) => page(parameters, [record('fixture-1'), record('fixture-2')]), {
      clock: { now: () => ticks++ === 0 ? now : completedAt },
    }).query(criteria());
    assert.equal(result.state, 'data-unavailable'); assert.equal(result.data, null);
  }
});

test('source coverage stays visible and unavailable coverage does not masquerade as an empty cohort', async () => {
  const coverage = { partial: true, knownFixtures: 2, matchingWithMarket: 2,
    dates: [{ date: today, status: 'partial', observedAt: now, authoritative: false }] };
  const result = await service(async (parameters) => page(parameters, [record('fixture-1'), record('fixture-2')], { coverage })).query(criteria());
  assert.equal(result.state, 'generated'); assert.equal(result.partialCoverage, true);
  const unavailable = await service(async (parameters) => page(parameters, [], {
    state: 'data-unavailable', coverage: { ...coverage, knownFixtures: 0, matchingWithMarket: 0 },
  })).query(criteria());
  assert.equal(unavailable.state, 'data-unavailable'); assert.equal(unavailable.data, null);
});

test('outages and rate-limit refusal remain distinct and never expose private diagnostics', async () => {
  for (const failure of [new Error('mysql://private-password'), new MatchFeedError('rate-limited', 11)]) {
    const result = await service(async () => { throw failure; }).query(criteria());
    assert.equal(result.state, failure instanceof MatchFeedError ? 'rate-limited' : 'data-unavailable');
    assert.equal(result.data, null); assert.doesNotMatch(JSON.stringify(result), /private-password|mysql:/);
    assert.equal(result.retryAfterSeconds, failure instanceof MatchFeedError ? 11 : null);
  }
  let reads = 0;
  const result = await service(async () => { reads++; }, { consume: async () => { throw new MatchFeedError('rate-limited', 7); } }).query(criteria());
  assert.equal(result.state, 'rate-limited'); assert.equal(reads, 0); assert.equal(result.retryAfterSeconds, 7);
});

function alternativeRecord(id) {
  const value = record(id), snapshot = validateMarketSnapshot({ 'match-result': { source: 'ai', period: marketRules.period,
    probabilities: { 'home-win': 0.2, draw: 0.1, 'away-win': 0.7 } } });
  return { ...value, forecast: { ...value.forecast, markets: Object.values(snapshot.markets).filter(entry => entry.available)
    .map(entry => ({ market: entry.market, reasons: [], uncertainty: null })) },
    prices: [{ ...value.prices[0], selection: 'away-win', price: '1.30' }] };
}
function alternativePrices() {
  return [['home-win', '2.00'], ['draw', '3.00'], ['away-win', '1.30']].map(([selection, price]) => ({
    family: 'match-result', selection, price, basis: 'bookmaker', retrievedAt: now - 1000, providerUpdatedAt: null,
  }));
}

test('manual alternatives use the own published outcome probability and supplementary approved price', async () => {
  const records = [alternativeRecord('fixture-1'), alternativeRecord('fixture-2')];
  const reader = async parameters => ({ feed: page(parameters, records),
    selectionPrices: Object.fromEntries(records.map(value => [value.fixtureId, alternativePrices()])) });
  const result = await service(reader).query(criteria({ markets: ['match-result'], probMin: 0,
    outcomes: { 'match-result': ['home-win'] } }));
  assert.equal(result.state, 'generated'); assert.equal(result.data.slips[0].averageProbability, 0.2);
  assert.equal(result.data.slips[0].totalOdds, '4.00');
  assert.ok(result.data.slips[0].selections.every(value => value.selection === 'home-win' && value.probability === 0.2 && value.odds === '2.00'));
  assert.ok(records.every(value => value.forecast.markets.find(item => item.market.family === 'match-result').market.selection === 'away-win'));
  const automatic = await service(reader).query(criteria({ markets: ['match-result'], probMin: 0, totalMin: 101 }));
  assert.equal(automatic.data.slips[0].averageProbability, 0.7);
  assert.ok(automatic.data.slips[0].selections.every(value => value.selection === 'away-win'));
});

test('supplementary price-pool drift or a future observation rejects the entire build', async () => {
  const records = [alternativeRecord('fixture-1'), alternativeRecord('fixture-2')];
  for (const kind of ['drift', 'future']) {
    let reads = 0;
    const result = await service(async parameters => {
      reads++; const prices = alternativePrices();
      if (kind === 'future') prices[0].retrievedAt = now + 1;
      if (kind === 'drift' && reads === 2) prices[0].price = '2.10';
      return { feed: page(parameters, records), selectionPrices: Object.fromEntries(records.map(value => [value.fixtureId, prices])) };
    }).query(criteria({ markets: ['match-result'], probMin: 0, outcomes: { 'match-result': ['home-win'] } }));
    assert.equal(result.state, 'data-unavailable', kind); assert.equal(result.data, null); assert.equal(result.examined, 0);
  }
});

test('alternative-price projection respects the odds policy and reuses only complete published market groups', async () => {
  let reads = 0;
  const at = new Date(now - 1000), rows = [
    ['match-result', 'home-win', 200], ['match-result', 'draw', 300], ['match-result', 'away-win', 400],
    ['double-chance', 'home-or-draw', 150], ['both-teams-to-score', 'yes', 180], ['both-teams-to-score', 'no', 220],
  ].map(([marketKey, selection, displayHundredths]) => ({ marketKey, selection, displayHundredths,
    basis: 'bookmaker', impliedProbability: '0.5', overround: '1.1', method: 'proportional-v1', snapshotId: 'synthetic-snapshot',
    retrievedAt: at, providerUpdatedAt: null, bookmakerExternalId: 'private-identifier' }));
  const tx = { $queryRaw: async () => { reads++; return rows; } }, source = record('fixture-1');
  const disabled = await storedSlipPricePools(tx, [source], false);
  assert.deepEqual(disabled, { 'fixture-1': [] }); assert.equal(reads, 0);
  const enabled = await storedSlipPricePools(tx, [source], true);
  assert.equal(reads, 1); assert.deepEqual(enabled['fixture-1'].map(price => price.selection), ['home-win', 'draw', 'away-win']);
  assert.ok(enabled['fixture-1'].every(price => price.family === 'match-result'));
  assert.doesNotMatch(JSON.stringify(enabled), /private-identifier|bookmakerExternalId|impliedProbability|overround|snapshotId/);
  rows[1].snapshotId = 'different-snapshot';
  assert.deepEqual(await storedSlipPricePools(tx, [source], true), { 'fixture-1': source.prices });
});

test('enabled price pools preserve standalone approved selected quotes and prefer complete supplemental quotes', async () => {
  const source = record('fixture-1', { prices: [{ family: 'match-result', selection: 'home-win', price: '1.80', basis: 'bookmaker',
    retrievedAt: now - 2000, providerUpdatedAt: null }] });
  assert.deepEqual(await storedSlipPricePools({ $queryRaw: async () => [] }, [source], true), { 'fixture-1': source.prices });
  const rows = [['home-win', 210], ['draw', 300], ['away-win', 400]].map(([selection, displayHundredths]) => ({
    marketKey: 'match-result', selection, displayHundredths, basis: 'bookmaker', impliedProbability: '0.5', overround: '1.1',
    method: 'proportional-v1', snapshotId: 'complete-snapshot', retrievedAt: new Date(now - 1000), providerUpdatedAt: null,
  }));
  const prices = await storedSlipPricePools({ $queryRaw: async () => rows }, [source], true);
  assert.equal(prices['fixture-1'].length, 3); assert.equal(prices['fixture-1'].find(price => price.selection === 'home-win').price, '2.10');
  assert.equal(prices['fixture-1'].find(price => price.selection === 'home-win').retrievedAt, now - 1000);
  assert.deepEqual(await storedSlipPricePools({ $queryRaw: async () => rows }, [source], false), { 'fixture-1': [] });
});

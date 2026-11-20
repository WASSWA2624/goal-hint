import assert from 'node:assert/strict';
import test from 'node:test';
import { getReportingDate, getReportingDayBounds } from '../src/domain/calendar.ts';
import { OddsError } from '../src/server/odds/odds-contract.ts';
import { assertValidatedOdds, authorizeOddsRequest, oddsPolicyHash, oddsRequestParameters, oddsScopeKey, parseOddsPolicy, parseOddsRequest,
  validateOddsObservation } from '../src/server/odds/odds-input.ts';
import { createOddsJobDefinitions, latestOddsSlot, ODDS_CATALOG_TYPE, ODDS_HISTORY_TYPE, ODDS_IMPORT_TYPE, ODDS_JOB_TIMEOUT_MS, ODDS_PROVIDER_WINDOW_MS, ODDS_SWEEP_MS,
  oddsCatalogEnvelope, oddsHistoryScheduleEnvelopes, oddsHistoryScopeId, oddsImportEnvelope, oddsJobOutcome, oddsQuotaAllows, oddsScheduleEnvelopes, oddsSlotDates,
  oddsSlotEnvelopes } from '../src/server/odds/odds-jobs.ts';
import { canonicalOddsValues, oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { classifyHistoricalOddsRow, classifyOddsRow, createOddsImportService } from '../src/server/odds/odds-service.ts';
import { createSyntheticOddsAdapter, launchBetCatalog, oddsAuthority, oddsBounds, oddsHash, oddsPolicy, oddsRequest, oddsResponse, offsetTime,
  rawOddsRow } from './helpers/odds-fixtures.mjs';

// Synthetic policies, envelopes and prices only (prompt 052). The real adapter runs over a fake transport.
const NOW = Date.parse('2026-10-11T06:00:00.000Z'), DATE = '2026-10-13', KICKOFF = Date.parse('2026-10-13T12:00:00.000Z');
const HOUR = 3_600_000;
const denied = (reason) => (error) => error instanceof OddsError && error.reason === reason;

function harness() {
  let at = NOW;
  const clock = { now: () => at };
  const odds = createSyntheticOddsAdapter(clock, { setTime: (value) => { at = value; } });
  return { clock, odds, set(value) { at = value; } };
}
async function observed(rows, options = {}) {
  const h = harness(), request = oddsRequest('prices', NOW, { date: options.date ?? DATE }), bounds = oddsBounds(NOW, options.bounds);
  h.odds.state.rows = rows;
  if (options.respond) h.odds.state.respond = options.respond;
  const result = await h.odds.adapter.odds.prices({ date: options.queryDate ?? DATE, bookmakerId: 8 }, bounds);
  return { h, request, bounds, result };
}
const row = (id = 101, overrides = {}) => rawOddsRow(id, overrides.kickoff ?? KICKOFF, { update: offsetTime(NOW - 60_000), ...overrides });

test('odds policies and requests are strict, frozen and bound to one documented bookmaker', () => {
  const policy = parseOddsPolicy(oddsPolicy());
  assert.ok(Object.isFrozen(policy));
  for (const change of [{ bookmakerId: 0 }, { bookmakerId: 4_294_967_296 }, { freshnessMs: 1_000 }, { method: 'shin-v1' }, { contractVersion: 'direct-v3' },
    { mappingVersion: 'launch-odds-v2' }, { retainAfterKickoffMs: HOUR }, { horizonDays: 8 }, { basis: 'median' }, { extra: true }, { evidenceRef: ' ' }]) {
    assert.throws(() => parseOddsPolicy(oddsPolicy(change)), denied('invalid-request'), JSON.stringify(change));
  }
  assert.equal(oddsPolicyHash(oddsPolicy()), oddsPolicyHash(oddsPolicy()));
  assert.notEqual(oddsPolicyHash(oddsPolicy()), oddsPolicyHash(oddsPolicy({ bookmakerId: 6 })));
  const prices = parseOddsRequest(oddsRequest('prices', NOW, { date: DATE }));
  assert.equal(oddsScopeKey(prices), `date:${DATE}:bookmaker:8`);
  assert.deepEqual(oddsRequestParameters(prices), { bookmaker: '8', date: DATE, timezone: 'Africa/Kampala' });
  const bets = parseOddsRequest(oddsRequest('bets', NOW));
  assert.equal(oddsScopeKey(bets), 'bets'); assert.deepEqual(oddsRequestParameters(bets), {});
  for (const request of [oddsRequest('prices', NOW), oddsRequest('bets', NOW, { date: DATE }), oddsRequest('prices', NOW, { date: '2026-02-30' }),
    { ...oddsRequest('bookmakers', NOW), id: 'not-a-hash' }, { ...oddsRequest('bets', NOW), kind: 'live' }]) {
    assert.throws(() => parseOddsRequest(request), denied('invalid-request'));
  }
});

test('authorization, the exact policy and the retention purpose are verified before any provider call', () => {
  const request = oddsRequest('prices', NOW, { date: DATE });
  assert.equal(authorizeOddsRequest(request, oddsAuthority()).date, DATE);
  assert.throws(() => authorizeOddsRequest(request, { ...oddsAuthority(), authorize() { throw new Error('denied'); } }), denied('operation-not-authorized'));
  assert.throws(() => authorizeOddsRequest(request, oddsAuthority({ publicDisplay: false }, oddsPolicy({ bookmakerId: 6 }))), denied('unverified-policy'));
  for (const verifyRetention of [() => 'yes', () => Promise.resolve(true), () => { throw new Error('no'); }]) {
    assert.throws(() => authorizeOddsRequest(request, { ...oddsAuthority(), verifyRetention }), denied('retention-not-authorized'));
  }
});

test('validation keeps exact selectors, ordered pages and each row\'s own retrieval and update times', async () => {
  const { h, request, bounds, result } = await observed([row(103), row(102), row(101)]);
  const observation = validateOddsObservation(request, result, bounds, oddsAuthority(), h.clock);
  assert.equal(observation.status, 'complete'); assert.deepEqual(observation.reasons, []);
  assert.deepEqual(observation.rows.map((entry) => entry.fixtureId), [101, 102, 103]);
  assert.equal(observation.rows[0].source.providerUpdatedAt, NOW - 60_000);
  assert.equal(observation.receivedAt, NOW); assert.equal(observation.requestsDispatched, 1);
  assert.equal(Object.hasOwn(observation.provenance[0], 'quota'), false);
  assert.ok(Object.isFrozen(observation.rows[0].bookmakers[0].bets[0]));
  assert.equal(assertValidatedOdds(observation), observation);
  assert.throws(() => assertValidatedOdds({ ...observation }), denied('invalid-request'));
  // Another bookmaker, an update after retrieval, or a repeated fixture is refused per row.
  const forged = structuredClone(result);
  forged.data[0].bookmakers[0].id = 6;
  forged.data[1].source.providerUpdatedAt = forged.data[1].source.retrievedAt + 1;
  forged.data.push(structuredClone(result.data[2]));
  const refused = validateOddsObservation(request, forged, bounds, oddsAuthority(), h.clock);
  assert.equal(refused.status, 'partial'); assert.deepEqual(refused.rows.map((entry) => entry.fixtureId), [101]);
  assert.deepEqual(refused.reasons, ['invalid-row-or-scope', 'invalid-rows']);
  // A request for another date never accepts this response's selectors or rows.
  const elsewhere = validateOddsObservation(oddsRequest('prices', NOW, { date: '2026-10-14' }), result, bounds, oddsAuthority(), h.clock);
  assert.equal(elsewhere.status, 'failed'); assert.ok(elsewhere.reasons.includes('invalid-source-provenance'));
  // Retrieval after the validation clock, or more requests than the bounds allow, is not an observation.
  assert.equal(validateOddsObservation(request, result, bounds, oddsAuthority(), { now: () => NOW - 1 }).status, 'failed');
  assert.throws(() => validateOddsObservation(request, { ...result, requestsDispatched: bounds.maxRequests + 1 }, bounds, oddsAuthority(), h.clock),
    denied('invalid-result'));
  assert.throws(() => validateOddsObservation(request, result, bounds, { ...oddsAuthority(), verifyObservation: () => false }, h.clock),
    denied('unverified-observation'));
});

test('failed and truncated sweeps are never complete; failed attempts never establish retrieval', async () => {
  const failed = await observed([], { respond: (url) => oddsResponse(url, [], { status: 503 }) });
  const none = validateOddsObservation(failed.request, failed.result, failed.bounds, oddsAuthority(), failed.h.clock);
  assert.equal(none.status, 'failed'); assert.equal(none.rows.length, 0);
  assert.ok(none.reasons.includes('missing-source-provenance') && none.reasons.includes('retrieval-incomplete'));
  assert.equal(none.receivedAt, NOW);
  const rows = Array.from({ length: 11 }, (_, index) => row(200 + index));
  const truncated = await observed(rows, { bounds: { maxPages: 1 } });
  const partial = validateOddsObservation(truncated.request, truncated.result, truncated.bounds, oddsAuthority(), truncated.h.clock);
  assert.equal(partial.status, 'partial'); assert.equal(partial.rows.length, 10); assert.ok(partial.reasons.includes('retrieval-incomplete'));
});

test('an unrestricted price sweep resumes sealed pages and withdraws only after exact coverage', async () => {
  const h = harness(), policy = oddsPolicy({ bookmakerScope: 'all', fallbackBookmakerIds: [6, 7] });
  const request = oddsRequest('prices', NOW, { date: DATE, policy });
  const pages = new Map(), receipts = new Map(), withdrawals = [];
  const store = {
    async pricePageBatches() { return [...pages.values()]; },
    async resolveFixtures() { return new Map(); },
    async saveAndApplyPricePage(batch, applications) {
      assert.equal(applications.length, 0, 'unknown fixtures never become public offers');
      assert.ok(batch.checkpoint && !pages.has(batch.checkpoint.page));
      pages.set(batch.checkpoint.page, batch);
      return { batch, outcomes: [] };
    },
    async saveBatch(batch) { receipts.set(batch.id, batch); return batch; },
    async markWithdrawn(input) { withdrawals.push(input); return 0; },
  };
  h.odds.state.rows = Array.from({ length: 23 }, (_, index) => row(200 + index));
  const service = (maxRequests) => createOddsImportService({ adapter: h.odds.adapter.odds, store,
    accountId: () => oddsHash('account'), authority: oddsAuthority({ publicDisplay: false }, policy),
    bounds: () => oddsBounds(NOW, { maxRequests, maxPages: 4 }), clock: h.clock, resumePricePages: true });
  const partial = await service(1).importDate(request);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.continuation, true);
  assert.equal(oddsJobOutcome(partial).retryable, true);
  assert.equal(withdrawals.length, 0);
  assert.equal(pages.size, 1);
  const complete = await service(2).importDate(request);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.outcomes['unknown-fixture'], 23);
  assert.equal(complete.requestsDispatched, 2);
  assert.equal(withdrawals.length, 1);
  const queries = h.odds.network.map((entry) => new URL(entry.url ?? entry));
  assert.deepEqual(queries.map((query) => query.searchParams.get('page')), ['1', '2', '3']);
  assert.ok(queries.every((query) => !query.searchParams.has('bookmaker') && !query.searchParams.has('bet')));
  assert.equal((await service(2).importDate(request)).batchId, complete.batchId, 'successful retry reuses the exact terminal receipt');
  assert.equal(h.odds.network.length, 3);
  assert.equal(receipts.size, 2);
});

test('bet catalogs validate as sorted unique names without prices', async () => {
  const h = harness(), request = oddsRequest('bets', NOW), bounds = oddsBounds(NOW);
  h.odds.state.bets = [...launchBetCatalog()].reverse();
  const result = await h.odds.adapter.odds.bets(bounds);
  const observation = validateOddsObservation(request, result, bounds, oddsAuthority(), h.clock);
  assert.equal(observation.status, 'complete'); assert.deepEqual(observation.catalog, launchBetCatalog()); assert.deepEqual(observation.rows, []);
  assert.equal(validateOddsObservation(oddsRequest('bookmakers', NOW), result, bounds, oddsAuthority(), h.clock).status, 'failed',
    'a bets response never satisfies a bookmakers request');
});

test('classification never prices unknown, started, rescheduled or non-scheduled fixtures', async () => {
  const { result } = await observed([row(101)]);
  const observation = result.data[0], target = { fixtureId: '00000000-0000-4000-8000-000000000101', externalId: 101, kickoff: KICKOFF, status: 'scheduled' };
  assert.equal(classifyOddsRow(observation, target), 'apply');
  assert.equal(classifyOddsRow(observation, undefined), 'unknown-fixture');
  assert.equal(classifyOddsRow(observation, { ...target, status: 'postponed' }), 'not-scheduled');
  assert.equal(classifyOddsRow(observation, { ...target, kickoff: KICKOFF + 60_000 }), 'kickoff-mismatch');
  assert.equal(classifyOddsRow(observation, { ...target, kickoff: null }), 'kickoff-mismatch');
  assert.equal(classifyOddsRow({ ...observation, source: { ...observation.source, retrievedAt: KICKOFF } }, target), 'after-kickoff');
});

test('historical recovery retains all books and exact quoted lines across UTC quota resets without reviving closing prices', async () => {
  const h = harness(), policy = oddsPolicy(), pages = [], recovered = [], finished = new Map();
  const dateEnd = getReportingDayBounds(DATE).endExclusive;
  const request = { ...oddsRequest('prices', dateEnd, { date: DATE, policy, id: oddsHistoryScopeId(oddsHash('provider'), DATE) }), recovery: true };
  const firstAt = dateEnd + 60_000, secondAt = firstAt + 6 * HOUR;
  h.set(firstAt);
  const first = rawOddsRow(101, KICKOFF, { update: offsetTime(KICKOFF - HOUR) });
  const other = rawOddsRow(101, KICKOFF, { bookmakerId: 9 });
  first.bookmakers.push(...other.bookmakers);
  h.odds.state.rows = [first, ...Array.from({ length: 10 }, (_, index) => rawOddsRow(102 + index, KICKOFF))];
  const store = {
    async completedRecoveryBatch({ requestId }) { return finished.get(requestId) ?? null; },
    async pricePageBatches() { return [...pages]; },
    async resolveFixtures(ids) { return new Map(ids.map(externalId => [externalId, { fixtureId: String(externalId), externalId,
      kickoff: externalId === 103 ? KICKOFF + HOUR : KICKOFF,
      status: externalId === 102 ? 'scheduled' : externalId === 101 ? 'live' : externalId === 104 ? 'postponed' : 'finished-regulation' }])); },
    async saveAndApplyPricePage(batch, applications) {
      pages.push(batch);
      recovered.push(...applications);
      assert.ok(batch.recovery);
      assert.ok(applications.every(({ publicDisplay }) => !publicDisplay), 'historical import does not publish a current price');
      return { batch, outcomes: applications.map(() => 'changed') };
    },
    async saveBatch(batch) { if (batch.status === 'complete') finished.set(batch.requestId, batch); return batch; },
    async markWithdrawn() { assert.fail('a historical scope never withdraws any offer'); },
  };
  const service = (maxRequests, admission) => createOddsImportService({ adapter: h.odds.adapter.odds, store,
    accountId: () => oddsHash(admission), authority: oddsAuthority({ publicDisplay: true }, policy),
    bounds: () => oddsBounds(h.clock.now(), { maxRequests }), clock: h.clock });
  const partial = await service(1, 'day-1').importHistoricalDate(request);
  assert.equal(partial.status, 'partial');
  assert.equal(partial.continuation, true);
  h.set(secondAt);
  const complete = await service(2, 'day-2').importHistoricalDate(request);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.requestsDispatched, 1);
  assert.equal(complete.outcomes.recover, 9);
  assert.equal(complete.outcomes['awaiting-start'], 1);
  assert.equal(complete.outcomes['kickoff-mismatch'], 1);
  assert.deepEqual(recovered[0].row.bookmakers.map(({ id }) => id), [8, 9]);
  assert.deepEqual(recovered[0].row.bookmakers[1].bets.find(({ id }) => id === 5).values.map(({ label }) => label),
    ['Over 1.5', 'Under 1.5', 'Over 2.5', 'Under 2.5']);
  assert.equal(recovered[0].row.source.providerUpdatedAt, KICKOFF - HOUR);
  assert.equal(recovered[0].row.source.retrievedAt, firstAt);
  assert.equal(recovered[1].row.fixtureId, 102, 'past-kickoff offers can wait privately for authoritative status evidence');
  assert.equal(recovered.at(-1).row.source.providerUpdatedAt, null);
  assert.equal(recovered.at(-1).row.source.retrievedAt, secondAt);
  assert.deepEqual(pages.map(({ accountId }) => accountId), [oddsHash('day-1'), oddsHash('day-2')]);
  assert.equal((await service(1, 'day-3').importHistoricalDate(request)).batchId, complete.batchId);
  const queries = h.odds.network.map((entry) => new URL(entry.url ?? entry));
  assert.deepEqual(queries.map((url) => url.searchParams.get('page')), ['1', '2']);
  assert.ok(queries.every((url) => url.pathname === '/odds' && !url.searchParams.has('bookmaker') && !url.searchParams.has('bet')));
});

test('the current date reuses one provider page for scheduled and recovered observations', async () => {
  const h = harness(), policy = oddsPolicy({ bookmakerScope: 'all' }), at = KICKOFF + 60_000;
  h.set(at);
  h.odds.state.rows = [rawOddsRow(101, KICKOFF), rawOddsRow(102, KICKOFF + HOUR)];
  const store = {
    async pricePageBatches() { return []; },
    async resolveFixtures(ids) { return new Map(ids.map((externalId) => [externalId, { fixtureId: String(externalId), externalId,
      kickoff: externalId === 101 ? KICKOFF : KICKOFF + HOUR, status: externalId === 101 ? 'live' : 'scheduled' }])); },
    async saveAndApplyPricePage(batch, applications) {
      assert.equal(batch.recovery, undefined);
      assert.deepEqual(batch.fixtures.map(({ outcome }) => outcome), ['recover', 'apply']);
      assert.equal(applications.length, 2);
      assert.equal(classifyHistoricalOddsRow(applications[1].row, { kickoff: KICKOFF + HOUR, status: 'scheduled' }), 'awaiting-start');
      return { batch, outcomes: ['changed', 'changed'] };
    },
    async saveBatch(batch) { return batch; },
    async markWithdrawn() { return 0; },
  };
  const service = createOddsImportService({ adapter: h.odds.adapter.odds, store, authority: oddsAuthority({ publicDisplay: false }, policy),
    accountId: () => oddsHash('current-quota'), clock: h.clock, bounds: () => oddsBounds(at), resumePricePages: true, recoverFromCurrentPages: true });
  const summary = await service.importDate(oddsRequest('prices', latestOddsSlot(at), { date: DATE, policy }));
  assert.equal(summary.outcomes.recover, 1);
  assert.equal(summary.outcomes.apply, 1);
  assert.equal(summary.requestsDispatched, 1);
  assert.equal(h.odds.network.length, 1);
});

test('an empty historical response seals no coverage without starting a fixture page or withdrawing a price', async () => {
  const h = harness(), dateEnd = getReportingDayBounds(DATE).endExclusive;
  h.set(dateEnd + 60_000);
  h.odds.state.respond = (url) => oddsResponse(url, [], { total: 0 });
  let saved;
  const store = {
    async pricePageBatches() { return []; },
    async completedRecoveryBatch() { return saved ?? null; },
    async saveBatch(batch) { saved = batch; return batch; },
    async saveAndApplyPricePage() { assert.fail('an explicit provider zero page has no observations'); },
    async markWithdrawn() { assert.fail('empty historical scope cannot withdraw'); },
  };
  const service = createOddsImportService({ adapter: h.odds.adapter.odds, store, authority: oddsAuthority(),
    accountId: () => oddsHash('empty-history'), bounds: () => oddsBounds(h.clock.now()), clock: h.clock });
  const request = { ...oddsRequest('prices', dateEnd, { date: DATE }), recovery: true };
  assert.equal((await service.importHistoricalDate(request)).status, 'complete');
  assert.equal(saved.pages[0].totalPages, 0);
  assert.deepEqual(saved.fixtures, []);
  assert.ok(saved.missingCoverage.includes('odds-coverage-not-established'));
  assert.equal((await service.importHistoricalDate(request)).requestsDispatched, 0);
});

test('canonical snapshot values ignore provider ordering', () => {
  const values = [{ label: 'Home', odd: '1.85' }, { label: 'Away', odd: '4.2' }, { label: 'Draw', odd: '3.4' }];
  assert.deepEqual(canonicalOddsValues(values).map((value) => value.label), ['Away', 'Draw', 'Home']);
  assert.equal(oddsValuesHash(values), oddsValuesHash([...values].reverse()));
  assert.notEqual(oddsValuesHash(values), oddsValuesHash([{ label: 'Home', odd: '1.9' }, ...values.slice(1)]));
});

test('odds envelopes carry only the slot and date; nearest dates run first and expire with their slot', () => {
  const slot = latestOddsSlot(NOW + 1_000);
  assert.equal(slot, NOW); assert.equal(slot % ODDS_SWEEP_MS, 0);
  const dates = oddsSlotDates(slot, 7);
  assert.equal(dates.length, 7); assert.equal(dates[0], getReportingDate(NOW)); assert.equal(dates[6], '2026-10-17');
  assert.deepEqual(oddsSlotDates(slot, 2), dates.slice(0, 2), 'the free-plan horizon sweeps only the dates it imports');
  assert.equal(oddsSlotDates(Date.parse('2026-10-11T21:00:00Z'), 1)[0], '2026-10-12', 'the 21:00 UTC slot already sweeps the next EAT date');
  const first = oddsImportEnvelope(slot, dates[0], 0), again = oddsImportEnvelope(slot, dates[0], 0), later = oddsImportEnvelope(slot, dates[3], 3);
  assert.equal(first.type, ODDS_IMPORT_TYPE); assert.equal(first.idempotencyKey, again.idempotencyKey); assert.notEqual(first.idempotencyKey, later.idempotencyKey);
  assert.deepEqual(first.payload, { slot, date: dates[0] }); assert.equal(first.refresh, null);
  assert.deepEqual([first.priority, later.priority], [7, 4]);
  assert.deepEqual([first.notBefore, first.expiresAt], [slot, slot + ODDS_SWEEP_MS]);
  assert.equal(first.fallbackReserveMs, 0); assert.equal(first.maxAttempts, 8);
  assert.equal(first.timeoutMs, ODDS_JOB_TIMEOUT_MS);
  assert.ok(ODDS_JOB_TIMEOUT_MS - ODDS_PROVIDER_WINDOW_MS >= 120_000, 'the provider walk leaves the writes at least two minutes');
  assert.throws(() => oddsImportEnvelope(slot + 1, dates[0], 0), RangeError);
  assert.throws(() => oddsImportEnvelope(slot, dates[0], 7), RangeError);
  const catalog = oddsCatalogEnvelope(NOW + 5 * HOUR);
  assert.equal(catalog.type, ODDS_CATALOG_TYPE); assert.deepEqual(catalog.payload, { utcDay: '2026-10-11' });
  assert.equal(catalog.idempotencyKey, oddsCatalogEnvelope(NOW).idempotencyKey);
  assert.deepEqual([catalog.notBefore, catalog.expiresAt], [Date.parse('2026-10-11T00:00:00Z'), Date.parse('2026-10-12T00:00:00Z')]);
  assert.ok(catalog.priority > first.priority, 'the catalog of the day is claimed before any price sweep');
  // Each slot enqueues the catalog of the UTC day first (one row per day), then its imports, nearest date first.
  const schedule = oddsScheduleEnvelopes(NOW + 2 * HOUR + 59 * 60_000, 7);
  assert.deepEqual(schedule.map((envelope) => envelope.type), [ODDS_CATALOG_TYPE, ...Array(7).fill(ODDS_IMPORT_TYPE)]);
  assert.deepEqual(schedule.slice(1), oddsSlotEnvelopes(slot, 7));
  assert.deepEqual(schedule.slice(1).map((envelope) => envelope.payload.date), dates);
  assert.equal(schedule[0].idempotencyKey, oddsScheduleEnvelopes(NOW + 9 * HOUR, 7)[0].idempotencyKey);
  assert.notEqual(schedule[1].idempotencyKey, oddsScheduleEnvelopes(NOW + 3 * HOUR, 7)[1].idempotencyKey, 'a new slot is a new sweep');
  assert.ok(Object.isFrozen(schedule));
});

test('historical odds schedule preserves the seven Kampala dates and prioritizes the expiring date', () => {
  const now = Date.parse('2026-10-11T08:00:00Z');
  const schedule = oddsHistoryScheduleEnvelopes(now);
  assert.deepEqual(schedule.map(({ payload }) => payload.date), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
  assert.ok(schedule.every(({ type }) => type === ODDS_HISTORY_TYPE));
  assert.equal(schedule[0].expiresAt, Date.parse('2026-10-11T21:00:00Z'));
  assert.equal(schedule[0].priority, 7);
  assert.equal(schedule.at(-1).priority, 1);
  const crossedKampalaMidnight = oddsHistoryScheduleEnvelopes(Date.parse('2026-10-11T21:00:00Z'));
  assert.deepEqual(crossedKampalaMidnight.slice(0, -1), schedule.slice(1));
  assert.equal(crossedKampalaMidnight.at(-1).payload.date, '2026-10-11');
  assert.equal(crossedKampalaMidnight.at(-1).notBefore, Date.parse('2026-10-11T21:00:00Z'));
  const nextQuotaDay = oddsHistoryScheduleEnvelopes(Date.parse('2026-10-12T00:00:00Z'));
  assert.notEqual(nextQuotaDay[0].idempotencyKey, crossedKampalaMidnight[0].idempotencyKey);
  assert.equal(nextQuotaDay[0].payload.date, crossedKampalaMidnight[0].payload.date);
});

test('extended pre-match collection keeps the reviewed near-date priorities and reaches the provider horizon', () => {
  const base = oddsScheduleEnvelopes(NOW, 7, 'all');
  const expanded = oddsScheduleEnvelopes(NOW, 7, 'all', { providerLookahead: true });
  assert.deepEqual(expanded.slice(0, base.length), base);
  const extra = expanded.slice(base.length);
  assert.deepEqual(extra.map(({ payload }) => payload.date), ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22',
    '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.ok(extra.every(({ type, priority, payload }) => type === ODDS_IMPORT_TYPE && priority === 0 && payload.bookmakerScope === 'all'));
  assert.equal(new Set(expanded.map(({ idempotencyKey }) => idempotencyKey)).size, 16);
});

function oddsSummary(changes = {}) {
  return { batchId: oddsHash('batch'), status: 'complete', requestsDispatched: 3, error: null,
    outcomes: { apply: 0, 'unknown-fixture': 0, 'after-kickoff': 0, 'kickoff-mismatch': 0, 'not-scheduled': 0, changed: 0, unchanged: 0, skipped: 0, withdrawn: 0 },
    ...changes };
}
// The Pro plan's odds allowance (liveWorkload(7500)): floor 6,639, spare 861, reserve 750.
const PRO = Object.freeze({ floor: 6_639, spare: 861, reserve: 750 });
const day = (used, oddsUsed = 0, remaining = 7_500 - used) => ({ remaining, used, oddsUsed });
function oddsJobHarness(options = {}) {
  const calls = [], usages = [];
  const state = { enabled: true, usage: day(0), at: NOW + HOUR, summary: oddsSummary(), failure: null, policy: oddsPolicy(), ...options };
  const answer = async (request) => { calls.push(request); if (state.failure) throw state.failure; return state.summary; };
  const service = { importDate: answer, importCatalog: answer, importHistoricalDate: answer, historicalComplete: async () => state.historyCompleted ?? null, expire: async () => 0 };
  const [importJob, catalogJob, historyJob] = createOddsJobDefinitions({ service, policy: () => state.policy, enabled: () => state.enabled,
    usage: async () => state.usage, allowance: PRO, maxRequests: (kind) => kind === 'prices' ? 154 : 3,
    resumePricePages: state.resumePricePages, historical: state.historical, now: () => state.at });
  const context = { lease: { jobId: oddsHash('job'), attemptId: oddsHash('attempt') }, signal: new AbortController().signal,
    checkpoint: async () => {}, recordUsage: async (usage) => { usages.push(usage); } };
  return { calls, usages, state, importJob, catalogJob, historyJob, context };
}
const EXPIRED = { status: 'failed', reason: 'eligibility-expired', retryable: false };

test('historical jobs defer on quota and reuse a complete date before asking for provider capacity', async () => {
  const reports = [], providerKey = oddsHash('stable-account');
  const h = oddsJobHarness({ historical: { scopeId: (date) => oddsHistoryScopeId(providerKey, date),
    report: (date, summary, state) => reports.push({ date, summary, state }) }, usage: day(1000, 861) });
  const [envelope] = oddsHistoryScheduleEnvelopes(h.state.at);
  assert.equal(await h.historyJob.eligible(envelope.payload, h.context), true);
  assert.deepEqual(await h.historyJob.handle(envelope.payload, h.context), EXPIRED);
  assert.equal(h.calls.length, 0);
  assert.deepEqual(reports.map(({ state }) => state), ['deferred']);
  h.state.historyCompleted = { id: oddsHash('complete') };
  assert.deepEqual(await h.historyJob.handle(envelope.payload, h.context), { status: 'succeeded' });
  assert.equal(h.calls.length, 0);
  h.state.historyCompleted = null;
  h.state.usage = day(1000, 860);
  assert.deepEqual(await h.historyJob.handle(envelope.payload, h.context), { status: 'succeeded' });
  assert.equal(h.calls[0].id, oddsHistoryScopeId(providerKey, envelope.payload.date));
  assert.equal(h.calls[0].recovery, true);
  assert.deepEqual(reports.map(({ state }) => state), ['deferred', 'stored', 'scanned']);
});

test('the scope change starts one new bounded sweep and expires queued jobs for the former scope', async () => {
  const standard = oddsImportEnvelope(NOW, DATE, 0), broader = oddsImportEnvelope(NOW, DATE, 0, 'all');
  assert.notEqual(broader.idempotencyKey, standard.idempotencyKey);
  assert.equal(broader.idempotencyKey, oddsImportEnvelope(NOW, DATE, 0, 'all').idempotencyKey);
  assert.equal(broader.timeoutMs, standard.timeoutMs);
  const h = oddsJobHarness({ policy: oddsPolicy({ bookmakerScope: 'all' }) });
  assert.deepEqual(await h.importJob.handle(standard.payload, h.context), EXPIRED);
  assert.equal(h.calls.length, 0);
  assert.equal((await h.importJob.handle(broader.payload, h.context)).status, 'succeeded');
  assert.equal(h.calls.length, 1);
  assert.equal(oddsScopeKey(h.calls[0]), `date:${DATE}:bookmakers:all`);
});

test('disabled odds jobs expire without a provider call; the definitions stay registered so queues drain', async () => {
  const h = oddsJobHarness({ enabled: false }), payload = { slot: NOW, date: DATE };
  assert.equal(await h.importJob.eligible(payload, h.context.signal), false, 'the worker expires disabled jobs at their first checkpoint');
  assert.equal(await h.catalogJob.eligible({ utcDay: '2026-10-11' }, h.context.signal), false);
  assert.deepEqual(await h.importJob.handle(payload, h.context), EXPIRED);
  assert.deepEqual(await h.catalogJob.handle({ utcDay: '2026-10-11' }, h.context), EXPIRED);
  assert.equal(h.calls.length, 0); assert.equal(h.usages.length, 0);
  h.state.enabled = true;
  assert.equal(await h.importJob.eligible(payload, h.context.signal), true);
});

test('the quota gate counts ordinary use once: odds spend only their own spare, and never the ordinary need left', () => {
  // 12:00 UTC on Pro: the one-minute date poll has used 720 requests and odds nothing. The old gate
  // (remaining >= floor + 154) reserved those requests twice and closed after 707 for the rest of the day.
  assert.ok(day(720).remaining < PRO.floor + 154, 'the double-counting gate would refuse');
  assert.equal(oddsQuotaAllows(day(720), PRO, 154), true);
  assert.equal(oddsQuotaAllows(day(1_500, 707), PRO, 154), true, 'a sweep starts while its whole ceiling fits under the spare (707 + 154 = 861)');
  assert.equal(oddsQuotaAllows(day(1_500, 708), PRO, 154), false, 'one more odds request and the ceiling no longer fits');
  assert.equal(oddsQuotaAllows(day(1_500, 858), PRO, 3), true, 'a catalog needs only its own ceiling');
  assert.equal(oddsQuotaAllows(day(1_500, 859), PRO, 3), false);
  // The provider reports fewer requests left than the limiter counted (use outside this runner): the ordinary need
  // that is left (6,639 - 707 = 5,932) must still be covered after the sweep's ceiling.
  assert.equal(oddsQuotaAllows(day(707, 0, 5_932 + 154), PRO, 154), true);
  assert.equal(oddsQuotaAllows(day(707, 0, 5_932 + 153), PRO, 154), false);
  // Ordinary work past its plan: odds still never take the reserve.
  assert.equal(oddsQuotaAllows(day(6_596, 0), PRO, 154), true, '904 left = reserve 750 + 154');
  assert.equal(oddsQuotaAllows(day(6_597, 0), PRO, 154), false);
  for (const broken of [day(-1), day(10, 20.5), { ...day(0), remaining: Number.NaN }]) assert.equal(oddsQuotaAllows(broken, PRO, 154), false);
  assert.equal(oddsQuotaAllows(day(0), PRO, -1), false);
  // A whole Pro day: the date poll uses one request a minute and each 3-hour slot sweeps seven dates of ten pages.
  // Every slot sweeps, the evening slots included, and odds stay within the spare.
  let oddsUsed = 0;
  const swept = [];
  for (let hour = 0; hour < 24; hour += 3) {
    let dates = 0;
    for (let date = 0; date < 7; date++) {
      if (!oddsQuotaAllows(day(hour * 60 + oddsUsed, oddsUsed), PRO, 154)) continue;
      oddsUsed += 10; dates++;
    }
    swept.push(dates);
  }
  assert.deepEqual(swept, [7, 7, 7, 7, 7, 7, 7, 7]);
  assert.ok(oddsUsed <= PRO.spare);
  // The gate's slack never grows inside a provider day, so a refused slot expires instead of retrying.
  for (const [before, after] of [[day(1_500, 708), day(1_600, 708)], [day(6_597, 0), day(6_700, 0)], [day(707, 0, 6_000), day(800, 0, 5_907)]]) {
    assert.equal(oddsQuotaAllows(before, PRO, 154), false); assert.equal(oddsQuotaAllows(after, PRO, 154), false);
  }
});

test('the odds job applies the gate before any provider call: a refused slot expires, a settling provider day waits', async () => {
  const h = oddsJobHarness(), payload = { slot: NOW, date: DATE };
  h.state.usage = day(1_500, 708);
  assert.deepEqual(await h.importJob.handle(payload, h.context), EXPIRED, 'the odds spare cannot recover inside one provider day');
  assert.equal(h.calls.length, 0, 'odds never spend beyond their own spare');
  h.state.usage = day(6_597);
  assert.deepEqual(await h.importJob.handle(payload, h.context), EXPIRED, 'odds never take the reserve');
  assert.equal(h.calls.length, 0);
  h.state.usage = null;
  assert.deepEqual(await h.importJob.handle(payload, h.context), { status: 'failed', reason: 'rate-limited', retryable: true },
    'before the new UTC provider day opens, the job retries within its slot');
  assert.equal(h.calls.length, 0);
  h.state.usage = day(707);
  assert.deepEqual(await h.importJob.handle(payload, h.context), { status: 'succeeded' }, 'mid-day ordinary use leaves the spare to odds');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].id, h.context.lease.jobId); assert.equal(h.calls[0].date, DATE);
  assert.equal(h.calls[0].kind, 'prices'); assert.equal(h.calls[0].slot, NOW);
  assert.deepEqual(h.usages.map((usage) => [usage.provider, usage.phase, usage.requests, usage.costReference]), [['football', 'completed', 3, null]]);
  h.state.at = NOW + ODDS_SWEEP_MS;
  assert.deepEqual(await h.importJob.handle(payload, h.context), EXPIRED);
  assert.equal(h.calls.length, 1);
});

test('the catalog job imports bets then bookmakers, gates each and records each usage separately', async () => {
  const h = oddsJobHarness({ usage: day(2_000, 858) }), payload = { utcDay: '2026-10-11' }, start = Date.parse('2026-10-11T00:00:00Z');
  h.state.at = Date.parse('2026-10-11T23:00:00Z');
  assert.deepEqual(await h.catalogJob.handle(payload, h.context), { status: 'succeeded' });
  assert.deepEqual(h.calls.map((request) => [request.kind, request.date, request.slot]), [['bets', null, start], ['bookmakers', null, start]]);
  assert.equal(new Set(h.usages.map((usage) => usage.requestReference)).size, 2);
  h.state.usage = day(2_000, 859);
  assert.deepEqual(await h.catalogJob.handle(payload, h.context), EXPIRED);
  assert.equal(h.calls.length, 2);
  h.state.usage = day(2_000, 858);
  h.state.summary = oddsSummary({ status: 'failed', requestsDispatched: 1, error: { reason: 'transport-error', retryable: true } });
  assert.deepEqual(await h.catalogJob.handle(payload, h.context), { status: 'failed', reason: 'handler-failed', retryable: true });
  assert.equal(h.calls.length, 3, 'a failed bet catalog stops before the bookmaker catalog');
  h.state.at = Date.parse('2026-10-12T00:00:00Z');
  assert.deepEqual(await h.catalogJob.handle(payload, h.context), EXPIRED);
});

test('coordinated price jobs can resume with one request left in their spare allowance', async () => {
  const h = oddsJobHarness({ resumePricePages: true, usage: day(1_500, 860),
    summary: oddsSummary({ status: 'partial', continuation: true, requestsDispatched: 1,
      error: { reason: 'request-budget-exhausted', retryable: true } }) });
  const payload = { slot: NOW, date: DATE };
  assert.deepEqual(await h.importJob.handle(payload, h.context), { status: 'failed', reason: 'handler-failed', retryable: true });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.usages.map(({ phase, requests }) => [phase, requests]), [['completed', 1]]);
  h.state.usage = day(1_501, 861);
  assert.deepEqual(await h.importJob.handle(payload, h.context), EXPIRED);
  assert.equal(h.calls.length, 1, 'a resumed sweep still needs admission for its next request');
});

test('receipt outcomes: transient failures retry in the slot, exhausted quota expires, refusals fail, data faults keep the receipt', async () => {
  const outcome = (status, reason, retryable) => oddsJobOutcome({ status, error: reason === null ? null : { reason, retryable } });
  assert.deepEqual(outcome('complete', null), { status: 'succeeded' });
  for (const reason of ['transport-error', 'rate-limited', 'quota-denied', 'deadline-exceeded', 'shared-work-pending']) {
    assert.deepEqual(outcome('partial', reason, true), { status: 'succeeded' }, `a partial ${reason} sweep keeps what it retrieved`);
  }
  assert.deepEqual(outcome('failed', 'transport-error', true), { status: 'failed', reason: 'handler-failed', retryable: true });
  assert.deepEqual(outcome('failed', 'deadline-exceeded', false), { status: 'failed', reason: 'handler-failed', retryable: true });
  assert.deepEqual(outcome('failed', 'rate-limited', true), { status: 'failed', reason: 'rate-limited', retryable: true });
  assert.deepEqual(outcome('failed', 'quota-denied', true), { status: 'failed', reason: 'rate-limited', retryable: true }, 'pacing and priority waits clear');
  assert.deepEqual(outcome('failed', 'quota-denied', false), EXPIRED, 'the essential reserve and daily limit only tighten within a day');
  for (const reason of ['invalid-credential', 'authentication-error', 'subscription-expired', 'operation-not-authorized', 'invalid-request']) {
    assert.deepEqual(outcome('failed', reason, false), { status: 'failed', reason: 'non-retryable', retryable: false }, reason);
  }
  for (const reason of ['schema-error', 'coverage-error', 'pagination-incomplete', 'response-too-large', 'request-budget-exhausted']) {
    assert.deepEqual(outcome('failed', reason, false), { status: 'succeeded' }, `${reason} keeps its failed receipt instead of repeating`);
  }
  const h = oddsJobHarness({ summary: oddsSummary({ status: 'failed', requestsDispatched: 2, error: { reason: 'quota-denied', retryable: false } }) });
  assert.deepEqual(await h.importJob.handle({ slot: NOW, date: DATE }, h.context), EXPIRED);
  assert.deepEqual(h.usages.map((usage) => [usage.phase, usage.requests]), [['completed', 2]], 'dispatched requests are recorded even when the job expires');
});

test('a storage failure after the provider call records uncertain usage; only unavailability retries', async () => {
  const h = oddsJobHarness({ failure: new OddsError('unavailable') }), payload = { slot: NOW, date: DATE };
  assert.deepEqual(await h.importJob.handle(payload, h.context), { status: 'failed', reason: 'handler-failed', retryable: true });
  h.state.failure = new OddsError('unverified-observation');
  assert.deepEqual(await h.importJob.handle(payload, h.context), { status: 'failed', reason: 'handler-failed', retryable: false });
  assert.deepEqual(h.usages.map((usage) => [usage.provider, usage.phase, usage.requests]), [['football', 'uncertain', 0], ['football', 'uncertain', 0]]);
});

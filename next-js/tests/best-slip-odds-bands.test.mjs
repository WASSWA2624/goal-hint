import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipOddsBands, bestSlipOddsBandFor, bestSlipPublicRank } from '../src/domain/best-slip-odds-bands.ts';
import { bestSlipBandCriteria, bestSlipCombinationIdentity, buildDailyBestSlips, buildHourlyBestSlips } from '../src/domain/best-slips.ts';
import { parseBestSlipsQuery, serializeBestSlipsQuery, selectSlipSummaryResult, defaultBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { bestSlipsRangeKey } from '../src/domain/best-slips-client.ts';
import { createDailySlipPublisher, runDailySlipPublisher } from '../src/server/slips/daily-slip-publication.ts';
import { readFeaturedSlipSelections, verifyFeaturedSlipOffers } from '../src/server/slips/best-slip-recommendations.ts';
import { LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localFirstGoalMarketDefinitions } from '../src/domain/goal-market-definitions.ts';
import { verifiedLocalFeaturedBinding } from '../src/domain/local-featured-decision.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { durableJobId } from '../src/server/jobs/job-input.ts';
import { dueSlipOddsRefreshSlot, slipOddsRefreshEnvelope, waitForSlipOddsRefresh } from '../src/server/odds/slip-odds-refresh-slot.ts';
import { readFeaturedGoalMarkets } from '../src/server/predictions/extended-market-read.ts';
import { prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';
import { bindSlipForecasts } from '../src/server/slips/slip-forecast.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';
import { pricedEditorialSelection } from './helpers/best-slip-publication-fixtures.mjs';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';
import { addReportingDays, getPublicationDeadline, getReportingDate, getReportingDayBounds } from '../src/domain/calendar.ts';

import { bestSlipActivePublicationDays, bestSlipFixtureWindow } from '../src/domain/best-slip-publication-hour.ts';

test('the targeted odds refresh starts five minutes before each Kampala publisher slot', () => {
  for (const publication of ['2026-11-27T00:00:00+03:00', '2026-11-27T00:30:00+03:00']) {
    const slot = Date.parse(publication);
    const job = slipOddsRefreshEnvelope(slot);
    assert.deepEqual(job.payload, { publicationSlot: slot });
    assert.equal(job.notBefore, slot - 300_000);
    assert.equal(job.expiresAt, slot + 300_000);
    assert.equal(job.maxAttempts, 1);
    assert.equal(dueSlipOddsRefreshSlot(job.notBefore - 1), null);
    assert.equal(dueSlipOddsRefreshSlot(job.notBefore), slot);
    assert.equal(dueSlipOddsRefreshSlot(slot), slot);
    assert.equal(dueSlipOddsRefreshSlot(job.expiresAt - 1), slot);
    assert.equal(dueSlipOddsRefreshSlot(job.expiresAt), null);
    assert.notEqual(durableJobId(job), durableJobId(slipOddsRefreshEnvelope(slot - 1_800_000)));
    assert.throws(() => slipOddsRefreshEnvelope(slot + 1));
  }
});

test('the publisher waits for success on its exact refresh after any earlier slots have finished', async () => {
  const slot = Date.parse('2026-11-27T00:30:00+03:00');
  const current = durableJobId(slipOddsRefreshEnvelope(slot));
  const previous = durableJobId(slipOddsRefreshEnvelope(slot - 1_800_000));
  const states = new Map([[previous, 'succeeded']]);
  let at = slot, polls = 0;
  const status = await waitForSlipOddsRefresh(slot, async (id) => {
    assert.equal(id, current);
    polls++;
    return states.get(id) ?? null;
  }, new AbortController().signal, { now: () => at, wait: async (ms) => {
    at += ms;
    states.set(current, polls === 1 ? 'running' : 'succeeded');
  } });
  assert.equal(status, 'succeeded');
  assert.equal(polls, 3);
});

test('failed, expired, missing and interrupted targeted refreshes cannot release the publisher', async () => {
  const slot = Date.parse('2026-11-27T00:30:00+03:00');
  const signal = new AbortController().signal;
  for (const state of ['failed', 'expired']) {
    assert.equal(await waitForSlipOddsRefresh(slot, async () => state, signal, { now: () => slot }), state);
  }

  let at = slot + 299_999;
  assert.equal(await waitForSlipOddsRefresh(slot, async () => null, signal, {
    now: () => at, wait: async (ms) => { assert.equal(ms, 1); at += ms; },
  }), 'timed-out');
  assert.equal(await waitForSlipOddsRefresh(slot, async () => 'succeeded', signal, { now: () => at }), 'timed-out');
  assert.equal(await waitForSlipOddsRefresh(slot, async () => { throw new Error('database gone'); }, signal, { now: () => slot }), 'unavailable');

  const controller = new AbortController();
  const pending = waitForSlipOddsRefresh(slot, () => new Promise(() => {}), controller.signal, { now: () => slot });
  controller.abort();
  assert.equal(await pending, 'aborted');
});

test('odds bands have unambiguous boundaries and preserve their scope through dates, summary and pagination', () => {
  const quotes = ['2.49','2.50','4.99','5.00','9.99','10.00','19.99','20.00','49.99','50.00','99.99','100.00','200.00','200.01'];
  assert.deepEqual(quotes.map(bestSlipOddsBandFor),[null,'1.5-5','1.5-5','5-10','5-10','10-20','10-20','20-50','20-50','50-100','50-100','100-200','100-200',null]);
  assert.deepEqual(bestSlipOddsBands.map(band => band.label), ['2.50–5.00','5.00–10.00','10.00–20.00','20.00–50.00','50.00–100.00','100.00–200.00']);
  assert.deepEqual(bestSlipOddsBands.map(band => [bestSlipBandCriteria(today, band.id).totalMin, bestSlipBandCriteria(today, band.id).totalMax]),
    [[250,499],[500,999],[1000,1999],[2000,4999],[5000,9999],[10000,20000]]);
  for(const [index,band] of bestSlipOddsBands.entries()){
    const query={...defaultBestSlipsQuery(),oddsBand:band.id,page:2};
    assert.deepEqual(parseBestSlipsQuery(serializeBestSlipsQuery(query),today),query);
    assert.deepEqual(selectSlipSummaryResult(query,'won'),{period:'today',status:'won',oddsBand:band.id,page:1});
    assert.equal(bestSlipBandCriteria(today,band.id).slips,20); assert.equal(bestSlipPublicRank(band.id,20),(index+1)*20);
  }
  assert.notEqual(bestSlipsRangeKey({...defaultBestSlipsQuery(),oddsBand:'5-10'},today),bestSlipsRangeKey(defaultBestSlipsQuery(),today));
  assert.throws(()=>parseBestSlipsQuery({oddsBand:'5-500'},today));
});
test('midnight checks both Kampala sets and continues to append beyond ten per band', async () => {
  const start = getReportingDayBounds(today).startInclusive, previous = addReportingDays(today, -1);
  const tomorrow = addReportingDays(today, 1), calls = [], reads = [], byDay = new Map();
  let clock = start;
  const pick = (id, kickoffAt, odds = '4.00') => pricedEditorialSelection(id, { at: clock, kickoffAt,
    odds, bookmakerId: id, probability: 0.64 });
  let offered = [pick(1, start + 3_600_000), pick(2, start + 3 * 3_600_000)];
  const state = (day) => {
    if (!byDay.has(day)) byDay.set(day, { counts: new Map([['1.5-5', 10]]), publishedHours: new Map(),
      fixtures: new Set(), combinations: new Set(), closed: new Set() });
    return byDay.get(day);
  };
  const options = { database: {}, competitionIds: [], now: () => clock, verifyPublicOdds: () => true,
    store: { hourlyState: async day => state(day), async append(input) {
      const { counts, publishedHours, fixtures, combinations } = state(input.day);
      calls.push(input);
      counts.set(input.oddsBand, (counts.get(input.oddsBand) ?? 0) + input.slips.length);
      const hours = publishedHours.get(input.oddsBand) ?? new Set();
      hours.add(input.hourAt);
      publishedHours.set(input.oddsBand, hours);
      for (const slip of input.slips) {
        combinations.add(bestSlipCombinationIdentity(slip.selections));
        slip.selections.forEach(({ fixtureId }) => fixtures.add(fixtureId));
      }
      return { status: 'published', appended: input.slips.length };
    } },
    read: async (parameters, context, time) => {
      const { day } = context.automaticPage;
      reads.push(day);
      assert.equal(parameters.get('start'), day + 'T03:00');
      assert.equal(parameters.get('end'), addReportingDays(day, 1) + 'T02:59');
      assert.equal(parameters.get('sort'), 'kickoff');
      assert.equal(context.featured, true);
      return { today, asOf: time.now(), range: bestSlipFixtureWindow(day), records: [liveRecord()],
        featuredSelections: offered, searchLimited: false, partialCoverage: false };
    } };
  const publisher = createDailySlipPublisher(options);
  const first = await publisher.publish(start);
  assert.equal(first.status, 'published');
  assert.equal(first.newSlips, 2);
  assert.deepEqual(reads, [previous, today]);
  assert.deepEqual(calls.map(({ day, hourAt, slips }) => [day, hourAt, slips[0].selections[0].fixtureId]),
    [[previous, start, offered[0].fixtureId], [today, start, offered[1].fixtureId]]);
  assert.equal(state(today).counts.get('1.5-5'), 11);
  assert.ok(calls.every(({ slips }) => !Object.hasOwn(slips[0], 'estimatedProbability')));
  const original = structuredClone(calls[1].slips);

  clock += 1_800_000;
  offered = [pick(3, start + 4 * 3_600_000, '3.00'), pick(4, start + 4 * 3_600_000, '101.00')];
  const second = await publisher.publish(clock);
  assert.equal(second.status, 'published');
  assert.equal(second.newSlips, 2);
  assert.equal(state(today).counts.get('1.5-5'), 12);
  assert.equal(calls.at(-1).oddsBand, '100-200');
  assert.deepEqual(calls[1].slips, original);
  assert.equal(await publisher.publish(start).then(({ status }) => status), 'unavailable');
  assert.equal((await publisher.publish(clock)).newSlips, 0);
  assert.equal(calls.length, 4);

  const window = bestSlipFixtureWindow(today);
  assert.equal(new Date(window.startInclusive).toISOString(), today + 'T00:00:00.000Z');
  assert.equal(new Date(window.endExclusive).toISOString(), tomorrow + 'T00:00:00.000Z');
  assert.deepEqual(bestSlipActivePublicationDays(start + 3 * 3_600_000 - 1), [previous, today]);
  assert.deepEqual(bestSlipActivePublicationDays(start + 3 * 3_600_000), [today]);
});

test('automatic reads advance a bounded kickoff cursor before reporting no candidates', async () => {
  const start = bestSlipFixtureWindow(today).startInclusive, at = start + 1_800_000;
  const selection = pricedEditorialSelection(99, { at, kickoffAt: at + 3_600_000 });
  const cursorRecord = liveRecord({ fixtureId: 'first-page-tail', kickoffAt: at + 1_800_000 });
  const pages = [], calls = [];
  const publisher = createDailySlipPublisher({ database: {}, competitionIds: [], now: () => at, verifyPublicOdds: () => true,
    store: { hourlyState: async () => ({ publishedHours: new Map(), closed: new Set(), fixtures: new Set(), combinations: new Set() }),
      async append(input) { calls.push(input); return { status: 'published', appended: input.slips.length }; } },
    read: async (_params, { automaticPage }, clock) => {
      pages.push(automaticPage);
      return { today, asOf: clock.now(), range: bestSlipFixtureWindow(today), records: [cursorRecord],
        featuredSelections: automaticPage.after ? [selection] : [], searchLimited: !automaticPage.after, partialCoverage: false };
    } });
  const result = await publisher.publish(at);
  assert.deepEqual(pages, [{ day: today }, { day: today, after: { kickoffAt: cursorRecord.kickoffAt, fixtureId: cursorRecord.fixtureId } }]);
  assert.equal(result.status, 'published');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].slips[0].selections[0].fixtureId, selection.fixtureId);
});

test('automatic publishing submits the available 2, 10, or 24 qualifying slips in a band', async () => {
  const range = bestSlipFixtureWindow(today), at = range.startInclusive;
  for (const count of [2, 10, 24]) {
    const selections = Array.from({ length: count }, (_, index) => pricedEditorialSelection(index + 1,
      { at, kickoffAt: at + 3_600_000 + index * 60_000, bookmakerId: index + 1 }));
    const batches = [];
    const publisher = createDailySlipPublisher({ database: {}, competitionIds: [], now: () => at, verifyPublicOdds: () => true,
      store: { hourlyState: async () => ({ counts: new Map([['1.5-5', 10]]), publishedHours: new Map(),
        closed: new Set(), fixtures: new Set(), combinations: new Set() }),
      async append(input) { batches.push(input); return { status: 'published', appended: input.slips.length }; } },
      read: async () => ({ today, asOf: at, range, records: [], featuredSelections: selections,
        searchLimited: false, partialCoverage: false }) });
    assert.equal((await publisher.publish()).newSlips, count);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].oddsBand, '1.5-5');
    assert.deepEqual(batches[0].slips.map(slip => slip.selections[0].fixtureId), selections.map(selection => selection.fixtureId));
  }
});

test('sparse odds bands stop at the eligible disjoint count and respect prior membership', () => {
  const selections = Array.from({ length: 5 }, (_, index) => pricedEditorialSelection(index, { odds: '1.80', probability: 0.61 }));
  const initial = buildHourlyBestSlips(today, '1.5-5', 10, now, { selections }, new Set());
  const identities = initial.slips.map(slip => bestSlipCombinationIdentity(slip.selections));
  assert.equal(identities.length, 2);
  assert.equal(new Set(initial.slips.flatMap(({ selections }) => selections.map(({ fixtureId }) => fixtureId))).size, 4);
  assert.ok(initial.slips.every(slip => slip.selections.length === 2 && slip.totalOdds === '3.24' && !('estimatedProbability' in slip)));
  const priorFixtures = new Set(initial.slips.flatMap(({ selections }) => selections.map(({ fixtureId }) => fixtureId)));
  const next = buildHourlyBestSlips(today, '1.5-5', 10, now, { selections, priorFixtures }, new Set(identities));
  assert.equal(next.slips.length, 0);
  assert.equal(buildHourlyBestSlips(today, '100-200', 10, now, { selections }, new Set()).slips.length, 0);
});

test('automatic generation enforces the 30 minute buffer and defers distant slips until their release window', () => {
  const start = bestSlipFixtureWindow(today).startInclusive - 1_800_000;
  const leg = (index, offset) => pricedEditorialSelection(index, { at: start, kickoffAt: start + offset, odds: '4.00', bookmakerId: index });
  const tooClose = leg(1, 1_799_999), boundary = leg(2, 1_800_000), distant = leg(3, 10 * 3_600_000);
  const build = (at, window) => buildHourlyBestSlips(today, '1.5-5', 10, at, { selections: [tooClose, boundary, distant] }, new Set(), window)
    .slips.flatMap(({ selections }) => selections.map(({ fixtureId }) => fixtureId));
  assert.deepEqual(build(start), [boundary.fixtureId]);
  assert.deepEqual(build(start + 4 * 3_600_000), [distant.fixtureId]);
  assert.deepEqual(build(start + 4 * 3_600_000, 3 * 3_600_000), []);
});

test('conservative whole-slip ranking beats a higher mean and does not sacrifice the top slip to fill a quota', () => {
  const selections = [pricedEditorialSelection(1, { odds: '4.00', probability: 0.76 }),
    pricedEditorialSelection(2, { odds: '2.00', probability: 0.86 }), pricedEditorialSelection(3, { odds: '2.00', probability: 0.87 })];
  const { slips } = buildHourlyBestSlips(today, '1.5-5', 10, now, { selections }, new Set());
  assert.deepEqual(slips.map(({ selections }) => selections.length), [1, 2]);
  assert.ok(slips.every((slip) => !Object.hasOwn(slip, 'estimatedProbability')));

  const pool = [['2.60', 0.90], ['3.00', 0.89], ['2.00', 0.70], ['1.80', 0.72]]
    .map(([odds, probability], index) => pricedEditorialSelection(index + 1, { odds, probability }));
  const best = buildHourlyBestSlips(today, '5-10', 10, now, { selections: pool }, new Set()).slips;
  assert.deepEqual(best.map(({ totalOdds }) => totalOdds), ['7.80']);
});

test('supervised loop keeps checking the next Kampala half-hour without a filled-band shortcut', async () => {
  let clock = Date.parse('2026-11-21T20:07:00Z');
  const calls = [], delays = [], controller = new AbortController();
  await runDailySlipPublisher({ async publish(hourAt) {
    calls.push(hourAt);
    return { day: getReportingDate(clock), status: 'published', dayComplete: calls.length === 2 };
  } }, controller.signal, () => { if (calls.length === 3) controller.abort(); }, false, {
    now: () => clock,
    wait: async delay => { delays.push(delay); clock += delay; },
  });
  assert.deepEqual(calls.map(at => new Date(at).toISOString()),
    ['2026-11-21T20:30:00.000Z', '2026-11-21T21:00:00.000Z', '2026-11-21T21:30:00.000Z']);
  assert.deepEqual(delays, [23 * 60_000, 1_800_000, 1_800_000]);
});

test('Best Slips orders sub-75 percent picks by probability then exact price and keeps three feasible slips', () => {
  const model = { calibrationReference: 'synthetic', correlationReference: 'synthetic',
    validFrom: now - 1000, validUntil: now + 86_400_000,
    estimate: (selections) => Math.min(...selections.map(({ probability }) => probability)) };
  const selections = [
    pricedEditorialSelection(1, { odds: '1.6041', probability: 0.72 }),
    pricedEditorialSelection(2, { odds: '1.60', probability: 0.74 }),
    pricedEditorialSelection(3, { odds: '1.6042', probability: 0.72 }),
    ...Array.from({ length: 3 }, (_, index) => pricedEditorialSelection(index + 4, { odds: '1.60', probability: 0.66 })),
  ];
  const order = [];
  const result = buildDailyBestSlips(today, '1.5-5', model, now, { selections, order: (candidates) => {
    order.push(...candidates.map(({ fixtureId }) => fixtureId));
    return candidates;
  } }, new Set());
  assert.deepEqual(order, [selections[1], selections[2], selections[0], ...selections.slice(3)].map(({ fixtureId }) => fixtureId));
  assert.equal(result.slips.length, 3);
  assert.equal(new Set(result.slips.flatMap((slip) => slip.selections.map(({ fixtureId }) => fixtureId))).size, selections.length);
  assert.ok(result.slips.every(({ selections, totalOdds }) =>
    selections.length === 2 && selections.every(({ probability }) => probability < 0.75) && bestSlipOddsBandFor(totalOdds) === '1.5-5'));
});

test('Best Slips exact products, same-book eligibility, compact ties and Kampala day cutoff', () => {
  const at = Date.parse('2026-10-09T19:45:00Z'), midnight = Date.parse('2026-10-09T21:00:00Z');
  const day = getReportingDate(at), model = { calibrationReference: 'synthetic', correlationReference: 'synthetic',
    validFrom: at - 3000, validUntil: midnight, estimate: () => 0.75 };
  const selections = [
    pricedEditorialSelection(1, { at, kickoffAt: midnight - 1, odds: '4.9999' }),
    pricedEditorialSelection(2, { at, kickoffAt: midnight - 1, odds: '5.00' }),
    pricedEditorialSelection(3, { at, kickoffAt: midnight, odds: '4.98' }),
    pricedEditorialSelection(4, { at, kickoffAt: midnight - 1, odds: '2.00' }),
    pricedEditorialSelection(5, { at, kickoffAt: midnight - 1, odds: '2.4999' }),
    pricedEditorialSelection(6, { at, kickoffAt: midnight - 1, odds: '2.20', bookmakerId: 9 }),
  ];
  const build = (band, prior = new Set()) => buildDailyBestSlips(day, band, model, at, { selections }, prior).slips;
  const defaults = build('1.5-5');
  assert.deepEqual(defaults.map(({ totalOdds, selections }) => [totalOdds, selections.length]), [['5.00', 1], ['5.00', 2]]);
  assert.deepEqual(build('5-10').map(({ selections }) => selections.length), [2, 1]);
  assert.ok([...defaults, ...build('5-10')].every(({ selections }) =>
    selections.every(({ kickoffAt, bookmaker }) => kickoffAt < midnight && bookmaker.id === selections[0].bookmaker.id)));
  const identity = bestSlipCombinationIdentity(defaults[1].selections);
  assert.equal(bestSlipCombinationIdentity([...defaults[1].selections].reverse()), identity);
  assert.ok(build('1.5-5', new Set([identity])).every(({ selections }) => bestSlipCombinationIdentity(selections) !== identity));
});

test('Best Slips uses fresh fixtures across bands when available and can reuse a fixture in a different combination', () => {
  const model = { calibrationReference: 'synthetic', correlationReference: 'synthetic',
    validFrom: now - 1000, validUntil: now + 86_400_000, estimate: (selections) => Math.min(...selections.map(({ probability }) => probability)) };
  const [previous, fresh] = [pricedEditorialSelection(1, { odds: '2.49', probability: 0.8 }), pricedEditorialSelection(2, { odds: '2.35' })];
  const alternatives = Array.from({ length: 20 }, (_, index) => pricedEditorialSelection(index + 3, { odds: '1.60' }));
  const priorFixtures = new Set([previous.fixtureId]);
  const find = (selections) => buildDailyBestSlips(today, '1.5-5', model, now, { selections, priorFixtures }, new Set()).slips;
  const diversified = find([previous, fresh, ...alternatives]);
  assert.equal(diversified.length, 10);
  assert.ok(diversified.every(({ selections }) => selections.every(({ fixtureId }) => fixtureId !== previous.fixtureId)));
  const sparse = find([previous, fresh, alternatives[0]]);
  assert.equal(sparse.length, 1);
  const requiresReuse = find([previous, alternatives[0]]);
  assert.deepEqual(requiresReuse[0].selections.map(({ fixtureId }) => fixtureId), [previous.fixtureId, alternatives[0].fixtureId]);
});

test('final rank uses odds before fewer matches when joint probabilities tie', () => {
  const model = { calibrationReference: 'synthetic', correlationReference: 'synthetic',
    validFrom: now - 1000, validUntil: now + 86_400_000, estimate: () => 0.75 };
  const single = pricedEditorialSelection(1), firstLeg = pricedEditorialSelection(2, { odds: '2.00' });
  const build = (price) => buildDailyBestSlips(today, '1.5-5', model, now,
    { selections: [single, firstLeg, pricedEditorialSelection(3, { odds: price })] }, new Set()).slips;
  assert.deepEqual(build('2.00').map((slip) => slip.selections.length), [1, 2]);
  assert.deepEqual(build('2.10').map((slip) => slip.selections.length), [2, 1]);
});

test('the editorial reader retains the sealed featured outcome with verified offers from multiple bookmakers', async () => {
  const fixture = liveRecord();
  const source = slipForecastFixture({ localQualification: 'qualified', homeWin: 0.77, at: now });
  const legacy = slipForecastFixture({ localQualification: 'unqualified', homeWin: 0.77, at: now });
  function projected(f) {
    const [leg] = f.slip.selections;
    return { ...fixture, fixtureId: leg.fixtureId, homeTeam: leg.homeTeam, awayTeam: leg.awayTeam, cycleId: f.cycle.id,
      kickoffAt: leg.kickoffAt, forecast: { ...fixture.forecast, revisionId: f.row.id, publishedAt: f.row.publishedAt.getTime(),
        provisional: true, updateDelayed: false, markets: [{ market: f.candidate.markets['match-result'].market, outcome: null }] } };
  }
  const record = projected(source), legacyRecord = projected(legacy);
  const { betId, betName, label } = verifiedLocalFeaturedBinding('match-result', 'home-win');
  const offer = { betId, betName, values: [{ label, odd: '1.6437' }], providerUpdatedAt: null,
    checkedAt: now - 1000, observedAt: now - 1000, snapshotId: 'a'.repeat(64), receiptId: 'b'.repeat(64) };
  const book = { bookmakerId: 8, bookmakerName: 'Synthetic bookmaker', offers: [offer] };
  const quotes = { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt, checkedAt: now - 1000,
    primaryBookmakerId: 99, bookmakers: [book, { ...book, bookmakerId: 19, offers: [
      { ...offer, values: [{ label, odd: '1.4219' }, { label: 'Away', odd: '3.80' }], snapshotId: 'c'.repeat(64) },
    ] }, { ...book, bookmakerId: 25, offers: [{ ...offer, values: [{ label, odd: '1.33' }], receiptId: undefined }] },
    { ...book, bookmakerId: 33, offers: [{ ...offer, betName: 'Incorrect market' }] },
    { ...book, bookmakerId: 44, offers: [{ ...offer, values: [{ label, odd: '2.10', suspended: true }] }] },
    { ...book, bookmakerId: 55, offers: [{ ...offer, observedAt: now - 86_400_000 }] },
    { ...book, bookmakerId: 66, offers: [{ ...offer, values: [{ label, odd: '1.55' }] }] },
    { ...book, bookmakerId: 66, offers: [{ ...offer, values: [{ label, odd: '1.51' }] }] },
    { ...book, bookmakerId: 77, offers: [{ ...offer, values: [{ label: 'Away', odd: '90.00' }] }] },
    { ...book, bookmakerId: 88, offers: [offer, offer] }] };
  const sealedReads = [];
  const tx = { async $queryRaw(query) {
    sealedReads.push(query.sql);
    const originals = [source, legacy].filter((item) => query.values.includes(item.row.id));
    if (query.sql.includes('FROM PredictionSet')) return originals.map(({ row }) => row);
    if (query.sql.includes('FROM MarketPrediction')) return originals.flatMap(({ marketRows }) => marketRows);
    throw new Error('Unexpected read');
  } };
  const load = (current, currentQuotes = quotes, at = now) => readFeaturedSlipSelections(tx, [current], at,
    async () => ({ goals: new Map(), quotes: new Map([[current.fixtureId, currentQuotes]]), total15: {} }));
  const selections = await load(record);
  assert.deepEqual(selections.map((selection) => [selection.family, selection.selection, selection.probability, selection.odds,
    selection.source, selection.bookmaker.id, selection.offer.snapshotId]), [
    ['match-result', 'home-win', 0.77, '1.6437', 'local-engine', 8, 'a'.repeat(64)],
    ['match-result', 'home-win', 0.77, '1.4219', 'local-engine', 19, 'c'.repeat(64)],
  ]);
  for (const selection of selections) assert.deepEqual(selection.forecast, {
    cycleId: record.cycleId, revisionId: record.forecast.revisionId, publishedAt: source.row.publishedAt.getTime(),
  });
  assert.equal(sealedReads.length, 2, 'each offered price shares one sealed forecast revision');
  assert.deepEqual(await load(record, { ...quotes, bookmakers: [quotes.bookmakers[3]] }), []);
  assert.deepEqual(await load({ ...record, kickoffAt: record.kickoffAt + 86_400_000 }), []);
  assert.deepEqual(await load(record, quotes, getPublicationDeadline(record.kickoffAt)), []);
  assert.equal(sealedReads.length, 2, 'ineligible prices, occurrences and cutoffs never trigger sealed revision reads');
  assert.deepEqual(await load(legacyRecord, { ...quotes, fixtureId: legacyRecord.fixtureId }), []);
  assert.equal(sealedReads.length, 4, 'a valid legacy Local Engine revision does not prove numerical qualification');
  const [item] = record.forecast.markets;
  assert.deepEqual(await load({ ...record, forecast: { ...record.forecast, markets: [{ ...item,
    market: { ...item.market, probabilities: { ...item.market.probabilities, 'home-win': 0.79 } } }] } }), []);
});

test('the publication recheck locks the occurrence and verifies the chosen non-primary bookmaker receipt', async () => {
  const selection = pricedEditorialSelection(11, { odds: '1.4219', bookmakerId: 19 });
  const { fixtureId, kickoffAt, offer } = selection;
  const { betId, betName, providerSelection: label, decimal: odd, checkedAt, observedAt, providerUpdatedAt, snapshotId, receiptId } = offer;
  const original = { betId, betName, values: [{ label, odd }], checkedAt, observedAt, providerUpdatedAt, snapshotId, receiptId };
  const book = { bookmakerId: 19, bookmakerName: null, offers: [original] };
  const quotes = { fixtureId, kickoffAt, checkedAt, primaryBookmakerId: 99, bookmakers: [book] };
  const locked = { async $queryRaw(query) {
    assert.ok(query.sql.includes('LOCK IN SHARE MODE'));
    assert.deepEqual(query.values, [fixtureId]);
    return [{ fixtureId }];
  } };
  const recheck = (current = quotes, proposed = selection) => verifyFeaturedSlipOffers(locked, [proposed], now,
    async () => new Map([[fixtureId, current]]));
  assert.equal(await recheck(), true);
  const alternative = { ...selection, odds: '1.50', bookmaker: { id: 21, name: null },
    offer: { ...offer, decimal: '1.5', bookmakerId: 21, snapshotId: 'a'.repeat(64) } };
  const alternateBook = { bookmakerId: 21, bookmakerName: null, offers: [{ ...original,
    snapshotId: alternative.offer.snapshotId, values: [{ label, odd: '1.5' }] }] };
  assert.equal(await verifyFeaturedSlipOffers(locked, [selection, alternative], now,
    async () => new Map([[fixtureId, { ...quotes, bookmakers: [book, alternateBook] }]])), true);
  assert.equal(await recheck({ ...quotes, kickoffAt: kickoffAt + 60_000 }), false);
  assert.equal(await recheck({ ...quotes, checkedAt: now + 1 }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, offers: [{ ...original, receiptId: 'd'.repeat(64) }] }] }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, offers: [{ ...original, values: [{ label, odd: '1.4221' }] }] }] }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, bookmakerId: 99 }] }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, offers: [original, original] }] }), false);
  assert.equal(await verifyFeaturedSlipOffers({ $queryRaw: async () => [] }, [selection], now,
    () => { throw new Error('odds must be locked before rereading quotes'); }), false);
});

test('automatic Best Slips bind exact sealed match and team goal totals with compatible prices', async () => {
  const cases = [
    { key: 'goal:full-time:totals:total:4.5:binary', family: 'total-goals', selection: 'under-4.5', odds: '1.80' },
    { key: 'goal:full-time:totals:home:2.5:binary', family: 'team-goals', selection: 'home-under-2.5', odds: '1.85' },
  ].map(({ key, family, selection, odds }) => {
    const source = slipForecastFixture({ localQualification: 'qualified', at: now });
    const [leg] = source.slip.selections;
    const fixture = liveRecord();
    const forecast = { ...fixture.forecast, revisionId: source.row.id, publishedAt: source.row.publishedAt.getTime(),
      provisional: true, updateDelayed: false, markets: Object.values(source.candidate.markets)
        .filter(({ available }) => available).map(({ market }) => ({ market, outcome: null })) };
    const record = { ...fixture, fixtureId: leg.fixtureId, cycleId: source.cycle.id, kickoffAt: leg.kickoffAt,
      homeTeam: leg.homeTeam, awayTeam: leg.awayTeam, forecast };
    const prepared = prepareGoalMarketExtension({ definitions: localFirstGoalMarketDefinitions,
      evaluationProfile: LOCAL_FIRST_GOAL_EVALUATION_PROFILE, localPoisson: source.candidate.markets['total-goals'].provenance.rates });
    const body = { ...prepared, revisionId: source.row.id, cycleId: record.cycleId, fixtureId: record.fixtureId,
      recordedAt: forecast.publishedAt, contentHash: evidenceFingerprint(prepared) };
    const extension = { ...body, body, recordedAt: source.row.publishedAt, validIntegrity: 1 };
    const { betId, betName, label } = verifiedLocalFeaturedBinding(key, 'under');
    const offer = { betId, betName, values: [{ label, odd: odds }], checkedAt: now - 1000, observedAt: now - 1000,
      providerUpdatedAt: null, snapshotId: 'a'.repeat(64), receiptId: 'b'.repeat(64) };
    const quotes = { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt, checkedAt: offer.checkedAt, primaryBookmakerId: 8,
      bookmakers: [{ bookmakerId: 8, bookmakerName: 'Synthetic bookmaker', offers: [offer] }] };
    const goal = prepared.markets.find(({ definition }) => definition.key === key);
    const probability = goal.derivation.market.selections.find(({ key }) => key === 'under').winProbability;
    return { source, record, extension, offer, quotes, family, selection, odds, probability };
  });
  const tx = {
    footballFixture: { findMany: async () => cases.map(({ source }) => source.fixture) },
    predictionCycle: { findUnique: async ({ where: { id } }) => cases.find(({ source }) => source.cycle.id === id).source.cycle },
    predictionSchedule: { findUnique: async ({ where: { cycleId_version: { cycleId } } }) =>
      cases.find(({ source }) => source.cycle.id === cycleId).source.schedule },
    async $queryRaw(query, ...parameters) {
      const sql = Array.isArray(query) ? query.join('?') : query.sql;
      const values = Array.isArray(query) ? parameters : query.values;
      const matching = cases.filter(({ source }) => values.includes(source.row.id));
      if (sql.includes('FROM PredictionSet')) return matching.map(({ source }) => source.row);
      if (sql.includes('FROM MarketPrediction')) return matching.flatMap(({ source }) => source.marketRows);
      if (sql.includes('FROM GoalMarketExtension')) return matching.map(({ extension }) => extension);
      if (sql.includes('FROM FixtureOddsState')) return values.map(fixtureId => ({ fixtureId }));
      if (sql.includes('FROM FootballFixture')) return values.map(id => ({ id }));
      if (sql.includes('FROM PredictionPublicationBarrier')) return [];
      throw new Error('Unexpected read');
    },
  };
  const records = cases.map(({ record }) => record);
  const quotes = new Map(cases.map(({ record, quotes }) => [record.fixtureId, quotes]));
  const goals = await readFeaturedGoalMarkets(tx, records.map(({ forecast }) => forecast.revisionId));
  const load = (includeAdditionalGoals, prices = quotes) => readFeaturedSlipSelections(tx, records, now,
    async () => ({ goals, quotes: prices, total15: {} }), includeAdditionalGoals);
  assert.deepEqual(await load(false), []);
  const selections = await load(true);
  assert.deepEqual(selections.map(({ family, selection, odds, probability }) => ({ family, selection, odds, probability })),
    cases.map(({ family, selection, odds, probability }) => ({ family, selection, odds, probability })));
  assert.deepEqual(await load(true, new Map()), []);

  const build = (band, at = now) => buildHourlyBestSlips(today, band, 10, at, { selections }, new Set()).slips;
  const [slip] = build('1.5-5');
  assert.equal(slip.totalOdds, '3.33');
  assert.equal(slip.selections.length, 2);
  assert.deepEqual(build('5-10'), []);
  assert.deepEqual(build('1.5-5', now + 1_800_001), []);
  assert.deepEqual(await bindSlipForecasts(tx, slip, now), slip);
  const [first, second] = slip.selections;
  assert.equal(await bindSlipForecasts(tx, { ...slip, selections: [{ ...first, probability: 0.5 }, second] }, now), null);

  const recheck = (prices = quotes) => verifyFeaturedSlipOffers(tx, slip.selections, now, async () => prices);
  assert.equal(await recheck(), true);
  for (const [index, wrongLabels] of [[0, ['Over 4.5', 'Under 3.5']], [1, ['Over 2.5']]]) {
    const current = cases[index];
    for (const label of wrongLabels) {
      const [book] = current.quotes.bookmakers;
      const offers = [{ ...current.offer, values: [{ label, odd: current.odds }] }];
      const changed = { ...current.quotes, bookmakers: [{ ...book, offers }] };
      assert.equal(await recheck(new Map(quotes).set(current.record.fixtureId, changed)), false);
    }
  }
  const team = cases[1], [book] = team.quotes.bookmakers;
  const { betId, betName, label } = verifiedLocalFeaturedBinding('goal:full-time:totals:away:2.5:binary', 'under');
  const offers = [{ ...team.offer, betId, betName, values: [{ label, odd: team.odds }] }];
  const wrongTeam = { ...team.quotes, bookmakers: [{ ...book, offers }] };
  assert.equal(await recheck(new Map(quotes).set(team.record.fixtureId, wrongTeam)), false);
});

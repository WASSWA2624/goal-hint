import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipOddsBands, bestSlipOddsBandFor, bestSlipPublicRank } from '../src/domain/best-slip-odds-bands.ts';
import { bestSlipBandCriteria, bestSlipCombinationIdentity, buildDailyBestSlips } from '../src/domain/best-slips.ts';
import { parseBestSlipsQuery, serializeBestSlipsQuery, selectSlipSummaryResult, defaultBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { bestSlipsRangeKey } from '../src/domain/best-slips-client.ts';
import { createDailySlipPublisher } from '../src/server/slips/daily-slip-publication.ts';
import { readFeaturedSlipSelections, verifyFeaturedSlipOffers } from '../src/server/slips/best-slip-recommendations.ts';
import { verifiedLocalFeaturedBinding } from '../src/domain/local-featured-decision.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';
import { pricedEditorialSelection } from './helpers/best-slip-publication-fixtures.mjs';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';
import { getPublicationDeadline, getReportingDate } from '../src/domain/calendar.ts';

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
test('publisher reads one cohort, fills missing bands only and resumes without replacing prior cohorts', async () => {
  const published=new Set(['1.5-5']), calls=[], record=liveRecord();
  const model={calibrationReference:'test',correlationReference:'test',validFrom:now-1000,validUntil:now+86400000,estimate:()=>0.72};
  const cohort = { today, asOf: now, range: { from: today, to: today }, searchLimited: false, partialCoverage: false,
    records: [record], featuredSelections: bestSlipOddsBands.map((band, index) =>
      pricedEditorialSelection(index + 1, { odds: (band.minimumTotal / 100).toFixed(2), probability: 0.72 })) };
  let reads = 0;
  const options={database:{},competitionIds:[],model,now:()=>now,verifyModel:()=>true,verifyPublicOdds:()=>true,
    historicalEvidence: async () => ({ order: values => values, report: { status: 'insufficient', scannedDecisions: 0, settledDecisions: 0 } }),
    store:{publishedBands:async()=>[...published],publish:async(input)=>{calls.push(input);published.add(input.oddsBand);return 'published';}},
    read:async (parameters) => { reads++; assert.equal(parameters.get('from'), today); return cohort; }};
  const publisher=createDailySlipPublisher(options);
  const result = await publisher.publish();
  assert.equal(result.status, 'published');
  assert.equal(result.eligibleSelections, 6);
  assert.equal(calls.length, 5);
  assert.deepEqual(calls.map(input=>input.oddsBand),bestSlipOddsBands.slice(1).map(band=>band.id));
  assert.ok(calls.every(input=>input.slips.length<=10));
  assert.equal((await publisher.publish()).status,'already-published');assert.equal(calls.length,5);
  assert.equal(reads, 1);
  const unavailable=createDailySlipPublisher({...options,store:{...options.store,publishedBands:async()=>[]},read:async()=>({...cohort, asOf: now - 1})});
  assert.equal((await unavailable.publish()).status,'unavailable');
  const noPrices=createDailySlipPublisher({...options,store:{...options.store,publishedBands:async()=>[]},
    read:async()=>({...cohort, records: [{...record, forecast: {}}], featuredSelections: []})});
  assert.equal((await noPrices.publish()).status,'odds-unavailable'); assert.equal(calls.length,5);
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
  assert.equal(await recheck({ ...quotes, kickoffAt: kickoffAt + 60_000 }), false);
  assert.equal(await recheck({ ...quotes, checkedAt: now + 1 }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, offers: [{ ...original, receiptId: 'd'.repeat(64) }] }] }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, offers: [{ ...original, values: [{ label, odd: '1.4221' }] }] }] }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, bookmakerId: 99 }] }), false);
  assert.equal(await recheck({ ...quotes, bookmakers: [{ ...book, offers: [original, original] }] }), false);
  assert.equal(await verifyFeaturedSlipOffers({ $queryRaw: async () => [] }, [selection], now,
    () => { throw new Error('odds must be locked before rereading quotes'); }), false);
});

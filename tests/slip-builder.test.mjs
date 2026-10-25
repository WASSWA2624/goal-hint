import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFeedRecordSchema } from '../src/domain/match-feed.ts';
import { marketRules, marketSelections, validateMarketSnapshot } from '../src/domain/markets.ts';
import { buildSlips, defaultSlipCriteria, hasJointBounds, parseSlipCriteria, serializeSlipCriteria, SlipCriteriaError, slipBuilderRules } from '../src/domain/slip-builder.ts';

const today = '2026-10-13', asOf = Date.parse('2026-10-13T07:00:00Z');
const kickoffAt = Date.parse('2026-10-13T15:00:00Z');
function record(id, odds = '2.00', probability = 0.8, overrides = {}) {
  const snapshot = validateMarketSnapshot({
    'match-result': { source: 'ai', period: marketRules.period,
      probabilities: { 'home-win': probability, draw: (1 - probability) / 2, 'away-win': (1 - probability) / 2 } },
  });
  const markets = Object.values(snapshot.markets).filter((entry) => entry.available).map(({ market }) => ({ market, reasons: [], uncertainty: null }));
  return matchFeedRecordSchema.parse({ fixtureId: id, dataVersion: '1', homeTeam: { id: `${id}-h`, name: `${id} Home` },
    awayTeam: { id: `${id}-a`, name: `${id} Away` }, competition: { id: 'league-a', name: 'League A', country: 'Uganda' },
    kickoffAt, syncedAt: asOf, status: 'scheduled', score: null, cycleId: `cycle-${id}`,
    cycle: { state: 'open', mode: 'current', ordinal: 1, lockedAt: null, voidReason: null },
    forecast: { runId: 'run-a', revisionId: `revision-${id}`, publishedAt: asOf - 60_000, markets },
    update: { prediction: 'current', result: 'untracked' }, unavailableMarkets: [
      { family: 'total-goals', reason: 'not-published' }, { family: 'both-teams-to-score', reason: 'not-published' }],
    availabilityMessage: null, scorePeriod: null,
    prices: [{ family: 'match-result', selection: 'home-win', price: odds, basis: 'bookmaker', retrievedAt: asOf - 1000, providerUpdatedAt: null }],
    ...overrides });
}
function criteria(overrides = {}) {
  return { ...defaultSlipCriteria(today), markets: ['match-result'], oddsMin: 101, oddsMax: 100_000,
    probMin: 0, probMax: 100, totalMin: 101, totalMax: 10_000_000, teamsMin: 1, teamsMax: 8, slips: 10, reuse: true, ...overrides };
}
const fixtureIds = (slip) => slip.selections.map((selection) => selection.fixtureId).sort();

test('generated slip identity retains the exact source cycle/revision/probability and quote', () => {
  const source = record('source'), options = criteria({ teamsMin: 1, teamsMax: 1, slips: 1 });
  const build = value => buildSlips(options, [value], asOf).slips[0];
  const first = build(source);
  assert.deepEqual(first.selections[0].forecast, { cycleId: source.cycleId, revisionId: source.forecast.revisionId, publishedAt: source.forecast.publishedAt });
  assert.equal(build(structuredClone(source)).id, first.id);
  for (const change of [
    { ...source, cycleId: 'replacement-cycle' },
    { ...source, forecast: { ...source.forecast, revisionId: 'revised-source' } },
    { ...source, forecast: { ...source.forecast, publishedAt: source.forecast.publishedAt + 1 } },
    record('source', '2.00', 0.79), record('source', '2.10', 0.8),
  ]) assert.notEqual(build(change).id, first.id);
  assert.equal(buildSlips(options, [{ ...source, cycleId: null }], asOf).slips.length, 0);
});

test('Any defaults and canonical native GET criteria round trip', () => {
  const defaults = defaultSlipCriteria(today);
  assert.deepEqual(defaults, { dateFrom: today, dateTo: '2026-11-12', timeFrom: '', timeTo: '',
    markets: ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score'], totalMin: 101, totalMax: 10_000_000, oddsMin: 101, oddsMax: 100_000,
    probMin: 0, probMax: 100, jointMin: 0, jointMax: 100, teamsMin: 1, teamsMax: 8, slips: 3, reuse: false });
  assert.deepEqual(parseSlipCriteria({}, today), defaults);
  assert.deepEqual(parseSlipCriteria(serializeSlipCriteria(defaults), today), defaults);
  // Default whole-slip bounds are omitted, so existing canonical URLs and sealed criteria strings are unchanged.
  assert.equal(serializeSlipCriteria(defaults).has('jointMin'), false); assert.equal(serializeSlipCriteria(defaults).has('jointMax'), false);
  assert.equal(serializeSlipCriteria(defaults).toString(), 'dateFrom=2026-10-13&dateTo=2026-11-12&timeFrom=&timeTo='
    + '&markets=match-result%2Cdouble-chance%2Ctotal-goals%2Cboth-teams-to-score&totalMin=1.01&totalMax=100000.00&oddsMin=1.01'
    + '&oddsMax=1000.00&probMin=0&probMax=100&teamsMin=1&teamsMax=8&slips=3&reuse=0');
  const repeated = parseSlipCriteria(new URLSearchParams('build=1&markets=total-goals&markets=match-result&reuse=0&reuse=1'), today);
  assert.deepEqual(repeated.markets, ['match-result', 'total-goals']); assert.equal(repeated.reuse, true);
  assert.equal(parseSlipCriteria({ markets: ['total-goals', 'match-result'], reuse: ['0', '1'] }, today).reuse, true);
  assert.equal(parseSlipCriteria({ reuse: '0' }, today).reuse, false);
  assert.equal(serializeSlipCriteria(repeated).getAll('reuse').length, 1);
  const smallProbability = criteria({ probMin: 0.0000001 });
  assert.deepEqual(parseSlipCriteria(serializeSlipCriteria(smallProbability), today), smallProbability);
});

test('non-default whole-slip bounds serialize as a canonical pair and round trip', () => {
  const lower = criteria({ jointMin: 50 }), serialized = serializeSlipCriteria(lower);
  assert.equal(serialized.get('jointMin'), '50'); assert.equal(serialized.get('jointMax'), '100');
  assert.match(serialized.toString(), /&probMax=100&jointMin=50&jointMax=100&teamsMin=/);
  assert.deepEqual(parseSlipCriteria(serialized, today), lower);
  const tiny = criteria({ jointMin: 0.0000001 });
  assert.deepEqual(parseSlipCriteria(serializeSlipCriteria(tiny), today), tiny);
  const upper = criteria({ jointMax: 99.999 });
  assert.equal(serializeSlipCriteria(upper).get('jointMin'), '0'); assert.deepEqual(parseSlipCriteria(serializeSlipCriteria(upper), today), upper);
  assert.equal(hasJointBounds(criteria()), false); assert.equal(hasJointBounds({ jointMin: 0, jointMax: 100 }), false);
  assert.equal(hasJointBounds({ jointMin: 0.001, jointMax: 100 }), true); assert.equal(hasJointBounds({ jointMin: 0, jointMax: 99.999 }), true);
  assert.deepEqual(parseSlipCriteria({ jointMin: '', jointMax: '' }, today), defaultSlipCriteria(today));
  for (const invalid of [{ jointMin: NaN }, { jointMin: 60, jointMax: 50 }, { jointMax: 100.5 }]) {
    assert.throws(() => serializeSlipCriteria(criteria(invalid)));
  }
});

test('whole-slip bounds without a joint ranking are refused rather than approximated', () => {
  const records = [record('a', '2.00', 0.8), record('b', '2.00', 0.9)];
  for (const bounds of [{ jointMin: 1 }, { jointMax: 99 }]) {
    assert.throws(() => buildSlips(criteria({ teamsMin: 2, teamsMax: 2, ...bounds }), records, asOf),
      (error) => error instanceof RangeError && /current calibrated joint ranking/.test(error.message));
  }
  const average = buildSlips(criteria({ teamsMin: 2, teamsMax: 2 }), records, asOf);
  assert.equal(average.slips.length, 1); assert.equal('joint' in average, false);
  assert.ok(average.slips.every((slip) => !('estimatedProbability' in slip)));
});

test('omitting reuse builds separate slips while an explicit opt-in still allows shared matches', () => {
  const records = [record('a', '2.00', 0.95), record('b', '2.00', 0.9), record('c', '2.00', 0.8), record('d', '2.00', 0.7)];
  const parameters = { teamsMin: '2', teamsMax: '2', slips: '2' };
  const separate = buildSlips(parseSlipCriteria(parameters, today), records, asOf);
  assert.equal(separate.slips.length, 2);
  const chosen = separate.slips.flatMap(fixtureIds);
  assert.equal(new Set(chosen).size, chosen.length);
  const reusable = buildSlips(parseSlipCriteria({ ...parameters, reuse: '1' }, today), records, asOf);
  assert.equal(reusable.slips.length, 2);
  const repeated = reusable.slips.flatMap(fixtureIds);
  assert.ok(new Set(repeated).size < repeated.length);
});

test('independent blank odds bounds mean the supported lower or upper bound', () => {
  const parsed = parseSlipCriteria({ totalMin: '', oddsMax: '' }, today);
  assert.equal(parsed.totalMin, 101); assert.equal(parsed.totalMax, 10_000_000);
  assert.equal(parsed.oddsMin, 101); assert.equal(parsed.oddsMax, 100_000);
  assert.equal(parseSlipCriteria({ totalMax: '' }, today).totalMax, 10_000_000);
  assert.equal(parseSlipCriteria({ oddsMin: '' }, today).oddsMin, 101);
});

test('blank Any dates, probabilities and selection counts resolve to supported bounds', () => {
  assert.deepEqual(parseSlipCriteria({ dateFrom: '', dateTo: '', probMin: '', probMax: '', teamsMin: '', teamsMax: '' }, today), defaultSlipCriteria(today));
  assert.equal(parseSlipCriteria({ dateFrom: '2026-10-20', dateTo: '' }, today).dateTo, '2026-11-19');
  const onlyUpper = parseSlipCriteria({ dateFrom: '', dateTo: '2026-10-20' }, today);
  assert.equal(onlyUpper.dateFrom, today); assert.equal(onlyUpper.dateTo, '2026-10-20');
  assert.throws(() => parseSlipCriteria({ dateFrom: '', dateTo: '2026-11-13' }, today), (error) => error.code === 'invalid-date-range');
  assert.throws(() => parseSlipCriteria({ slips: '' }, today), (error) => error.code === 'invalid-slip-count');
});

test('automatic outcomes canonicalize to omitted criteria and manual choices use family order', () => {
  const automatic = new URLSearchParams(Object.keys(marketSelections).map((family) => [`picks.${family}`, 'auto']));
  assert.deepEqual(parseSlipCriteria(automatic, today), defaultSlipCriteria(today));
  assert.equal([...serializeSlipCriteria(parseSlipCriteria(automatic, today)).keys()].some((key) => key.startsWith('picks.')), false);
  const manual = parseSlipCriteria(new URLSearchParams('picks.match-result=away-win&' + 'picks.match-result=home-win&' + 'picks.match-result=draw&picks.total-goals=under-2.5'), today);
  assert.deepEqual(manual.outcomes, { 'match-result': ['home-win', 'draw', 'away-win'], 'total-goals': ['under-2.5'] });
  const reversedMap = { ...manual, outcomes: { 'total-goals': ['under-2.5'], 'match-result': ['away-win', 'home-win', 'draw'] } };
  assert.equal(serializeSlipCriteria(reversedMap).toString(), serializeSlipCriteria(manual).toString());
});

test('all ten manual outcome checkboxes fit the bounded full native GET contract', () => {
  const outcomes = { ...marketSelections }, expected = { ...defaultSlipCriteria(today), outcomes, reuse: true };
  const form = serializeSlipCriteria(expected); form.delete('markets'); form.delete('reuse');
  for (const [family, choices] of Object.entries(outcomes)) {
    form.delete(`picks.${family}`);
    for (const selection of choices) form.append(`picks.${family}`, selection);
    form.append('markets', family);
  }
  form.append('reuse', '0'); form.append('reuse', '1'); form.append('build', '1');
  assert.equal([...form].length, 30); assert.deepEqual(parseSlipCriteria(form, today), expected);
  // A form offering whole-slip limits submits both blank Any fields as well.
  form.append('jointMin', ''); form.append('jointMax', '');
  assert.equal([...form].length, 32); assert.deepEqual(parseSlipCriteria(form, today), expected);
});

for (const input of [
  { 'picks.match-result': 'auto,home-win' }, { 'picks.match-result': ['auto', 'home-win'] },
  { 'picks.match-result': 'over-2.5' }, { 'picks.total-goals': 'over-3.5' }, { 'picks.match-result': '' },
  { 'picks.match-result': [] },
]) {
  test(`manual outcome criteria reject ${JSON.stringify(input)}`, () => {
    assert.throws(() => parseSlipCriteria(input, today), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-pick');
  });
}

test('an unchecked market ignores its valid native outcome draft and preserves active market choices', () => {
  const parsed = parseSlipCriteria(new URLSearchParams('build=1&markets=match-result&picks.match-result=home-win,draw&picks.total-goals=under-2.5'), today);
  assert.deepEqual(parsed.markets, ['match-result']); assert.deepEqual(parsed.outcomes, { 'match-result': ['home-win', 'draw'] });
  assert.equal(serializeSlipCriteria(parsed).has('picks.total-goals'), false);
  assert.throws(() => parseSlipCriteria({ markets: 'match-result', 'picks.total-goals': 'home-win' }, today), (error) => error.code === 'invalid-pick');
});

test('invalid typed outcome mappings cannot bypass serialization validation', () => {
  for (const outcomes of [{ corners: ['over-2.5'] }, { 'match-result': [] }, { 'match-result': ['yes'] }, { 'match-result': ['auto'] }]) {
    assert.throws(() => serializeSlipCriteria(criteria({ outcomes })), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-pick');
  }
  assert.throws(() => parseSlipCriteria({ 'picks.corners': 'auto' }, today), (error) => error.code === 'invalid-query');
});

test('bounded parsing preserves the complete native GET form with four repeated markets and hidden reuse pair', () => {
  const allMarkets = ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score'];
  const expected = { ...defaultSlipCriteria(today), markets: allMarkets, reuse: true };
  const form = serializeSlipCriteria(expected); form.delete('markets'); form.delete('reuse');
  for (const market of allMarkets) form.append('markets', market);
  form.append('reuse', '0'); form.append('reuse', '1'); form.append('build', '1');
  assert.equal([...form].length, 20);
  assert.deepEqual(parseSlipCriteria(form, today), expected);
  assert.deepEqual(parseSlipCriteria(new URLSearchParams('markets=total-goals,match-result&markets=double-chance&markets=both-teams-to-score'), today).markets, allMarkets);
});

test('repeated market aggregation stops at four total CSV and checkbox tokens', () => {
  const five = new URLSearchParams();
  for (let index = 0; index < 5; index++) five.append('markets', 'match-result');
  assert.throws(() => parseSlipCriteria(five, today), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-market');
  assert.throws(() => parseSlipCriteria({ markets: ['match-result,double-chance,total-goals,both-teams-to-score', 'match-result'] }, today),
    (error) => error instanceof SlipCriteriaError && error.code === 'invalid-market');
  const oversized = Array(100_000).fill('match-result');
  // An oversized array is rejected from its length without inspecting or copying its entries.
  Object.defineProperty(oversized, 0, { get: () => { throw new Error('Oversized array was read.'); } });
  assert.throws(() => parseSlipCriteria({ markets: oversized }, today), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-query');
});

test('aggregate encoded bytes and entry counts are bounded before query values are combined', () => {
  const longValues = new URLSearchParams();
  for (const field of ['dateFrom', 'dateTo', 'timeFrom']) longValues.append(field, '😀'.repeat(128));
  assert.throws(() => parseSlipCriteria(longValues, today), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-query');
  const oversizedAscii = new URLSearchParams();
  for (const field of ['dateFrom', 'dateTo', 'timeFrom', 'timeTo', 'totalMin', 'totalMax', 'oddsMin', 'oddsMax']) oversizedAscii.append(field, '1'.repeat(256));
  assert.throws(() => parseSlipCriteria(oversizedAscii, today), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-query');
  const tooMany = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`unused-${index}`, undefined]));
  assert.throws(() => parseSlipCriteria(tooMany, today), (error) => error instanceof SlipCriteriaError && error.code === 'invalid-query');
});
for (const [parameters, code] of [
  [{ dateFrom: '2026-02-30' }, 'invalid-date-range'], [{ dateTo: '2026-10-12' }, 'invalid-date-range'],
  [{ dateTo: '2026-11-13' }, 'invalid-date-range'], [{ timeFrom: '10:00' }, 'invalid-time-range'],
  [{ timeTo: '10:00' }, 'invalid-time-range'], [{ timeFrom: '18:00', timeTo: '08:00' }, 'invalid-time-range'],
  [{ timeFrom: '24:00', timeTo: '24:00' }, 'invalid-time-range'], [{ markets: '' }, 'invalid-market'],
  [{ markets: 'corners' }, 'invalid-market'], [{ build: '1' }, 'invalid-market'],
  [{ oddsMin: '1.00' }, 'invalid-odds-range'], [{ totalMax: '100000.01' }, 'invalid-odds-range'],
  [{ oddsMax: '1000.01' }, 'invalid-odds-range'], [{ oddsMin: '1000.01' }, 'invalid-odds-range'],
  [{ totalMin: '100000.01' }, 'invalid-odds-range'], [{ oddsMin: '1e2' }, 'invalid-odds-range'],
  [{ totalMin: '3.001' }, 'invalid-odds-range'], [{ probMin: '100.01' }, 'invalid-probability-range'],
  [{ probMin: '80', probMax: '69.99' }, 'invalid-probability-range'], [{ jointMin: '100.01' }, 'invalid-joint-probability-range'],
  [{ jointMin: '60', jointMax: '50' }, 'invalid-joint-probability-range'], [{ jointMax: 'abc' }, 'invalid-joint-probability-range'],
  [{ jointMin: '-1' }, 'invalid-joint-probability-range'], [{ teamsMin: '5', teamsMax: '4' }, 'invalid-selection-range'],
  [{ teamsMax: '9' }, 'invalid-selection-range'], [{ slips: '11' }, 'invalid-slip-count'],
  [{ slips: '0' }, 'invalid-slip-count'], [{ reuse: 'yes' }, 'invalid-query'],
  [{ build: '0' }, 'invalid-query'], [{ locale: 'en' }, 'invalid-query'],
  [{ totalMax: ['6', '8'] }, 'invalid-query'], [{ reuse: ['1', '0'] }, 'invalid-query'],
]) {
  test(`criteria rejects ${JSON.stringify(parameters)} with a localized error code`, () => {
    assert.throws(() => parseSlipCriteria(parameters, today), (error) => error instanceof SlipCriteriaError && error.code === code);
  });
}

test('ranks fewer picks before average probability, then exact total odds', () => {
  const result = buildSlips(criteria({ teamsMin: 2, teamsMax: 3, totalMin: 400, totalMax: 600, slips: 2 }), [
    record('a', '2.10', 0.71), record('b', '2.10', 0.71), record('c', '1.70', 0.99), record('d', '1.70', 0.99), record('e', '1.70', 0.99),
  ], asOf);
  assert.deepEqual(result.slips.map(fixtureIds), [['a', 'b'], ['c', 'd', 'e']]);
  assert.equal(result.slips[0].totalOdds, '4.41'); assert.equal(result.slips[1].totalOdds, '4.91');
  assert.equal(result.searchLimited, false);
  const singles = buildSlips(criteria({ teamsMax: 1, slips: 3 }), [record('a', '1.50'), record('b', '3.00'), record('c', '2.00')], asOf);
  assert.deepEqual(singles.slips.map(fixtureIds), [['b'], ['c'], ['a']]);
});

test('averages the selected forecasts, without presenting the accumulator product as probability', () => {
  const result = buildSlips(criteria({ teamsMin: 2, teamsMax: 2, slips: 1 }), [record('a', '1.80', 0.8), record('b', '1.70', 0.9)], asOf);
  assert.equal(result.slips[0].totalOdds, '3.06');
  assert.ok(Math.abs(result.slips[0].averageProbability - 0.85) < 1e-15);
  assert.notEqual(result.slips[0].averageProbability, 0.72);
});

test('exact odds constraints are evaluated before rounding the displayed total', () => {
  const records = [record('a', '1.01'), record('b', '1.99')];
  assert.equal(buildSlips(criteria({ teamsMin: 2, teamsMax: 2, totalMax: 200 }), records, asOf).slips.length, 0);
  assert.equal(buildSlips(criteria({ teamsMin: 2, teamsMax: 2, totalMin: 201 }), records, asOf).slips.length, 0);
  const boundary = buildSlips(criteria({ teamsMin: 2, teamsMax: 2, totalMin: 300, totalMax: 300 }), [record('a', '1.50'), record('b', '2.00')], asOf);
  assert.equal(boundary.slips[0].totalOdds, '3.00');
});

test('individual odds and unrounded probability bounds are inclusive', () => {
  const result = buildSlips(criteria({ teamsMax: 1, oddsMin: 150, oddsMax: 200, probMin: 70, probMax: 80 }), [
    record('minimum', '1.50', 0.7), record('maximum', '2.00', 0.8), record('too-high', '2.01', 0.8),
    record('too-low', '1.49', 0.7), record('prob-low', '1.80', 0.699999), record('prob-high', '1.80', 0.800001),
  ], asOf);
  assert.deepEqual(result.slips.map(fixtureIds), [['maximum'], ['minimum']]); assert.equal(result.qualifyingMatches, 2);
});

test('examines each selected market but never puts two picks from one fixture in a slip', () => {
  const a = record('a'), b = record('b');
  for (const fixture of [a, b]) fixture.prices.push({ family: 'double-chance', selection: fixture.forecast.markets[1].market.selection,
    price: '1.50', basis: 'bookmaker', retrievedAt: asOf - 1, providerUpdatedAt: null });
  const result = buildSlips(criteria({ markets: ['match-result', 'double-chance'], teamsMin: 2, teamsMax: 2 }), [a, b], asOf);
  assert.equal(result.slips.length, 4); assert.equal(new Set(result.slips.map((slip) => slip.id)).size, 4);
  for (const slip of result.slips) assert.deepEqual(fixtureIds(slip), ['a', 'b']);
  // The best forecast is unpriced; its absence must not hide a priced qualifying second family.
  const ownPrice = buildSlips(criteria({ markets: ['double-chance'], teamsMax: 1 }), [record('own-price')], asOf);
  assert.equal(ownPrice.slips.length, 0); assert.equal(ownPrice.excludedMissingOdds, 1);
});

test('Automatic can use an outcome below the top forecast when only its own odds qualify', () => {
  const fixture = record('automatic', '3.00', 0.6);
  fixture.selectionPrices = [...fixture.prices, { ...fixture.prices[0], selection: 'away-win', price: '1.70' }];
  const result = buildSlips(criteria({ oddsMin: 150, oddsMax: 200, probMin: 10, probMax: 100, teamsMax: 1 }), [fixture], asOf);
  assert.equal(result.slips.length, 1); assert.equal(result.slips[0].selections[0].selection, 'away-win');
  assert.equal(result.slips[0].selections[0].probability, 0.2); assert.equal(result.slips[0].totalOdds, '1.70');
  assert.equal(fixture.forecast.markets[0].market.selection, 'home-win');
});

test('manual Home win uses its own probability and price when Away win is the published top pick', () => {
  const base = record('base');
  const snapshot = validateMarketSnapshot({ 'match-result': { source: 'ai', period: marketRules.period,
    probabilities: { 'home-win': 0.3, draw: 0.2, 'away-win': 0.5 } } });
  const markets = Object.values(snapshot.markets).filter((entry) => entry.available).map(({ market }) => ({ market, reasons: [], uncertainty: null }));
  const fixture = record('manual', '3.00', 0.8, { forecast: { ...base.forecast, markets },
    prices: [{ ...base.prices[0], selection: 'away-win', price: '3.00' }] });
  fixture.selectionPrices = [...fixture.prices, { ...fixture.prices[0], selection: 'home-win', price: '1.80' }];
  const result = buildSlips(criteria({ outcomes: { 'match-result': ['home-win'] }, probMin: 25, probMax: 35, teamsMax: 1 }), [fixture], asOf);
  assert.equal(result.slips.length, 1); assert.equal(result.slips[0].selections[0].selection, 'home-win');
  assert.equal(result.slips[0].averageProbability, 0.3); assert.equal(result.slips[0].totalOdds, '1.80');
});

test('multiple explicit outcomes are distinct combinations with at most one pick from each fixture', () => {
  const records = [record('a', '2.00', 0.6), record('b', '2.00', 0.6)];
  for (const fixture of records) fixture.selectionPrices = [...fixture.prices,
    { ...fixture.prices[0], selection: 'draw', price: '2.50' }, { ...fixture.prices[0], selection: 'away-win', price: '3.00' }];
  const result = buildSlips(criteria({ outcomes: { 'match-result': ['home-win', 'away-win'] }, teamsMin: 2, teamsMax: 2 }), records, asOf);
  assert.equal(result.slips.length, 4); assert.equal(new Set(result.slips.map((slip) => slip.id)).size, 4);
  for (const slip of result.slips) {
    assert.deepEqual(fixtureIds(slip), ['a', 'b']);
    assert.equal(slip.selections.some((item) => item.selection === 'draw'), false);
  }
});

test('manual outcome prices cannot fall back to another selection or a legacy price hidden by the slip projection', () => {
  const fixture = record('unpriced');
  const missingManual = buildSlips(criteria({ outcomes: { 'match-result': ['away-win'] }, teamsMax: 1 }), [fixture], asOf);
  assert.equal(missingManual.slips.length, 0); assert.equal(missingManual.excludedMissingOdds, 1);
  fixture.selectionPrices = [];
  const emptyApproved = buildSlips(criteria({ teamsMax: 1 }), [fixture], asOf);
  assert.equal(emptyApproved.slips.length, 0); assert.equal(emptyApproved.excludedMissingOdds, 1);
});

test('no-reuse finds a full compatible batch when the individually best slip would block it', () => {
  const records = [record('a', '4.00', 0.99), record('b', '1.50', 0.98), record('c', '1.60', 0.7), record('d', '4.40', 0.7)];
  const bounds = criteria({ teamsMin: 2, teamsMax: 2, totalMin: 600, totalMax: 700, slips: 2 });
  const reusable = buildSlips(bounds, records, asOf);
  assert.deepEqual(fixtureIds(reusable.slips[0]), ['a', 'b']);
  const separate = buildSlips({ ...bounds, reuse: false }, records, asOf);
  assert.deepEqual(separate.slips.map(fixtureIds), [['a', 'c'], ['b', 'd']]); assert.equal(separate.searchLimited, false);
  const all = separate.slips.flatMap((slip) => fixtureIds(slip)); assert.equal(new Set(all).size, all.length);
});

test('missing forecasts, provisional/delayed/closed records and nonfuture fixtures never build slips', () => {
  const base = record('base');
  const records = [
    record('none', '2.00', 0.8, { forecast: null, prices: [], unavailableMarkets: ['match-result', 'double-chance', 'total-goals', 'both-teams-to-score']
      .map((family) => ({ family, reason: 'not-published' })) }),
    record('delayed', '2.00', 0.8, { update: { ...base.update, prediction: 'delayed' } }),
    record('provisional', '2.00', 0.8, { forecast: { ...base.forecast, provisional: true } }),
    record('forecast-delayed', '2.00', 0.8, { forecast: { ...base.forecast, updateDelayed: true } }),
    record('future-publication', '2.00', 0.8, { forecast: { ...base.forecast, publishedAt: asOf + 1 } }),
    record('closed', '2.00', 0.8, { cycle: { ...base.cycle, state: 'closed', mode: 'locked', lockedAt: asOf } }),
    record('past', '2.00', 0.8, { kickoffAt: asOf - 1 }),
    record('cutoff', '2.00', 0.8, { kickoffAt: asOf + 300_000 }),
    record('live', '2.00', 0.8, { status: 'live' }),
    record('postponed', '2.00', 0.8, { status: 'postponed' }),
  ];
  const result = buildSlips(criteria(), records, asOf);
  assert.equal(result.slips.length, 0); assert.equal(result.excludedMissingForecast, 6);
});

test('missing, future-observed, invalid or median prices are excluded without fabricating odds', () => {
  const base = record('base'), price = base.prices[0];
  const badPrice = record('invalid'); badPrice.prices[0].price = '1.00';
  const result = buildSlips(criteria(), [record('missing', '2.00', 0.8, { prices: [] }),
    record('median', '2.00', 0.8, { prices: [{ ...price, basis: 'median' }] }),
    record('retrieval-future', '2.00', 0.8, { prices: [{ ...price, retrievedAt: asOf + 1 }] }),
    record('provider-future', '2.00', 0.8, { prices: [{ ...price, providerUpdatedAt: asOf + 1 }] }), badPrice], asOf);
  assert.equal(result.slips.length, 0); assert.equal(result.excludedMissingOdds, 5);
});

test('a partially unpriced or unpublished market does not count an otherwise qualifying fixture as excluded', () => {
  const result = buildSlips(criteria({ markets: ['match-result', 'double-chance', 'total-goals'], teamsMax: 1 }), [record('priced')], asOf);
  assert.equal(result.slips.length, 1); assert.equal(result.qualifyingMatches, 1);
  assert.equal(result.excludedMissingOdds, 0); assert.equal(result.excludedMissingForecast, 0);
});

test('kickoff dates are inclusive EAT days and the time range includes the final selected minute daily', () => {
  const result = buildSlips(criteria({ dateFrom: today, dateTo: '2026-10-14', timeFrom: '18:00', timeTo: '18:30', teamsMax: 1 }), [
    record('start', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-13T15:00:00Z') }),
    record('end', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-14T15:30:59.999Z') }),
    record('before', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-13T14:59:59.999Z') }),
    record('after', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-14T15:31:00Z') }),
    record('day-after', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-15T15:00:00Z') }),
  ], asOf);
  assert.deepEqual(result.slips.map(fixtureIds), [['end'], ['start']]);
  const midnight = buildSlips(criteria({ dateTo: today, teamsMax: 1 }), [
    record('last-minute', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-13T20:59:59.999Z') }),
    record('next-eat-day', '2.00', 0.8, { kickoffAt: Date.parse('2026-10-13T21:00:00Z') }),
  ], asOf);
  assert.deepEqual(midnight.slips.map(fixtureIds), [['last-minute']]);
});

test('small exhaustive oracle agrees with ranked exact two-pick combinations', () => {
  const records = [record('a', '1.41', 0.7), record('b', '2.07', 0.8), record('c', '1.93', 0.9), record('d', '2.14', 0.8), record('e', '1.52', 0.7)];
  const expected = [];
  for (let a = 0; a < records.length; a++) for (let b = a + 1; b < records.length; b++) {
    const product = BigInt(records[a].prices[0].price.replace('.', '')) * BigInt(records[b].prices[0].price.replace('.', ''));
    if (product < 300n * 100n || product > 420n * 100n) continue;
    expected.push({ ids: [records[a].fixtureId, records[b].fixtureId], product,
      average: (records[a].forecast.markets[0].market.selectedProbability + records[b].forecast.markets[0].market.selectedProbability) / 2 });
  }
  expected.sort((a, b) => b.average - a.average || (a.product > b.product ? -1 : a.product < b.product ? 1 : 0) || a.ids.join().localeCompare(b.ids.join()));
  const result = buildSlips(criteria({ teamsMin: 2, teamsMax: 2, totalMin: 300, totalMax: 420 }), records, asOf);
  assert.deepEqual(result.slips.map(fixtureIds), expected.map((slip) => slip.ids)); assert.equal(result.searchLimited, false);
  assert.deepEqual(buildSlips(criteria({ teamsMin: 2, teamsMax: 2, totalMin: 300, totalMax: 420 }), [...records].reverse(), asOf), result);
});

test('bounded candidate and search budgets disclose limited results and remain deterministic', () => {
  const records = Array.from({ length: slipBuilderRules.maximumCandidates + 1 }, (_, index) => record(`fixture-${String(index).padStart(3, '0')}`));
  const result = buildSlips(criteria({ teamsMax: 1 }), records, asOf);
  assert.equal(result.searchLimited, true); assert.equal(result.qualifyingMatches, records.length); assert.equal(result.slips.length, 10);
  assert.deepEqual(buildSlips(criteria({ teamsMax: 1 }), [...records].reverse(), asOf), result);
  const boundedSearch = buildSlips(criteria({ teamsMin: 4, teamsMax: 4, totalMin: 2000 }), records.slice(0, 60), asOf);
  assert.equal(boundedSearch.searchLimited, true); assert.equal(boundedSearch.slips.length, 0);
  const retained = buildSlips(criteria({ teamsMin: 3, teamsMax: 3 }), records.slice(0, 60), asOf);
  assert.equal(retained.searchLimited, true); assert.equal(retained.slips.length, 10);
});

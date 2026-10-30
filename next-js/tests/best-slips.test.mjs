import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipBuilder, bestSlipCriteria, bestSlipViews, bestSlipsRules, jointSlipProbability } from '../src/domain/best-slips.ts';
import { jointSlipRanking } from '../src/domain/joint-slip-model.ts';
import { createBestSlipsService, gateBestSlips } from '../src/server/slips/best-slips.ts';
import { createBestSlipsHandler } from '../src/server/slips/best-slips-http.ts';
import { marketRules, validateMarketSnapshot } from '../src/domain/markets.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

const free = { tier: 'free', signedIn: false, mode: 'off' }, full = { tier: 'full', signedIn: true, mode: 'off' };
// Synthetic test evidence only: this fixture is never bound to the production service.
const model = { calibrationReference: 'synthetic-test-calibration', correlationReference: 'synthetic-test-joint-outcomes',
  validFrom: now - 1000, validUntil: now + 60_000, estimate: selections => Math.min(...selections.map(s => s.probability)) - (selections.length > 1 ? 0.1 : 0) };
function record(id, probability = 0.7, odds = '2.20') {
  const snapshot = validateMarketSnapshot({ 'match-result': { source: 'ai', period: marketRules.period,
    probabilities: { 'home-win': probability, draw: (1 - probability) / 2, 'away-win': (1 - probability) / 2 } } });
  return liveRecord({ fixtureId: id, status: 'scheduled', kickoffAt: now + 3600_000,
    forecast: { runId: 'synthetic-run', revisionId: `synthetic-${id}`, publishedAt: now - 60_000, provisional: false, updateDelayed: false,
      markets: Object.values(snapshot.markets).filter(entry => entry.available).map(({ market }) => ({ market, reasons: [], uncertainty: null })) },
    prices: [{ family: 'match-result', selection: 'home-win', price: odds, basis: 'bookmaker', retrievedAt: now - 1000, providerUpdatedAt: null }] });
}
const records = Array.from({ length: 20 }, (_, index) => record(`private-fixture-${index}`, 0.65 + index * 0.01));
const generate = (criteria = bestSlipCriteria(today), data = records, joint = model) => bestSlipBuilder(joint)(criteria, data, now);

test('daily target returns every available disjoint slip up to its capacity with actual prices and ordered matches', () => {
  const result = generate();
  assert.equal(result.slips.length, 10);
  assert.equal(new Set(result.slips.map(slip => slip.id)).size, 10);
  const fixtures = result.slips.flatMap(slip => slip.selections.map(selection => selection.fixtureId));
  assert.equal(new Set(fixtures).size, fixtures.length, 'daily slips do not reuse fixtures');
  for (const [index, slip] of result.slips.entries()) {
    assert.equal(slip.totalOdds, '4.84');
    assert.equal(new Set(slip.selections.map(selection => selection.fixtureId)).size, slip.selections.length);
    assert.ok(slip.selections.every((selection, i) => !i || slip.selections[i - 1].probability >= selection.probability));
    assert.ok(!index || result.slips[index - 1].estimatedProbability >= slip.estimatedProbability);
    assert.notEqual(slip.estimatedProbability, slip.averageProbability);
  }
  assert.deepEqual(generate().slips, result.slips);
  const criteria = bestSlipCriteria(today, { minimumTotal: 480, maximumTotal: 490, count: 10 });
  assert.equal(criteria.dateTo, today); assert.equal(criteria.totalMin, 480); assert.equal(criteria.reuse, false);
  assert.equal(criteria.probMin, 0, 'daily publication keeps its probability policy independent of builder defaults');
  assert.equal(bestSlipCriteria(today).slips, 100); assert.equal(bestSlipsRules.count, 100);
});

test('daily capacity supports one hundred single-match and two-match slips without reusing fixtures', () => {
  for (const [count, odds, matchCount] of [[100, '5.00', 1], [200, '2.20', 2]]) {
    const cohort = Array.from({ length: count }, (_, index) => record(`large-${String(index).padStart(3, '0')}`, 0.65 + index / 2000, odds));
    const result = generate(bestSlipCriteria(today), cohort);
    assert.equal(result.slips.length, 100);
    const fixtures = result.slips.flatMap(slip => slip.selections.map(selection => selection.fixtureId));
    assert.equal(new Set(fixtures).size, count);
    assert.ok(result.slips.every((slip, index) => slip.selections.length === matchCount
      && (!index || result.slips[index - 1].estimatedProbability >= slip.estimatedProbability)));
    assert.deepEqual(generate(bestSlipCriteria(today), [...cohort].reverse()), result);
  }
});

test('impossible shorter totals cannot starve one hundred qualifying three-match slips', () => {
  const cohort = Array.from({ length: 500 }, (_, index) => record(`triple-${String(index).padStart(3, '0')}`, 0.9, '1.70'));
  const result = generate(bestSlipCriteria(today), cohort);
  assert.equal(result.slips.length, 100);
  assert.ok(result.slips.every(slip => slip.selections.length === 3 && slip.totalOdds === '4.91'));
  const fixtures = result.slips.flatMap(slip => slip.selections.map(selection => selection.fixtureId));
  assert.equal(new Set(fixtures).size, 300);
  assert.deepEqual(generate(bestSlipCriteria(today), [...cohort].reverse()), result);
});

test('reachability pruning skips five impossible lengths before qualifying six-match slips', () => {
  const cohort = Array.from({ length: 12 }, (_, index) => record(`six-${String(index).padStart(3, '0')}`, 0.92, '1.30'));
  const criteria = { ...bestSlipCriteria(today), slips: 2 };
  const result = generate(criteria, cohort);
  assert.equal(result.slips.length, 2);
  assert.ok(result.slips.every(slip => slip.selections.length === 6 && slip.totalOdds === '4.83'));
  const fixtures = result.slips.flatMap(slip => slip.selections.map(selection => selection.fixtureId));
  assert.equal(new Set(fixtures).size, 12);
});

test('diversification returns fewer daily slips when the qualifying cohort cannot fill the request', () => {
  const data = records.slice(0, 6), criteria = bestSlipCriteria(today);
  const diversified = generate(criteria, data), overlapping = generate({ ...criteria, reuse: true }, data);
  assert.equal(diversified.slips.length, 3);
  assert.equal(overlapping.slips.length, 15);
  assert.ok(!diversified.searchLimited);
});

test('joint probability takes priority over a shorter slip; tied estimates prefer fewer matches then higher odds', () => {
  const data = [record('single', 0.60, '5.00'), record('pair-a', 0.75), record('pair-b', 0.75), record('higher-odds', 0.60, '5.20')];
  const result = generate(bestSlipCriteria(today), data);
  assert.equal(result.slips[0].selections.length, 2); assert.equal(result.slips[0].estimatedProbability, 0.65);
  assert.deepEqual(result.slips.slice(1).map(slip => slip.totalOdds), ['5.20', '5.00']);
  const tied = generate(bestSlipCriteria(today), data, { ...model, estimate: () => 0.60 });
  assert.deepEqual(tied.slips.map(slip => slip.selections.length), [1, 1, 2]);
});

test('Best Slips order is the shared joint ranking used by custom builds', () => {
  const criteria = bestSlipCriteria(today), data = [record('single', 0.60, '5.00'), record('pair-a', 0.75), record('pair-b', 0.75), record('higher-odds', 0.60, '5.20')];
  for (const [slips, joint] of [[generate().slips, model], [generate(criteria, data).slips, model],
    [generate(criteria, data, { ...model, estimate: () => 0.60 }).slips, { ...model, estimate: () => 0.60 }]]) {
    assert.deepEqual([...slips].sort(jointSlipRanking(joint).ranking.compare), slips);
  }
});

test('absent, expired and impossible joint estimates never get replaced with arithmetic means or fabricated probabilities', () => {
  assert.equal(generate(bestSlipCriteria(today), records, { ...model, estimate: () => 0.99 }).slips.length, 0);
  assert.equal(generate(bestSlipCriteria(today), records, { ...model, estimate: () => null }).slips.length, 0);
  assert.throws(() => generate(bestSlipCriteria(today), records, { ...model, validUntil: now }), /current calibrated/);
  const slip = generate().slips[0];
  for (const value of [NaN, Infinity, -0.1, 1.1, 0]) assert.equal(jointSlipProbability({ ...model, estimate: () => value }, slip), null);
});

test('joint marginal bounds allow decimal rounding noise while rejecting material violations', () => {
  const slip = generate().slips[0];
  const boundary = { ...slip, selections: slip.selections.map((selection, index) => ({ ...selection, probability: index ? 0.8 : 0.9 })) };
  const lower = jointSlipProbability({ ...model, estimate: () => 0.7 }, boundary);
  assert.ok(lower !== null && Math.abs(lower - 0.7) <= Number.EPSILON);
  assert.equal(jointSlipProbability({ ...model, estimate: () => 0.7 - 1e-10 }, boundary), null);
  assert.equal(jointSlipProbability({ ...model, estimate: () => 0.8 + 1e-10 }, boundary), null);
});

test('public projection shares the original arithmetic mean separately from ranking probability without match data', () => {
  const slips = generate().slips, publicView = bestSlipViews(slips, false);
  assert.deepEqual(Object.keys(publicView[0]), ['rank', 'matchCount', 'totalOdds', 'estimatedProbability', 'averageProbability']);
  assert.equal(publicView[0].totalOdds, slips[0].totalOdds);
  assert.equal(publicView[0].estimatedProbability, slips[0].estimatedProbability);
  for (const [index, summary] of publicView.entries()) {
    const slip = slips[index], mean = slip.selections.reduce((sum, selection) => sum + selection.probability, 0) / slip.selections.length;
    assert.equal(summary.averageProbability, slip.averageProbability);
    assert.ok(Math.abs(summary.averageProbability - mean) <= Number.EPSILON * slip.selections.length);
    assert.notEqual(summary.averageProbability, summary.estimatedProbability);
  }
  assert.doesNotMatch(JSON.stringify(publicView), /private-fixture|home-win|selections|kickoffAt|homeTeam|awayTeam|forecast|oddsBasis/);
  assert.equal(bestSlipViews(slips, true)[0].slip, slips[0]);
  const gated = gateBestSlips({ day: today, state: 'generated', slips: bestSlipViews(slips, true), searchLimited: false, partialCoverage: false }, free);
  assert.deepEqual(gated.slips, publicView);
});

test('every non-entitled tier retains public aggregates while the gate strips unapproved view fields', () => {
  const slips = generate().slips, views = bestSlipViews(slips, true), expected = bestSlipViews(slips, false);
  const input = { day: today, state: 'generated', searchLimited: false, partialCoverage: false,
    slips: views.map(view => ({ ...view, fixtureId: 'private-fixture', prediction: 'home-win', internalId: view.slip.id })) };
  for (const access of [free, { ...free, signedIn: true }, { ...free, mode: 'free' }]) {
    assert.deepEqual(gateBestSlips(input, access).slips, expected);
  }
  assert.deepEqual(gateBestSlips(input, full).slips, views, 'entitled users retain the complete original slips');
});

test('stored or caller-supplied slips are projected in descending probability before ranks and paywall gating', () => {
  const slips = generate().slips, reversed = [...slips].reverse();
  assert.deepEqual(bestSlipViews(reversed, true), bestSlipViews(slips, true));
  assert.deepEqual(bestSlipViews(reversed, false), bestSlipViews(slips, false));
  assert.deepEqual(reversed, [...slips].reverse(), 'projection never mutates stored snapshots');
});

function service(overrides = {}) {
  return createBestSlipsService({ providerOdds: true, model, now: () => now,
    read: async (criteria, clock, locale, build) => ({ state: 'generated', data: build(criteria, records, clock.now()), asOf: now,
      examined: records.length, searchLimited: false, partialCoverage: false, retryAfterSeconds: null }), ...overrides });
}
test('off mode shares daily aggregate odds and probabilities while keeping active matches entitled', async () => {
  const read = service(), publicResult = await read(free), signedInResult = await read({ ...free, signedIn: true }), paidResult = await read(full);
  assert.equal(publicResult.slips.length, 10); assert.ok(!publicResult.slips[0].slip);
  assert.equal(paidResult.slips[0].slip.selections.length, 2);
  assert.equal(publicResult.day, today);
  assert.deepEqual(publicResult.statistics, { total: 10, won: 0, lost: 0, pending: 10, void: 0 });
  assert.deepEqual(publicResult.statistics, paidResult.statistics);
  assert.deepEqual(publicResult, signedInResult);
  assert.deepEqual(publicResult.slips, paidResult.slips.map(({ slip, ...summary }) => { assert.ok(slip); return summary; }));
});

test('missing approved odds or joint model performs no cohort read and returns an honest empty state', async () => {
  let reads = 0;
  const read = async () => { reads++; throw new Error('must not read'); };
  assert.equal((await service({ providerOdds: false, read })(free)).state, 'odds-unavailable');
  assert.equal((await service({ model: null, read })(free)).state, 'model-unavailable');
  assert.equal(reads, 0);
});

test('daily/model rollover during generation withholds the old set; insufficient fixtures stay partial', async () => {
  let calls = 0;
  const rollover = await service({ now: () => calls++ ? now + 86_400_000 : now })(full);
  assert.equal(rollover.state, 'data-unavailable'); assert.deepEqual(rollover.slips, []);
  const insufficient = generate(bestSlipCriteria(today), records.slice(0, 2));
  assert.equal(insufficient.slips.length, 1);
});

test('API rechecks access after generation, strips expired selections, and disables shared/browser caching', async () => {
  let checks = 0;
  const handler = createBestSlipsHandler({ read: service(), access: async () => checks++ === 0 ? full : free });
  const response = await handler(new Request('https://goalhint.com/api/best-slips'));
  assert.equal(response.status, 200); assert.equal(checks, 3);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('set-cookie'), null);
  const payload = await response.json();
  assert.deepEqual(Object.keys(payload.slips[0]), ['rank', 'matchCount', 'totalOdds', 'estimatedProbability', 'averageProbability']);
  assert.equal(payload.slips[0].totalOdds, '4.84');
  assert.equal(payload.slips[0].estimatedProbability, generate().slips[0].estimatedProbability);
  assert.equal(payload.slips[0].averageProbability, generate().slips[0].averageProbability);
  assert.notEqual(payload.slips[0].averageProbability, payload.slips[0].estimatedProbability);
  assert.doesNotMatch(JSON.stringify(payload), /private-fixture|home-win|selections|kickoffAt|homeTeam|awayTeam|forecast|oddsBasis/);
});

test('anonymous API visitors receive the same ranked original aggregates without match data', async () => {
  const read = service(), expected = await read(free);
  const handler = createBestSlipsHandler({ read, access: async () => free });
  const response = await handler(new Request('https://goalhint.com/api/best-slips'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), expected);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('filtered API reads receive normalized dates/results and recheck access before returning private selections', async () => {
  let checks = 0, received;
  const handler = createBestSlipsHandler({ now: () => now, access: async () => checks++ ? free : full,
    read: async () => { throw new Error('must use the filtered reader'); },
    browse: async (viewer, query) => {
      assert.equal(viewer.tier, 'full'); received = query;
      const result = await service()(full);
      return { ...result, slips: result.slips.map((view, index) => ({ ...view, id: `publication-${index}`,
        publicationDay: today, outcome: 'won' })),
        browse: { query, total: result.slips.length, pageSize: 20, hasMore: false, nextCursor: null, from: today, to: today } };
    } });
  const response = await handler(new Request('https://goalhint.com/api/best-slips?period=today&status=won&page=1'));
  assert.equal(response.status, 200); assert.equal(checks, 2);
  assert.deepEqual(received, { period: 'today', status: 'won', page: 1 });
  const data = await response.json();
  assert.equal(data.browse.query.status, 'won'); assert.equal(data.slips[0].outcome, 'won');
  assert.equal(data.slips[0].publicationDay, today);
  assert.equal(data.slips[0].slip, undefined); assert.equal(data.slips[0].matchStates, undefined);
  assert.doesNotMatch(JSON.stringify(data), /private-fixture|home-win|selections|kickoffAt|homeTeam|awayTeam|forecast|oddsBasis/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('filtered API rejects malformed or reversed criteria before accessing private data', async () => {
  let reads = 0;
  const handler = createBestSlipsHandler({ now: () => now, access: async () => { reads++; return full; },
    browse: async () => { reads++; throw new Error('must not read'); } });
  for (const search of ['period=unknown', 'status=void', 'period=custom&from=2026-02-30&to=2026-03-01',
    'period=custom&from=2026-10-29&to=2026-10-28', 'period=today&period=yesterday', 'page=0', 'period=all&cursor=broken']) {
    const response = await handler(new Request(`https://goalhint.com/api/best-slips?${search}`));
    assert.equal(response.status, 400, search);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal(reads, 0);
});

test('filtered API failures return private unavailable responses without internal diagnostics', async () => {
  const handler = createBestSlipsHandler({ now: () => now, access: async () => full,
    browse: async () => { throw new Error('private database diagnostics'); } });
  const response = await handler(new Request('https://goalhint.com/api/best-slips?period=yesterday'));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'unavailable' });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('a failed publication read retains an unavailable HTTP status even when the service returns a safe empty DTO', async () => {
  const handler = createBestSlipsHandler({ now: () => now, access: async () => free,
    browse: async () => ({ day: today, state: 'data-unavailable', slips: [], searchLimited: false, partialCoverage: false }) });
  const response = await handler(new Request('https://goalhint.com/api/best-slips?period=last7'));
  assert.equal(response.status, 503); assert.equal((await response.json()).state, 'data-unavailable');
});

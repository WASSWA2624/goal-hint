import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipBuilder, bestSlipCriteria, bestSlipViews, jointSlipProbability } from '../src/domain/best-slips.ts';
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

test('daily target generates ten distinct ranked slips with actual prices and ordered matches', () => {
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
});

test('diversification returns fewer daily slips when the qualifying cohort cannot fill the request', () => {
  const data = records.slice(0, 6), criteria = bestSlipCriteria(today);
  const diversified = generate(criteria, data), overlapping = generate({ ...criteria, reuse: true }, data);
  assert.equal(diversified.slips.length, 3);
  assert.equal(overlapping.slips.length, 10);
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

test('public projection reveals premium slip availability without active prices, probabilities or identifiers', () => {
  const slips = generate().slips, publicView = bestSlipViews(slips, false);
  assert.deepEqual(Object.keys(publicView[0]), ['rank', 'matchCount']);
  assert.doesNotMatch(JSON.stringify(publicView), /private-fixture|home-win|selections|kickoffAt|Probability|totalOdds/);
  assert.equal(bestSlipViews(slips, true)[0].slip, slips[0]);
  const gated = gateBestSlips({ day: today, state: 'generated', slips: bestSlipViews(slips, true), searchLimited: false, partialCoverage: false }, free);
  assert.deepEqual(gated.slips, publicView);
});

function service(overrides = {}) {
  return createBestSlipsService({ providerOdds: true, model, now: () => now,
    read: async (criteria, clock, locale, build) => ({ state: 'generated', data: build(criteria, records, clock.now()), asOf: now,
      examined: records.length, searchLimited: false, partialCoverage: false, retryAfterSeconds: null }), ...overrides });
}
test('off mode gates active predictions while preserving premium availability and existing subscribed periods', async () => {
  const read = service(), publicResult = await read(free), paidResult = await read(full);
  assert.equal(publicResult.slips.length, 10); assert.ok(!publicResult.slips[0].slip);
  assert.equal(paidResult.slips[0].slip.selections.length, 2);
  assert.equal(publicResult.day, today);
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
  assert.equal(response.status, 200); assert.equal(checks, 2);
  assert.equal(response.headers.get('cache-control'), 'private, no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.doesNotMatch(await response.text(), /private-fixture|home-win|selections|kickoffAt|totalOdds|Probability/);
});

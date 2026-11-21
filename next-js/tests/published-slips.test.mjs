import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipOddsBands } from '../src/domain/best-slip-odds-bands.ts';
import { bestSlipPublicationHour } from '../src/domain/best-slip-publication-hour.ts';
import { bestSlipViews } from '../src/domain/best-slips.ts';
import { gateBestSlips } from '../src/server/slips/best-slips.ts';
import { createPublishedSlips, parsePublishedSlipHistoryQuery, slipPublicationIdentity } from '../src/server/slips/published-slips.ts';
import { createDailySlipPublisher, runDailySlipPublisher } from '../src/server/slips/daily-slip-publication.ts';
import { now, today } from './helpers/live-refresh-fixtures.mjs';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { pricedEditorialSelection } from './helpers/best-slip-publication-fixtures.mjs';
import { parseDecimalOdds } from '../src/domain/odds.ts';

const model = { calibrationReference: 'synthetic-calibration', correlationReference: 'synthetic-correlation',
  validFrom: now - 1000, validUntil: now + 86_400_000, estimate: () => 0.75 };
const fixtureId = (last) => `10000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
function slip(last = 1) {
  return { id: `original-${last}`, totalOdds: '4.00', oddsBasis: 'bookmaker', averageProbability: 0.75, estimatedProbability: 0.75,
    selections: [pricedEditorialSelection(last, { cycleId: fixtureId(90), revisionId: fixtureId(91), at: now + 900 })] };
}
const priceSelection = (selection, odds) => ({ ...selection, odds, offer: { ...selection.offer, decimal: parseDecimalOdds(odds).text } });
function fixture() {
  const parents = [], batches = [], rows = [], legs = [], combinations = [], bound = [], outcomes = new Map(), fixtureCompletion = new Map(), fixtureStatuses = new Map();
  let at = now, corrupted = false, ignored = false, normalized = false, afterMembership = () => {};
  const databaseSnapshot = json => {
    const snapshot = JSON.parse(json);
    if (normalized) snapshot.estimatedProbability -= Number.EPSILON;
    return snapshot;
  };
  const statement = (query, values) => Array.isArray(query) ? { text: query.join('?'), values } : { text: query.sql, values: query.values };
  const tx = {
    dailySlipPublication: { async findUnique({ where }) { return parents.find(row => +row.eatDate === +where.eatDate) ?? null; } },
    publishedSlipLeg: { async createMany({ data }) { legs.push(...data); afterMembership(); }, async findMany() { return legs; } },
    async $queryRaw(query, ...values) {
      const sql = statement(query, values);
      if (sql.text.includes('UTC_TIMESTAMP')) return [{ at: new Date(at) }];
      if (sql.text.includes('SELECT JSON_EXTRACT')) return [{ snapshot: databaseSnapshot(sql.values[0]) }];
      if (sql.text.includes('FROM FootballFixture')) return [{ id: sql.values[0] }];
      if (sql.text.includes('FROM DailyBestSlipAppendBatch')) {
        if (sql.text.includes('LOCK IN SHARE MODE')) return batches.filter(row => row.publicationId === sql.values[0] &&
          (+row.hourAt === +sql.values[1] || row.firstRank === sql.values[2]));
        return batches.filter(row => sql.values.includes(row.publicationId)).map(row => ({ ...row, validIntegrity: corrupted ? 0 : 1 }));
      }
      if (sql.text.includes('FROM DailyBestSlipCombination')) return combinations.filter(([date, key]) =>
        +date === +sql.values[0] && key === sql.values[1]).map(([, , slipId]) => ({ slipId }));
      if (sql.text.includes('JOIN PublishedSlip s')) return rows.filter(row =>
        parents.some(parent => parent.id === row.publicationId && +parent.eatDate === +sql.values[0]))
        .map(row => ({ ...row, validIntegrity: corrupted ? 0 : 1 }));
      if (sql.text.includes('FROM DailySlipPublication')) return parents.filter(row => !sql.text.includes('oddsBand') || !sql.values.some(value => bestSlipOddsBands.some(band => band.id === value)) || sql.values.includes(row.oddsBand)).map(row => ({ ...row, validIntegrity: corrupted ? 0 : 1 }));
      if (sql.text.includes('FROM PublishedSlip')) return rows.filter(row => sql.values.includes(row.publicationId)).map(row => ({ ...row, validIntegrity: corrupted ? 0 : 1 }));
      assert.fail(sql.text);
    },
    async $executeRaw(query, ...values) {
      const sql = statement(query, values), v = sql.values;
      if (sql.text.includes('INSERT IGNORE INTO DailySlipPublication')) {
        if (ignored) return 0;
        if (parents.some(row => +row.eatDate === +v[1] && row.oddsBand === v[2])) return 0;
        const modelLess = sql.text.includes(',NULL,');
        parents.push({ id: v[0], eatDate: v[1], oddsBand: v[2], publishedAt: v[3],
          modelId: modelLess ? null : v[4], bodyJson: JSON.parse(v[modelLess ? 4 : 5]) }); return 1;
      }
      if (sql.text.includes('INSERT IGNORE INTO DailyBestSlipAppendBatch')) {
        if (batches.some(row => row.publicationId === v[1] && (+row.hourAt === +v[2] || row.firstRank === v[4]))) return 0;
        batches.push({ id: v[0], publicationId: v[1], hourAt: v[2], publishedAt: v[3], firstRank: v[4],
          count: v[5], bodyJson: JSON.parse(v[6]) }); return 1;
      }
      if (sql.text.includes('INSERT INTO PublishedSlip')) {
        const appended = sql.text.includes('appendBatchId');
        rows.push({ id: v[0], publicationId: v[1], ...(appended ? { appendBatchId: v[2] } : {}),
          rank: v[appended ? 3 : 2], snapshotJson: databaseSnapshot(v[appended ? 4 : 3]) }); return 1;
      }
      if (sql.text.includes('INSERT IGNORE INTO DailyBestSlipCombination')) {
        if (combinations.some(([date, key]) => +date === +v[0] && key === v[1])) return 0;
        combinations.push(v); return 1;
      }
      if (sql.text.includes('INSERT INTO DailyBestSlipCombination')) {
        if (combinations.some(([date, key]) => +date === +v[0] && key === v[1])) throw new Error('duplicate combination');
        combinations.push(v); return 1;
      }
      assert.fail(sql.text);
    },
  };
  const store = createPublishedSlips({ async transaction(run) {
    const tables = [parents, rows, legs, combinations, batches], before = tables.map(table => table.length);
    try { return await run(tx); } catch (error) {
      tables.forEach((table, index) => { table.length = before[index]; }); throw error;
    }
  } }, {
    async verifyOffers() { return true; },
    async bindForecasts(_tx, value) {
      bound.push(value.id);
      return { ...value, selections: value.selections.map(item => ({ ...item,
        forecast: { cycleId: fixtureId(90), revisionId: fixtureId(91), publishedAt: now - 100 } })) };
    },
    async resolveResults(_tx, selections) {
      return selections.map(item => ({ fixtureId: item.fixtureId, family: item.family, selection: item.selection, forecast: item.forecast,
        completed: outcomes.has(item.fixtureId), fixtureCompleted: fixtureCompletion.get(item.fixtureId) ?? outcomes.has(item.fixtureId),
        status: fixtureStatuses.get(item.fixtureId) ?? (outcomes.get(item.fixtureId) === 'void' ? 'canceled' : 'finished-regulation'),
        regulationVerified: true, regulationHome: outcomes.get(item.fixtureId) === 'lost' ? 0 : 2, regulationAway: 1 }));
    },
  });
  const publish = (changes = {}) => store.publish({ day: today, slips: [slip()], model,
    searchLimited: false, partialCoverage: false, verifyModel: () => true, verifyPublicOdds: () => true, ...changes });
  return { store, publish, parents, batches, rows, legs, bound, outcomes, fixtureCompletion, fixtureStatuses, advance(value) { at = value; }, corrupt() { corrupted = true; },
    ignoreInsert() { ignored = true; }, normalizeNumbers() { normalized = true; }, afterMembership(callback) { afterMembership = callback; } };
}
const query = { from: today, to: today, page: 1, pageSize: 1 };

test('sealed publication identities survive database JSON number normalization', async () => {
  const f = fixture(); f.normalizeNumbers(); await f.publish();
  const day = await f.store.day(today);
  assert.equal(day.slips.length, 1);
  assert.equal(day.slips[0].estimatedProbability, 0.75 - Number.EPSILON);
});

test('daily publication seals verified legs below 75 percent with the original probabilities', async () => {
  const f = fixture(), probability = 0.62, original = slip();
  assert.equal(await f.publish({ model: { ...model, estimate: () => probability }, slips: [{ ...original,
    averageProbability: probability, estimatedProbability: probability, selections: [{ ...original.selections[0], probability }] }] }),
  'published');
  const [view] = (await f.store.day(today)).slips;
  assert.equal(view.estimatedProbability, probability);
  assert.equal(f.rows[0].snapshotJson.slip.selections[0].probability, probability);
  assert.equal(new URLSearchParams(f.parents[0].bodyJson.criteria).get('probMin'), '0');
});

test('six version-three bands publish at most ten each, retain stable public ranks and read old twenty-slip bands', async () => {
  const f = fixture();
  for (const [index, band] of bestSlipOddsBands.entries()) {
    const price = ["4.00", "7.00", "15.00", "30.00", "60.00", "150.00"][index];
    const slips = Array.from({ length: 10 }, (_, n) => { const original = slip(index * 20 + n + 1); return { ...original, totalOdds: price,
      selections: original.selections.map(selection => priceSelection(selection, price)) }; });
    assert.equal(await f.publish({ slips, oddsBand: band.id }), 'published');
    assert.equal(await f.publish({ slips, oddsBand: band.id }), 'already-published');
    await assert.rejects(() => f.publish({ slips: [...slips, slip(21)], oddsBand: band.id }));
  }
  assert.equal(f.rows.length, 60);
  const day = await f.store.day(today);
  assert.equal(day.slips.length, 60); assert.equal(day.slips[59].rank, 110);
  assert.equal((await f.store.day(today, false, '1.5-5')).slips.length, 10);
  const old = f.parents[1]; old.bodyJson.version = 2; old.bodyJson.count = 20;
  for (let rank = 11; rank <= 20; rank++) {
    const seed = slip(20 + rank);
    const snapshot = { slip: { id: seed.id, averageProbability: 0.75, totalOdds: '7.00', oddsBasis: 'bookmaker',
      selections: seed.selections.map((selection) => priceSelection(selection, '7.00')) }, estimatedProbability: 0.75 };
    const id = evidenceFingerprint({ publicationId: old.id, rank, snapshot });
    f.rows.push({ id, rank, publicationId: old.id, snapshotJson: snapshot });
    f.legs.push(...snapshot.slip.selections.map(({ fixtureId, forecast }) => ({ slipId: id, fixtureId, ...forecast })));
  }
  Array.from({length:20}, (_,n) => f.outcomes.set(fixtureId(n+21), 'won'));
  const history = await f.store.history({ ...query, page: 2, pageSize: 10, oddsBand: '5-10' });
  assert.equal(history.total, 20); assert.equal(history.statistics.won, 20); assert.equal(history.records[9].rank, 40);
});

test('publication assigns probability order before sealing snapshot ranks', async () => {
  const f = fixture(), probabilities = [0.75, 0.8, 0.78];
  const slips = probabilities.map((probability, index) => ({ ...slip(index + 1), averageProbability: probability,
    estimatedProbability: probability, selections: slip(index + 1).selections.map(selection => ({ ...selection, probability })) }));
  await f.publish({ slips, model: { ...model, estimate: selections => selections[0].probability } });
  assert.deepEqual(f.rows.map(row => row.snapshotJson.estimatedProbability), [0.8, 0.78, 0.75]);
  assert.deepEqual((await f.store.day(today)).slips.map(view => view.estimatedProbability), [0.8, 0.78, 0.75]);
});

test('exact unrounded band assignment and cross-band duplicate prevention survive write and read', async () => {
  const f = fixture(), original = slip();
  const almost = { ...original, totalOdds: '5.00', selections: original.selections.map((value) => priceSelection(value, '4.9999')) };
  assert.equal(await f.publish({ slips: [almost] }), 'published');
  const current = await f.store.day(today, false, '1.5-5');
  assert.equal(current.slips[0].totalOdds, '5.00');
  assert.equal((await f.store.browse({ period: 'today', status: 'all', oddsBand: '5-10', page: 1 }, today)).browse.total, 0);
  const repriced = { ...original, totalOdds: '7.00', selections: original.selections.map((value) => priceSelection(value, '7.00')) };
  await assert.rejects(f.publish({ slips: [repriced], oddsBand: '5-10' }), /duplicate combination/u);
  assert.equal(f.parents.length, 1); assert.equal(f.rows.length, 1);
});

test('historical 100.00 quotes move to the sixth filter without rewriting snapshots or public ranks', async () => {
    const f = fixture(), original = slip(), currentBand = '100-200', oldBand = '50-100', price = '100.00';
    await f.publish({ oddsBand: currentBand, slips: [{ ...original, totalOdds: price,
      selections: original.selections.map(selection => priceSelection(selection, price)) }] });
    // Reconstruct the original policy's inclusive final 100.00 boundary.
    const parent = f.parents[0], row = f.rows[0], previousId = row.id;
    parent.oddsBand = oldBand; parent.bodyJson.oddsBand = oldBand; parent.bodyJson.version = 2;
    const criteria = new URLSearchParams(parent.bodyJson.criteria);
    criteria.set('totalMin', '50.00'); criteria.set('totalMax', '100.00');
    parent.bodyJson.criteria = criteria.toString();
    parent.id = slipPublicationIdentity(today, oldBand); row.publicationId = parent.id;
    row.id = evidenceFingerprint({ publicationId: parent.id, rank: row.rank, snapshot: row.snapshotJson });
    f.legs.filter(leg => leg.slipId === previousId).forEach(leg => { leg.slipId = row.id; });
    f.outcomes.set(fixtureId(1), 'won');
    const sealed = JSON.stringify([f.parents, f.rows, f.legs]);
    const browse = await f.store.browse({ period: 'today', status: 'all', oddsBand: currentBand, page: 1 }, today);
    assert.equal(browse.browse.total, 1); assert.equal(browse.slips[0].rank, 81);
    assert.equal((await f.store.browse({ period: 'today', status: 'all', oddsBand: oldBand, page: 1 }, today)).browse.total, 0);
    assert.equal((await f.store.history({ ...query, oddsBand: currentBand })).total, 1);
    assert.equal((await f.store.day(today, false, currentBand)).slips.length, 1);
    assert.equal((await f.store.day(today)).slips[0].rank, 81);
    assert.equal(JSON.stringify([f.parents, f.rows, f.legs]), sealed);
});

test('larger custom-slip storage limits do not widen the daily publication match limit', async () => {
  const f = fixture(), source = slip();
  const nine = { ...source, totalOdds: '5.16', selections: Array.from({ length: 9 }, (_, index) => ({
    ...source.selections[0], fixtureId: fixtureId(index + 1), odds: '1.20',
  })) };
  await assert.rejects(() => f.publish({ slips: [nine] }));
  assert.equal(f.parents.length, 0);
});


const modelFreeSlip = (indices, { odds = '4.00', oddsPerLeg = '4.00', at = now, bookmakerId = 8 } = {}) => ({
  id: `hourly-${indices.join('-')}`, totalOdds: odds, oddsBasis: 'bookmaker', averageProbability: 0.75,
  selections: indices.map(index => pricedEditorialSelection(index, { odds: oddsPerLeg, at, bookmakerId, kickoffAt: now + 6 * 3_600_000 })),
});
const hourlyInput = (at, slips, oddsBand = '1.5-5') => ({ ...bestSlipPublicationHour(at), slips, oddsBand,
  searchLimited: false, partialCoverage: false, verifyPublicOdds: () => true });

test('hourly append fills a modern band through distinct frozen batches without changing its initial legacy ranks', async () => {
  const f = fixture(); await f.publish();
  const previous = structuredClone(f.rows[0]), parent = structuredClone(f.parents[0]);
  const later = bestSlipPublicationHour(now).nextAt; f.advance(later + 30_000);
  const one = modelFreeSlip([1, 2], { oddsPerLeg: '2.00', at: later });
  assert.deepEqual(await f.store.append(hourlyInput(later, [one])), { status: 'published', appended: 1 });
  assert.deepEqual(f.rows[0], previous); assert.deepEqual(f.parents[0], parent);
  assert.equal(f.rows[1].rank, 2); assert.equal('estimatedProbability' in f.rows[1].snapshotJson, false);
  const [legacy, added] = (await f.store.day(today, false, '1.5-5')).slips;
  assert.equal(legacy.estimatedProbability, 0.75); assert.equal('estimatedProbability' in added, false);
  assert.equal(added.publishedAt, later + 30_000);
  assert.deepEqual(await f.store.append(hourlyInput(later, [modelFreeSlip([3], { at: later })])), { status: 'already-published', appended: 0 });
  assert.equal((await f.store.hourlyState(today)).counts.get('1.5-5'), 2);

  const next = later + 3_600_000; f.advance(next + 30_000);
  const proposals = Array.from({ length: 10 }, (_, i) => modelFreeSlip([i + 10], { at: next }));
  assert.deepEqual(await f.store.append(hourlyInput(next, proposals)), { status: 'published', appended: 8 });
  assert.deepEqual(f.rows.map(row => row.rank), Array.from({ length: 10 }, (_, i) => i + 1));
  assert.deepEqual(f.rows[0], previous); assert.deepEqual(f.parents[0], parent);
  f.advance(next + 3_600_000 + 30_000);
  assert.deepEqual(await f.store.append(hourlyInput(next + 3_600_000, [modelFreeSlip([31], { at: next + 3_600_000 })])),
    { status: 'full', appended: 0 });
});

test('model-less hourly bands allow distinct slips with overlapping fixtures and reject duplicate combinations across bands', async () => {
  const f = fixture(), slot = bestSlipPublicationHour(now), at = slot.hourAt + 300_000; f.advance(at);
  const first = modelFreeSlip([1, 2], { oddsPerLeg: '2.00', at });
  const overlap = modelFreeSlip([2, 3], { oddsPerLeg: '2.00', at, bookmakerId: 19 });
  assert.deepEqual(await f.store.append(hourlyInput(at, [first, overlap])), { status: 'published', appended: 2 });
  assert.equal(f.parents[0].modelId, null); assert.equal(f.parents[0].bodyJson.count, 0);
  assert.equal(f.batches[0].bodyJson.count, 2);
  assert.equal(f.rows[0].appendBatchId, f.batches[0].id);
  const repriced = modelFreeSlip([2, 1], { odds: '6.25', oddsPerLeg: '2.50', at, bookmakerId: 19 });
  assert.deepEqual(await f.store.append(hourlyInput(at, [repriced], '5-10')), { status: 'no-qualifying', appended: 0 });
  assert.equal(f.parents.length, 1); assert.equal(f.rows.length, 2);
  const state = await f.store.hourlyState(today);
  assert.equal(state.counts.get('1.5-5'), 2);
  assert.equal(state.fixtures.size, 3);
  assert.equal(state.combinations.size, 2);
});

test('crossing a Kampala hour after durable writes rolls back the new batch and anchor', async () => {
  const f = fixture(), { hourAt, nextAt } = bestSlipPublicationHour(now), at = nextAt - 1000; f.advance(at);
  const ready = modelFreeSlip([17], { at });
  f.afterMembership(() => f.advance(nextAt));
  assert.deepEqual(await f.store.append(hourlyInput(hourAt, [ready])), { status: 'stale', appended: 0 });
  assert.deepEqual([f.parents.length, f.batches.length, f.rows.length, f.legs.length], [0, 0, 0, 0]);
});

test('first qualified publication preserves quotes, model evidence and original references; retries never replace it', async () => {
  const f = fixture();
  assert.equal(await f.publish(), 'published');
  const first = structuredClone(f.rows[0]);
  assert.equal(await f.publish({ slips: [slip(2)] }), 'already-published');
  assert.equal(f.rows.length, 1); assert.deepEqual(f.rows[0], first); assert.deepEqual(f.bound, ['original-1']);
  assert.equal(f.parents[0].bodyJson.model.calibrationReference, model.calibrationReference);
  assert.equal(f.legs[0].cycleId, fixtureId(90)); assert.equal(f.legs[0].revisionId, fixtureId(91));
  const day = await f.store.day(today);
  assert.equal(day.slips[0].slip.totalOdds, '4.00');
  assert.ok(f.rows[0].snapshotJson.slip.selections[0].offer.snapshotId);
  assert.equal(day.slips[0].slip.selections[0].offer, undefined);
  const publicViews = bestSlipViews(day.slips.map(view => view.slip), false);
  assert.deepEqual(publicViews, [{ rank: 1, matchCount: 1, totalOdds: '4.00', estimatedProbability: 0.75, averageProbability: 0.75 }]);
  const gated = gateBestSlips(day, { tier: 'free', signedIn: false, mode: 'off' });
  assert.equal(gated.slips.length, 1);
  assert.equal(gated.slips[0].slip, undefined);
  assert.equal(gated.slips[0].preview[0].fixture.fixtureId, fixtureId(1));
  assert.equal(gated.slips[0].preview[0].pick, null);
  assert.doesNotMatch(JSON.stringify(gated), /original-1|home-win|revisionId|selections/);
  assert.doesNotMatch(JSON.stringify(publicViews), /original-1|home-win|selections|cycleId|revisionId|fixtureId/);
});

test('active publications expose counts only; original-cycle completion releases original losses and quotes', async () => {
  const f = fixture(); await f.publish();
  const active = await f.store.history(query);
  assert.deepEqual(active.records, []); assert.equal(active.total, 0); assert.equal(active.statistics.pending, 1);
  assert.equal(active.statistics.meanQuotedOdds, null); assert.equal(active.statistics.returnsSampleCount, 0);
  assert.doesNotMatch(JSON.stringify(active), /home-win|5\.00|estimatedProbability|calibrationReference/);
  f.outcomes.set(fixtureId(1), 'lost');
  const completed = await f.store.history(query);
  assert.equal(completed.total, 1); assert.equal(completed.records[0].outcome, 'lost');
  assert.equal(completed.records[0].slip.totalOdds, '4.00'); assert.equal(completed.records[0].publicationDay, today);
  assert.equal(completed.statistics.profitUnits, -1); assert.equal(completed.statistics.winRate, 0);
  assert.equal('accountId' in completed.records[0], false);
});

test('pagination uses the whole publication-period denominator and retains void history', async () => {
  const f = fixture(); await f.publish({ slips: [slip(1), slip(2), slip(3)] });
  f.outcomes.set(fixtureId(1), 'won'); f.outcomes.set(fixtureId(2), 'lost'); f.outcomes.set(fixtureId(3), 'void');
  const page = await f.store.history({ ...query, page: 2 });
  assert.equal(page.records.length, 1); assert.equal(page.records[0].rank, 2); assert.equal(page.total, 3);
  assert.equal(page.statistics.total, 3); assert.equal(page.statistics.returnsSampleCount, 2);
  assert.equal(page.statistics.roi, 1); assert.equal(page.statistics.cancelled, 1); assert.equal(page.statistics.void, 0);
  assert.equal((await f.store.history({ ...query, page: 3 })).records[0].outcome, 'void');
  assert.equal((await f.store.history({ ...query, page: 4 })).records.length, 0);
});

test('history status filters only visible records and pagination, retaining the full selected-period metrics', async () => {
  const f = fixture(); await f.publish({ slips: [slip(1), slip(2), slip(3), slip(4), slip(5)] });
  f.outcomes.set(fixtureId(1), 'won'); f.outcomes.set(fixtureId(2), 'lost');
  f.outcomes.set(fixtureId(3), 'void'); f.outcomes.set(fixtureId(4), 'void');
  f.fixtureStatuses.set(fixtureId(4), 'abandoned');
  const all = await f.store.history(query);
  assert.equal(all.total, 4); assert.equal(all.statistics.total, 5);
  assert.equal(all.statistics.won, 1); assert.equal(all.statistics.lost, 1);
  assert.equal(all.statistics.void, 1); assert.equal(all.statistics.cancelled, 1); assert.equal(all.statistics.pending, 1);
  for (const status of ['won', 'lost', 'pending', 'void', 'cancelled']) {
    const filtered = await f.store.history({ ...query, status });
    assert.deepEqual(filtered.statistics, all.statistics, status);
    assert.equal(filtered.total, status === 'pending' ? 0 : 1, status);
    assert.equal(filtered.records.length, filtered.total, status);
    if (filtered.records.length) assert.equal(filtered.records[0].status, status);
    assert.equal((await f.store.history({ ...query, status, page: 2 })).records.length, 0);
    const publicAll = await f.store.history(query, true), publicFiltered = await f.store.history({ ...query, status }, true);
    assert.deepEqual(publicFiltered.statistics, publicAll.statistics, `public ${status}`);
  }
  assert.throws(() => parsePublishedSlipHistoryQuery({ ...query, status: 'incorrect' }));
});

test('public performance and daily counts filter canonical unfinished fixtures before pagination', async () => {
  const f = fixture(); await f.publish({ slips: [slip(1), slip(2), slip(3)] });
  f.outcomes.set(fixtureId(1), 'won'); f.outcomes.set(fixtureId(2), 'lost'); f.outcomes.set(fixtureId(3), 'void');
  f.fixtureCompletion.set(fixtureId(2), false);
  const first = await f.store.history(query, true), second = await f.store.history({ ...query, page: 2 }, true);
  assert.equal(first.total, 2); assert.equal(first.statistics.total, 2); assert.equal(first.records[0].rank, 1);
  assert.equal(second.records[0].rank, 3); assert.equal(second.statistics.lost, 0);
  const day = await f.store.day(today, true);
  assert.deepEqual(day.slips.map(view => view.rank), [1, 3]); assert.equal(day.statistics.total, 2);
  assert.ok(day.slips.every(view => view.completed));
  const full = await f.store.history(query);
  assert.equal(full.total, 3); assert.equal(full.statistics.total, 3);
});

test('daily slip performance includes every published slip and updates from original-cycle results', async () => {
  const f = fixture(); await f.publish({ slips: [slip(1), slip(2), slip(3), slip(4)] });
  assert.deepEqual((await f.store.day(today)).statistics, { total: 4, won: 0, lost: 0, pending: 4, void: 0, cancelled: 0 });
  f.outcomes.set(fixtureId(1), 'won'); f.outcomes.set(fixtureId(2), 'lost'); f.outcomes.set(fixtureId(3), 'void');
  const day = await f.store.day(today);
  assert.deepEqual(day.statistics, { total: 4, won: 1, lost: 1, pending: 1, void: 0, cancelled: 1 });
  assert.equal(day.slips.find((view) => view.outcome === 'void').status, 'cancelled');
});

test('a lost leg settles aggregate loss immediately while active selections and quotes stay private', async () => {
  const first = slip(1), second = slip(2);
  const mixed = { ...first, selections: [priceSelection(first.selections[0], '2.00'), priceSelection(second.selections[0], '2.00')] };
  const f = fixture(); await f.publish({ slips: [mixed] });
  f.outcomes.set(fixtureId(1), 'lost');
  assert.deepEqual((await f.store.day(today)).statistics, { total: 1, won: 0, lost: 1, pending: 0, void: 0, cancelled: 0 });
  const history = await f.store.history(query);
  assert.deepEqual(history.records, []); assert.equal(history.statistics.lost, 1); assert.equal(history.statistics.pending, 0);
  assert.equal(history.statistics.returnsSampleCount, 0); assert.equal(history.statistics.meanQuotedOdds, null);
  assert.doesNotMatch(JSON.stringify(history), /home-win|5\.00|estimatedProbability/);
});

test('publication refuses overlaps, invalid probability, revoked authority, late kickoff and unsealed reads', async () => {
  for (const changes of [{ slips: [slip(), slip()] }, { slips: [{ ...slip(), estimatedProbability: 0.9 }] },
    { slips: [{ ...slip(), totalOdds: '4.80' }] }, { slips: [{ ...slip(), averageProbability: 0.8 }] },
    { verifyModel: () => false }, { verifyPublicOdds: () => Promise.resolve(true) },
    { verifyModel: () => Promise.reject(new Error('synthetic asynchronous approval')) }]) {
    const f = fixture(); await assert.rejects(() => f.publish(changes)); assert.equal(f.rows.length, 0);
  }
  const late = fixture(); late.advance(now + 3_600_000); await assert.rejects(() => late.publish()); assert.equal(late.parents.length, 0);
  const f = fixture(); await f.publish(); f.corrupt(); await assert.rejects(() => f.store.day(today));
  await assert.rejects(() => f.store.history(query));
  for (const change of [{ from: '2026-01-01' }, { page: 0 }, { pageSize: 51 }])
    assert.throws(() => parsePublishedSlipHistoryQuery({ ...query, ...change }));
});

test('hourly publisher skips frozen legacy days and checks retained odds rights before reading', async () => {
  let reads = 0, writes = 0;
  const options = { database: {}, competitionIds: [], providerOdds: true, now: () => now,
    verifyPublicOdds: () => true, read: async () => { reads++; throw new Error('must not generate'); },
    store: { async hourlyState() { return { counts: new Map(), fixtures: new Set(), combinations: new Set(),
      publishedHours: new Map(), closed: new Set(bestSlipOddsBands.map(({ id }) => id)) }; },
    async append() { writes++; return { status: 'published', appended: 1 }; } } };
  assert.equal((await createDailySlipPublisher(options).publish()).status, 'already-published');
  assert.equal((await createDailySlipPublisher({ ...options, verifyPublicOdds: () => false }).publish()).status, 'odds-unavailable');
  assert.equal(reads, 0); assert.equal(writes, 0);
  const output = [], controller = new AbortController();
  await runDailySlipPublisher({ async publish() { return { day: today, status: 'no-qualifying' }; } }, controller.signal, value => output.push(value), true);
  assert.deepEqual(output, [{ day: today, status: 'no-qualifying' }]);
  controller.abort(); await runDailySlipPublisher(options.store, controller.signal, () => assert.fail('aborted worker'), true);
});

test('an ignored non-duplicate insert is unavailable and a slow write crossing cutoff rolls back the batch', async () => {
  const ignored = fixture(); ignored.ignoreInsert();
  await assert.rejects(() => ignored.publish(), error => error.reason === 'unavailable');
  assert.equal(ignored.parents.length, 0); assert.equal(ignored.rows.length, 0);
  const late = fixture(); late.afterMembership(() => late.advance(now + 3_600_000));
  await assert.rejects(() => late.publish(), error => error.reason === 'invalid-input');
  assert.equal(late.parents.length, 0); assert.equal(late.rows.length, 0); assert.equal(late.legs.length, 0);
});

test('published forecasts survive model expiry and preserve the historical odds-target criteria', async () => {
  const f = fixture(); await f.publish();
  f.parents[0].bodyJson.criteria = f.parents[0].bodyJson.criteria.replace('totalMin=2.50', 'totalMin=1.60').replace('totalMax=5.00', 'totalMax=4.99');
  f.parents[0].bodyJson.criteria = f.parents[0].bodyJson.criteria.replace('slips=20', 'slips=10');
  f.advance(model.validUntil + 1);
  assert.equal((await f.store.day(today)).slips[0].slip.totalOdds, '4.00');
  assert.match(f.parents[0].bodyJson.criteria, /totalMin=1.60/);
  assert.match(f.parents[0].bodyJson.criteria, /slips=10/);
});

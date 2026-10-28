import assert from 'node:assert/strict';
import test from 'node:test';
import { bestSlipViews } from '../src/domain/best-slips.ts';
import { gateBestSlips } from '../src/server/slips/best-slips.ts';
import { createPublishedSlips, parsePublishedSlipHistoryQuery } from '../src/server/slips/published-slips.ts';
import { createDailySlipPublisher, runDailySlipPublisher } from '../src/server/slips/daily-slip-publication.ts';
import { liveRecord, now, today } from './helpers/live-refresh-fixtures.mjs';

const base = liveRecord(), model = { calibrationReference: 'synthetic-calibration', correlationReference: 'synthetic-correlation',
  validFrom: now - 1000, validUntil: now + 86_400_000, estimate: () => 0.7 };
const fixtureId = (last) => `10000000-0000-4000-8000-${String(last).padStart(12, '0')}`;
function slip(last = 1) {
  return { id: `original-${last}`, totalOdds: '5.00', oddsBasis: 'bookmaker', averageProbability: 0.7, estimatedProbability: 0.7,
    selections: [{ fixtureId: fixtureId(last), kickoffAt: now + 3_600_000, homeTeam: base.homeTeam, awayTeam: base.awayTeam,
      competition: base.competition, family: 'match-result', selection: 'home-win', probability: 0.7, odds: '5.00', oddsBasis: 'bookmaker' }] };
}
function fixture() {
  const parents = [], rows = [], legs = [], bound = [], outcomes = new Map();
  let at = now, corrupted = false, ignored = false, afterMembership = () => {};
  const statement = (query, values) => Array.isArray(query) ? { text: query.join('?'), values } : { text: query.sql, values: query.values };
  const tx = {
    dailySlipPublication: { async findUnique({ where }) { return parents.find(row => +row.eatDate === +where.eatDate) ?? null; } },
    publishedSlipLeg: { async createMany({ data }) { legs.push(...data); afterMembership(); }, async findMany() { return legs; } },
    async $queryRaw(query, ...values) {
      const sql = statement(query, values);
      if (sql.text.includes('UTC_TIMESTAMP')) return [{ at: new Date(at) }];
      if (sql.text.includes('FROM FootballFixture')) return [{ id: sql.values[0] }];
      if (sql.text.includes('FROM DailySlipPublication')) return parents.map(row => ({ ...row, validIntegrity: corrupted ? 0 : 1 }));
      if (sql.text.includes('FROM PublishedSlip')) return rows.map(row => ({ ...row, validIntegrity: corrupted ? 0 : 1 }));
      assert.fail(sql.text);
    },
    async $executeRaw(query, ...values) {
      const sql = statement(query, values), v = sql.values;
      if (sql.text.includes('INSERT IGNORE INTO DailySlipPublication')) {
        if (ignored) return 0;
        if (parents.some(row => +row.eatDate === +v[1])) return 0;
        parents.push({ id: v[0], eatDate: v[1], publishedAt: v[2], modelId: v[3], bodyJson: JSON.parse(v[4]) }); return 1;
      }
      if (sql.text.includes('INSERT INTO PublishedSlip')) {
        rows.push({ id: v[0], publicationId: v[1], rank: v[2], snapshotJson: JSON.parse(v[3]) }); return 1;
      }
      assert.fail(sql.text);
    },
  };
  const store = createPublishedSlips({ async transaction(run) {
    const before = [parents.length, rows.length, legs.length];
    try { return await run(tx); } catch (error) { parents.length = before[0]; rows.length = before[1]; legs.length = before[2]; throw error; }
  } }, {
    async bindForecasts(_tx, value) {
      bound.push(value.id);
      return { ...value, selections: value.selections.map(item => ({ ...item,
        forecast: { cycleId: fixtureId(90), revisionId: fixtureId(91), publishedAt: now - 100 } })) };
    },
    async resolveResults(_tx, selections) {
      return selections.map(item => ({ fixtureId: item.fixtureId, family: item.family, selection: item.selection, forecast: item.forecast,
        completed: outcomes.has(item.fixtureId), status: outcomes.get(item.fixtureId) === 'void' ? 'canceled' : 'finished-regulation',
        regulationVerified: true, regulationHome: outcomes.get(item.fixtureId) === 'lost' ? 0 : 2, regulationAway: 1 }));
    },
  });
  const publish = (changes = {}) => store.publish({ day: today, slips: [slip()], model,
    searchLimited: false, partialCoverage: false, verifyModel: () => true, verifyPublicOdds: () => true, ...changes });
  return { store, publish, parents, rows, legs, bound, outcomes, advance(value) { at = value; }, corrupt() { corrupted = true; },
    ignoreInsert() { ignored = true; }, afterMembership(callback) { afterMembership = callback; } };
}
const query = { from: today, to: today, page: 1, pageSize: 1 };

test('one hundred daily slips publish, read and settle across the complete history cohort', async () => {
  const f = fixture(), slips = Array.from({ length: 100 }, (_, index) => slip(index + 1));
  assert.equal(await f.publish({ slips }), 'published');
  assert.equal(f.rows.length, 100);
  const day = await f.store.day(today);
  assert.equal(day.slips.length, 100); assert.equal(day.slips[99].rank, 100);
  slips.forEach(item => f.outcomes.set(item.selections[0].fixtureId, 'won'));
  const history = await f.store.history({ ...query, page: 2, pageSize: 50 });
  assert.equal(history.records.length, 50); assert.equal(history.total, 100);
  assert.equal(history.statistics.won, 100);
  assert.equal(history.records[49].rank, 100);
  const oversized = fixture();
  await assert.rejects(() => oversized.publish({ slips: [...slips, slip(101)] }));
  assert.equal(oversized.parents.length, 0);
});

test('publication assigns probability order before sealing snapshot ranks', async () => {
  const f = fixture(), probabilities = [0.65, 0.8, 0.7];
  const slips = probabilities.map((probability, index) => ({ ...slip(index + 1), averageProbability: probability,
    estimatedProbability: probability, selections: slip(index + 1).selections.map(selection => ({ ...selection, probability })) }));
  await f.publish({ slips, model: { ...model, estimate: selections => selections[0].probability } });
  assert.deepEqual(f.rows.map(row => row.snapshotJson.estimatedProbability), [0.8, 0.7, 0.65]);
  assert.deepEqual((await f.store.day(today)).slips.map(view => view.estimatedProbability), [0.8, 0.7, 0.65]);
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
  assert.equal(day.slips[0].slip.totalOdds, '5.00');
  const publicViews = bestSlipViews(day.slips.map(view => view.slip), false);
  assert.deepEqual(publicViews, [{ rank: 1, matchCount: 1, totalOdds: '5.00', estimatedProbability: 0.7 }]);
  assert.deepEqual(gateBestSlips(day, { tier: 'free', signedIn: false, mode: 'off' }).slips, publicViews);
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
  assert.equal(completed.records[0].slip.totalOdds, '5.00'); assert.equal(completed.records[0].publicationDay, today);
  assert.equal(completed.statistics.profitUnits, -1); assert.equal(completed.statistics.winRate, 0);
  assert.equal('accountId' in completed.records[0], false);
});

test('pagination uses the whole publication-period denominator and retains void history', async () => {
  const f = fixture(); await f.publish({ slips: [slip(1), slip(2), slip(3)] });
  f.outcomes.set(fixtureId(1), 'won'); f.outcomes.set(fixtureId(2), 'lost'); f.outcomes.set(fixtureId(3), 'void');
  const page = await f.store.history({ ...query, page: 2 });
  assert.equal(page.records.length, 1); assert.equal(page.records[0].rank, 2); assert.equal(page.total, 3);
  assert.equal(page.statistics.total, 3); assert.equal(page.statistics.returnsSampleCount, 2);
  assert.equal(page.statistics.roi, 1.5); assert.equal(page.statistics.void, 1);
  assert.equal((await f.store.history({ ...query, page: 3 })).records[0].outcome, 'void');
  assert.equal((await f.store.history({ ...query, page: 4 })).records.length, 0);
});

test('daily slip performance includes every published slip and updates from original-cycle results', async () => {
  const f = fixture(); await f.publish({ slips: [slip(1), slip(2), slip(3), slip(4)] });
  assert.deepEqual((await f.store.day(today)).statistics, { total: 4, won: 0, lost: 0, pending: 4, void: 0 });
  f.outcomes.set(fixtureId(1), 'won'); f.outcomes.set(fixtureId(2), 'lost'); f.outcomes.set(fixtureId(3), 'void');
  assert.deepEqual((await f.store.day(today)).statistics, { total: 4, won: 1, lost: 1, pending: 1, void: 1 });
});

test('a lost leg settles aggregate loss immediately while active selections and quotes stay private', async () => {
  const first = slip(1), second = slip(2);
  const mixed = { ...first, selections: [{ ...first.selections[0], odds: '2.00' }, { ...second.selections[0], odds: '2.50' }] };
  const f = fixture(); await f.publish({ slips: [mixed] });
  f.outcomes.set(fixtureId(1), 'lost');
  assert.deepEqual((await f.store.day(today)).statistics, { total: 1, won: 0, lost: 1, pending: 0, void: 0 });
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

test('private publisher skips unqualified generation, respects existing publication and handles sparse days', async () => {
  let reads = 0, writes = 0;
  const options = { database: {}, competitionIds: [], model, providerOdds: true, now: () => now,
    verifyModel: () => true, verifyPublicOdds: () => true, read: async () => { reads++; throw new Error('must not generate'); },
    store: { async day() { return {}; }, async publish() { writes++; return 'published'; } } };
  assert.equal((await createDailySlipPublisher(options).publish()).status, 'already-published');
  assert.equal((await createDailySlipPublisher({ ...options, model: null }).publish()).status, 'model-unavailable');
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
  f.parents[0].bodyJson.criteria = f.parents[0].bodyJson.criteria.replace('totalMin=4.50', 'totalMin=4.00');
  f.parents[0].bodyJson.criteria = f.parents[0].bodyJson.criteria.replace('slips=100', 'slips=10');
  f.advance(model.validUntil + 1);
  assert.equal((await f.store.day(today)).slips[0].slip.totalOdds, '5.00');
  assert.match(f.parents[0].bodyJson.criteria, /totalMin=4.00/);
  assert.match(f.parents[0].bodyJson.criteria, /slips=10/);
});

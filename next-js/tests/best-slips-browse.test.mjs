import assert from 'node:assert/strict';
import test from 'node:test';
import { addReportingDays, parseReportingDate } from '../src/domain/calendar.ts';
import { bestSlipsQueryRules, parseBestSlipsQuery } from '../src/domain/best-slips-query.ts';
import { createBestSlipsBrowseService } from '../src/server/slips/best-slips-browse.ts';
import { createPublishedSlips } from '../src/server/slips/published-slips.ts';
import { gateBestSlips } from '../src/server/slips/best-slips.ts';
import { createBestSlipsHandler } from '../src/server/slips/best-slips-http.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { liveRecord, now, today as dayString } from './helpers/live-refresh-fixtures.mjs';

const today = parseReportingDate(dayString), free = { tier: 'free', signedIn: false, mode: 'off' }, full = { tier: 'full', signedIn: true, mode: 'off' };
const uuid = (number) => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function fixture(days = 1, daily = 4, replacementCycles = false) {
  const publications = [], slips = [], legs = [], outcomes = new Map(), reads = [], resultBatches = [], source = liveRecord();
  let corrupt = false;
  for (let dateIndex = 0; dateIndex < days; dateIndex++) {
    const day = addReportingDays(today, -dateIndex), publicationId = evidenceFingerprint({ kind: 'daily-best-slips', version: 1, day });
    const publishedAt = Date.parse(`${day}T00:00:01+03:00`), modelId = 'a'.repeat(64);
    const bodyJson = { version: 1, day, publishedAt, model: { id: modelId, calibrationReference: 'synthetic-review-model',
      correlationReference: 'synthetic-review-correlation', validFrom: publishedAt - 1000, validUntil: publishedAt + 86_400_000 },
      criteria: '', count: daily, searchLimited: false, partialCoverage: false };
    publications.push({ id: publicationId, eatDate: new Date(`${day}T00:00:00Z`), publishedAt: new Date(publishedAt), modelId, bodyJson });
    for (let index = 0; index < daily; index++) {
      const rank = index + 1, identity = dateIndex * 100 + rank, fixtureId = uuid(identity), forecast = {
        cycleId: uuid(100000 + identity), revisionId: uuid(200000 + identity), publishedAt: publishedAt - 1000 };
      const snapshot = { slip: { id: `private-original-${identity}`, totalOdds: '5.00', averageProbability: 0.7, oddsBasis: 'bookmaker',
        selections: [{ fixtureId, kickoffAt: publishedAt + 3600_000, homeTeam: source.homeTeam, awayTeam: source.awayTeam,
          competition: source.competition, family: 'match-result', selection: 'home-win', probability: 0.7, odds: '5.00', oddsBasis: 'bookmaker', forecast }] },
        estimatedProbability: 0.65 };
      const id = evidenceFingerprint({ publicationId, rank, snapshot });
      slips.push({ id, publicationId, rank, snapshotJson: snapshot });
      legs.push({ slipId: id, fixtureId, cycleId: forecast.cycleId, revisionId: forecast.revisionId });
      outcomes.set(fixtureId, ['won', 'lost', 'pending', 'void'][index % 4]);
    }
  }
  const tx = {
    publishedSlipLeg: { async findMany({ where }) { return legs.filter((leg) => where.slipId.in.includes(leg.slipId)); } },
    async $queryRaw(query, ...arguments_) {
      const sql = Array.isArray(query) ? { text: query.join('?'), values: arguments_ } : { text: query.sql, values: query.values };
      reads.push(sql);
      if (sql.text.includes('UTC_TIMESTAMP')) return [{ at: new Date(now) }];
      if (sql.text.includes('FROM DailySlipPublication')) {
        let rows = publications.filter((row) => +row.publishedAt <= +sql.values[0]);
        if (sql.text.includes('eatDate>=')) rows = rows.filter((row) => +row.eatDate >= +sql.values[1] && +row.eatDate <= +sql.values[2]);
        else if (sql.text.includes('eatDate<=')) rows = rows.filter((row) => +row.eatDate <= +sql.values[1]);
        return rows.sort((a, b) => +b.eatDate - +a.eatDate).slice(0, sql.values.at(-1)).map((row) => ({ ...row, validIntegrity: corrupt ? 0 : 1 }));
      }
      if (sql.text.includes('FROM PublishedSlip')) return slips.filter((row) => sql.values.includes(row.publicationId))
        .sort((a, b) => a.publicationId.localeCompare(b.publicationId) || a.rank - b.rank)
        .slice(0, sql.values.at(-1)).map((row) => ({ ...row, validIntegrity: corrupt ? 0 : 1 }));
      assert.fail(sql.text);
    },
  };
  const store = createPublishedSlips({ async transaction(run) { return run(tx); } }, {
    async resolveResults(_tx, selections) {
      resultBatches.push(selections.length);
      const results = selections.map((selection) => {
        const outcome = outcomes.get(selection.fixtureId);
        const active = ['pending', 'not-started', 'in-progress', 'unknown'].includes(outcome);
        return { fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection, forecast: selection.forecast,
          completed: !active, fixtureCompleted: !active, status: outcome === 'pending' || outcome === 'not-started' ? 'scheduled'
            : outcome === 'in-progress' ? 'live' : outcome === 'unknown' ? 'unknown'
              : outcome === 'void' ? 'canceled' : outcome === 'void-abandoned' ? 'abandoned' : 'finished-regulation',
          regulationVerified: true, regulationHome: outcome === 'lost' ? 0 : 2, regulationAway: 1 };
      });
      return replacementCycles ? [...results.map((result) => ({ ...result, forecast: { ...result.forecast, cycleId: uuid(999999) },
        completed: true, status: 'finished-regulation', regulationHome: result.regulationAway, regulationAway: result.regulationHome })), ...results] : results;
    },
  });
  return { store, reads, resultBatches, outcomes, publications, slips, legs, corrupt() { corrupt = true; } };
}
const query = (input = {}) => parseBestSlipsQuery(input, today);

test('publication pages show 50 slips and preserve every original rank at the 50, 51 and 100 boundaries', async () => {
  for (const count of [50, 51, 100]) {
    const f = fixture(1, count), first = await f.store.browse(query(), today);
    assert.equal(first.browse.pageSize, 50); assert.equal(first.browse.total, count);
    assert.equal(first.slips.length, 50); assert.equal(first.browse.hasMore, count > 50);
    const second = await f.store.browse(query({ page: '2' }), today);
    assert.equal(second.slips.length, count - 50); assert.equal(second.browse.hasMore, false);
    const rows = [...first.slips, ...second.slips];
    assert.deepEqual(rows.map((view) => view.rank), Array.from({ length: count }, (_, index) => index + 1));
    assert.equal(new Set(rows.map((view) => view.id)).size, count);
    assert.deepEqual(second.statistics, first.statistics);
  }
});

test('publication browsing filters original outcomes before pagination and retains whole-period counts', async () => {
  const f = fixture(7, 8), result = await f.store.browse(query({ period: 'last7', status: 'won', page: '2' }), today);
  assert.equal(result.browse.total, 14); assert.deepEqual(result.slips, []); assert.equal(result.browse.hasMore, false);
  assert.deepEqual(result.statistics, { total: 56, won: 14, lost: 14, pending: 14, void: 0, cancelled: 14 });
  const pending = await f.store.browse(query({ period: 'last7', status: 'pending' }), today);
  assert.equal(pending.slips.length, 14); assert.ok(pending.slips.every((view) => view.outcome === 'pending' && view.slip && view.matchStates.length));
  assert.equal(pending.slips[0].publicationDay, today); assert.equal(pending.slips.at(-1).publicationDay, addReportingDays(today, -6));
  assert.equal(pending.slips[0].publishedAt, Date.parse(`${today}T00:00:01+03:00`));
  const future = await f.store.browse(query({ period: 'next7' }), today);
  assert.equal(future.browse.total, 0); assert.equal(future.state, 'generated');
});

test('void, cancelled and pending progress categories filter before pagination with one whole-period denominator', async () => {
  const f = fixture(7, 28);
  const statuses = ['won', 'lost', 'void-abandoned', 'void', 'not-started', 'in-progress', 'unknown'];
  [...f.outcomes.keys()].forEach((id, index) => f.outcomes.set(id, statuses[index % statuses.length]));
  for (const status of ['void', 'cancelled', 'pending']) {
    const result = await f.store.browse(query({ period: 'last7', status, page: '2' }), today);
    assert.deepEqual(result.statistics, { total: 196, won: 28, lost: 28, pending: 84, void: 28, cancelled: 28 });
    assert.equal(result.browse.total, status === 'pending' ? 84 : 28);
    assert.equal(result.slips.length, status === 'pending' ? 34 : 0);
    assert.ok(result.slips.every((view) => status === 'pending'
      ? ['not-started', 'in-progress', 'pending'].includes(view.status) && view.outcome === 'pending'
      : view.status === status && view.outcome === 'void'));
    assert.equal(result.statistics.total, ['won', 'lost', 'pending', 'void', 'cancelled'].reduce((sum, key) => sum + result.statistics[key], 0));
  }
  const current = await f.store.browse(query(), today), gated = gateBestSlips(current, free);
  assert.deepEqual(gated.slips.map(view => view.status), current.slips.filter(view => view.completed).map(view => view.status));
  assert.ok(gated.slips.every(view => view.completed && view.slip));
  let accessChecks = 0;
  const response = await createBestSlipsHandler({ now: () => now, browse: async (viewer, selected) => f.store.browse(selected, today, viewer.tier === 'free'),
    access: async () => ++accessChecks === 1 ? full : free })(new Request('https://goalhint.test/api/best-slips?period=today'));
  const expired = await response.json();
  assert.equal(response.status, 200); assert.equal(expired.entitled, false);
  assert.deepEqual(expired.slips.map(view => view.status), current.slips.filter(view => view.completed).map(view => view.status));
  assert.ok(expired.slips.every(view => view.completed && view.slip));
  assert.equal(expired.statistics.total, 16); assert.equal(accessChecks, 3);
});

test('exact custom ranges resolve forecast results in bounded batches without truncating older publications', async () => {
  const f = fixture(64, 4), result = await f.store.browse(query({ period: 'custom', from: addReportingDays(today, -63), to: today, status: 'lost' }), today);
  assert.equal(result.browse.total, 64); assert.equal(result.slips.length, bestSlipsQueryRules.pageSize); assert.equal(result.browse.hasMore, true);
  assert.equal(result.statistics.total, 256); assert.deepEqual(f.resultBatches, [124, 124, 8]);
  assert.ok(f.reads.filter((read) => read.text.includes('FROM PublishedSlip')).every((read) => read.values.at(-1) === 3101));
});

test('All dates continues within publication ranks without skipping and never claims a partial total', async () => {
  const f = fixture(3, 30), seen = [], expected = f.slips.length;
  let selected = query({ period: 'all' }), result;
  do {
    result = await f.store.browse(selected, today);
    assert.equal(result.browse.total, null); assert.equal(result.statistics, null);
    seen.push(...result.slips.map((view) => view.id));
    selected = { ...selected, page: selected.page + 1, ...(result.browse.nextCursor ? { cursor: result.browse.nextCursor } : {}) };
  } while (result.browse.hasMore);
  assert.equal(seen.length, expected); assert.equal(new Set(seen).size, expected);
});

test('an empty All dates scan exposes a continuation for matching older publications', async () => {
  const f = fixture(35, 4);
  for (const [fixtureId] of f.outcomes) f.outcomes.set(fixtureId, 'pending');
  f.outcomes.set(f.slips.at(-1).snapshotJson.slip.selections[0].fixtureId, 'lost');
  const first = await f.store.browse(query({ period: 'all', status: 'lost' }), today);
  assert.deepEqual(first.slips, []); assert.equal(first.browse.hasMore, true);
  assert.equal(first.browse.from, addReportingDays(today, -30));
  const second = await f.store.browse(query({ period: 'all', status: 'lost', page: '2', cursor: first.browse.nextCursor }), today);
  assert.equal(second.slips.length, 1); assert.equal(second.browse.hasMore, false);
  assert.equal(second.slips[0].publicationDay, addReportingDays(today, -34));
  assert.ok(f.resultBatches.every((count) => count <= bestSlipsQueryRules.scanDays * 4));
});

test('the browse service releases complete original selections and filters unfinished rows before public counts', async () => {
  const f = fixture(), result = await f.store.browse(query(), today), gated = gateBestSlips(result, free);
  assert.equal(gated.slips.length, 3); assert.ok(gated.slips.every(view => view.slip && view.completed));
  assert.equal(gated.slips[0].publicationDay, today); assert.equal(gated.slips[0].outcome, 'won');
  assert.ok(!gated.slips.some(view => view.rank === 3));
  const read = createBestSlipsBrowseService({ read: async (selected, day, _locale, completedOnly) => f.store.browse(selected, day, completedOnly), providerOdds: true, now: () => now });
  assert.deepEqual(await read(free, query()), gated);
  assert.deepEqual(await read(full, query()), { ...result, entitled: true });
});

test('a replacement cycle on the same fixture cannot overwrite the original published outcome or row state', async () => {
  const f = fixture(1, 4, true), result = await f.store.browse(query(), today);
  assert.deepEqual(result.slips.map((view) => view.outcome), ['won', 'lost', 'pending', 'void']);
  assert.deepEqual(result.slips.map((view) => view.matchStates[0].outcome), ['correct', 'incorrect', 'pending', 'void']);
  assert.ok(result.slips.every((view) => view.matchStates[0].forecast.cycleId === view.slip.selections[0].forecast.cycleId));
});

test('invalid ranges, unsealed publications and read failures fail closed; disabled odds perform no reads', async () => {
  const f = fixture(); f.corrupt();
  await assert.rejects(() => f.store.browse(query(), today));
  let reads = 0;
  const service = createBestSlipsBrowseService({ read: async () => { reads++; throw new Error('private database detail'); }, providerOdds: true, now: () => now });
  const failure = await service(full, query()); assert.equal(failure.state, 'data-unavailable'); assert.deepEqual(failure.slips, []);
  const off = createBestSlipsBrowseService({ read: async () => { reads++; throw new Error('must not read'); }, providerOdds: false, now: () => now });
  assert.equal((await off(full, query())).state, 'odds-unavailable'); assert.equal(reads, 1);
  assert.doesNotMatch(JSON.stringify(failure), /private database detail/);
});


test('public completion eligibility precedes statistics, result filtering and every page boundary', async () => {
  const f = fixture(2, 100), rows = [];
  for (const page of [1, 2, 3, 4]) {
    const result = await f.store.browse(query({ period: 'last3', page: String(page) }), today, true);
    assert.equal(result.browse.total, 150); assert.equal(result.statistics.total, 150);
    assert.equal(result.statistics.pending, 0); assert.equal(result.slips.length, page <= 3 ? 50 : 0);
    assert.equal(result.browse.hasMore, page < 3);
    assert.ok(result.slips.every(view => view.completed && view.rank % 4 !== 3));
    rows.push(...result.slips);
  }
  assert.equal(new Set(rows.map(view => view.id)).size, 150);
  const pending = await f.store.browse(query({ period: 'last3', status: 'pending' }), today, true);
  assert.equal(pending.browse.total, 0); assert.deepEqual(pending.slips, []); assert.equal(pending.statistics.total, 150);
  const all = await f.store.browse(query({ period: 'last3' }), today);
  assert.equal(all.browse.total, 200); assert.equal(all.statistics.pending, 50);
});

test('a historical early-lost slip with another live leg is excluded in its entirety', async () => {
  const f = fixture(2, 4), row = f.slips.find(item => item.publicationId === f.publications[1].id && item.rank === 1);
  const oldId = row.id, first = row.snapshotJson.slip.selections[0];
  const extra = { ...first, fixtureId: uuid(900000), forecast: { ...first.forecast, cycleId: uuid(900001), revisionId: uuid(900002) } };
  row.snapshotJson.slip.selections = [{ ...first, odds: '2.00' }, { ...extra, odds: '2.50' }];
  row.id = evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot: row.snapshotJson });
  for (const leg of f.legs) if (leg.slipId === oldId) leg.slipId = row.id;
  f.legs.push({ slipId: row.id, fixtureId: extra.fixtureId, cycleId: extra.forecast.cycleId, revisionId: extra.forecast.revisionId });
  f.outcomes.set(first.fixtureId, 'lost'); f.outcomes.set(extra.fixtureId, 'in-progress');
  const fullResult = await f.store.browse(query({ period: 'yesterday' }), today);
  assert.equal(fullResult.slips.find(view => view.id === row.id).outcome, 'lost');
  assert.equal(fullResult.slips.find(view => view.id === row.id).completed, false);
  const publicResult = await f.store.browse(query({ period: 'yesterday' }), today, true);
  assert.equal(publicResult.browse.total, 2); assert.equal(publicResult.statistics.total, 2);
  assert.ok(!publicResult.slips.some(view => view.id === row.id));
  assert.ok(!JSON.stringify(publicResult).includes(extra.fixtureId));
});

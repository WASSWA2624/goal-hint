import assert from 'node:assert/strict';
import test from 'node:test';
import { addReportingDays, parseReportingDate } from '../src/domain/calendar.ts';
import { bestSlipsQueryRules, parseBestSlipsQuery, resolveBestSlipsDates } from '../src/domain/best-slips-query.ts';
import { bestSlipPublicRank } from '../src/domain/best-slip-odds-bands.ts';
import { createBestSlipsBrowseService } from '../src/server/slips/best-slips-browse.ts';
import { createPublishedSlips, slipPublicationIdentity } from '../src/server/slips/published-slips.ts';
import { gateBestSlips } from '../src/server/slips/best-slips.ts';
import { createBestSlipsHandler } from '../src/server/slips/best-slips-http.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { liveRecord, now, today as dayString } from './helpers/live-refresh-fixtures.mjs';
import { pricedEditorialSelection } from './helpers/best-slip-publication-fixtures.mjs';

const today = parseReportingDate(dayString), free = { tier: 'free', signedIn: false, mode: 'off' }, full = { tier: 'full', signedIn: true, mode: 'off' };
const uuid = (number) => `20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
function fixture(days = 1, daily = 4, replacementCycles = false, valuesForRank = () => ({ averageProbability: 0.7, totalOdds: '4.00' })) {
  const publications = [], slips = [], legs = [], outcomes = new Map(), reads = [], resultBatches = [], source = liveRecord();
  const batches = [], transactions = [];
  let corrupt = false, asOf = now, nextBrowseClock = null;
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
      const { averageProbability, totalOdds } = valuesForRank(rank);
      const snapshot = { slip: { id: `private-original-${identity}`, totalOdds, averageProbability, oddsBasis: 'bookmaker',
        selections: [{ fixtureId, kickoffAt: publishedAt + 3600_000, homeTeam: source.homeTeam, awayTeam: source.awayTeam,
          competition: source.competition, family: 'match-result', selection: 'home-win', probability: averageProbability, odds: totalOdds, oddsBasis: 'bookmaker', forecast }] },
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
      if (sql.text === 'SELECT UTC_TIMESTAMP(3) AS at') return [{ at: new Date(asOf) }];
      if (sql.text.includes('FROM DailyBestSlipAppendBatch')) return batches.filter(row => sql.values.includes(row.publicationId))
        .sort((left, right) => left.publicationId.localeCompare(right.publicationId) || left.firstRank - right.firstRank)
        .map(row => ({ ...row, validIntegrity: corrupt ? 0 : 1 }));
      if (sql.text.includes('FROM DailySlipPublication')) {
        const dates = sql.values.filter(value => value instanceof Date);
        if (sql.text.includes('WHERE eatDate=')) return publications.filter(row => +row.eatDate === +dates[0]).map(row => ({ ...row, validIntegrity: corrupt ? 0 : 1 }));
        if (nextBrowseClock !== null && sql.text.includes('ORDER BY eatDate DESC, FIELD')) {
          asOf = nextBrowseClock;
          nextBrowseClock = null;
        }
        const historic = sql.text.includes('WHERE eatDate>=');
        const clockFilter = sql.text.includes('publishedAt<=');
        const dateOffset = clockFilter ? 1 : 0;
        const available = historic ? dates[2] : dates[0];
        let rows = clockFilter ? publications.filter((row) => +row.publishedAt <= +available) : publications;
        if (historic) rows = rows.filter((row) => +row.eatDate >= +dates[0] && +row.eatDate <= +dates[1]);
        else if (sql.text.includes('eatDate>=')) rows = rows.filter((row) => +row.eatDate >= +dates[dateOffset] && +row.eatDate <= +dates[dateOffset + 1]);
        else if (sql.text.includes('eatDate<=')) rows = rows.filter((row) => +row.eatDate <= +dates[dateOffset]);
        rows = rows.filter(row => sql.values.includes(row.oddsBand ?? 'legacy') || row.oddsBand === undefined);
        return rows.sort((a, b) => +b.eatDate - +a.eatDate).slice(0, sql.values.at(-1)).map((row) => ({ ...row, validIntegrity: corrupt ? 0 : 1 }));
      }
      if (sql.text.includes('FROM PublishedSlip')) {
        return slips.filter((row) => sql.values.includes(row.publicationId)
          && (!sql.text.includes('`rank`>') || row.rank > sql.values[1])
          && (!sql.text.includes('`rank`=') || row.rank === sql.values[1])
          && (!sql.text.includes('JSON_UNQUOTE') || row.snapshotJson.slip.id === sql.values[1]))
          .sort((a, b) => a.publicationId.localeCompare(b.publicationId) || a.rank - b.rank)
          .slice(0, sql.text.includes('LIMIT 1') ? 1 : sql.text.includes('LIMIT') ? sql.values.at(-1) : undefined)
          .map((row) => ({ ...row, validIntegrity: corrupt ? 0 : 1 }));
      }
      assert.fail(sql.text);
    },
  };
  const store = createPublishedSlips({ async transaction(run, options) { transactions.push(options); return run(tx); } }, {
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
  return { store, reads, resultBatches, outcomes, publications, slips, legs, batches, transactions,
    advance(value) { asOf = value; }, advanceOnBrowse(value) { nextBrowseClock = value; }, corrupt() { corrupt = true; } };
}
const query = (input = {}) => parseBestSlipsQuery({ period: 'last30', status: 'all', ...input }, today);

test('publication pages show 20 slips and preserve every original rank across page boundaries', async () => {
  for (const count of [20, 21, 50, 51, 100]) {
    const f = fixture(1, count), rows = [];
    for (let page = 1; page <= Math.ceil(count / 20); page++) {
      const data = await f.store.browse(query({ page: String(page) }), today);
      assert.equal(data.browse.pageSize, 20); assert.equal(data.browse.total, count);
      assert.equal(data.slips.length, Math.min(20, count - (page - 1) * 20));
      assert.equal(data.browse.hasMore, page * 20 < count);
      rows.push(...data.slips);
    }
    assert.deepEqual(rows.map((view) => view.rank), Array.from({ length: count }, (_, index) => index + 1));
    assert.equal(new Set(rows.map((view) => view.id)).size, count);
  }
});

test('extended publications page every sealed slot and keep canonical links across the old stride', async () => {
  const f = fixture(1, 67), oddsBand = '1.5-5', parent = f.publications[0];
  const midnight = Date.parse(`${today}T00:00:00+03:00`), firstAt = midnight + 10_000;
  const kickoffAt = Date.parse(`${today}T20:00:00+03:00`);
  Object.assign(parent, { id: slipPublicationIdentity(today, oddsBand), oddsBand, publishedAt: new Date(firstAt), modelId: null });
  Object.assign(parent.bodyJson, { version: 5, oddsBand, publishedAt: firstAt, count: 0, model: null,
    criteria: `dateFrom=${today}&dateTo=${today}&totalMin=2.50&totalMax=5.00` });
  for (const [index, firstRank] of [1, 33, 65].entries()) {
    const count = Math.min(32, f.slips.length - firstRank + 1), hourAt = midnight + index * 1_800_000, at = hourAt + 10_000;
    const id = evidenceFingerprint({ kind: 'hourly-best-slip-append', publicationId: parent.id, hourAt });
    f.batches.push({ id, publicationId: parent.id, hourAt: new Date(hourAt), publishedAt: new Date(at), firstRank, count,
      bodyJson: { version: 2, hourAt, publishedAt: at, firstRank, count, searchLimited: false, partialCoverage: false } });
    for (const row of f.slips.slice(firstRank - 1, firstRank - 1 + count)) {
      const leg = f.legs.find(leg => leg.slipId === row.id), snapshot = row.snapshotJson;
      snapshot.slip.selections = [pricedEditorialSelection(row.rank, { fixtureId: leg.fixtureId, cycleId: leg.cycleId,
        revisionId: leg.revisionId, at, kickoffAt, probability: snapshot.slip.averageProbability })];
      delete snapshot.estimatedProbability;
      row.publicationId = parent.id;
      row.appendBatchId = id;
      row.id = evidenceFingerprint({ publicationId: parent.id, rank: row.rank, snapshot });
      leg.slipId = row.id;
      f.outcomes.set(leg.fixtureId, 'won');
    }
  }
  // The final batch commits before the first consistent read but after an earlier clock-only read would have sampled time.
  const committedAt = f.batches.at(-1).publishedAt.getTime();
  f.advance(committedAt - 1);
  f.advanceOnBrowse(committedAt);
  const concurrent = await f.store.browse(query({ period: 'today' }), today);
  assert.equal(concurrent.summary.asOf, committedAt);
  assert.equal(concurrent.browse.total, 67);
  assert.deepEqual(f.transactions[0], { isolationLevel: 'RepeatableRead', timeout: 30_000, maxWait: 5_000 });
  f.advance(midnight + 2 * 3_600_000);
  const expected = f.slips.map(({ rank }) => bestSlipPublicRank(oddsBand, rank));
  const listed = [], archived = [];
  let cursor;
  for (let page = 1; page <= 4; page++) {
    const dated = await f.store.browse(query({ period: 'today', page: String(page) }), today);
    assert.equal(dated.browse.total, 67);
    listed.push(...dated.slips.map(({ rank }) => rank));
    const scan = await f.store.browse(query({ period: 'all', page: String(page), ...(cursor ? { cursor } : {}) }), today);
    archived.push(...scan.slips.map(({ rank }) => rank));
    cursor = scan.browse.nextCursor;
  }
  assert.deepEqual(listed, expected);
  assert.deepEqual(archived, expected);
  assert.equal(cursor, null);
  for (const rank of [1, 20, 21, 65, 67]) {
    const [direct] = (await f.store.byRank(today, expected[rank - 1])).slips;
    assert.equal(direct.id, f.slips[rank - 1].id);
    assert.equal(direct.rank, expected[rank - 1]);
  }
  assert.equal(await f.store.byRank(today, bestSlipPublicRank('5-10', 1)), null);
  const shares = await f.store.day(today, false, undefined, f.slips[65].snapshotJson.slip.id);
  assert.deepEqual(shares.slips.map(({ id }) => id), [f.slips[65].id]);
  assert.equal(f.resultBatches.at(-1), 1, 'share lookup only resolves the selected snapshot');
  const history = await f.store.history({ from: today, to: today, page: 4, pageSize: 20 });
  assert.equal(history.total, 67);
  assert.equal(history.records.length, 7);
  assert.equal(history.statistics.won, 67);
});

test('Today includes only actionable previous-set legs during the midnight handoff', async () => {
  const f = fixture(2, 4), previous = addReportingDays(today, -1);
  const at = (time) => Date.parse(`${today}T${time}:00+03:00`);
  const update = (row, kickoffAt, outcome) => {
    const selection = row.snapshotJson.slip.selections[0], leg = f.legs.find(leg => leg.slipId === row.id);
    selection.kickoffAt = kickoffAt;
    row.id = evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot: row.snapshotJson });
    leg.slipId = row.id;
    f.outcomes.set(selection.fixtureId, outcome);
  };
  const previousRows = f.slips.filter(({ publicationId }) => publicationId === f.publications[1].id);
  [ ['02:00', 'pending'], ['00:05', 'pending'], ['02:30', 'in-progress'], ['03:00', 'pending'] ].forEach(([time, outcome], i) =>
    update(previousRows[i], at(time), outcome));
  const currentRows = f.slips.filter(({ publicationId }) => publicationId === f.publications[0].id);
  currentRows.forEach((row) => update(row, at('10:00'), 'pending'));
  f.advance(at('00:15'));
  const request = query({ period: 'today', status: 'pending' });
  const active = await f.store.browse(request, today);
  assert.equal(active.browse.total, 5);
  assert.equal(active.browse.bandTotal, 5);
  assert.equal(active.statistics.pending, 5);
  assert.deepEqual(active.slips.map(({ publicationDay }) => publicationDay), [previous, today, today, today, today]);
  const [overlap] = active.slips;
  assert.equal(overlap.id, previousRows[0].id);
  assert.deepEqual((await f.store.byRank(previous, overlap.rank)).slips, [overlap]);
  assert.deepEqual((await f.store.browse(query({ period: 'yesterday' }), today)).slips.map(({ publicationDay }) => publicationDay),
    [previous, previous, previous, previous]);
  assert.equal((await f.store.browse(query({ period: 'custom', from: today, to: today }), today)).browse.total, 4);
  const [protectedPrior] = gateBestSlips(active, free).slips;
  assert.equal(protectedPrior.slip, undefined);
  assert.equal(protectedPrior.preview[0].pick, null);
  f.advance(at('03:00'));
  assert.ok((await f.store.browse(request, today)).slips.every(({ publicationDay }) => publicationDay === today));
});

test('browse keeps publications dated after the snapshot clock out of the rows and counts', async () => {
  const f = fixture(2, 4), previous = addReportingDays(today, -1);
  f.advance(f.publications[0].publishedAt.getTime() - 1);
  const dated = await f.store.browse(query({ period: 'custom', from: previous, to: today }), today);
  assert.equal(dated.statistics.total, 4);
  assert.equal(dated.browse.bandTotal, 4);
  assert.ok(dated.slips.every(({ publicationDay }) => publicationDay === previous));
  const archive = await f.store.browse(query({ period: 'all' }), today);
  assert.ok(archive.slips.every(({ publicationDay }) => publicationDay === previous));
  assert.equal(archive.browse.to, previous);
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

test('daily pages order by card probability across different odds and keep the canonical ranks', async () => {
  const { store } = fixture(1, 25, false, rank => ({ averageProbability: rank > 20 ? 0.9 : 0.7, totalOdds: rank % 2 === 0 ? '4.80' : '2.75' }));
  const first = await store.browse(query({ period: 'today' }), today);
  const second = await store.browse(query({ period: 'today', page: '2' }), today);
  const canonical = await store.day(today);
  const ranks = canonical.slips.map(view => view.rank);
  assert.deepEqual(first.slips.map(view => view.rank), [...ranks.slice(20), ...ranks.slice(0, 15)]);
  assert.deepEqual(second.slips.map(view => view.rank), ranks.slice(15, 20));
  assert.equal(first.browse.total, 25);
  assert.equal(first.browse.bandTotal, 25);
  assert.equal(first.browse.dailyBandLimit, undefined, 'legacy bands keep their historical capacity');
  assert.equal(first.browse.version, second.browse.version);
  assert.equal(first.slips[0].id, canonical.slips[20].id);
  const won = await store.browse(query({ period: 'today', status: 'won' }), today);
  assert.deepEqual(won.slips.map(view => view.rank), [21, 25, 1, 5, 9, 13, 17]);
});

test('void, cancelled and pending progress categories filter before pagination with one whole-period denominator', async () => {
  const f = fixture(7, 28);
  const statuses = ['won', 'lost', 'void-abandoned', 'void', 'not-started', 'in-progress', 'unknown'];
  [...f.outcomes.keys()].forEach((id, index) => f.outcomes.set(id, statuses[index % statuses.length]));
  for (const status of ['void', 'cancelled', 'pending']) {
    const result = await f.store.browse(query({ period: 'last7', status, page: '2' }), today);
    assert.deepEqual(result.statistics, { total: 196, won: 28, lost: 28, pending: 84, void: 28, cancelled: 28 });
    assert.equal(result.browse.total, status === 'pending' ? 84 : 28);
    assert.equal(result.slips.length, status === 'pending' ? 20 : 8);
    assert.ok(result.slips.every((view) => status === 'pending'
      ? ['not-started', 'in-progress', 'pending'].includes(view.status) && view.outcome === 'pending'
      : view.status === status && view.outcome === 'void'));
    assert.equal(result.statistics.total, ['won', 'lost', 'pending', 'void', 'cancelled'].reduce((sum, key) => sum + result.statistics[key], 0));
  }
  const current = await f.store.browse(query(), today), gated = gateBestSlips(current, free);
  assert.deepEqual(gated.slips.map(view => view.status), current.slips.map(view => view.status));
  assert.ok(gated.slips.every(view => view.completed ? view.slip : view.preview.every(leg => leg.pick === null)));
  let accessChecks = 0;
  const response = await createBestSlipsHandler({ now: () => now, snapshot: async selected => f.store.browse(selected, today, false),
    access: async () => { accessChecks++; return free; } })(new Request('https://goalhint.test/api/best-slips?period=today'));
  const expired = await response.json();
  assert.equal(response.status, 200); assert.equal(expired.entitled, false);
  assert.deepEqual(expired.slips.map(view => view.status), current.slips.map(view => view.status));
  assert.ok(expired.slips.every(view => view.completed ? view.slip : view.preview.every(leg => leg.pick === null)));
  assert.equal(expired.statistics.total, 28); assert.equal(accessChecks, 1);
});

test('exact custom ranges resolve forecast results in bounded batches without truncating older publications', async () => {
  const f = fixture(64, 4), result = await f.store.browse(query({ period: 'custom', from: addReportingDays(today, -63), to: today, status: 'lost' }), today);
  assert.equal(result.browse.total, 64); assert.equal(result.slips.length, bestSlipsQueryRules.pageSize); assert.equal(result.browse.hasMore, true);
  assert.equal(result.statistics.total, 256); assert.deepEqual(f.resultBatches, [128, 128]);
  assert.ok(f.reads.filter((read) => read.text.includes('FROM PublishedSlip')).every((read) => read.values.at(-1) <= 65));
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

test('a populated All dates archive proves one next row without adjudicating the remaining window', async t => {
  const f = fixture(35, 25), elapsed = [];
  for (let run = 0; run < 12; run++) {
    f.reads.length = 0;
    f.resultBatches.length = 0;
    const start = performance.now();
    const first = await f.store.browse(query({ period: 'all' }), today);
    elapsed.push(performance.now() - start);
    assert.equal(first.slips.length, 20);
    assert.equal(first.browse.nextCursor, `${today}:20`);
    assert.equal(first.statistics, null);
  }
  const resolved = f.resultBatches.reduce((total, count) => total + count, 0);
  const snapshotReads = f.reads.filter(read => read.text.includes('FROM PublishedSlip')).length;
  elapsed.sort((a, b) => a - b);
  t.diagnostic(`875 sealed slips, 12 in-process samples: p50=${Math.round(elapsed[5])}ms p95=${Math.round(elapsed[11])}ms, snapshot queries=${snapshotReads}, adjudicated legs=${resolved}`);
  assert.ok(snapshotReads < bestSlipsQueryRules.scanDays);
  assert.equal(resolved, 21);
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

test('All dates pages retain every adjacent-band historical boundary and civil-day continuation', async () => {
  const f = fixture(35, 4), parents = [];
  for (const original of f.publications) {
    const rows = f.slips.filter(row => row.publicationId === original.id);
    for (const [index, oddsBand] of ['50-100', '100-200'].entries()) {
      const day = original.bodyJson.day, id = slipPublicationIdentity(day, oddsBand);
      const criteria = `dateFrom=${day}&dateTo=${day}&totalMin=${index ? '100.00' : '50.00'}&totalMax=${index ? '200.00' : '100.00'}`;
      parents.push({ ...original, id, oddsBand, bodyJson: { ...original.bodyJson, version: 2, oddsBand, criteria, count: 2 } });
      for (const row of rows.slice(index * 2, index * 2 + 2)) {
        const oldId = row.id;
        row.publicationId = id; row.rank -= index * 2;
        row.snapshotJson.slip.totalOdds = index ? '150.00' : '100.00';
        row.snapshotJson.slip.selections[0].odds = row.snapshotJson.slip.totalOdds;
        row.id = evidenceFingerprint({ publicationId: id, rank: row.rank, snapshot: row.snapshotJson });
        f.legs.filter(leg => leg.slipId === oldId).forEach(leg => { leg.slipId = row.id; });
      }
    }
  }
  f.publications.splice(0, f.publications.length, ...parents);
  const seen = [];
  let cursor;
  for (let page = 1; page <= 8; page++) {
    const result = await f.store.browse(query({ period: 'all', oddsBand: '100-200', page: String(page), ...(cursor ? { cursor } : {}) }), today);
    seen.push(...result.slips);
    if (!result.browse.hasMore) break;
    cursor = result.browse.nextCursor;
  }
  assert.equal(seen.length, 140); assert.equal(new Set(seen.map(row => row.id)).size, 140);
  assert.deepEqual(seen.slice(0, 4).map(row => row.rank), [81, 82, 101, 102]);
  assert.equal(seen.at(-1).publicationDay, addReportingDays(today, -34));
});

test('the browse service retains public counts and releases complete original selections beside locked previews', async () => {
  const f = fixture(), result = await f.store.browse(query(), today), gated = gateBestSlips(result, free);
  assert.equal(gated.slips.length, 4); assert.equal(gated.slips.filter(view => view.slip && view.completed).length, 3);
  assert.equal(gated.slips[0].publicationDay, today); assert.equal(gated.slips[0].outcome, 'won');
  assert.equal(gated.slips.find(view => view.rank === 3).preview[0].pick, null);
  const read = createBestSlipsBrowseService({ read: async (selected, day, _locale, completedOnly) => f.store.browse(selected, day, completedOnly), providerOdds: true, now: () => now });
  const dates = resolveBestSlipsDates(query(), today);
  assert.deepEqual(await read(free, query()), { ...gated, summary: { asOf: now, ...dates, statistics: result.statistics } });
  assert.deepEqual(await read(full, query()), { ...gateBestSlips(result, full), summary: { asOf: now, ...dates, statistics: result.statistics } });
});

test('selected-period summaries retain every outcome while drilldowns change only the list', async () => {
  const f = fixture(7, 8);
  const read = createBestSlipsBrowseService({ read: (selected, day, _locale, completedOnly) => f.store.browse(selected, day, completedOnly),
    providerOdds: true, now: () => now });
  const selected = query({ period: 'custom', from: addReportingDays(today, -6), to: today });
  const baseline = await read(full, selected);
  assert.equal(baseline.summary.statistics.total, 56);
  for (const status of ['all', 'won', 'lost', 'pending', 'void', 'cancelled']) {
    const result = await read(full, { ...selected, status, page: 99 });
    assert.deepEqual(result.summary, baseline.summary);
    assert.equal(result.browse.total, status === 'all' ? 56 : baseline.summary.statistics[status]);
    assert.deepEqual(result.slips, [], 'an empty list page does not erase the period metrics');
  }
  const archive = await read(full, query({ period: 'all', status: 'won' }));
  assert.deepEqual(archive.summary, { asOf: now, from: null, to: null, statistics: null },
    'a bounded archive scan never substitutes today or claims complete archive metrics');
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

test('an unpublished odds range today differs from an empty result filter or archive range', async () => {
  const f = fixture(1, 4);
  const service = createBestSlipsBrowseService({ read: (selected, day, _locale, completedOnly) => f.store.browse(selected, day, completedOnly),
    providerOdds: true, now: () => now });
  const unpublished = await service(full, query({ period: 'today', oddsBand: '10-20' }));
  assert.equal(unpublished.state, 'awaiting-publication');
  assert.deepEqual(unpublished.slips, []);
  assert.equal(unpublished.browse.bandTotal, 0);
  assert.equal(unpublished.browse.dailyBandLimit, undefined);
  const paged = await service(full, query({ period: 'today', page: '2' }));
  assert.equal(paged.state, 'generated');
  assert.deepEqual(paged.slips, []);
  const filtered = await service(full, query({ period: 'today', probMin: '80' }));
  assert.equal(filtered.state, 'generated');
  assert.equal(filtered.statistics.total, 0);
  assert.equal(filtered.browse.bandTotal, 4);
  assert.equal((await service(full, query({ period: 'yesterday' }))).state, 'generated');
});

test('stored probability and match count precede exact cohort totals, settlement and result pagination', async () => {
  const f = fixture(7, 8, false, rank => ({ averageProbability: rank < 5 ? 0.75 : 0.9, totalOdds: '4.00' }));
  for (const row of f.slips.filter(row => row.rank === 6)) {
    const oldId = row.id, slip = row.snapshotJson.slip, original = slip.selections[0];
    const forecast = { ...original.forecast, cycleId: uuid(600000 + f.legs.length), revisionId: uuid(700000 + f.legs.length) };
    const second = { ...original, fixtureId: uuid(500000 + f.legs.length), odds: '2.00', forecast };
    slip.selections = [{ ...original, odds: '2.00' }, second];
    row.id = evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot: row.snapshotJson });
    f.legs.find(leg => leg.slipId === oldId).slipId = row.id;
    f.legs.push({ slipId: row.id, fixtureId: second.fixtureId, cycleId: forecast.cycleId, revisionId: forecast.revisionId });
    f.outcomes.set(second.fixtureId, 'won');
  }
  const result = await f.store.browse(query({ period: 'last7', probMin: '90', matchesMin: '2', matchesMax: '2', status: 'lost' }), today);
  assert.equal(result.browse.bandTotal, 56);
  assert.deepEqual(result.statistics, { total: 7, won: 0, lost: 7, pending: 0, void: 0, cancelled: 0 });
  assert.equal(result.browse.total, 7);
  assert.ok(result.slips.every(view => view.rank === 6 && view.matchCount === 2 && view.averageProbability === 0.9 && view.outcome === 'lost'));
  assert.deepEqual(f.resultBatches, [14]);
  const won = await f.store.browse({ ...result.browse.query, status: 'won' }, today);
  assert.deepEqual(won.statistics, result.statistics);
  assert.equal(won.browse.total, 0);
});

test('modern browsing uses the sealed rank and the exact band before display rounding', async () => {
  const f = fixture(1, 2, false, rank => ({ averageProbability: rank === 1 ? 0.8 : 0.95, totalOdds: rank === 1 ? '5.00' : '4.00' }));
  const parent = f.publications[0], oddsBand = '1.5-5';
  parent.oddsBand = oddsBand;
  parent.id = slipPublicationIdentity(today, oddsBand);
  Object.assign(parent.bodyJson, { version: 3, oddsBand, criteria: `dateFrom=${today}&dateTo=${today}&totalMin=2.50&totalMax=5.00` });
  for (const row of f.slips) {
    const oldId = row.id, snapshot = row.snapshotJson, first = snapshot.slip.selections[0];
    const forecast = { ...first.forecast, cycleId: uuid(610000 + row.rank), revisionId: uuid(620000 + row.rank) };
    const second = { ...first, fixtureId: uuid(630000 + row.rank), forecast };
    const prices = row.rank === 1 ? ['1.44', '3.47'] : ['1.81', '2.21'];
    snapshot.slip.selections = [first, second].map((selection, index) => ({ ...selection, odds: prices[index],
      bookmaker: { id: 1, name: 'Test bookmaker' }, source: 'local-engine', offer: {
        bookmakerId: 1, bookmakerName: 'Test bookmaker', betId: 1, betName: 'Match Winner', providerSelection: 'Home',
        decimal: prices[index], observedAt: parent.bodyJson.publishedAt - 500, checkedAt: parent.bodyJson.publishedAt - 100,
        providerUpdatedAt: null, snapshotId: 'b'.repeat(64), receiptId: 'c'.repeat(64),
      } }));
    snapshot.estimatedProbability = row.rank === 1 ? 0.7 : 0.6;
    row.publicationId = parent.id;
    row.id = evidenceFingerprint({ publicationId: row.publicationId, rank: row.rank, snapshot });
    f.legs.find(leg => leg.slipId === oldId).slipId = row.id;
    f.legs.push({ slipId: row.id, fixtureId: second.fixtureId, cycleId: forecast.cycleId, revisionId: forecast.revisionId });
    f.outcomes.set(second.fixtureId, 'won');
  }
  const lower = await f.store.browse(query({ period: 'today', oddsBand }), today);
  assert.deepEqual(lower.slips.map(view => [view.rank, view.totalOdds, view.estimatedProbability, view.averageProbability]),
    [[1, '5.00', 0.7, 0.8], [2, '4.00', 0.6, 0.95]]);
  assert.ok(lower.slips.every(view => view.slip.selections.every(selection => selection.offer === undefined)));
  assert.equal(lower.browse.bandTotal, 2);
  assert.equal(lower.browse.dailyBandLimit, undefined);
  const filtered = await f.store.browse(query({ period: 'custom', from: today, to: today, oddsBand, probMin: '95' }), today);
  assert.equal(filtered.browse.total, 1);
  assert.equal(filtered.browse.bandTotal, 2);
  assert.equal(filtered.browse.dailyBandLimit, undefined);
  assert.equal((await f.store.browse(query({ period: 'today', oddsBand: '5-10' }), today)).browse.bandTotal, 0);
});

test('hourly records extend v3 and v4 bands with stable ranks, their own publication time and no invented estimates', async () => {
  for (const version of [3, 4]) {
    const f = fixture(1, 2), oddsBand = '1.5-5', parent = f.publications[0];
    const firstAt = now - 2 * 3_600_000 + 15_000, secondAt = firstAt + 3_600_000;
    Object.assign(parent, { id: slipPublicationIdentity(today, oddsBand), oddsBand, publishedAt: new Date(firstAt) });
    Object.assign(parent.bodyJson, { version, oddsBand, publishedAt: firstAt,
      criteria: `dateFrom=${today}&dateTo=${today}&totalMin=2.50&totalMax=5.00`, count: version === 3 ? 1 : 0 });
    if (version === 4) {
      parent.modelId = null;
      parent.bodyJson.model = null;
    }
    const makeBatch = (firstRank, at) => {
      const count = 1, hourAt = Math.floor(at / 3_600_000) * 3_600_000;
      const id = evidenceFingerprint({ kind: 'hourly-best-slip-append', publicationId: parent.id, hourAt });
      return { id, publicationId: parent.id, hourAt: new Date(hourAt), publishedAt: new Date(at), firstRank, count,
        bodyJson: { version: 1, hourAt, publishedAt: at, firstRank, count, searchLimited: false, partialCoverage: false } };
    };
    const firstBatch = version === 4 ? makeBatch(1, firstAt) : null, secondBatch = makeBatch(2, secondAt);
    const rows = f.slips.splice(0);
    for (const [index, row] of rows.entries()) {
      const at = index === 0 ? firstAt : secondAt, batch = index === 0 ? firstBatch : secondBatch;
      const oldId = row.id, leg = f.legs.find(item => item.slipId === oldId), { snapshotJson: snapshot } = row;
      Object.assign(snapshot.slip, { selections: [pricedEditorialSelection(index + 1, {
        fixtureId: leg.fixtureId, cycleId: leg.cycleId, revisionId: leg.revisionId, at, probability: snapshot.slip.averageProbability,
      })] });
      if (batch) {
        delete snapshot.estimatedProbability;
        row.appendBatchId = batch.id;
      }
      row.publicationId = parent.id;
      row.id = evidenceFingerprint({ publicationId: parent.id, rank: row.rank, snapshot });
      leg.slipId = row.id;
    }
    if (firstBatch) f.batches.push(firstBatch);
    f.slips.push(rows[0]);
    const request = query({ period: 'today', oddsBand, status: 'won' });
    const before = await f.store.browse(request, today), first = structuredClone(before.slips[0]);
    f.batches.push(secondBatch);
    f.slips.push(rows[1]);
    const after = await f.store.browse(request, today);
    assert.deepEqual(after.slips, [first]);
    assert.equal(after.browse.total, 1);
    assert.equal(after.browse.bandTotal, 2);
    assert.equal(after.browse.dailyBandLimit, undefined);
    assert.notEqual(after.browse.version, before.browse.version);
    const both = await f.store.browse({ ...request, status: 'all' }, today);
    assert.deepEqual(both.slips.map(view => [view.rank, view.publishedAt]), [[1, firstAt], [2, secondAt]]);
    assert.equal(Object.hasOwn(both.slips[0], 'estimatedProbability'), version === 3);
    assert.equal(Object.hasOwn(both.slips[1], 'estimatedProbability'), false);
    assert.ok(both.slips.every(view => !Object.hasOwn(view.slip.selections[0], 'offer')));
    assert.deepEqual((await f.store.day(today)).slips, both.slips);
    const history = await f.store.history({ from: today, to: today, oddsBand, page: 1, pageSize: 2 });
    assert.deepEqual(history.records.map(view => view.rank), [2, 1]);
    assert.equal(history.records[0].publishedAt, new Date(secondAt).toISOString());
    assert.equal(Object.hasOwn(history.records[0], 'modelId'), false);
    assert.equal(Object.hasOwn(history.records[0], 'estimatedProbability'), false);
    assert.equal(Object.hasOwn(history.records[1], 'modelId'), version === 3);
    rows[1].appendBatchId = 'f'.repeat(64);
    await assert.rejects(f.store.day(today), /unavailable/);
  }
});


test('public completion eligibility precedes statistics, result filtering and every page boundary', async () => {
  const f = fixture(2, 100), rows = [];
  for (const page of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const result = await f.store.browse(query({ period: 'last3', page: String(page) }), today, true);
    assert.equal(result.browse.total, 150); assert.equal(result.statistics.total, 150);
    assert.equal(result.statistics.pending, 0); assert.equal(result.slips.length, page <= 7 ? 20 : page === 8 ? 10 : 0);
    assert.equal(result.browse.hasMore, page < 8);
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

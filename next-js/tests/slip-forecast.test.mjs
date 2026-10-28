import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { savedSlipSnapshotSchema, savedSlipView } from '../src/domain/saved-slips.ts';
import { cycleFromRows, revisionFromRows } from '../src/server/predictions/history-read.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { bindSlipForecasts, projectSlipForecastResult, readSlipForecastResults, slipForecastReadRules } from '../src/server/slips/slip-forecast.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

function transaction(f) {
  return { footballFixture: { findMany: async () => [f.fixture] }, predictionCycle: { findUnique: async () => f.cycle },
    predictionSchedule: { findUnique: async () => f.schedule }, $queryRaw: async (query) => {
      const sql = Array.isArray(query) ? query.join('?') : query.sql;
      if (sql.includes('FOR SHARE')) return [{ id: f.fixture.id }];
      if (sql.includes('FROM PredictionSet')) return [f.row];
      if (sql.includes('FROM MarketPrediction')) return f.marketRows;
      throw new Error('Unexpected query');
    } };
}
function bound(f) {
  return { ...f.slip.selections[0], forecast: { cycleId: f.cycle.id, revisionId: f.row.id, publishedAt: f.row.publishedAt.getTime() } };
}
function projection(f, changes = {}) {
  const at = f.cycle.cutoffAt.getTime(), closed = { ...f.cycle, state: 'closed', closedAt: new Date(at), lockedAt: new Date(at), lockedSetId: randomUUID() };
  const cycle = cycleFromRows(closed, f.schedule), revision = revisionFromRows(f.row, f.marketRows);
  return { fixture: f.fixture, cycle, revision, result: null, historical: null, asOf: at + 3_600_000,
    schedules: [{ version: 1, kickoffAt: f.schedule.kickoffAt.getTime(), cutoffAt: at,
      observedAt: f.schedule.observedAt.getTime(), actualStartedAt: null }], ...changes };
}

test('server binding preserves the exact published revision and refuses source drift, expired cutoff or foreign supplied identity', async () => {
  const f = slipForecastFixture(), tx = transaction(f);
  const result = await bindSlipForecasts(tx, f.slip, f.at);
  assert.deepEqual(result.selections[0], bound(f));
  assert.ok(savedSlipSnapshotSchema.safeParse(result).success);
  assert.equal(await bindSlipForecasts(tx, { ...f.slip, selections: [{ ...f.slip.selections[0], probability: 0.8 }] }, f.at), null);
  assert.equal(await bindSlipForecasts(tx, { ...f.slip, selections: [{ ...bound(f), forecast: { ...bound(f).forecast, revisionId: randomUUID() } }] }, f.at), null);
  assert.equal(await bindSlipForecasts(tx, f.slip, f.cycle.cutoffAt.getTime()), null);
  f.fixture.status = 'live';
  assert.equal(await bindSlipForecasts(tx, f.slip, f.at), null);
});

test('a formally void original cycle remains public and void while its replacement is live', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const cycle = { ...input.cycle, state: 'void', voidedAt: input.asOf - 1000, voidReason: 'formal-postponement' };
  const outcome = projectSlipForecastResult(selection, { ...input, cycle,
    fixture: { ...f.fixture, activeCycleId: randomUUID(), status: 'live' } });
  assert.equal(outcome.completed, true);
  const view = savedSlipView('saved', '', { ...f.slip, selections: [selection] }, [outcome]);
  assert.equal(view.outcome, 'void'); assert.equal(view.slip.selections[0].probability, 0.7);
  assert.equal(view.slip.selections[0].odds, '2.00');
});

test('a superseded but cutoff-eligible saved selection is graded unchanged; a replacement cycle score cannot grade it', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const result = { id: 'a'.repeat(64), fixtureId: f.fixture.id, observedAt: input.asOf - 1000,
    status: 'finished-regulation', regulationVerifiedAt: input.asOf - 1000,
    regulation: { verified: true, home: 2, away: 1, evidenceRef: 'synthetic-proof' } };
  const fixture = { ...f.fixture, status: 'finished-regulation', regulationHome: 2, regulationAway: 1,
    regulationVerifiedAt: new Date(result.regulationVerifiedAt), regulationEvidenceRef: 'synthetic-proof' };
  const outcome = projectSlipForecastResult(selection, { ...input, fixture, result });
  assert.equal(savedSlipView('saved', '', { ...f.slip, selections: [selection] }, [outcome]).outcome, 'won');
  const replaced = { ...fixture, activeCycleId: randomUUID(), status: 'live' };
  assert.equal(projectSlipForecastResult(selection, { ...input, fixture: replaced, result }).completed, false);
  const historical = projectSlipForecastResult(selection, { ...input, fixture: replaced, result: null,
    historical: { result, terminalVoid: false } });
  assert.equal(savedSlipView('saved', '', { ...f.slip, selections: [selection] }, [historical]).outcome, 'won');
  const correction = projectSlipForecastResult(selection, { ...input, fixture: replaced, result: null,
    historical: { result: null, terminalVoid: false, completed: true } });
  assert.equal(savedSlipView('saved', '', { ...f.slip, selections: [selection] }, [correction]).outcome, 'pending');
  assert.equal(correction.regulationHome, null, 'pending corrections cannot reuse a prior winning score');
});

test('desktop progress uses only coherent original-cycle live scores and provider clocks', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const fixture = { ...f.fixture, status: 'live' };
  const result = { fixtureId: fixture.id, observedAt: input.asOf - 1000, status: 'live', providerStatus: '1H', elapsedMinutes: 30,
    reportedGoals: { home: 1, away: 0 }, regulationVerifiedAt: null,
    regulation: { verified: false, home: null, away: null, evidenceRef: null } };
  const live = projectSlipForecastResult(selection, { ...input, fixture, result });
  assert.deepEqual(live.progress, { score: { home: 1, away: 0 }, liveClock: { phase: 'first-half', minute: 30 } });
  assert.equal(live.completed, false); assert.equal(live.regulationVerified, false);
  const halfTime = projectSlipForecastResult(selection, { ...input, fixture, result: { ...result, providerStatus: 'HT', elapsedMinutes: 45 } });
  assert.deepEqual(halfTime.progress.liveClock, { phase: 'half-time', minute: null });
  const missingScore = projectSlipForecastResult(selection, { ...input, fixture,
    result: { ...result, reportedGoals: { home: null, away: null } } });
  assert.equal(missingScore.progress.score, null);
  assert.deepEqual(missingScore.progress.liveClock, { phase: 'first-half', minute: 30 }, 'a coherent clock remains available without a score');
  const incoherent = projectSlipForecastResult(selection, { ...input, fixture,
    result: { ...result, regulation: { ...result.regulation, home: 4 } } });
  assert.equal(incoherent.progress.score, null); assert.equal(incoherent.progress.liveClock, null);
  const replacement = projectSlipForecastResult(selection, { ...input, fixture: { ...fixture, activeCycleId: randomUUID() }, result });
  assert.equal(replacement.progress, undefined, 'replacement live data never populates the original cycle');
});

test('open, foreign, future or altered snapshot bindings never expose a completed slip', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f), snapshot = { ...f.slip, selections: [selection] };
  for (const change of [{ cycle: { ...input.cycle, state: 'open' } }, { cycle: { ...input.cycle, id: randomUUID() } },
    { asOf: f.at - 60_000 }, { revision: { ...input.revision, publishedAt: input.revision.publishedAt + 1 } }]) {
    assert.equal(savedSlipView('saved', '', snapshot, [projectSlipForecastResult(selection, { ...input, ...change })]), null);
  }
  assert.equal(savedSlipSnapshotSchema.safeParse({ ...snapshot, selections: [{ ...selection, forecast: { ...selection.forecast, revisionId: 'fabricated' } }] }).success, false);
});

test('a saved revision invalidated by an earlier kickoff is void instead of graded from later scores', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const outcome = projectSlipForecastResult(selection, { ...input, cycle: { ...input.cycle, closedAt: input.revision.publishedAt } });
  assert.equal(outcome.cycleEligibility.reason, 'cutoff-invalidated');
  assert.equal(savedSlipView('saved', '', { ...f.slip, selections: [selection] }, [outcome]).outcome, 'void');
});

test('flattened result batches distinguish the same fixture with different original outcomes or cycles', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const voidResult = projectSlipForecastResult(selection, { ...input,
    cycle: { ...input.cycle, state: 'void', voidedAt: input.asOf - 1000, voidReason: 'formal-postponement' } });
  const draw = { ...selection, selection: 'draw', probability: 0.2 };
  const drawResult = { ...voidResult, selection: 'draw', completed: false };
  assert.equal(savedSlipView('draw', '', { ...f.slip, selections: [draw], averageProbability: 0.2 }, [voidResult, drawResult]), null);
  const later = { ...selection, forecast: { ...selection.forecast, cycleId: randomUUID() } };
  assert.equal(savedSlipView('later', '', { ...f.slip, selections: [later] }, [voidResult]), null);
});

test('duplicate void-cycle selections reuse sealed cycle/revision reads without consulting a replacement result', async () => {
  const f = slipForecastFixture(), tx = transaction(f), at = f.cycle.cutoffAt.getTime();
  f.cycle = { ...f.cycle, state: 'void', closedAt: new Date(at), voidedAt: new Date(at), voidReason: 'formal-postponement' };
  f.fixture = { ...f.fixture, status: 'live', activeCycleId: randomUUID() };
  const selections = [bound(f), { ...bound(f), selection: 'draw', probability: 0.2 }];
  const results = await readSlipForecastResults(tx, selections, at + 1000);
  assert.equal(results.length, 2); assert.ok(results.every(result => result.completed && result.cycleEligibility.eligible === false));
});

test('a latest pending correction keeps old-cycle history public without reviving its old winning score', async () => {
  const f = slipForecastFixture(), tx = transaction(f), at = f.cycle.cutoffAt.getTime();
  f.cycle = { ...f.cycle, state: 'closed', closedAt: new Date(at), lockedAt: new Date(at), lockedSetId: f.row.id };
  f.fixture = { ...f.fixture, status: 'live', activeCycleId: randomUUID() };
  tx.predictionSchedule.findMany = async () => [f.schedule];
  function settlement(id, status, previousId, stamp) {
    const base = { fixtureId: f.fixture.id, cycleId: f.cycle.id, family: 'match-result', ruleVersion: f.row.ruleVersion,
      lockedSetId: f.row.id, selection: 'home-win', source: 'ai', selectedProbability: 0.7,
      resultId: status === 'correct' ? 'a'.repeat(64) : null, resultUsable: status === 'correct', status,
      reason: status === 'correct' ? 'selection-occurred' : 'awaiting-final-result', cycleState: 'closed', voidReason: null };
    const body = { ...base, id, previousId, batchId: 'b'.repeat(64), inputHash: evidenceFingerprint(base), at: stamp,
      correctedAt: null, kind: previousId ? 'transition' : 'initial' };
    return { ...body, at: new Date(stamp), body: evidenceSerialize(body), validIntegrity: 1 };
  }
  const anchor = settlement('c'.repeat(64), 'correct', null, at + 1000);
  const latest = settlement('d'.repeat(64), 'pending', anchor.id, at + 2000);
  tx.marketSettlementRevision = { findFirst: async ({ where }) => {
    assert.equal('status' in where, false, 'settlement statuses live in sealed JSON, not an invented SQL column');
    return { id: latest.id };
  } };
  const originalRaw = tx.$queryRaw;
  tx.$queryRaw = async (query, ...values) => {
    const sql = Array.isArray(query) ? query.join('?') : query.sql;
    assert.equal(sql.includes('FROM FixtureResult'), false, 'a pending correction must not reload the prior winning score');
    if (sql.includes("JSON_EXTRACT(body,'$.status')")) return [{ id: anchor.id }];
    if (sql.includes('FROM MarketSettlementRevision WHERE id')) return [values[0] === latest.id ? latest : anchor];
    return originalRaw(query, ...values);
  };
  const selection = bound(f), results = await readSlipForecastResults(tx, [selection], at + 3000);
  assert.equal(results[0].completed, true); assert.equal(results[0].regulationHome, null);
  assert.equal(savedSlipView('saved', '', { ...f.slip, selections: [selection] }, results).outcome, 'pending');
  latest.validIntegrity = 0;
  await assert.rejects(readSlipForecastResults(tx, [selection], at + 3000), error => error.reason === 'invalid-state');
});

test('archive-sized mixed-cycle reads batch sealed forecasts across the chunk boundary and preserve each original result', async () => {
  const sources = Array.from({ length: slipForecastReadRules.batchSize + 1 }, () => slipForecastFixture());
  const at = sources[0].cycle.cutoffAt.getTime();
  sources.forEach((source, index) => {
    if (index % 3 === 0) {
      source.cycle = { ...source.cycle, state: 'void', closedAt: new Date(at), voidedAt: new Date(at), voidReason: 'formal-postponement' };
      source.fixture = { ...source.fixture, activeCycleId: randomUUID(), status: 'live' };
    } else if (index % 3 === 1) {
      source.cycle = { ...source.cycle, state: 'closed', closedAt: new Date(at), lockedAt: new Date(at), lockedSetId: source.row.id };
      source.fixture.status = 'finished-regulation';
    }
  });
  const counts = { fixtures: 0, cycles: 0, schedules: 0, revisions: 0, markets: 0 }, missing = new Set();
  let corruptMarket = false;
  const tx = {
    footballFixture: { findMany: async () => { counts.fixtures++; return sources.map(source => source.fixture); } },
    predictionCycle: { findUnique: async () => assert.fail('bulk cycle misses must be cached'), findMany: async ({ where }) => {
      counts.cycles++; assert.ok(where.id.in.length <= slipForecastReadRules.batchSize);
      return sources.filter(source => where.id.in.includes(source.cycle.id) && !missing.has(source.cycle.id)).map(source => source.cycle);
    } },
    predictionSchedule: { findUnique: async () => assert.fail('bulk schedules require no per-cycle read'), findMany: async ({ where }) => {
      counts.schedules++; assert.ok(where.cycleId.in.length <= slipForecastReadRules.batchSize);
      return sources.filter(source => where.cycleId.in.includes(source.cycle.id) && !missing.has(source.cycle.id)).map(source => source.schedule).reverse();
    } },
    marketSettlementRevision: { findFirst: async () => assert.fail('a void replacement never inherits current result evidence') },
    $queryRaw: async query => {
      assert.ok(query.values.length <= slipForecastReadRules.batchSize);
      const selected = sources.filter(source => query.values.includes(source.row.id) && !missing.has(source.row.id));
      if (query.sql.includes('FROM PredictionSet')) { counts.revisions++; return selected.map(source => source.row); }
      if (query.sql.includes('FROM MarketPrediction')) {
        counts.markets++;
        return [...selected.flatMap(source => source.marketRows), ...(corruptMarket ? [{ ...sources[0].marketRows[0], setId: randomUUID() }] : [])];
      }
      assert.fail('No current result query is needed for absent result pointers');
    },
  };
  const selections = [...sources.map(bound), { ...bound(sources[0]), selection: 'draw', probability: 0.2 },
    { ...bound(sources[0]), family: 'total-goals', selection: 'over-2.5', probability: 0.6 }, sources[1].slip.selections[0]];
  const results = await readSlipForecastResults(tx, selections, at + 1000);
  assert.deepEqual(counts, { fixtures: 1, cycles: 2, schedules: 2, revisions: 2, markets: 2 });
  assert.equal(results.length, selections.length);
  sources.forEach((source, index) => {
    assert.deepEqual(results[index].forecast, bound(source).forecast);
    assert.equal(results[index].completed, index % 3 !== 2);
    if (index % 3 === 0) assert.equal(results[index].cycleEligibility.eligible, false);
    else assert.equal(results[index].regulationVerified, false);
  });
  assert.equal(results.at(-1).forecast, undefined, 'legacy snapshots stay unbound');
  assert.equal(results.at(-1).completed, true);
  sources[0].row.validIntegrity = 0;
  await assert.rejects(readSlipForecastResults(tx, selections, at + 1000), error => error.reason === 'invalid-state');
  sources[0].row.validIntegrity = 1;
  corruptMarket = true;
  await assert.rejects(readSlipForecastResults(tx, selections, at + 1000), error => error.reason === 'invalid-state');
  corruptMarket = false;
  missing.add(sources[0].cycle.id); missing.add(sources[0].row.id);
  assert.equal((await readSlipForecastResults(tx, selections, at + 1000))[0].completed, false);
});

test('forecast history rejects more than the supported 31-day publication range before any database read', async () => {
  assert.equal(slipForecastReadRules.maximumSelections, 31 * 100 * 8);
  const source = slipForecastFixture(), selections = Array.from({ length: slipForecastReadRules.maximumSelections + 1 }, () => bound(source));
  const tx = { footballFixture: { findMany: async () => assert.fail('oversized history must not reach storage') } };
  await assert.rejects(readSlipForecastResults(tx, selections, source.at), error => error.reason === 'invalid-request');
});

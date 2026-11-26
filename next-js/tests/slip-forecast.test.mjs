import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { liveGoalMarketDefinitions } from '../src/domain/goal-market-definitions.ts';
import { slipHeaderState } from '../src/components/slips/slip-header-outcome.ts';
import { slipMatchStatesFromResults } from '../src/domain/slip-match-state.ts';
import { slipCompleted, slipSnapshotSchema, slipResultView, slipSnapshotStatus } from '../src/domain/slip-snapshot.ts';
import { cycleFromRows, revisionFromRows } from '../src/server/predictions/history-read.ts';
import { goalMarketExtensionFromRow, prepareGoalMarketExtension } from '../src/server/predictions/goal-market-store.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { bindSlipForecasts, projectSlipForecastResult, readSlipForecastResults, slipForecastReadRules } from '../src/server/slips/slip-forecast.ts';
import { projectSlipTotal15Forecast } from '../src/server/slips/slip-goal-forecast.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';
import { pricedEditorialSelection } from './helpers/best-slip-publication-fixtures.mjs';

function transaction(f) {
  return { footballFixture: { findMany: async () => [f.fixture] }, predictionCycle: { findUnique: async () => f.cycle },
    predictionSchedule: { findUnique: async () => f.schedule }, $queryRaw: async (query) => {
      const sql = Array.isArray(query) ? query.join('?') : query.sql;
      if (sql.includes('LOCK IN SHARE MODE')) return [{ id: f.fixture.id }];
      if (sql.includes('FROM PredictionSet')) return [f.row];
      if (sql.includes('FROM MarketPrediction')) return f.marketRows;
      if (sql.includes('FROM GoalMarketExtension')) return f.goalExtension ? [f.goalExtension] : [];
      if (sql.includes('FROM PredictionPublicationBarrier')) return f.barrier ? [f.barrier] : [];
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
  assert.ok(slipSnapshotSchema.safeParse(result).success);
  assert.equal(await bindSlipForecasts(tx, { ...f.slip, selections: [{ ...f.slip.selections[0], probability: 0.8 }] }, f.at), null);
  assert.equal(await bindSlipForecasts(tx, { ...f.slip, selections: [{ ...bound(f), forecast: { ...bound(f).forecast, revisionId: randomUUID() } }] }, f.at), null);
  assert.equal(await bindSlipForecasts(tx, f.slip, f.cycle.cutoffAt.getTime()), null);
  f.fixture.status = 'live';
  assert.equal(await bindSlipForecasts(tx, f.slip, f.at), null);
});

test('editorial binding excludes an observed start while the current fixture still says scheduled', async () => {
  const f = slipForecastFixture({ localQualification: 'qualified' }), selection = bound(f), tx = transaction(f);
  const { offer } = pricedEditorialSelection(1, { odds: selection.odds, at: f.at });
  const editorial = { ...f.slip, selections: [{ ...selection, offer }] };
  assert.ok(await bindSlipForecasts(tx, editorial, f.at));
  f.fixture.lifecycleState = { issue: null, actualStartedAt: new Date(f.at - 1_000) };
  assert.equal(await bindSlipForecasts(tx, editorial, f.at), null);

  f.cycle.ordinal = 2;
  assert.equal(await bindSlipForecasts(tx, editorial, f.at), null);
  f.fixture.lifecycleState.actualStartedAt = new Date(f.cycle.openedAt.getTime() - 1);
  assert.ok(await bindSlipForecasts(tx, editorial, f.at), 'a historical start from an earlier occurrence does not block the replacement');
});

test('an editorial quote cannot publish after a sealed early-play barrier or a postponement', async () => {
  const f = slipForecastFixture({ localQualification: 'qualified' }), selection = bound(f), tx = transaction(f);
  const { offer } = pricedEditorialSelection(1, { odds: selection.odds, at: f.at });
  const editorial = { ...f.slip, selections: [{ ...selection, offer }] };
  assert.ok(await bindSlipForecasts(tx, editorial, f.at));
  const clock = f.at - 1000;
  const observation = { provider: 'api-football', fixtureId: f.fixture.id, externalFixtureId: 1, cycleId: f.cycle.id,
    kickoffAt: selection.kickoffAt, status: 'live', retrievedAt: f.at, providerUpdatedAt: null, actualStartedAt: clock,
    evidenceRef: 'synthetic-early-play' };
  f.barrier = { fixtureId: f.fixture.id, cycleId: f.cycle.id, observationJson: evidenceSerialize(observation), validIntegrity: 1,
    closedAt: new Date(clock), recordedAt: new Date(f.at) };
  assert.equal(await bindSlipForecasts(tx, editorial, f.at), null);
  f.barrier = null;
  f.fixture.kickoff = new Date(selection.kickoffAt + 86_400_000);
  assert.equal(await bindSlipForecasts(tx, editorial, f.at), null);
});

test('the editorial binder requires numerical qualification on the exact original revision while custom slips retain their existing source rules', async () => {
  for (const localQualification of [undefined, 'unqualified', 'qualified']) {
    const f = slipForecastFixture({ localQualification }), selection = bound(f), tx = transaction(f);
    assert.ok(await bindSlipForecasts(tx, f.slip, f.at));
    const { offer } = pricedEditorialSelection(1, { odds: selection.odds, at: f.at });
    const editorial = { ...f.slip, selections: [{ ...selection, offer }] };
    assert.equal(Boolean(await bindSlipForecasts(tx, editorial, f.at)), localQualification === 'qualified');
  }
});

test('an exact sealed Total 1.5 extension still needs a numerically qualified parent total-goals family', async () => {
  for (const localQualification of ['unqualified', 'qualified']) {
    const f = slipForecastFixture({ localQualification }), parent = bound(f), tx = transaction(f);
    const prepared = prepareGoalMarketExtension({ localPoisson: f.candidate.markets['total-goals'].provenance.rates,
      definitions: liveGoalMarketDefinitions });
    const sealed = { ...prepared, cycleId: parent.forecast.cycleId, revisionId: parent.forecast.revisionId,
      fixtureId: parent.fixtureId, contentHash: evidenceFingerprint(prepared), recordedAt: parent.forecast.publishedAt };
    f.goalExtension = { ...sealed, body: sealed, validIntegrity: 1, recordedAt: new Date(sealed.recordedAt) };
    const total15 = projectSlipTotal15Forecast(goalMarketExtensionFromRow(f.goalExtension), parent.fixtureId, parent.kickoffAt, parent.forecast, f.at);
    const { offer, bookmaker } = pricedEditorialSelection(1, { odds: parent.odds, at: f.at });
    const selection = { ...parent, family: 'total-goals', selection: 'over-1.5', probability: total15.probabilities['over-1.5'], bookmaker,
      offer: { ...offer, betId: 5, betName: 'Goals Over/Under', providerSelection: 'Over 1.5' } };
    const editorial = { ...f.slip, selections: [selection], averageProbability: selection.probability };
    assert.equal(Boolean(await bindSlipForecasts(tx, editorial, f.at)), localQualification === 'qualified');
    f.goalExtension = undefined;
    assert.equal(await bindSlipForecasts(tx, editorial, f.at), null);
  }
});

test('a formally void original cycle retains its adjudication but remains private while its replacement is live', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const cycle = { ...input.cycle, state: 'void', voidedAt: input.asOf - 1000, voidReason: 'formal-postponement' };
  const outcome = projectSlipForecastResult(selection, { ...input, cycle,
    fixture: { ...f.fixture, activeCycleId: randomUUID(), status: 'live' } });
  assert.equal(outcome.completed, true);
  assert.equal(outcome.status, 'unknown', 'saved slips retain their existing result projection');
  assert.equal(outcome.fixtureCompleted, false);
  assert.equal(slipCompleted({ ...f.slip, selections: [selection] }, [outcome]), false);
  const view = slipResultView('saved', '', { ...f.slip, selections: [selection] }, [outcome]);
  assert.equal(view.outcome, 'void'); assert.equal(view.slip.selections[0].probability, 0.7);
  assert.equal(view.slip.selections[0].odds, '2.00');
});

test('published slip status expires at kickoff or after schedule drift without settlement or snapshot changes', () => {
  const early = slipForecastFixture(), late = slipForecastFixture({ at: early.at + 3_600_000 });
  const selections = [bound(early), bound(late)], snapshot = { ...early.slip, selections, totalOdds: '4.00' };
  const sealed = structuredClone(snapshot), kickoff = selections[0].kickoffAt;
  const display = (asOf, changes = {}) => {
    const results = [projectSlipForecastResult(selections[0], projection(early, { asOf, editorial: true, ...changes })),
      projectSlipForecastResult(selections[1], { ...projection(late), asOf, editorial: true, cycle: cycleFromRows(late.cycle, late.schedule) })];
    const status = slipSnapshotStatus(snapshot, results);
    const states = slipMatchStatesFromResults(selections, results);
    assert.deepEqual(slipHeaderState(snapshot, undefined, states), { status, outcome: 'pending' });
    assert.equal(slipCompleted(snapshot, results), false);
    assert.deepEqual(snapshot, sealed);
    return { status, states };
  };

  assert.equal(display(kickoff - 1).status, 'not-started');
  const overdue = display(kickoff);
  assert.deepEqual(overdue.states.map(({ status }) => status), ['unknown', 'scheduled']);
  assert.equal(overdue.status, 'pending');
  assert.equal(display(kickoff, { editorial: false }).status, 'not-started', 'personal slip observations are unchanged');
  assert.equal(display(kickoff + 1, { fixture: { ...early.fixture, status: 'live' } }).status, 'in-progress');
  assert.equal(display(kickoff - 1, { fixture: { ...early.fixture, kickoff: new Date(kickoff + 3_600_000) } }).status, 'pending');
  assert.equal(display(kickoff - 1, { fixture: { ...early.fixture,
    lifecycleState: { issue: null, actualStartedAt: new Date(kickoff - 60_000) } } }).status, 'pending');
  assert.equal(display(kickoff - 1, { cycle: { ...projection(early).cycle, ordinal: 2 }, fixture: { ...early.fixture,
    lifecycleState: { issue: null, actualStartedAt: new Date(early.at - 86_400_000) } } }).status, 'not-started');
});

test('an editorial read uses sealed early-play evidence before the canonical scheduled status changes', async () => {
  const f = slipForecastFixture(), selection = bound(f), tx = transaction(f);
  const { fixtureId, kickoffAt, forecast: { cycleId } } = selection;
  const snapshot = { ...f.slip, selections: [selection] };
  const observation = { provider: 'api-football', fixtureId, externalFixtureId: 1, cycleId, kickoffAt, status: 'live',
    retrievedAt: f.at, providerUpdatedAt: null, actualStartedAt: f.at - 1000, evidenceRef: 'synthetic-early-play' };
  f.barrier = { cycleId, fixtureId, observationJson: evidenceSerialize(observation), validIntegrity: 1,
    closedAt: new Date(observation.actualStartedAt), recordedAt: new Date(f.at) };
  let barrierReads = 0;
  const queryRaw = tx.$queryRaw;
  tx.$queryRaw = async (query) => {
    if (query.sql?.includes('FROM PredictionPublicationBarrier')) barrierReads++;
    return queryRaw(query);
  };
  const read = (asOf, editorial) => readSlipForecastResults(tx, [selection], asOf, { editorial });
  assert.equal(slipSnapshotStatus(snapshot, await read(f.at - 1, true)), 'not-started', 'future receipts are ignored');
  const current = await read(f.at, true);
  assert.equal(current[0].preMatchUnavailable, true);
  assert.equal(slipSnapshotStatus(snapshot, current), 'pending');
  assert.equal(slipSnapshotStatus(snapshot, await read(f.at, false)), 'not-started');
  assert.equal(slipSnapshotStatus(snapshot, await read(kickoffAt, true)), 'pending');
  assert.equal(barrierReads, 2, 'personal and past-kickoff reads do not need barrier lookups');
});

test('sealed cancellation, postponement and other terminal decisions retain their original phase', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const snapshot = { ...f.slip, selections: [selection] };
  for (const [voidReason, status, slipStatus] of [['fixture-canceled', 'canceled', 'cancelled'], ['formal-postponement', 'postponed', 'void'],
    ['fixture-abandoned', 'abandoned', 'void'], ['fixture-awarded', 'awarded', 'void']]) {
    if (status === 'canceled' || status === 'postponed') {
      const observed = projectSlipForecastResult(selection, { ...input, cycle: cycleFromRows(f.cycle, f.schedule),
        editorial: true, fixture: { ...f.fixture, status } });
      assert.equal(observed.status, status);
      assert.equal(observed.completed, false);
      assert.equal(slipSnapshotStatus(snapshot, [observed]), 'pending');
      assert.equal(slipResultView('original', '', snapshot, [observed]), null);
    }
    const cycle = { ...input.cycle, state: 'void', voidedAt: input.asOf - 1000, voidReason };
    const outcome = projectSlipForecastResult(selection, { ...input, cycle, editorial: true,
      fixture: { ...f.fixture, status: 'scheduled', activeCycleId: randomUUID(), kickoff: new Date(selection.kickoffAt + 86_400_000) } });
    const history = slipResultView('original', '', snapshot, [outcome]);
    assert.equal(outcome.status, status);
    assert.equal(outcome.fixtureCompleted, false);
    assert.equal(history.status, slipStatus);
    assert.equal(history.outcome, 'void');
    assert.equal(history.slip.totalOdds, snapshot.totalOdds);
    assert.deepEqual(history.slip.selections, snapshot.selections);
  }
});

test('a superseded but cutoff-eligible saved selection is graded unchanged; a replacement cycle score cannot grade it', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const result = { id: 'a'.repeat(64), fixtureId: f.fixture.id, observedAt: input.asOf - 1000,
    status: 'finished-regulation', regulationVerifiedAt: input.asOf - 1000,
    regulation: { verified: true, home: 2, away: 1, evidenceRef: 'synthetic-proof' } };
  const fixture = { ...f.fixture, status: 'finished-regulation', regulationHome: 2, regulationAway: 1,
    regulationVerifiedAt: new Date(result.regulationVerifiedAt), regulationEvidenceRef: 'synthetic-proof' };
  const outcome = projectSlipForecastResult(selection, { ...input, fixture, result });
  assert.equal(slipResultView('saved', '', { ...f.slip, selections: [selection] }, [outcome]).outcome, 'won');
  const correctedTeams = projectSlipForecastResult(selection, { ...input, fixture: { ...fixture, homeTeamId: randomUUID() }, result, editorial: true });
  assert.equal(correctedTeams.preMatchUnavailable, true);
  assert.equal(slipResultView('original', '', { ...f.slip, selections: [selection] }, [correctedTeams]), null);
  const replaced = { ...fixture, activeCycleId: randomUUID(), status: 'live' };
  assert.equal(projectSlipForecastResult(selection, { ...input, fixture: replaced, result }).completed, false);
  const historical = projectSlipForecastResult(selection, { ...input, fixture: replaced, result: null,
    historical: { result, terminalVoid: false } });
  assert.equal(slipResultView('saved', '', { ...f.slip, selections: [selection] }, [historical]).outcome, 'won');
  const correction = projectSlipForecastResult(selection, { ...input, fixture: replaced, result: null,
    historical: { result: null, terminalVoid: false, completed: true } });
  assert.equal(slipResultView('saved', '', { ...f.slip, selections: [selection] }, [correction]).outcome, 'pending');
  assert.equal(correction.regulationHome, null, 'pending corrections cannot reuse a prior winning score');
});

test('desktop progress uses only coherent original-cycle live scores and provider clocks', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const fixture = { ...f.fixture, status: 'live' };
  const result = { fixtureId: fixture.id, observedAt: input.asOf - 1000, status: 'live', providerStatus: '1H', elapsedMinutes: 30,
    reportedGoals: { home: 1, away: 0 }, regulationVerifiedAt: null,
    regulation: { verified: false, home: null, away: null, evidenceRef: null } };
  const live = projectSlipForecastResult(selection, { ...input, fixture, result });
  assert.deepEqual(live.progress, { score: { home: 1, away: 0 }, liveClock: { phase: 'first-half', minute: 30, observedAt: result.observedAt } });
  assert.equal(live.completed, false); assert.equal(live.regulationVerified, false);
  const halfTime = projectSlipForecastResult(selection, { ...input, fixture, result: { ...result, providerStatus: 'HT', elapsedMinutes: 45 } });
  assert.deepEqual(halfTime.progress.liveClock, { phase: 'half-time', minute: null });
  const missingScore = projectSlipForecastResult(selection, { ...input, fixture,
    result: { ...result, reportedGoals: { home: null, away: null } } });
  assert.equal(missingScore.progress.score, null);
  assert.deepEqual(missingScore.progress.liveClock, { phase: 'first-half', minute: 30, observedAt: result.observedAt }, 'a coherent clock remains available without a score');
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
    assert.equal(slipResultView('saved', '', snapshot, [projectSlipForecastResult(selection, { ...input, ...change })]), null);
  }
  assert.equal(slipSnapshotSchema.safeParse({ ...snapshot, selections: [{ ...selection, forecast: { ...selection.forecast, revisionId: 'fabricated' } }] }).success, false);
});

test('a saved revision invalidated by an earlier kickoff is void instead of graded from later scores', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const outcome = projectSlipForecastResult(selection, { ...input, cycle: { ...input.cycle, closedAt: input.revision.publishedAt } });
  assert.equal(outcome.cycleEligibility.reason, 'cutoff-invalidated');
  assert.equal(slipResultView('saved', '', { ...f.slip, selections: [selection] }, [outcome]).outcome, 'void');
});

test('flattened result batches distinguish the same fixture with different original outcomes or cycles', () => {
  const f = slipForecastFixture(), selection = bound(f), input = projection(f);
  const voidResult = projectSlipForecastResult(selection, { ...input,
    cycle: { ...input.cycle, state: 'void', voidedAt: input.asOf - 1000, voidReason: 'formal-postponement' } });
  const draw = { ...selection, selection: 'draw', probability: 0.2 };
  const drawResult = { ...voidResult, selection: 'draw', completed: false };
  assert.equal(slipResultView('draw', '', { ...f.slip, selections: [draw], averageProbability: 0.2 }, [voidResult, drawResult]), null);
  const later = { ...selection, forecast: { ...selection.forecast, cycleId: randomUUID() } };
  assert.equal(slipResultView('later', '', { ...f.slip, selections: [later] }, [voidResult]), null);
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
  assert.equal(slipResultView('saved', '', { ...f.slip, selections: [selection] }, results).outcome, 'pending');
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

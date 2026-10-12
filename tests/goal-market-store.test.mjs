import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { goalAsianHandicapMarket, goalResultMarket, goalTotalsMarket } from '../src/domain/goal-market-definitions.ts';
import { SCORE_DISTRIBUTION_VERSION } from '../src/domain/score-distribution.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { goalMarketExtensionFromRow, goalMarketSettlementFromRow, goalMarketSettlementRevisionSchema,
  parseGoalMarketExtensionInput, prepareGoalMarketExtension, projectGoalMarketSettlements } from '../src/server/predictions/goal-market-store.ts';
import { PredictionHistoryError } from '../src/server/predictions/history-contract.ts';

const at = Date.parse('2026-10-12T08:00:00Z'), fixtureId = randomUUID(), cycleId = randomUUID(), revisionId = randomUUID();
const denied = (reason) => (error) => error instanceof PredictionHistoryError && error.reason === reason;
const distribution = () => ({ version: SCORE_DISTRIBUTION_VERSION, unrepresentedProbability: 0, states: [
  { home: 0, away: 0, halfHome: 0, halfAway: 0, probability: .1 },
  { home: 1, away: 0, halfHome: 0, halfAway: 0, probability: .2 },
  { home: 2, away: 1, halfHome: 1, halfAway: 0, probability: .3 },
  { home: 0, away: 2, halfHome: 0, halfAway: 1, probability: .4 },
] });
const extension = (input = { scoreDistribution: distribution(), definitions: [goalResultMarket(), goalResultMarket('half-time'), goalAsianHandicapMarket(-.25)] }) => {
  const prepared = prepareGoalMarketExtension(input);
  return { ...prepared, fixtureId, cycleId, revisionId, recordedAt: at, contentHash: evidenceFingerprint(prepared) };
};
const cycle = (overrides = {}) => ({ fixtureId, id: cycleId, state: 'closed', lockedSetId: revisionId, voidReason: null, ...overrides });
const context = (overrides = {}) => ({ status: 'finished-regulation', cycleEligibility: { eligible: true },
  regulationScore: { verified: true, period: 'regulation-including-stoppage-time', home: 1, away: 0 }, halfTimeScore: null, ...overrides });
const row = (body) => ({ ...body, body, validIntegrity: 1, recordedAt: new Date(body.recordedAt ?? at), at: new Date(body.at ?? at) });

test('extension derives reviewed period/line definitions, preserving immutable PMF mass and legacy separation', () => {
  const input = { scoreDistribution: distribution(), definitions: [goalTotalsMarket(1.5), goalTotalsMarket(2.5), goalResultMarket('half-time')] };
  const prepared = prepareGoalMarketExtension(input), original = structuredClone(input);
  assert.equal(prepared.markets.length, 3);
  assert.notEqual(prepared.markets[0].definition.key, prepared.markets[1].definition.key);
  assert.ok(prepared.markets.every((entry) => entry.derivation.available));
  assert.ok(Object.isFrozen(prepared.markets[0].derivation.market.selections));
  assert.ok(Object.isFrozen(prepared.scoreDistribution.states[0]));
  assert.deepEqual(input, original);
  assert.equal(Object.hasOwn(prepared, 'candidate'), false);
  assert.equal(Object.hasOwn(prepared, 'lockedSetId'), false);
});

test('source inputs cannot inject derived probabilities, duplicate identities, omit period identity or exceed bounded definitions', () => {
  const input = { scoreDistribution: distribution(), definitions: [goalResultMarket()] };
  for (const malformed of [{ ...input, markets: [] }, { ...input, definitions: [goalResultMarket(), goalResultMarket()] },
    { ...input, definitions: [{ ...goalResultMarket(), key: 'goal:half-time:result' }] },
    { ...input, definitions: Array.from({ length: 257 }, () => goalResultMarket()) }]) {
    assert.throws(() => parseGoalMarketExtensionInput(malformed), denied('invalid-request'));
  }
});

test('unknown tail and missing half time remain explicitly unavailable rather than silently dropping mass', () => {
  const tail = distribution(); tail.states[0].probability = .05; tail.unrepresentedProbability = .05;
  assert.equal(prepareGoalMarketExtension({ scoreDistribution: tail, definitions: [goalResultMarket()] }).markets[0].derivation.reason, 'unrepresented-score-mass');
  const noHalf = distribution(); noHalf.states.forEach((state) => { state.halfHome = null; state.halfAway = null; });
  const prepared = prepareGoalMarketExtension({ scoreDistribution: noHalf, definitions: [goalResultMarket(), goalResultMarket('half-time')] });
  assert.equal(prepared.markets[0].derivation.available, true);
  assert.equal(prepared.markets[1].derivation.reason, 'missing-half-time-distribution');
});

test('read validates both database integrity and local deterministic derivation against every sealed field', () => {
  const value = extension(); assert.deepEqual(goalMarketExtensionFromRow(row(value)), value);
  for (const broken of [{ ...row(value), validIntegrity: 0 }, { ...row(value), fixtureId: randomUUID() },
    { ...row(value), body: { ...value, markets: [] } }, { ...row(value), body: null }]) {
    assert.throws(() => goalMarketExtensionFromRow(broken), denied('invalid-state'));
  }
  const forged = structuredClone(value); forged.markets[0].derivation.market.selectedProbability = .99;
  assert.throws(() => goalMarketExtensionFromRow({ ...row(value), body: forged }), denied('invalid-state'));
});

test('settlement uses exact canonical locked pick and requires separately verified half-time evidence', () => {
  const value = extension(), plans = projectGoalMarketSettlements(value, cycle(), context(), 'a'.repeat(64), true, new Map());
  assert.equal(plans[0].base.predictionRevisionId, revisionId);
  assert.equal(plans[0].base.selection, value.markets[0].derivation.market.selection);
  assert.equal(plans[0].base.status, 'correct');
  assert.equal(plans[1].base.status, 'pending');
  assert.equal(plans[1].base.reason, 'missing-verified-half-time-score');
  assert.throws(() => projectGoalMarketSettlements(value, cycle({ lockedSetId: randomUUID() }), context(), null, false, new Map()), denied('invalid-state'));
  assert.throws(() => projectGoalMarketSettlements(value, cycle({ state: 'open' }), context(), null, false, new Map()), denied('invalid-state'));
});

test('extended settlement schema keeps half wins/losses/push distinct and preserves corrected exact selection', () => {
  const value = extension(), plan = projectGoalMarketSettlements(value, cycle(), context(), 'a'.repeat(64), true, new Map())[2];
  for (const status of ['correct','incorrect','half-win','half-loss','push','pending','void']) {
    const base = { ...plan.base, status }, revision = { ...base, id: 'b'.repeat(64), batchId: 'c'.repeat(64),
      inputHash: evidenceFingerprint(base), previousId: 'd'.repeat(64), at: at + 1000, correctedAt: at + 1000, kind: 'correction' };
    assert.deepEqual(goalMarketSettlementFromRow(row(revision)), revision);
  }
  const revision = { ...plan.base, id: 'b'.repeat(64), batchId: 'c'.repeat(64), inputHash: plan.inputHash,
    previousId: null, at, correctedAt: null, kind: 'initial' };
  assert.equal(goalMarketSettlementRevisionSchema.safeParse({ ...revision, status: 'half-win', resultId: null, resultUsable: false }).success, false);
  const previous = { ...revision, selection: 'different-pick' };
  assert.throws(() => projectGoalMarketSettlements(value, cycle(), context(), 'a'.repeat(64), true,
    new Map([[plan.base.marketKey, previous]])), denied('invalid-state'));
});

test('void historical cycles retain their own evidence while independently closed cycles never inherit a prior lock', () => {
  const value = extension(), voidCycle = cycle({ state: 'void', voidReason: 'formal-postponement' });
  const voidContext = context({ status: 'postponed', cycleEligibility: { eligible: false, reason: 'postponed-cycle' } });
  const first = projectGoalMarketSettlements(value, voidCycle, voidContext, 'a'.repeat(64), true, new Map())[0];
  const previous = { ...first.base, inputHash: first.inputHash, id: 'b'.repeat(64), previousId: null,
    batchId: 'c'.repeat(64), at, correctedAt: null, kind: 'initial' };
  const replay = projectGoalMarketSettlements(value, voidCycle, voidContext, 'd'.repeat(64), false,
    new Map([[first.base.marketKey, previous]]))[0];
  assert.equal(replay.inputHash, first.inputHash); assert.equal(replay.base.resultId, 'a'.repeat(64));
  assert.throws(() => projectGoalMarketSettlements(value, voidCycle, context(), null, false, new Map()), denied('invalid-state'));
});

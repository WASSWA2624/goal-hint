import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { nonGoalTotalsMarket } from '../src/domain/non-goal-market-definitions.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { oddsValuesHash } from '../src/server/odds/odds-mysql-store.ts';
import { PredictionHistoryError } from '../src/server/predictions/history-contract.ts';
import { prepareImpliedMarketExtension, impliedMarketExtensionFromRow, publicImpliedMarketExtension } from '../src/server/predictions/implied-market-store.ts';
import { impliedMarketSettlementFromRow, impliedMarketSettlementRevisionSchema, projectImpliedMarketSettlements } from '../src/server/settlement/implied-market-settlement.ts';
import { impliedResultEvidenceFromRow } from '../src/server/settlement/implied-market-evidence.ts';

const at = Date.parse('2026-10-12T08:00:00Z'), fixtureId = randomUUID(), cycleId = randomUUID(), revisionId = randomUUID();
const definition = nonGoalTotalsMarket('corners', 9.5), resultId = 'a'.repeat(64);
const mapping = { betId: 9001, betName: 'Synthetic corners', definition, providerLabels: { over: 'Over 9.5', under: 'Under 9.5' } };
const values = [{ label: 'Over 9.5', odd: '1.50' }, { label: 'Under 9.5', odd: '3.00' }];
const snapshot = { id: 'b'.repeat(64), fixtureId, previousId: null, bookmakerId: 8, bookmakerName: 'Synthetic bookmaker',
  betId: mapping.betId, betName: mapping.betName, valuesHash: oddsValuesHash(values), retrievedAt: at - 1000, providerUpdatedAt: at - 2000,
  retainUntil: at + 86400000, values };
const extension = () => {
  const prepared = prepareImpliedMarketExtension({ bookmakerId: 8, freshnessMs: 60000, snapshotIds: [snapshot.id], mappings: [mapping] },
    [{ id: mapping.betId, name: mapping.betName }], [snapshot], at - 1000);
  return { ...prepared, fixtureId, cycleId, revisionId, recordedAt: at, contentHash: evidenceFingerprint(prepared) };
};
const cycle = (overrides = {}) => ({ fixtureId, id: cycleId, state: 'closed', lockedSetId: revisionId, voidReason: null, ...overrides });
const facts = (home = 6, away = 4) => ({ counts: [{ metric: 'corners', period: 'full-time', scope: 'regulation-including-stoppage-time',
  countingRule: definition.countingRule, verified: true, home, away }], events: [] });
const evidence = (home = 6, away = 4) => ({ fixtureId, resultId, id: evidenceFingerprint(facts(home, away)), evidence: facts(home, away) });
const context = (value) => ({ status: 'finished-regulation', cycleEligibility: { eligible: true }, resultUsable: true, evidence: value?.evidence ?? null });
const row = (body) => ({ ...body, body, validIntegrity: 1, recordedAt: new Date(body.recordedAt ?? at), at: new Date(body.at ?? at) });
const denied = (error) => error instanceof PredictionHistoryError && error.reason === 'invalid-state';

test('sealed extension rederives exact stored quote probabilities and historical price expiry without exposing source payload', () => {
  const value = extension(); assert.deepEqual(impliedMarketExtensionFromRow(row(value)), value);
  const publicValue = publicImpliedMarketExtension(value, at)[0];
  assert.equal(publicValue.source, 'market-implied'); assert.equal(publicValue.selection, 'over');
  assert.equal(publicValue.selections[0].capturedPrice, '1.50');
  assert.equal(Object.hasOwn(publicValue, 'bookmakerId'), false); assert.equal(Object.hasOwn(publicValue, 'snapshots'), false);
  assert.equal(Object.hasOwn(publicValue.selections[0], 'price'), false);
  assert.equal(publicImpliedMarketExtension(value, snapshot.retainUntil)[0].selections[0].capturedPrice, null);
  for (const broken of [{ ...row(value), validIntegrity: 0 }, { ...row(value), revisionId: randomUUID() },
    { ...row(value), body: null }, { ...row(value), body: { ...value, confirmedAt: at + 1 } }]) assert.throws(() => impliedMarketExtensionFromRow(broken), denied);
  const forged = structuredClone(value); forged.markets[0].derivation.market.selectedProbability = .99;
  assert.throws(() => impliedMarketExtensionFromRow({ ...row(value), body: forged }), denied);
});

test('freshness and exact snapshot values are independent of mutable fixture confirmation', () => {
  const stale = extension(); stale.recordedAt = at + 60001;
  assert.throws(() => impliedMarketExtensionFromRow(row(stale)), denied);
  const changed = structuredClone(extension()); changed.snapshots[0].valuesHash = 'f'.repeat(64);
  const prepared = { ...changed }; delete prepared.fixtureId; delete prepared.cycleId; delete prepared.revisionId; delete prepared.recordedAt; delete prepared.contentHash;
  changed.contentHash = evidenceFingerprint(prepared);
  assert.throws(() => impliedMarketExtensionFromRow(row(changed)), denied);
});

test('settlement never grades absent or different result evidence and never changes the accepted selection', () => {
  const value = extension(), missing = projectImpliedMarketSettlements(value, cycle(), context(null), resultId, null, new Map())[0];
  assert.equal(missing.base.status, 'pending'); assert.equal(missing.base.evidenceId, null);
  const observed = evidence(), first = projectImpliedMarketSettlements(value, cycle(), context(observed), resultId, observed, new Map())[0];
  assert.equal(first.base.status, 'correct'); assert.equal(first.base.selection, 'over');
  assert.equal(first.base.predictionRevisionId, revisionId);
  assert.throws(() => projectImpliedMarketSettlements(value, cycle(), context(observed), 'c'.repeat(64), observed, new Map()), denied);
  assert.throws(() => projectImpliedMarketSettlements(value, cycle({ lockedSetId: randomUUID() }), context(observed), resultId, observed, new Map()), denied);
  const previous = { ...first.base, id: 'd'.repeat(64), batchId: 'e'.repeat(64), inputHash: first.inputHash, previousId: null, at, correctedAt: null, kind: 'initial' };
  const correction = evidence(3, 2), next = projectImpliedMarketSettlements(value, cycle(), context(correction), resultId, correction,
    new Map([[definition.key, previous]]))[0];
  assert.equal(next.base.status, 'incorrect'); assert.equal(next.base.resultId, first.base.resultId);
  assert.notEqual(next.base.evidenceId, first.base.evidenceId); assert.notEqual(next.inputHash, first.inputHash);
  assert.equal(next.base.selection, previous.selection);
  assert.throws(() => projectImpliedMarketSettlements(value, cycle(), context(observed), resultId, observed,
    new Map([[definition.key, { ...previous, selection: 'under' }]])), denied);
});

test('source-specific settlement row decoder rejects tampered provenance and impossible grades', () => {
  const observed = evidence(), plan = projectImpliedMarketSettlements(extension(), cycle(), context(observed), resultId, observed, new Map())[0];
  const saved = { ...plan.base, id: 'd'.repeat(64), batchId: 'e'.repeat(64), inputHash: plan.inputHash, previousId: null, at, correctedAt: null, kind: 'initial' };
  assert.deepEqual(impliedMarketSettlementFromRow(row(saved)), saved);
  assert.throws(() => impliedMarketSettlementFromRow({ ...row(saved), source: 'ai-score-distribution' }), denied);
  assert.equal(impliedMarketSettlementRevisionSchema.safeParse({ ...saved, evidenceId: null }).success, false);
  assert.equal(impliedMarketSettlementRevisionSchema.safeParse({ ...saved, resultUsable: false }).success, false);
});

test('stored result evidence is ordered by database sequence and validates exact source hashes and fixture/result binding', () => {
  const input = { fixtureId, resultId, provider: 'api-football', externalFixtureId: '3005', homeTeamId: randomUUID(), awayTeamId: randomUUID(),
    contractVersion: 'verified-non-goal-result-v1', sources: [{ endpoint: 'fixtures/statistics', sourceRef: 'd'.repeat(64),
      retrievedAt: at - 1000, providerUpdatedAt: null }], evidence: facts() };
  const saved = { ...input, recordedAt: at, contentHash: evidenceFingerprint(input), id: evidenceFingerprint({ input, recordedAt: at }) };
  assert.deepEqual(impliedResultEvidenceFromRow({ ...row(saved), sequence: 2n }), { ...saved, sequence: 2n });
  for (const broken of [{ ...row(saved), sequence: 0n }, { ...row(saved), sequence: 2n, resultId: 'f'.repeat(64) },
    { ...row(saved), sequence: 2n, body: { ...saved, sources: [] } }, { ...row(saved), sequence: 2n, validIntegrity: 0 }]) {
    assert.throws(() => impliedResultEvidenceFromRow(broken), denied);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createConservativeJointModel } from '../src/server/slips/conservative-joint-model.ts';
import { shadowAt, shadowCandidate, shadowModel, shadowStudy } from './helpers/shadow-slip-fixtures.mjs';

test('only a qualified full-set independence study permits multiplying calibrated marginals', () => {
  const candidates = [shadowCandidate('a'), shadowCandidate('b', '2.00', 0.7), shadowCandidate('c')];
  const pair = candidates.slice(0, 2), pairStudy = shadowStudy(pair), selections = pair.map(value => value.selection);
  assert.equal(shadowModel(candidates).estimate(selections), null);
  assert.equal(shadowModel(candidates, [pairStudy]).estimate(selections), 0.8 * 0.7);
  assert.equal(shadowModel(candidates, [pairStudy]).estimate(candidates.map(value => value.selection)), null,
    'pairwise evidence must not be promoted to mutual independence');
  assert.equal(shadowModel(candidates).estimate([candidates[0].selection]), 0.8);
  assert.equal(shadowModel(candidates).estimate([]), null);
});

test('shared fixtures, shared teams and changed selection/model identities fail closed', () => {
  const a = shadowCandidate('a'), b = shadowCandidate('b');
  b.selection.homeTeam.id = a.selection.awayTeam.id;
  assert.equal(shadowModel([a, b], [shadowStudy([a, b])]).estimate([a.selection, b.selection]), null);
  assert.equal(shadowModel([a]).estimate([a.selection, a.selection]), null);
  const model = shadowModel([a]);
  assert.equal(model.estimate([{ ...a.selection, probability: 0.81 }]), null);
  assert.equal(model.estimate([{ ...a.selection, odds: '3.00' }]), null);
  const qualified = shadowCandidate('q'), other = shadowCandidate('r'), study = shadowStudy([qualified, other]);
  qualified.modelVersion = 'synthetic-v2';
  assert.equal(shadowModel([qualified, other], [study]).estimate([qualified.selection, other.selection]), null);
});

test('unsupported marginal qualification, sparse/future/expired study and revoked authority abstain', () => {
  const candidates = [shadowCandidate('a'), shadowCandidate('b')], selections = candidates.map(value => value.selection);
  for (const patch of [{ calibrated: false }, { eligible: false }, { validatedAt: shadowAt + 1 },
    { validUntil: shadowAt }, { oddsObservedAt: shadowAt + 1 }, { evidenceReliability: NaN }]) {
    const altered = [{ ...candidates[0], ...patch }, candidates[1]];
    assert.equal(shadowModel(altered, [shadowStudy(altered)]).estimate(selections), null);
  }
  for (const patch of [{ sampleSize: 499 }, { assessedAt: shadowAt + 1 }, { assessedAt: shadowAt - 2000 }, { validUntil: shadowAt },
    { method: 'pairwise-only' }, { candidateKeys: [] }]) {
    assert.equal(shadowModel(candidates, [shadowStudy(candidates, patch)]).estimate(selections), null);
  }
  for (const verifier of [() => false, () => { throw new Error('unavailable'); }, async () => true]) {
    assert.equal(shadowModel(candidates, [shadowStudy(candidates)], { verifyIndependence: verifier }).estimate(selections), null);
    assert.equal(shadowModel(candidates, [shadowStudy(candidates)], { verifyCandidate: verifier }).estimate(selections), null);
  }
});

test('qualification snapshots survive caller mutation and reject ambiguous marginals and cutoff crossings', () => {
  const a = shadowCandidate('a'), original = structuredClone(a.selection), model = shadowModel([a]);
  a.selection.probability = 0.99;
  assert.equal(model.estimate([original]), 0.8);
  assert.equal(model.estimate([a.selection]), null);
  const b = shadowCandidate('b');
  assert.equal(shadowModel([b, b]).estimate([b.selection]), null);
  b.selection.kickoffAt = shadowAt + 300_000;
  assert.equal(shadowModel([b]).estimate([b.selection]), null);
  b.selection.kickoffAt = shadowAt + 310_000;
  assert.equal(shadowModel([b]).estimate([b.selection]), null, 'model cannot remain valid through the lock');
});

test('the estimator snapshots policy values and verifier identities while honoring verifier revocation', () => {
  const candidate = shadowCandidate('short', '2.50', 0.8, { validUntil: shadowAt + 30_000 });
  const input = { candidates: [candidate], independence: [], calibrationReference: 'synthetic-calibration',
    correlationReference: 'synthetic-correlation', asOf: shadowAt, validUntil: shadowAt + 60_000,
    minimumStudySample: 500, verifyCandidate: () => true, verifyIndependence: () => true };
  const model = createConservativeJointModel(input);
  assert.equal(model.estimate([candidate.selection]), null);
  input.validUntil = shadowAt + 1; input.asOf = shadowAt - 100_000;
  assert.equal(model.validUntil, shadowAt + 60_000);
  assert.equal(model.estimate([candidate.selection]), null, 'mutating policy cannot bypass the original expiry proof');

  const candidates = [shadowCandidate('a'), shadowCandidate('b')];
  let revoked = false;
  const reviewed = { ...input, candidates, independence: [shadowStudy(candidates)], asOf: shadowAt, validUntil: shadowAt + 60_000,
    verifyCandidate: () => !revoked, verifyIndependence: () => false };
  const fixed = createConservativeJointModel(reviewed);
  reviewed.verifyCandidate = () => true; reviewed.verifyIndependence = () => true;
  assert.equal(fixed.estimate(candidates.map(value => value.selection)), null, 'replacement verifier cannot approve an unqualified study');
  assert.equal(fixed.estimate([candidates[0].selection]), 0.8);
  revoked = true;
  assert.equal(fixed.estimate([candidates[0].selection]), null, 'the captured verifier still sees revoked authority');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { parseAppendRevision, parseCreateCycle, parseChangeCycle } from '../src/server/predictions/history-input.ts';
import { parseResolvedForecastCandidate } from '../src/server/fallback/fallback-input.ts';
import { evidenceContext, evidenceHash } from './helpers/evidence-fixtures.mjs';
import { predictorSnapshot } from './helpers/predictor-output-fixtures.mjs';
import { historyCandidate, revisionInput, cycleCreation, historyActor } from './helpers/prediction-history-fixtures.mjs';

function candidate(options = {}) {
  const context = evidenceContext(undefined, { cycleId: randomUUID(), runId: randomUUID() });
  return historyCandidate({ snapshot: predictorSnapshot(undefined, undefined, context), ...options });
}
test('archive parser reuses complete market validation and preserves binary64 probabilities and original provenance', () => {
  const input = revisionInput(candidate(), evidenceHash('evidence-request'));
  assert.deepEqual(parseAppendRevision(input), input);
  assert.ok(Object.isFrozen(parseAppendRevision(input).candidate.markets));
  for (const mutate of [
    (v) => { v.candidate.markets['match-result'].market.probabilities['home-win'] = NaN; },
    (v) => { delete v.candidate.markets['total-goals']; },
    (v) => { v.candidate.markets['total-goals'].market.probabilities['over-2.5'] = 0.9; },
    (v) => { v.candidate.markets['match-result'].market.selection = 'away-win'; },
    (v) => { v.candidate.markets['double-chance'].market.source = 'api-football'; },
    (v) => { v.candidate.markets['double-chance'].timestamps.retrievedAt += 1; },
    (v) => { v.candidate.markets['match-result'].provenance.modelVersionId = evidenceHash('wrong-model'); },
    (v) => { v.candidate.context.context.cycleId = null; },
    (v) => { v.candidate.context.context.runId = null; },
    (v) => { v.unexpected = true; },
  ]) { const changed = structuredClone(input); mutate(changed); assert.throws(() => parseAppendRevision(changed)); }
});
test('partial snapshots retain explicit unavailability and fallback keeps unknown generation/update clocks', () => {
  const partial = candidate({ partial: true });
  assert.equal(parseResolvedForecastCandidate(partial).markets['total-goals'].available, false);
  const provider = candidate({ source: 'api-football' });
  const stored = parseAppendRevision(revisionInput(provider, evidenceHash('fallback-request')));
  assert.equal(stored.candidate.markets['match-result'].timestamps.generatedAt, null);
  assert.equal(stored.candidate.markets['match-result'].timestamps.providerUpdatedAt, null);
  assert.equal(stored.candidate.markets['match-result'].fallback.detail, 'unconfigured');
  assert.throws(() => parseResolvedForecastCandidate({ ...partial, markets: { ...partial.markets,
    'match-result': { available: false, reason: 'unsupported-family' } } }));
});
test('generation, evidence, provider retrieval and publication clocks cannot be conflated or moved backwards', () => {
  const input = revisionInput(candidate(), evidenceHash('clocks-request'));
  assert.throws(() => parseAppendRevision({ ...input, publishedAt: input.generationCompletedAt - 1 }));
  assert.throws(() => parseAppendRevision({ ...input, generationCompletedAt: input.candidate.context.context.analysisAt + 1000 }));
  const changed = structuredClone(input); changed.candidate.markets['match-result'].timestamps.providerUpdatedAt = changed.publishedAt + 1;
  assert.throws(() => parseAppendRevision(changed));
});
test('all-unavailable output is not an accepted revision and cannot erase a previous set through this write primitive', () => {
  const input = revisionInput(candidate(), evidenceHash('empty-request'));
  input.candidate = { ...input.candidate, markets: Object.fromEntries(Object.keys(input.candidate.markets).map((family) =>
    [family, { available: false, reason: 'missing-group' }])) };
  assert.throws(() => parseAppendRevision(input));
});
test('cycle metadata requires canonical identities, coherent closed/locked state and a public void reason', () => {
  const context = evidenceContext();
  const creation = cycleCreation({ id: context.fixtureId, kickoff: context.kickoffAt });
  assert.deepEqual(parseCreateCycle(creation), creation);
  assert.throws(() => parseCreateCycle({ ...creation, fixtureId: 'provider-101' }));
  const change = { ...historyActor, cycleId: randomUUID(), expectedVersion: 1, eventKey: evidenceHash('event'),
    at: creation.openedAt + 1, next: { state: 'closed', currentSetId: null, lockedSetId: null,
      closedAt: creation.openedAt + 1, lockedAt: null, voidedAt: null, voidReason: null } };
  assert.deepEqual(parseChangeCycle(change), change);
  assert.throws(() => parseChangeCycle({ ...change, next: { ...change.next, lockedSetId: randomUUID() } }));
  assert.throws(() => parseChangeCycle({ ...change, next: { ...change.next, state: 'void', voidedAt: change.at } }));
  assert.throws(() => parseChangeCycle({ ...change, at: change.at - 1 }));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { localHistoryFromEvidence } from '../src/server/intelligence/evidence-adapter.ts';
import { buildEvidenceSnapshot } from '../src/server/evidence/evidence-snapshot.ts';
import { evidenceAuthority, evidenceContext, evidencePolicy } from './helpers/evidence-fixtures.mjs';
import { recommendationFootballSources } from './helpers/recommendation-evidence-fixtures.mjs';

function fixture() {
  const context = evidenceContext(), authority = evidenceAuthority();
  const sources = recommendationFootballSources(context);
  const snapshot = buildEvidenceSnapshot({ context, policy: evidencePolicy(), sources }, authority);
  const scopes = sources.flatMap((source) => source.claims.filter((claim) => claim.kind === 'history').map(({ value }) => ({
    externalFixtureId: value.fixtureId, fixtureId: `historical-${value.fixtureId}`, cycleId: `cycle-${value.fixtureId}`,
    competitionId: value.fixtureId % 2 ? 'women-league' : 'men-league',
    homeExternalId: value.homeExternalId, awayExternalId: value.awayExternalId,
    homeTeamId: [context.home, context.away].find((team) => team.externalId === value.homeExternalId)?.teamId ?? `team-${value.homeExternalId}`,
    awayTeamId: [context.home, context.away].find((team) => team.externalId === value.awayExternalId)?.teamId ?? `team-${value.awayExternalId}`,
    observedAt: context.cutoffAt - 1000, evidenceRef: 'synthetic-point-in-time-catalog',
  })));
  return { snapshot, authority, scopes, verifyScope: () => true };
}

test('history requires independently verified league identity and preserves original observation clocks', () => {
  const input = fixture(), result = localHistoryFromEvidence(input);
  assert.equal(result.history.length, 6);
  assert.deepEqual(new Set(result.history.map((row) => row.competitionId)), new Set(['men-league', 'women-league']));
  assert.ok(result.history.every((row) => row.availableAt === input.snapshot.context.cutoffAt - 1000));
  assert.ok(result.history.every((row) => row.evidenceRef.includes(input.snapshot.id)));
  const unavailable = localHistoryFromEvidence({ ...input, scopes: [] });
  assert.equal(unavailable.history.length, 0);
  assert.deepEqual(unavailable.reasons, ['missing-historical-competition-scope']);
});

test('late, unverified and contradictory scope receipts cannot supply local fitting data', () => {
  const input = fixture();
  assert.equal(localHistoryFromEvidence({ ...input, verifyScope: () => false }).history.length, 0);
  assert.equal(localHistoryFromEvidence({ ...input, scopes: input.scopes.map((scope) => ({ ...scope,
    observedAt: input.snapshot.context.cutoffAt + 1 })) }).history.length, 0);
  const duplicate = { ...input.scopes[0], competitionId: 'different-competition' };
  const conflicted = localHistoryFromEvidence({ ...input, scopes: [...input.scopes, duplicate] });
  assert.equal(conflicted.history.length, 5);
  assert.ok(conflicted.reasons.includes('conflicting-historical-scope-or-score'));
  assert.equal(localHistoryFromEvidence({ ...input, scopes: [...input.scopes, input.scopes[0]] }).history.length, 6);
  const reobserved = { ...input.scopes[0], observedAt: input.scopes[0].observedAt + 500, evidenceRef: 'synthetic-later-receipt' };
  assert.equal(localHistoryFromEvidence({ ...input, scopes: [...input.scopes, reobserved] }).history.length, 6);
  const wrongTeam = input.scopes.map((scope) => ({ ...scope, homeTeamId: 'wrong-canonical-team' }));
  assert.ok(localHistoryFromEvidence({ ...input, scopes: wrongTeam }).history.length < 6);
});

test('a rehashed/serialized snapshot and revoked source rights cannot bypass original evidence authority', () => {
  const input = fixture();
  assert.throws(() => localHistoryFromEvidence({ ...input, snapshot: { ...input.snapshot } }), /unavailable/);
  input.authority.verifySource = () => false;
  assert.throws(() => localHistoryFromEvidence(input), /unavailable/);
});

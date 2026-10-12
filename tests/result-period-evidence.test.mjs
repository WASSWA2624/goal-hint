import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { fixtureResultFromRow } from '../src/server/results/result-read.ts';
import { lifecycleObservationSchema } from '../src/server/predictions/lifecycle-input.ts';
import { lifecycleContentHash } from '../src/server/predictions/lifecycle-policy.ts';
import { parseLifecycleInput } from '../src/server/predictions/lifecycle-input.ts';
import { lifecycleInput } from './helpers/lifecycle-fixtures.mjs';

const at = Date.parse('2026-10-12T08:00:00Z'), fixtureId = '10000000-0000-4000-8000-000000000001';
const content = () => ({ status: 'finished-extra-time', providerStatus: 'AET', elapsedMinutes: 120,
  reportedGoals: { home: 4, away: 2 }, extraTimeScore: { home: 4, away: 2 }, penaltyScore: { home: null, away: null },
  regulation: { verified: true, home: 2, away: 1, evidenceRef: 'synthetic-verified-fulltime' } });
const halfTime = () => ({ verified: true, period: 'first-half-including-stoppage-time', home: 1, away: 0,
  evidenceRef: 'api-football:fixture:101:AET:score.halftime' });
function resultRow(value) {
  const body = { id: 'a'.repeat(64), fixtureId, fixtureVersion: 2n, previousId: null, observationId: 'b'.repeat(64),
    observedAt: at, providerUpdatedAt: null, regulationVerifiedAt: at, ...value };
  return { id: body.id, fixtureId, fixtureVersion: body.fixtureVersion, body: evidenceSerialize(body), validIntegrity: 1,
    observedAt: new Date(at), status: value.status, regulationVerified: value.regulation.verified,
    regulationHome: value.regulation.home, regulationAway: value.regulation.away, contentHash: evidenceFingerprint(value) };
}

test('sealed legacy result evidence retains no half-time property and the original content hash', () => {
  const value = content(), row = resultRow(value), parsed = fixtureResultFromRow(row);
  assert.equal(Object.hasOwn(parsed, 'halfTime'), false);
  assert.equal(evidenceFingerprint(value), row.contentHash);
  assert.ok(Object.isFrozen(parsed));
});

test('verified first-half evidence is sealed separately and cannot substitute extra-time or total scores', () => {
  const value = { ...content(), halfTime: halfTime() }, row = resultRow(value);
  const parsed = fixtureResultFromRow(row);
  assert.deepEqual(parsed.halfTime, halfTime()); assert.ok(Object.isFrozen(parsed.halfTime));
  for (const mutation of [
    { ...halfTime(), verified: false }, { ...halfTime(), period: 'regulation-including-stoppage-time' },
    { ...halfTime(), home: 4 }, { ...halfTime(), away: 2 }, { ...halfTime(), home: null },
  ]) {
    assert.throws(() => fixtureResultFromRow(resultRow({ ...content(), halfTime: mutation })), (error) => error.reason === 'invalid-state');
  }
  const forged = { ...row, body: evidenceSerialize({ ...parsed, halfTime: { ...halfTime(), home: 0 } }) };
  assert.throws(() => fixtureResultFromRow(forged), (error) => error.reason === 'invalid-state');
  assert.throws(() => fixtureResultFromRow(resultRow({ ...value, status: 'live', providerStatus: 'ET' })), (error) => error.reason === 'invalid-state');
});

test('half-time corrections change lifecycle content without affecting old absent-field projections', () => {
  const input = lifecycleInput({ fixture: { id: fixtureId, externalId: 101 }, cycle: { kickoffAt: at - 3_600_000 } }, at,
    { status: 'AET', raw: { goals: { home: 4, away: 2 }, score: { fulltime: { home: 2, away: 1 }, extratime: { home: 4, away: 2 } } } });
  const old = parseLifecycleInput(input), halfTimeScore = { fixtureId: 101, providerStatus: 'AET', verified: true,
    sourceField: 'score.halftime', period: 'first-half-including-stoppage-time', home: 1, away: 0 };
  const observed = lifecycleObservationSchema.parse({ ...old, halfTimeScore });
  assert.notEqual(lifecycleContentHash(old), lifecycleContentHash(observed));
  assert.notEqual(lifecycleContentHash(observed), lifecycleContentHash({ ...observed, halfTimeScore: { ...halfTimeScore, home: 0 } }));
  for (const malformed of [{ ...halfTimeScore, fixtureId: 102 }, { ...halfTimeScore, providerStatus: 'FT' },
    { ...halfTimeScore, home: 3 }, { ...halfTimeScore, sourceField: 'goals' }]) {
    assert.equal(lifecycleObservationSchema.safeParse({ ...old, halfTimeScore: malformed }).success, false);
  }
});

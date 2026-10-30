import assert from 'node:assert/strict';
import test from 'node:test';
import { savedSlipCompleted, savedSlipOutcome } from '../src/domain/saved-slips.ts';
import { readWithSlipAccess } from '../src/server/slips/slip-access.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

const { slip: original } = slipForecastFixture();
const slip = { ...original, selections: [1, 2].map(number => ({ ...original.selections[0],
  fixtureId: `10000000-0000-4000-8000-00000000000${number}`,
  forecast: { cycleId: `cycle-${number}`, revisionId: `revision-${number}`, publishedAt: 1000 },
})) };
const result = (index, changes = {}) => ({ ...slip.selections[index], completed: true, fixtureCompleted: true,
  status: 'finished-regulation', regulationVerified: true, regulationHome: 2, regulationAway: 0, ...changes });

test('an early loss never releases another unfinished original selection', () => {
  const results = [result(0, { regulationHome: 0, regulationAway: 2 }), result(1, {
    completed: false, fixtureCompleted: false, status: 'live', regulationVerified: false,
  })];
  assert.equal(savedSlipOutcome(slip, results), 'lost');
  assert.equal(savedSlipCompleted(slip, results), false);
  assert.equal(savedSlipCompleted(slip, [results[0]]), false);
});

test('every canonical terminal status is public while scheduled, live, postponed and unknown stay private', () => {
  for (const status of ['finished-regulation', 'finished-extra-time', 'finished-penalties', 'canceled', 'abandoned', 'awarded']) {
    assert.equal(savedSlipCompleted(slip, [result(0), result(1, { status })]), true, status);
  }
  for (const status of ['scheduled', 'live', 'postponed', 'unknown']) {
    assert.equal(savedSlipCompleted(slip, [result(0), result(1, { status, fixtureCompleted: false })]), false, status);
  }
});

test('old-cycle voids and final scores cannot bypass an unfinished canonical replacement fixture', () => {
  for (const status of ['unknown', 'finished-regulation']) {
    const results = [result(0), result(1, { status, fixtureCompleted: false,
      cycleEligibility: { eligible: false, reason: 'ineligible-cycle' } })];
    assert.equal(savedSlipCompleted(slip, results), false);
    assert.equal(savedSlipCompleted(slip, [results[0], { ...results[1], fixtureCompleted: true }]), true);
  }
});

test('foreign cycle evidence, missing original completion, and empty slips fail closed', () => {
  assert.equal(savedSlipCompleted(slip, [result(0), result(1, { forecast: { ...slip.selections[1].forecast, cycleId: 'foreign-cycle' } })]), false);
  assert.equal(savedSlipCompleted(slip, [result(0), result(1, { completed: false })]), false);
  assert.equal(savedSlipCompleted({ ...slip, selections: [] }, []), false);
});

test('fresh access rechecks reread the public subset on expiry and reject a second access race', async () => {
  const full = { tier: 'full', signedIn: true, mode: 'off' }, free = { ...full, tier: 'free' };
  let checks = 0;
  const reads = [];
  const value = await readWithSlipAccess(async viewer => { reads.push(viewer.tier); return viewer.tier; },
    async () => checks++ === 0 ? full : free);
  assert.equal(value, 'free'); assert.deepEqual(reads, ['full', 'free']); assert.equal(checks, 3);
  checks = 0;
  await assert.rejects(readWithSlipAccess(async viewer => viewer.tier, async () => ++checks === 2 ? free : full), /access changed/);
});

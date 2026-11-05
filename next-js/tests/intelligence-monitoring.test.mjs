import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyObservationChange, observationFingerprint, planMonitoringCheck, admitContextReview, monitoringRetry } from '../src/server/intelligence/monitoring.ts';

const now = Date.UTC(2026, 10, 5, 10), hour = 3_600_000;
const observation = (changes = {}) => ({ fixtureId: '11111111-1111-4111-8111-111111111111', observedAt: now, receivedAt: now,
  kickoffAt: now + 24 * hour, status: 'scheduled', confirmedMajorAbsences: [], unexpectedLineup: false, seriousSecurityIssue: false,
  context: [], odds: { home: 2 }, probabilities: { home: 0.6 }, ...changes });
const claim = (changes = {}) => ({ id: 'report-1', category: 'weather', classification: 'credible-report', summary: 'Heavy rain is expected.',
  sourceUrl: 'https://example.org/report', publishedAt: now - hour, observedAt: now, ...changes });

test('unchanged observations and reobserved news ignore retrieval clocks', () => {
  const first = observation({ context: [claim()] }), repeat = observation({ observedAt: now + hour, receivedAt: now + hour, context: [claim({ observedAt: now + hour })] });
  assert.equal(observationFingerprint(first), observationFingerprint(repeat));
  assert.equal(classifyObservationChange(first, repeat, now + hour).severity, 'unchanged');
  assert.equal(observationFingerprint(first), observationFingerprint(observation({ context: [claim(), claim()] })));
  assert.equal(classifyObservationChange(first, observation({ context: [] }), now).severity, 'unavailable');
  assert.equal(classifyObservationChange(first, observation({ context: [claim(), claim({ summary: 'Conflicting duplicate' })] }), now).severity, 'unavailable');
});
test('five points is a configurable review trigger; minor movement alone does not require AI', () => {
  const old = observation();
  assert.equal(classifyObservationChange(old, observation({ probabilities: { home: 0.649 } }), now).severity, 'minor');
  const changed = classifyObservationChange(old, observation({ probabilities: { home: 0.65 } }), now);
  assert.equal(changed.severity, 'significant'); assert.equal(changed.recomputeLocal, true); assert.equal(changed.contextualReview, false);
});
test('missing updates, stale observations, older evidence and disappearing fields are unavailable', () => {
  const old = observation();
  for (const next of [null, observation({ probabilities: null }), observation({ probabilities: {} }), observation({ odds: {} }), observation({ observedAt: now - 1 })])
    assert.equal(classifyObservationChange(old, next, now).severity, 'unavailable');
  assert.equal(classifyObservationChange(null, old, now + 3 * hour).severity, 'unavailable');
});
test('postponements, cancellation, initial major absence and unexpected lineup suspend eligibility', () => {
  for (const delta of [{ status: 'postponed' }, { status: 'cancelled' }, { confirmedMajorAbsences: ['captain'] }, { unexpectedLineup: true }, { seriousSecurityIssue: true }]) {
    const next = observation(delta), changed = classifyObservationChange(null, next, now);
    assert.equal(changed.severity, 'critical'); assert.equal(changed.suspend, true);
    const unchanged = classifyObservationChange(next, next, now);
    assert.equal(unchanged.severity, 'unchanged'); assert.equal(unchanged.suspend, true); assert.equal(unchanged.recomputeLocal, false);
  }
});
test('credible contextual changes justify review, rumours do not and future evidence is refused', () => {
  const old = observation();
  assert.equal(classifyObservationChange(old, observation({ context: [claim()] }), now).contextualReview, true);
  assert.equal(classifyObservationChange(old, observation({ context: [claim({ classification: 'rumour' })] }), now).contextualReview, false);
  assert.equal(classifyObservationChange(old, observation({ context: [claim({ publishedAt: now + 1 })] }), now).severity, 'unavailable');
});
test('checks require verified capabilities, use hourly near-term cadence, prioritize published slips and honor lock', () => {
  const input = { now, kickoffAt: now + 24 * hour, lastCheckedAt: now - hour, publishedSlip: false, capabilitiesVerified: true };
  assert.equal(planMonitoringCheck(input).due, true);
  assert.equal(planMonitoringCheck({ ...input, capabilitiesVerified: false }).due, false);
  assert.equal(planMonitoringCheck({ ...input, kickoffAt: now + 4 * 86_400_000 }).due, false);
  assert.equal(planMonitoringCheck({ ...input, kickoffAt: now + 4 * 86_400_000, publishedSlip: true }).due, true);
  assert.equal(planMonitoringCheck({ ...input, kickoffAt: now + 5 * 60_000 }).due, false);
});
test('daily and monthly request/money limits and open circuit all deny contextual dispatch', () => {
  const change = classifyObservationChange(observation(), observation({ context: [claim()] }), now);
  const budget = { dayRemainingRequests: 1, monthRemainingRequests: 1, dayRemainingUsdPicos: 10n, monthRemainingUsdPicos: 10n, maximumRequests: 1, maximumUsdPicos: 10n };
  const input = { change, authorizedSources: true, configured: true, budget, circuitOpenUntil: null, now };
  assert.equal(admitContextReview(input).allowed, true);
  for (const key of ['dayRemainingRequests', 'monthRemainingRequests', 'dayRemainingUsdPicos', 'monthRemainingUsdPicos'])
    assert.equal(admitContextReview({ ...input, budget: { ...budget, [key]: typeof budget[key] === 'bigint' ? 0n : 0 } }).reason, 'budget-exhausted');
  assert.equal(admitContextReview({ ...input, circuitOpenUntil: now + 1 }).reason, 'circuit-open');
  assert.equal(admitContextReview({ ...input, configured: false }).allowed, false);
  assert.equal(admitContextReview({ ...input, change: classifyObservationChange(observation(), observation(), now) }).allowed, false);
});
test('retries back off, open a circuit after repeated failure and stop at cutoff or maximum attempts', () => {
  assert.equal(monitoringRetry(1, now, now + hour).retryAt, now + 30_000);
  assert.equal(monitoringRetry(3, now, now + hour).circuitOpenUntil, now + 120_000);
  assert.equal(monitoringRetry(7, now, now + 24 * hour).retryAt, null);
  assert.equal(monitoringRetry(1, now, now + 30_000).retryAt, null);
});

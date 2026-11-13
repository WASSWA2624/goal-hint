import assert from "node:assert/strict";
import test from "node:test";
import { hourlySelectionEnvelope, latestHourlySelectionOccurrence } from "../src/server/selection/selection-trigger.ts";

test('hourly selection schedules one expiring occurrence per UTC hour around EAT midnight', () => {
  const midnight = Date.parse('2026-10-10T21:00:00Z'), hour = 3_600_000;
  const bounds = { maxAttempts: 16, timeoutMs: 2_700_000, leaseMs: 60_000, fallbackReserveMs: 0,
    backoff: { baseMs: 60_000, maxMs: hour }, expiresAfterMs: 48 * hour };
  assert.equal(latestHourlySelectionOccurrence(midnight - 1), midnight - hour);
  assert.equal(latestHourlySelectionOccurrence(midnight), null);
  assert.equal(latestHourlySelectionOccurrence(midnight + hour - 1), null);
  assert.equal(latestHourlySelectionOccurrence(midnight + hour), midnight + hour);
  assert.throws(() => hourlySelectionEnvelope(midnight, bounds));
  assert.throws(() => hourlySelectionEnvelope(midnight + hour + 1, bounds));
  const slot = midnight + hour, envelope = hourlySelectionEnvelope(slot, bounds);
  assert.equal(envelope.type, 'hourly.selection');
  assert.deepEqual(envelope.payload, { scheduledFor: slot });
  assert.equal(envelope.notBefore, slot);
  assert.equal(envelope.expiresAt, slot + hour);
  assert.equal(envelope.maxAttempts, 3);
  assert.equal(hourlySelectionEnvelope(slot, { ...bounds, timeoutMs: 2 * hour }).timeoutMs, hour);
  assert.deepEqual(hourlySelectionEnvelope(slot, bounds), envelope);
  assert.notEqual(hourlySelectionEnvelope(slot + hour, bounds).idempotencyKey, envelope.idempotencyKey);
});

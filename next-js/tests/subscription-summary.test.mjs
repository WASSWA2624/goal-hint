import assert from "node:assert/strict";
import test from "node:test";
import { activeSubscriptionUntil } from "../src/domain/subscription-summary.ts";

const now = new Date("2026-10-24T10:00:00Z"), hour = 3_600_000;
const period = (start, end, revoked = false) => ({ startsAt: new Date(+now + start * hour), endsAt: new Date(+now + end * hour), revokedAt: revoked ? now : null });

test("active expiry merges overlapping and contiguous grants without mutating or bridging gaps", () => {
  const periods = [period(2, 4), period(-1, 2), period(-2, 1), period(5, 10), period(-2, 100, true)];
  const original = structuredClone(periods);
  assert.equal(activeSubscriptionUntil(periods, now), new Date(+now + 4 * hour).toISOString());
  assert.deepEqual(periods, original);
});

test("a period starts inclusively and expires exclusively", () => {
  assert.equal(activeSubscriptionUntil([period(0, 1)], now), new Date(+now + hour).toISOString());
  for (const periods of [[], [period(-1, 0)], [period(1, 2)], [period(-1, 1, true)]]) {
    assert.equal(activeSubscriptionUntil(periods, now), null);
  }
});

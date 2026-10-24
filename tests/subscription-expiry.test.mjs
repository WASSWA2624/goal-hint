import assert from "node:assert/strict";
import test from "node:test";
import { formatSubscriptionExpiry, subscriptionExpiryParts, subscriptionTimeLeft } from "../src/domain/subscription-expiry.ts";

test("subscription expiry includes the year and rolls over in East Africa Time", () => {
  assert.equal(formatSubscriptionExpiry(new Date("2026-12-31T21:30:00Z")), "1 Jan 2027, 00:30 EAT");
  assert.deepEqual(subscriptionExpiryParts(new Date("2026-12-31T21:30:00Z")), { day: "1 Jan 2027", time: "00:30 EAT" });
});

test("time left rounds down to whole days, then whole hours on the last day, and ends at the expiry", () => {
  const until = new Date("2026-10-31T12:12:00Z"), at = (iso) => Date.parse(iso);
  assert.deepEqual(subscriptionTimeLeft(until, at("2026-10-24T12:00:00Z")), { unit: "day", count: 7 });
  assert.deepEqual(subscriptionTimeLeft(until, at("2026-10-30T12:12:00Z")), { unit: "day", count: 1 });
  assert.deepEqual(subscriptionTimeLeft(until, at("2026-10-30T12:12:01Z")), { unit: "hour", count: 23 });
  assert.deepEqual(subscriptionTimeLeft(until, at("2026-10-31T07:00:00Z")), { unit: "hour", count: 5 });
  assert.deepEqual(subscriptionTimeLeft(until, at("2026-10-31T11:30:00Z")), { unit: "hour", count: 0 });
  for (const now of [at("2026-10-31T12:12:00Z"), at("2026-11-01T00:00:00Z"), Number.NaN]) assert.equal(subscriptionTimeLeft(until, now), null);
});

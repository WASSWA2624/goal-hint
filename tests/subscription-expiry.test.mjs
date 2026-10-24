import assert from "node:assert/strict";
import test from "node:test";
import { formatSubscriptionExpiry } from "../src/domain/subscription-expiry.ts";

test("subscription expiry includes the year and rolls over in East Africa Time", () => {
  assert.equal(formatSubscriptionExpiry(new Date("2026-12-31T21:30:00Z")), "1 Jan 2027, 00:30 EAT");
});

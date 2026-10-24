import assert from "node:assert/strict";
import test from "node:test";
import { formatCredit, formatCreditChange, renewalDue, validTopUp, walletKindLabels, walletKinds, walletRules } from "../src/domain/wallet.ts";

const hour = 3_600_000, now = new Date("2026-10-24T12:00:00Z");

test("a top-up is a whole number of shillings within the published range", () => {
  for (const amount of [1000, 25_000, 500_000]) assert.equal(validTopUp(amount), true, String(amount));
  for (const amount of [999, 500_001, 1000.5, -1000, Number.NaN, "5000", null, undefined]) assert.equal(validTopUp(amount), false, String(amount));
});

test("a period is due within the renewal lead, and the job's lapse limit bounds how late", () => {
  assert.equal(renewalDue(new Date(+now + 2 * hour), now), false, "more than an hour away");
  assert.equal(renewalDue(new Date(+now + hour), now), true, "exactly the lead");
  assert.equal(renewalDue(new Date(+now - 30 * 24 * hour), now), true, "a member's own visit renews any lapse");
  assert.equal(renewalDue(new Date(+now - 2 * hour), now, walletRules.renewLeadMs, walletRules.jobMaxLapseMs), true);
  assert.equal(renewalDue(new Date(+now - 25 * hour), now, walletRules.renewLeadMs, walletRules.jobMaxLapseMs), false, "the job never charges a long-lapsed account");
  assert.ok(walletRules.renewLeadMs < 24 * hour, "the lead stays below the shortest plan");
});

test("every ledger kind has a label, and amounts read with their sign", () => {
  assert.deepEqual(Object.keys(walletKindLabels).sort(), [...walletKinds].sort());
  assert.equal(formatCredit(-5000), "−UGX 5,000");
  assert.equal(formatCredit(12_500), "UGX 12,500");
  assert.equal(formatCreditChange(5000), "+UGX 5,000");
  assert.equal(formatCreditChange(-1000), "−UGX 1,000");
});

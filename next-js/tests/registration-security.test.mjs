import assert from "node:assert/strict";
import test from "node:test";
import { createMemberAuthFixture } from "./helpers/member-auth-fixture.mjs";
import { createMemberRateLimit } from "../src/server/members/rate-limit.ts";
import { awardReferralRegistration } from "../src/server/members/referrals.ts";

const password = "correct horse 47", address = "198.51.100.90";

test("unresolved addresses retain a durable bounded budget", async () => {
  const f = createMemberAuthFixture();
  const limit = createMemberRateLimit(f.database, { key: (purpose, value) => `${purpose}:${value}` }, f.now);
  const input = { purpose: "security-check", value: "unknown", maximum: 2, windowMs: 60_000 };
  assert.equal(await limit(input), true); assert.equal(await limit(input), true); assert.equal(await limit(input), false);
  f.advance(60_000); assert.equal(await limit(input), true);
});

test("recovery send/check limits persist by phone when addresses change, without charging another phone", async () => {
  const f = createMemberAuthFixture();
  // Missing accounts retain the same generic answer, but no longer allow unlimited distributed lookups.
  for (let index = 0; index < 11; index++) assert.equal((await f.restart().requestPasswordReset("256700000008", `198.51.100.${index}`, "sms")).status,
    index < 10 ? "requested" : "busy");
  assert.equal((await f.service.requestPasswordReset("256700000009", address, "sms")).status, "requested");
  for (let index = 0; index < 16; index++) assert.equal((await f.restart().verifyPasswordReset("256700000008", "123456", `203.0.113.${index}`)).status,
    index < 15 ? "unauthorized" : "busy");
  assert.equal(f.messages.length, 0);
  f.advance(3_600_000);
  assert.equal((await f.service.requestPasswordReset("256700000008", address, "sms")).status, "requested");
});

test("one shared address permits independent verified referral awards; claimed/unverified invitees cannot award", async () => {
  const f = createMemberAuthFixture({ trialDays: 0 }), inviter = await f.account({ referralCode: "a".repeat(32) });
  for (const phone of ["256700000002", "256700000003"]) {
    const pending = await f.service.register(phone, password, { member: null }, address, inviter.referralCode);
    assert.equal(pending.status, "authenticated");
    const account = f.accounts.get(pending.accountId), config = { key: () => { assert.fail("Unverified identity must not reach reward keying"); } };
    await f.database.transaction(tx => awardReferralRegistration(tx, config, account, new Date(f.now())));
    assert.equal(f.accessCodes.size, phone.endsWith("2") ? 0 : 1, "An unverified identity cannot grant a reward");
    await f.service.requestVerification("sms", pending.token, address);
    const code = f.messages.at(-1).code;
    const verified = await f.service.verifyAccount(code, pending.token, address);
    assert.equal(verified.status, "authenticated");
    assert.equal((await f.service.verifyAccount(code, pending.token, "203.0.113.100")).status, "unauthorized");
  }
  assert.equal([...f.referrals.values()].filter(row => row.status === "rewarded").length, 2);
  const grants = [...f.accessCodes.values()];
  assert.equal(grants.length, 2); assert.ok(grants.every(row => row.accountId === inviter.id && row.durationDays === 1));
  assert.equal(+grants[1].startsAt, +grants[0].endsAt);
});

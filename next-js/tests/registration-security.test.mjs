import assert from "node:assert/strict";
import test from "node:test";
import { createMemberAuthFixture } from "./helpers/member-auth-fixture.mjs";
import { createMemberRateLimit } from "../src/server/members/rate-limit.ts";
import { awardReferralRegistration, recordReferralRegistration } from "../src/server/members/referrals.ts";

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

test("only previously issued verification proofs award referrals, with attribution retained for new registrations", async () => {
  const f = createMemberAuthFixture({ trialDays: 0 }), inviter = await f.account({ referralCode: "a".repeat(32) });
  const newPhone = "256700000004", registered = await f.service.register(newPhone, password, { member: null }, inviter.referralCode);
  assert.equal(registered.status, "authenticated"); assert.equal(registered.requiresVerification, undefined);
  assert.equal(f.accounts.get(registered.accountId).phoneVerifiedAt, null);
  assert.equal(f.referralCredits.size, 0); assert.equal(f.messages.length, 0);
  await f.service.requestPasswordReset(newPhone, address, "sms");
  const recovered = await f.service.verifyPasswordReset(newPhone, f.messages[0].code, address);
  assert.equal((await f.service.resetPassword("registered recovery password", recovered.token, address)).status, "authenticated");
  assert.ok(f.accounts.get(registered.accountId).phoneVerifiedAt);
  assert.equal(f.referralCredits.size, 0, "A recovery proof does not change referral policy");
  assert.deepEqual([...f.referrals.values()].map(row => row.status), ["pending"]);
  for (const [index, phone] of ["256700000002", "256700000003"].entries()) {
    const account = await f.account({ phone, phoneVerifiedAt: null });
    await f.database.transaction(tx => recordReferralRegistration(tx, f.config, account, new Date(f.now()), inviter.referralCode));
    const pending = await f.service.login(phone, password, address);
    assert.equal(pending.requiresVerification, true);
    const config = { key: () => { assert.fail("Unverified identity must not reach reward keying"); } };
    await f.database.transaction(tx => awardReferralRegistration(tx, config, account, new Date(f.now())));
    assert.equal(f.referralCredits.size, index);
    const code = await f.legacyCode(account.id);
    const verified = await f.service.verifyAccount(code, pending.token, address);
    assert.equal(verified.status, "authenticated");
    assert.equal((await f.service.verifyAccount(code, pending.token, "203.0.113.100")).status, "unauthorized");
  }
  assert.equal([...f.referrals.values()].filter(row => row.status === "rewarded").length, 2);
  const grants = [...f.referralCredits.values()];
  assert.equal(grants.length, 2); assert.ok(grants.every(row => row.accountId === inviter.id && row.days === 1));
  assert.equal(f.accessCodes.size, 0, "Referral awards wait for explicit redemption");
});

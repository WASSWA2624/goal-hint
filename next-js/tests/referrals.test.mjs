import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomUUID } from "node:crypto";
import { createMemberAuthFixture as fixture } from "./helpers/member-auth-fixture.mjs";
import { createReferrals } from "../src/server/members/referrals.ts";
import { createAccessCodes, createAccessPeriod } from "../src/server/members/access-codes.ts";
import { remainingRewardMs, scheduleRewardPeriods, referralRules } from "../src/domain/referrals.ts";
import { createReferralLinkHandler, readReferralAttribution, signReferralAttribution } from "../src/server/members/referral-attribution.ts";
import { createMemberAuthHandler } from "../src/server/members/member-auth-http.ts";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

const DAY = 86_400_000, HOUR = 3_600_000, password = "correct horse 47", address = "198.51.100.90";
const code = "a".repeat(32), otherCode = "b".repeat(32), friend = "256700000002";
const config = { production: false, cookies: { secure: false, session: "owner-cookie" },
  key: (purpose, value) => createHmac("sha256", "synthetic-test-secret").update(`${purpose}\0${value}`).digest("hex") };
async function inviter(f) {
  const signed = await f.authenticate(), referrals = createReferrals({ database: f.database, now: f.now });
  return { ...signed, referrals, summary: await referrals.read(signed.member) };
}
async function register(f, inviteCode, phone = friend) {
  const result = await f.service.register(phone, password, { member: null }, address, inviteCode);
  assert.equal(result.status, "authenticated"); assert.equal(result.requiresVerification, true);
  return result;
}
async function verify(f, pending) {
  assert.equal((await f.service.requestVerification("sms", pending.token, address)).status, "requested");
  const otp = f.messages.at(-1).code;
  const result = await f.service.verifyAccount(otp, pending.token, address);
  assert.equal(result.status, "authenticated");
  return { result, otp };
}

test("registration captures attribution once; verification awards a full day without payment", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f);
  const pending = await register(f, owner.summary.code);
  assert.equal((await owner.referrals.read(owner.member)).verified, 0);
  assert.equal(f.accessCodes.size, 0, "A link or unverified registration grants no access");
  const registration = [...f.referrals.values()][0];
  assert.equal(registration.inviterId, owner.member.accountId); assert.equal(registration.status, "pending");
  assert.equal(JSON.stringify([...f.referrals.values()]).includes(friend), false, "No raw phone is retained in the reward ledger");
  const { result, otp } = await verify(f, pending);
  const summary = await owner.referrals.read(owner.member);
  assert.equal(summary.verified, 1); assert.equal(summary.earnedDays, 1); assert.equal(summary.remainingMs, DAY);
  assert.equal(summary.history[0].status, "rewarded"); assert.equal(summary.code, owner.summary.code);
  const reward = [...f.accessCodes.values()][0];
  assert.equal(reward.source, "referral"); assert.equal(+reward.endsAt - +reward.startsAt, DAY);
  assert.equal(reward.priceUgx, 0); assert.equal(reward.amountReceivedUgx, 0);
  assert.ok((await f.sessionService.verify(owner.token)).codeEnteredAt, "An expired/free inviter receives normal device access");
  assert.equal((await f.service.verifyAccount(otp, pending.token, address)).status, "unauthorized");
  assert.equal((await f.service.login(friend, password, address, result.token)).status, "authenticated");
  assert.equal(f.accessCodes.size, 1, "Replayed verification and later logins never award again");
  assert.equal(JSON.stringify(summary).includes(registration.phoneKey), false);
});

test("simultaneous verification consumes one code and awards only once", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f), pending = await register(f, owner.summary.code);
  await f.service.requestVerification("sms", pending.token, address);
  const otp = f.messages.at(-1).code;
  const results = await Promise.all([f.service.verifyAccount(otp, pending.token, address), f.service.verifyAccount(otp, pending.token, address)]);
  assert.deepEqual(results.map(row => row.status).sort(), ["authenticated", "unauthorized"]);
  assert.equal(f.accessCodes.size, 1); assert.equal((await owner.referrals.read(owner.member)).earnedDays, 1);
});

test("a failed award rolls back verification and its access period, allowing a safe retry", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f), pending = await register(f, owner.summary.code);
  await f.service.requestVerification("sms", pending.token, address);
  const otp = f.messages.at(-1).code, update = f.tx.memberReferral.update;
  f.tx.memberReferral.update = async () => { throw new Error("Synthetic ledger failure"); };
  await assert.rejects(f.service.verifyAccount(otp, pending.token, address), /Synthetic ledger/);
  assert.equal(f.accessCodes.size, 0); assert.equal(f.accounts.get(pending.accountId).phoneVerifiedAt, null);
  assert.equal([...f.referrals.values()][0].status, "pending");
  f.tx.memberReferral.update = update;
  assert.equal((await f.service.verifyAccount(otp, pending.token, address)).status, "authenticated");
  assert.equal(f.accessCodes.size, 1);
});

test("rewards accumulate across multiple registrations and remain behind all paid/trial periods", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f), at = new Date(f.now());
  await f.database.transaction(tx => createAccessPeriod(tx, f.accounts.get(owner.member.accountId), {
    source: "manual", planName: "Weekly", durationDays: 7, priceUgx: 0 }, "admin", at, { maximum: 2 }));
  for (const phone of [friend, "256700000003", "256700000004"]) await verify(f, await register(f, owner.summary.code, phone));
  const rewards = [...f.accessCodes.values()].filter(row => row.source === "referral").sort((a, b) => +a.startsAt - +b.startsAt);
  assert.equal(+rewards[0].startsAt, +at + 7 * DAY); assert.equal(+rewards[2].endsAt, +at + 10 * DAY);
  assert.equal((await owner.referrals.read(owner.member)).remainingMs, 3 * DAY);
  f.advance(7 * DAY + HOUR);
  assert.equal((await owner.referrals.read(owner.member)).remainingMs, 3 * DAY - HOUR);
});

test("a paid purchase pauses earned access and preserves exact unused milliseconds", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f);
  await verify(f, await register(f, owner.summary.code));
  const original = [...f.accessCodes.values()][0];
  f.advance(5 * HOUR + 1234);
  const at = new Date(f.now()), left = DAY - 5 * HOUR - 1234;
  const paid = await f.database.transaction(tx => createAccessPeriod(tx, f.accounts.get(owner.member.accountId), {
    source: "manual", planName: "Weekly", durationDays: 7, priceUgx: 0 }, "admin", at, { maximum: 2 }));
  const moved = f.accessCodes.get(original.id);
  assert.equal(+paid.startsAt, +at); assert.equal(+moved.startsAt, +paid.endsAt);
  assert.equal(+moved.endsAt - +moved.startsAt, left);
  assert.equal((await owner.referrals.read(owner.member)).remainingMs, left);
  f.advance(DAY);
  assert.equal((await owner.referrals.read(owner.member)).remainingMs, left, "Queued unused time does not expire during paid access");
});

test("repeated scheduling, paid extensions/revocations and reward expiry never recreate spent time", () => {
  const at = new Date("2026-10-31T12:00:00Z"), base = { durationDays: 1, extensionDays: 0, revokedAt: null };
  const paid = { ...base, id: "paid", source: "manual", startsAt: at, endsAt: new Date(+at + DAY) };
  const reward = { ...base, id: "reward", source: "referral", startsAt: new Date(+at - HOUR), endsAt: new Date(+at + 23 * HOUR) };
  const moved = scheduleRewardPeriods([paid, reward], at)[0];
  assert.equal(+moved.startsAt, +paid.endsAt); assert.equal(+moved.endsAt - +moved.startsAt, 23 * HOUR);
  assert.deepEqual(scheduleRewardPeriods([paid, moved], at), [moved]);
  const extended = { ...paid, endsAt: new Date(+paid.endsAt + DAY) };
  assert.equal(+scheduleRewardPeriods([extended, moved], at)[0].startsAt, +extended.endsAt);
  const shortened = scheduleRewardPeriods([{ ...paid, revokedAt: at }, moved], at)[0];
  assert.equal(+shortened.startsAt, +at); assert.equal(+shortened.endsAt - +at, 23 * HOUR);
  assert.equal(remainingRewardMs([shortened], shortened.endsAt), 0);
  assert.deepEqual(scheduleRewardPeriods([shortened], shortened.endsAt), []);
});

test("self/existing accounts and invalid or unverified inviters cannot earn referral rewards", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f);
  assert.equal((await f.service.register(owner.member.phone, password, { member: null }, address, owner.summary.code)).status, "conflict");
  assert.equal((await f.service.register(friend, password, { member: owner.member }, address, owner.summary.code)).status, "invalid");
  f.accounts.get(owner.member.accountId).phoneVerifiedAt = null;
  await verify(f, await register(f, owner.summary.code));
  assert.equal(f.accessCodes.size, 0);
  f.accounts.get(owner.member.accountId).phoneVerifiedAt = new Date(f.now());
  await verify(f, await register(f, "forged", "256700000003"));
  assert.equal(f.accessCodes.size, 0);
});

test("an inviter blocked or erased before verification receives no award", async t => {
  for (const field of ["blockedAt", "erasedAt"]) await t.test(field, async () => {
    const f = fixture({ trialDays: 0 }), owner = await inviter(f), pending = await register(f, owner.summary.code);
    f.accounts.get(owner.member.accountId)[field] = new Date(f.now());
    await verify(f, pending);
    assert.equal(f.accessCodes.size, 0); assert.equal([...f.referrals.values()][0].status, "ineligible");
  });
});

test("a phone registered without an inviter cannot be erased and re-registered for a reward", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f), old = await register(f, null);
  await verify(f, old);
  f.accounts.get(old.accountId).phone = null; f.accounts.get(old.accountId).erasedAt = new Date(f.now());
  const reused = await register(f, owner.summary.code);
  await verify(f, reused);
  assert.equal(f.referrals.size, 1); assert.equal(f.accessCodes.size, 0);
});

test("referral reads reject stale/restricted/foreign/blocked identities and expose only bounded safe history", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f);
  for (let index = 0; index < 15; index++) f.referrals.set(String(index), { id: String(index), inviterId: owner.member.accountId,
    registeredAt: new Date(f.now() - index), rewardedAt: null, status: "pending", phoneKey: "private-digest", accountId: "private-invitee" });
  const summary = await owner.referrals.read(owner.member);
  assert.equal(summary.history.length, referralRules.historyLimit);
  assert.doesNotMatch(JSON.stringify(summary), /private-|phone|accountId|inviterId/);
  for (const change of [{ blocked: true }, { administrator: true }, { accountId: "foreign" }, { tokenHash: "stale" }])
    assert.equal(await owner.referrals.read({ ...owner.member, ...change }), null);
  f.sessions.get(owner.member.tokenHash).passwordResetAt = new Date(f.now());
  assert.equal(await owner.referrals.read(owner.member), null);
});

test("first valid signed attribution wins for 30 days; invalid links/cookies grant nothing", async () => {
  const at = Date.parse("2026-10-31T12:00:00Z"), handler = createReferralLinkHandler(async () => ({ config,
    referrals: { async inviter(value) { return [code, otherCode].includes(value); } } }), () => at);
  const request = value => new Request("https://goal.test/r/example", { headers: value ? { cookie: `goal-hint-referral=${value}` } : {} });
  const response = await handler(request(), code);
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/en/account?view=register");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const attribution = /goal-hint-referral=([^;]+)/u.exec(response.headers.get("set-cookie"))[1];
  assert.deepEqual(readReferralAttribution(config, attribution, at), { code, at });
  assert.equal((await handler(request(attribution), otherCode)).headers.get("set-cookie"), null);
  assert.ok(readReferralAttribution(config, attribution, at + 30 * DAY - 1));
  assert.equal(readReferralAttribution(config, attribution, at + 30 * DAY), null);
  assert.equal(readReferralAttribution(config, attribution, at - 1), null);
  assert.equal(readReferralAttribution(config, attribution.slice(0, -1) + "x", at), null);
  assert.equal((await handler(request(), "bad")).headers.get("set-cookie"), null);
  assert.match(response.headers.get("set-cookie"), /HttpOnly; SameSite=Lax; Max-Age=2592000/);
});

test("registration HTTP trusts only signed attribution and clears it only on success", async () => {
  let selected, status = "authenticated";
  const handler = createMemberAuthHandler("register", async () => ({ config, sessions: { async verify() { return null; } },
    auth: { async register(_phone, _password, _binding, _address, value) { selected = value; return { status, token: "t".repeat(43), phone: friend, requiresVerification: true, message: "Synthetic refusal" }; } } }));
  const attribution = signReferralAttribution(config, code, Date.now());
  const request = value => new Request("https://goal.test/api/account/register", { method: "POST", headers: {
    "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: `goal-hint-referral=${value}` }, body: JSON.stringify({ phone: friend, password }) });
  let response = await handler(request(attribution));
  assert.equal(response.status, 200); assert.equal(selected, code);
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith("goal-hint-referral=;") && value.includes("Max-Age=0")));
  status = "conflict"; response = await handler(request(attribution));
  assert.equal(response.status, 409); assert.equal(response.headers.get("set-cookie"), null);
  status = "authenticated"; response = await handler(request("forged"));
  assert.equal(response.status, 200); assert.equal(selected, undefined);
});

test("the real link, registration and verification HTTP handlers complete a referral without a payment", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f);
  const source = async () => ({ config, sessions: f.sessionService, auth: f.service, referrals: owner.referrals });
  const landing = await createReferralLinkHandler(source)(new Request(`https://goal.test/r/${owner.summary.code}`), owner.summary.code);
  const attribution = landing.headers.getSetCookie()[0].split(";")[0];
  const request = (action, body, cookie) => new Request(`https://goal.test/api/account/${action}`, { method: "POST", headers: {
    "sec-fetch-site": "same-origin", "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  const registered = await createMemberAuthHandler("register", source)(request("register", { phone: friend, password }, attribution));
  assert.equal(registered.status, 200);
  const pendingCookie = registered.headers.getSetCookie()[0].split(";")[0];
  assert.equal((await owner.referrals.read(owner.member)).earnedDays, 0);
  assert.equal((await createMemberAuthHandler("verification", source)(request("verification", { channel: "sms" }, pendingCookie))).status, 200);
  assert.equal((await createMemberAuthHandler("verify", source)(request("verify", { code: f.messages.at(-1).code }, pendingCookie))).status, 200);
  const summary = await owner.referrals.read(owner.member);
  assert.equal(summary.earnedDays, 1); assert.equal(summary.remainingMs, DAY);
});

test("auto-renew waits through the final reward instant, then debits credit exactly once", async () => {
  const f = fixture({ trialDays: 0 }), owner = await inviter(f);
  f.settings.paywallMode = "test";
  await verify(f, await register(f, owner.summary.code));
  const account = f.accounts.get(owner.member.accountId), planId = randomUUID(), entries = [];
  Object.assign(account, { creditUgx: 5000, autoRenew: true, autoRenewPlanId: planId, autoRenewTermsVersion: null });
  f.tx.subscriptionPlan = { async findUnique() { return { id: planId, active: true, name: "Daily", priceUgx: 1000, durationDays: 1 }; } };
  f.tx.walletEntry = { async findUnique({ where }) { return entries.find(row => row.requestKey === where.requestKey) ?? null; },
    async create({ data }) { entries.push(data); return data; } };
  const raw = f.tx.$queryRaw;
  f.tx.$queryRaw = async (strings, ...values) => strings.join("").includes("SELECT creditUgx") ? [{ creditUgx: f.accounts.get(values[0]).creditUgx }]
    : strings.join("").includes("entryNumber") ? entries.slice(-1) : raw(strings, ...values);
  const codes = createAccessCodes({ database: f.database, now: f.now, notifications: silentPaymentNotifications });
  f.advance(DAY - 1);
  assert.equal(await codes.renewDue(account.id), "skipped"); assert.equal(entries.length, 0); assert.equal(account.creditUgx, 5000);
  f.advance(1);
  assert.equal(await codes.renewDue(account.id), "renewed"); assert.equal(entries.length, 1);
  assert.equal(f.accounts.get(account.id).creditUgx, 4000);
  assert.equal(await codes.renewDue(account.id), "skipped"); assert.equal(entries.length, 1);
});

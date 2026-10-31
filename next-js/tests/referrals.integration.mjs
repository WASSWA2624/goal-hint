import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberSessions } from "../src/server/members/member-sessions.ts";
import { createReferrals } from "../src/server/members/referrals.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

test("referral award concurrency, paid precedence, immutable identity and deletion work on isolated MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-31T12:00:00Z");
  const DAY = 86_400_000, now = () => time, messages = [], password = "correct horse 47", phone = "256700001001", friend = "256700001002";
  await f.database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", trialDays: 0, updatedAt: new Date(time), updatedBy: "synthetic-owner" } }));
  const auth = createMemberAuth({ database: f.database, config: f.config, now, adminPhone: () => false, adminPasswordHash: () => null,
    delivery: { async send(message) { messages.push(message); } } });
  const sessions = createMemberSessions({ database: f.database, config: f.config, now, adminPhone: () => false, adminPasswordHash: () => null });
  const referrals = createReferrals({ database: f.database, now });
  const codes = createAccessCodes({ database: f.database, now, notifications: silentPaymentNotifications });
  async function signup(number, code) {
    const pending = await auth.register(number, password, { member: null }, "198.51.100.9", code);
    assert.equal(pending.status, "authenticated");
    await auth.requestVerification("sms", pending.token, "198.51.100.9");
    return { pending, otp: messages.at(-1).code };
  }
  const first = await signup(phone);
  const owner = await auth.verifyAccount(first.otp, first.pending.token, "198.51.100.9"), member = await sessions.verify(owner.token);
  const link = (await referrals.read(member)).code;
  const paid = await codes.manual({ phone, durationDays: 7, amountReceivedUgx: 0, note: "Synthetic paid-priority period" }, "synthetic-owner");
  assert.equal(paid.status, "created");
  const invited = await signup(friend, link);
  const results = await Promise.all([auth.verifyAccount(invited.otp, invited.pending.token, "198.51.100.9"), auth.verifyAccount(invited.otp, invited.pending.token, "198.51.100.10")]);
  assert.deepEqual(results.map(row => row.status).sort(), ["authenticated", "unauthorized"]);
  assert.equal((await referrals.read(member)).earnedDays, 1);
  let reward = await f.database.query(tx => tx.accessCode.findFirst({ where: { accountId: member.accountId, source: "referral" } }));
  assert.equal(+reward.startsAt, +paid.grant.endsAt); assert.equal(+reward.endsAt - +reward.startsAt, DAY);
  assert.equal((await codes.extend(reward.id, 1, "synthetic-owner")).status, "refused", "Earned awards cannot be extended as paid grants");
  time += 7 * DAY + 5 * 3_600_000 + 1234;
  const left = DAY - 5 * 3_600_000 - 1234;
  const purchase = await codes.manual({ phone, durationDays: 2, amountReceivedUgx: 0, note: "Synthetic purchase during rewards" }, "synthetic-owner");
  reward = await f.database.query(tx => tx.accessCode.findUnique({ where: { id: reward.id } }));
  assert.equal(+purchase.grant.startsAt, time); assert.equal(+reward.startsAt, +purchase.grant.endsAt);
  assert.equal(+reward.endsAt - +reward.startsAt, left);
  const planId = randomUUID();
  await f.database.query(tx => tx.subscriptionPlan.create({ data: { id: planId, name: "Referral renewal daily", durationDays: 1, priceUgx: 1000,
    active: true, sortOrder: 99, createdAt: new Date(time), updatedAt: new Date(time) } }));
  assert.equal((await codes.adjustCredit(member.accountId, 10000, "Synthetic earned-access renewal credit", "synthetic-owner")).status, "saved");
  await f.database.query(tx => tx.memberAccount.update({ where: { id: member.accountId }, data: { autoRenew: true, autoRenewPlanId: planId, autoRenewTermsVersion: "2026-10-24" } }));
  time = +reward.endsAt - 1;
  assert.equal(await codes.renewDue(member.accountId), "skipped", "Credit cannot renew ahead of unused earned time");
  assert.equal((await f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: member.accountId } }))).creditUgx, 10000);
  time++;
  assert.equal(await codes.renewDue(member.accountId), "renewed");
  assert.equal((await f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: member.accountId } }))).creditUgx, 9000);
  assert.equal(await codes.renewDue(member.accountId), "skipped");
  assert.equal(await f.database.query(tx => tx.walletEntry.count({ where: { accountId: member.accountId, kind: "renewal" } })), 1);
  await assert.rejects(f.database.query(tx => tx.memberReferral.updateMany({ where: { accountId: invited.pending.accountId }, data: { inviterId: invited.pending.accountId } })));
  const admin = createSubscribers(f.database, now, f.config);
  assert.equal((await admin.action(invited.pending.accountId, "delete", undefined, "synthetic-owner")).status, "saved");
  const reused = await signup(friend, link);
  assert.equal((await auth.verifyAccount(reused.otp, reused.pending.token, "198.51.100.9")).status, "authenticated");
  assert.equal((await referrals.read(member)).earnedDays, 1, "A deleted number cannot earn twice");
  assert.equal((await admin.action(member.accountId, "delete", undefined, "synthetic-owner")).status, "saved");
  assert.equal(await f.database.query(tx => tx.memberReferral.count({ where: { status: "rewarded", accessCodeId: null, inviterId: null } })), 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { createReferralReviews, purgeReferralReviewEvidence, scrubReferralReviewEvidence } from "../src/server/members/referral-reviews.ts";
import { accessCodeTransaction, createAccessCodes, createAccessPeriod, lockMemberAccount } from "../src/server/members/access-codes.ts";
import { referralReviewRules } from "../src/domain/referral-reviews.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

const DAY = 86_400_000, HOUR = 3_600_000;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test("referral review accounting, permissions, concurrency, appeal and privacy on genuine MySQL", { timeout: 240_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-31T12:00:00Z"), serial = 100;
  const now = () => time, admins = new Set(), credential = "plain:synthetic administrator credential", passwordHash = await hashPassword("synthetic member credential");
  async function actor(administrator = false) {
    const phone = `256700${String(++serial).padStart(6, "0")}`, id = randomUUID(), tokenHash = randomBytes(32).toString("hex");
    if (administrator) admins.add(phone);
    await f.database.query(async tx => {
      await tx.memberAccount.create({ data: { id, phone, passwordHash: administrator ? null : passwordHash, phoneVerifiedAt: new Date(time),
        referralCode: randomBytes(16).toString("hex"), createdAt: new Date(time), lastSignInAt: new Date(time) } });
      await tx.memberSession.create({ data: { tokenHash, accountId: id, createdAt: new Date(time), lastSeenAt: new Date(time), authenticatedAt: new Date(time),
        expiresAt: new Date(time + 730 * DAY), ...(administrator ? { adminPasswordVersion: f.config.key("admin-password-version", credential) } : {}) } });
    });
    return { accountId: id, tokenHash, phone, blocked: false, codeEnteredAt: null, accessCodeId: null, expiresAt: new Date(time + 730 * DAY), ...(administrator ? { administrator: true } : {}) };
  }
  const admin = await actor(true), otherAdmin = await actor(true);
  const options = { config: f.config, now, adminPhone: phone => admins.has(phone), adminCredential: () => credential };
  const reviews = createReferralReviews({ ...options, database: f.database });
  const codes = createAccessCodes({ database: f.database, now, notifications: silentPaymentNotifications });
  async function grant(member, source = "referral", duration = DAY) {
    const invitee = source === "referral" ? await actor() : null;
    return accessCodeTransaction(f.database, async tx => {
      const account = await lockMemberAccount(tx, member.accountId);
      const created = await createAccessPeriod(tx, account, { source, planName: source === "referral" ? "Earned access" : "Paid or trial access",
        durationDays: 1, priceUgx: 0, amountReceivedUgx: 0 }, "synthetic-owner", new Date(time), { maximum: 1 }, source === "referral" ? duration : undefined);
      let referralId = null;
      if (invitee) {
        referralId = randomUUID();
        await tx.memberReferral.create({ data: { id: referralId, phoneKey: f.config.key("test-phone", invitee.phone), inviterId: member.accountId,
          accountId: invitee.accountId, registeredAt: new Date(time), status: "pending" } });
        await tx.memberReferral.update({ where: { id: referralId }, data: { status: "rewarded", rewardedAt: new Date(time), accessCodeId: created.id } });
      }
      return { ...await tx.accessCode.findUniqueOrThrow({ where: { id: created.id } }), referralId, invitee };
    });
  }
  const readGrant = id => f.database.query(tx => tx.accessCode.findUniqueOrThrow({ where: { id } }));
  async function open(grantId, administrator = admin) {
    const reply = await reviews.mutate(administrator, { action: "create", requestId: randomUUID(), grantId, reason: "duplicate-award",
      summary: "Corroborated duplicate award in retained accounting records", evidenceRef: "support/TICKET-ABC", evidenceConfirmed: true });
    assert.equal(reply.status, "saved"); return reply.case;
  }
  const confirm = (row, administrator = admin) => reviews.mutate(administrator, { action: "decide", id: row.id, revision: row.revision, decision: "confirm", evidenceConfirmed: true });

  await t.test("real session authorization and private member isolation survive stale/forged roles", async () => {
    const member = await actor(), other = await actor(), earned = await grant(member), row = await open(earned.id);
    assert.equal(await reviews.list(member), null);
    assert.equal((await reviews.mutate({ ...member, administrator: true }, { action: "decide", id: row.id, revision: 1, decision: "confirm", evidenceConfirmed: true })).status, "forbidden");
    assert.deepEqual(await reviews.member(other), []);
    assert.equal((await reviews.appeal(other, { id: row.id, revision: 1, statement: "Please examine this record" })).status, "forbidden");
    await f.database.query(tx => tx.memberSession.update({ where: { tokenHash: admin.tokenHash }, data: { passwordResetAt: new Date(time) } }));
    assert.equal(await reviews.list(admin), null);
    await f.database.query(tx => tx.memberSession.update({ where: { tokenHash: admin.tokenHash }, data: { passwordResetAt: null } }));
    const memberView = await reviews.member(member);
    assert.equal(memberView.length, 1); assert.ok(!JSON.stringify(memberView).includes("TICKET-ABC"));
  });

  await t.test("active, consumed, queued and mixed paid/trial grants keep exact unused milliseconds", async () => {
    const activeOwner = await actor(), active = await grant(activeOwner); time += 5 * HOUR + 37;
    const row = await open(active.id), result = await confirm(row), amount = DAY - 5 * HOUR - 37;
    assert.equal(result.case.reversedMs, amount);
    const original = await readGrant(active.id); assert.equal(+original.startsAt, +active.startsAt); assert.equal(+original.endsAt, +active.endsAt); assert.ok(original.revokedAt);
    const consumedOwner = await actor(), consumed = await grant(consumedOwner); time += DAY;
    assert.equal((await confirm(await open(consumed.id))).case.status, "no-action");
    assert.equal((await readGrant(consumed.id)).revokedAt, null);
    const queuedOwner = await actor(), paid = await grant(queuedOwner, "manual"), trial = await grant(queuedOwner, "trial"), target = await grant(queuedOwner), unrelated = await grant(queuedOwner);
    const [paidBefore, trialBefore] = await Promise.all([readGrant(paid.id), readGrant(trial.id)]);
    assert.equal((await confirm(await open(target.id))).case.reversedMs, DAY);
    assert.deepEqual(await readGrant(paid.id), paidBefore); assert.deepEqual(await readGrant(trial.id), trialBefore);
    const kept = await readGrant(unrelated.id); assert.equal(+kept.endsAt - +kept.startsAt, DAY); assert.equal(+kept.startsAt, +trialBefore.endsAt);
    assert.equal((await f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: queuedOwner.accountId } }))).creditUgx, 0);
    const deletedOwner = await actor(), removed = await grant(deletedOwner), deletionCase = await open(removed.id);
    await f.database.query(async tx => {
      await tx.memberSession.updateMany({ where: { accessCodeId: removed.id }, data: { accessCodeId: null, codeEnteredAt: null } });
      await tx.accessCode.delete({ where: { id: removed.id } });
    });
    const closed = await reviews.mutate(admin, { action: "decide", id: deletionCase.id, revision: 1, decision: "no-action", evidenceConfirmed: false });
    assert.equal(closed.case.status, "no-action", "Deletion cannot strand the immutable nonfinancial review case");
  });

  await t.test("different administrators and different cases cannot reverse the same grant twice; appeals compensate once", async () => {
    const member = await actor(), earned = await grant(member); time += HOUR + 91;
    const [first, second] = await Promise.all([open(earned.id), open(earned.id, otherAdmin)]);
    const results = await Promise.all([confirm(first), confirm(second, otherAdmin)]);
    assert.deepEqual(results.map(result => result.case.status).sort(), ["no-action", "reversed"]);
    assert.equal(await f.database.query(tx => tx.referralGrantReversal.count({ where: { grantId: earned.id } })), 1);
    const winner = results.find(result => result.case.status === "reversed").case;
    const appealed = await reviews.appeal(member, { id: winner.id, revision: winner.revision, statement: "Please reassess the corroborating records" });
    assert.equal(appealed.status, "saved");
    const action = { action: "appeal-decision", id: winner.id, revision: appealed.case.revision, decision: "restore", evidenceConfirmed: false };
    const restored = await Promise.all([reviews.mutate(admin, action), reviews.mutate(otherAdmin, action)]);
    assert.ok(restored.every(reply => reply.status === "saved"));
    const ledger = await f.database.query(tx => tx.referralGrantReversal.findUniqueOrThrow({ where: { grantId: earned.id } }));
    const compensation = await readGrant(ledger.restoredGrantId);
    assert.equal(+compensation.endsAt - +compensation.startsAt, DAY - HOUR - 91);
    assert.equal(await f.database.query(tx => tx.accessCode.count({ where: { createdBy: `referral-review:${winner.id}` } })), 1);
    assert.equal(await f.database.query(tx => tx.memberNotification.count({ where: { eventKey: `referral-review:${winner.id}:restored` } })), 1);
    await assert.rejects(f.database.query(tx => tx.referralReviewEvent.updateMany({ where: { caseId: winner.id }, data: { actor: "rewritten" } })));
    await assert.rejects(f.database.query(tx => tx.referralGrantReversal.update({ where: { grantId: earned.id }, data: { reversedMs: DAY } })));
    await assert.rejects(f.database.query(tx => tx.referralReviewCase.update({ where: { id: winner.id }, data: { grantId: compensation.id } })));
  });

  await t.test("a simultaneous paid purchase cannot recreate consumed earned time", async () => {
    const member = await actor(), earned = await grant(member); time += 3 * HOUR + 3;
    const row = await open(earned.id), expected = DAY - 3 * HOUR - 3;
    const [decision, paid] = await Promise.all([confirm(row), codes.manual({ phone: member.phone, durationDays: 1, amountReceivedUgx: 0, note: "Concurrent paid-access preservation check" }, "synthetic-owner")]);
    assert.equal(decision.case.reversedMs, expected); assert.equal(paid.status, "created");
    assert.equal(+paid.grant.endsAt - +paid.grant.startsAt, DAY);
    assert.equal((await f.database.query(tx => tx.referralGrantReversal.findUniqueOrThrow({ where: { grantId: earned.id } }))).reversedMs, expected);
  });

  await t.test("blocked holders retain their claim without an access grant; upheld appeals and retries close once", async () => {
    const member = await actor(), earned = await grant(member), row = await open(earned.id), reversed = await confirm(row);
    const appeal = await reviews.appeal(member, { id: row.id, revision: reversed.case.revision, statement: "Please verify the supporting records" });
    await f.database.query(tx => tx.memberAccount.update({ where: { id: member.accountId }, data: { blockedAt: new Date(time), blockedReason: "Independent pre-existing account review" } }));
    assert.equal((await reviews.mutate(admin, { action: "appeal-decision", id: row.id, revision: appeal.case.revision, decision: "restore", evidenceConfirmed: false })).status, "conflict");
    assert.equal((await reviews.detail(admin, row.id)).status, "appealed");
    const action = { action: "appeal-decision", id: row.id, revision: appeal.case.revision, decision: "uphold", evidenceConfirmed: true };
    const upheld = await reviews.mutate(admin, action); assert.equal(upheld.case.status, "upheld");
    assert.equal((await reviews.mutate(otherAdmin, action)).status, "saved");
    assert.equal(await f.database.query(tx => tx.accessCode.count({ where: { createdBy: `referral-review:${row.id}` } })), 0);
    assert.equal(await f.database.query(tx => tx.memberNotification.count({ where: { eventKey: `referral-review:${row.id}:upheld` } })), 1);
  });

  await t.test("transaction failure rolls back the grant, case, financial ledger, events and notifications", async () => {
    const member = await actor(), earned = await grant(member), row = await open(earned.id);
    const failedDatabase = { ...f.database, transaction: (run, transactionOptions) => f.database.transaction(async tx => {
      await run(tx); throw new Error("Synthetic failure before commit");
    }, transactionOptions) };
    const failed = createReferralReviews({ ...options, database: failedDatabase });
    await assert.rejects(failed.mutate(admin, { action: "decide", id: row.id, revision: 1, decision: "confirm", evidenceConfirmed: true }));
    assert.equal((await readGrant(earned.id)).revokedAt, null);
    assert.equal((await reviews.detail(admin, row.id)).status, "open");
    assert.equal(await f.database.query(tx => tx.referralGrantReversal.count({ where: { grantId: earned.id } })), 0);
    assert.equal(await f.database.query(tx => tx.referralReviewEvent.count({ where: { caseId: row.id } })), 1);
    assert.equal(await f.database.query(tx => tx.memberNotification.count({ where: { eventKey: `referral-review:${row.id}:reversed` } })), 0);
  });

  await t.test("audited number transfers carry appeal claims without rewriting original ownership or attribution", async () => {
    const member = await actor(), destination = await actor(), paid = await grant(member, "manual"), earned = await grant(member);
    const row = await open(earned.id), reversed = await confirm(row);
    assert.equal((await codes.changeNumber(member.accountId, { newPhone: destination.phone, verifiedBy: "old-number" }, "synthetic-owner")).status, "created");
    assert.equal((await reviews.appeal(member, { id: row.id, revision: reversed.case.revision, statement: "This claim moved with my number" })).status, "forbidden");
    const appealed = await reviews.appeal(destination, { id: row.id, revision: reversed.case.revision, statement: "Please review my transferred reward claim" });
    assert.equal(appealed.status, "saved");
    const restored = await reviews.mutate(admin, { action: "appeal-decision", id: row.id, revision: appealed.case.revision, decision: "restore", evidenceConfirmed: false });
    assert.equal(restored.status, "saved");
    const ledger = await f.database.query(tx => tx.referralGrantReversal.findUniqueOrThrow({ where: { grantId: earned.id } }));
    assert.equal(ledger.accountId, member.accountId); assert.equal(ledger.holderAccountId, destination.accountId);
    assert.equal((await readGrant(ledger.restoredGrantId)).accountId, destination.accountId);
    assert.equal((await readGrant(paid.id)).accountId, member.accountId);
    assert.equal((await f.database.query(tx => tx.memberReferral.findUniqueOrThrow({ where: { id: earned.referralId } }))).inviterId, member.accountId);
  });

  await t.test("retention revalidates a concurrent appeal after selecting an old closed case", async () => {
    const member = await actor(), earned = await grant(member), row = await open(earned.id), reversed = await confirm(row);
    time += referralReviewRules.evidenceRetentionMs;
    const selected = deferred(), resume = deferred();
    const racingDatabase = { ...f.database, transaction: (run, transactionOptions) => f.database.transaction(tx => run(new Proxy(tx, { get(target, key) {
      if (key === "referralReviewCase") return new Proxy(target.referralReviewCase, { get(delegate, method) {
        if (method === "findMany") return async args => { const rows = await delegate.findMany(args); selected.resolve(); await resume.promise; return rows; };
        return delegate[method];
      } });
      const value = target[key]; return typeof value === "function" ? value.bind(target) : value;
    } })), transactionOptions) };
    const purging = purgeReferralReviewEvidence(racingDatabase, now);
    await selected.promise;
    const appeal = await reviews.appeal(member, { id: row.id, revision: reversed.case.revision, statement: "Fresh evidence must survive this concurrent review" });
    assert.equal(appeal.status, "saved"); resume.resolve(); await purging;
    const evidence = await f.database.query(tx => tx.referralReviewEvidence.findUniqueOrThrow({ where: { caseId: row.id } }));
    assert.equal(evidence.appealStatement, "Fresh evidence must survive this concurrent review"); assert.equal(evidence.purgedAt, null);
    assert.equal((await reviews.detail(admin, row.id)).closedAt, null);
  });

  await t.test("late appeals recreate only fresh evidence; erasing either participant scrubs supplementary data", async () => {
    const member = await actor(), earned = await grant(member), row = await open(earned.id), reversed = await confirm(row);
    time += referralReviewRules.evidenceRetentionMs - 1;
    await purgeReferralReviewEvidence(f.database, now);
    assert.ok((await reviews.detail(admin, row.id)).summary);
    time++; await purgeReferralReviewEvidence(f.database, now);
    assert.equal((await reviews.detail(admin, row.id)).summary, null);
    const appeal = await reviews.appeal(member, { id: row.id, revision: reversed.case.revision, statement: "Late appeal retains this new statement only" });
    assert.equal(appeal.status, "saved"); assert.equal((await reviews.detail(admin, row.id)).evidenceRef, null);
    await f.database.transaction(tx => scrubReferralReviewEvidence(tx, earned.invitee.accountId));
    const scrubbed = await f.database.query(tx => tx.referralReviewEvidence.findUniqueOrThrow({ where: { caseId: row.id } }));
    assert.equal(scrubbed.appealStatement, null); assert.ok(scrubbed.purgedAt);
    assert.ok(await f.database.query(tx => tx.referralReviewEvent.count({ where: { caseId: row.id } })));
  });
});

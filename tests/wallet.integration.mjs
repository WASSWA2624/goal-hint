import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createAutoRenew } from "../src/server/members/auto-renew.ts";
import { createMembersPurge } from "../src/server/members/purge.ts";
import { createPayments } from "../src/server/members/payments.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { createAuthenticatedTestSessions as createMemberSessions } from "./helpers/member-fixtures.mjs";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { jpeg } from "./helpers/payment-fixtures.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

const hour = 3_600_000, day = 24 * hour;

test("account credit on restricted real MySQL", { timeout: 240000 }, async (t) => {
  let f; try { f = await paidDatabase(); } catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const { database: db, config, root } = f;
  let clock = Date.parse("2026-10-24T09:00:00Z"), n = 700, txn = 0;
  const now = () => clock;
  const codes = createAccessCodes({ database: db, config, now, notifications: silentPaymentNotifications }), sessions = createMemberSessions({ database: db, config, now });
  const payments = createPayments({ database: db, config, now, environment: null }), subscribers = createSubscribers(db, now, () => false, config);
  const daily = randomUUID(), weekly = randomUUID();
  await db.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", mtnNumber: "256700000901", mtnName: "TEST", airtelNumber: "256700000902",
    airtelName: "TEST AIRTEL", updatedAt: new Date(clock), updatedBy: "test" } }));
  for (const [id, name, durationDays, priceUgx] of [[daily, "Daily", 1, 1000], [weekly, "Weekly", 7, 5000]]) {
    await db.query(tx => tx.subscriptionPlan.create({ data: { id, name, durationDays, priceUgx, active: true, sortOrder: durationDays, createdAt: new Date(clock), updatedAt: new Date(clock) } }));
  }
  async function member() { const signed = await sessions.signIn(`25670000${String(++n).padStart(4, "0")}`, "unknown"); return sessions.verify(signed.token); }
  const balance = async (accountId) => (await db.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: accountId } }))).creditUgx;
  const ledger = (accountId) => db.query(tx => tx.walletEntry.findMany({ where: { accountId }, orderBy: { entryNumber: "asc" } }));
  async function report(who, fields) {
    const tid = `CREDIT${++txn}`;
    const outcome = await payments.submit(who, { payerPhone: who.phone, network: "mtn", transactionId: tid, screenshotAmount: null, accepted: true, ...fields }, jpeg());
    assert.equal(outcome.status, "saved");
    const row = await db.query(tx => tx.paymentSubmission.findFirstOrThrow({ where: { accountId: who.accountId, claimedTxnRef: tid } }));
    return { ...row, tid };
  }
  async function topUp(who, amount, received = amount) {
    const row = await report(who, { purpose: "topup", topUpUgx: amount });
    const outcome = await codes.approvePayment(row.id, { network: "mtn", transactionRef: row.tid, amountReceivedUgx: received }, "owner");
    assert.equal(outcome.status, "credited"); return { row, outcome };
  }
  const buy = (who, planId, requestKey = randomUUID()) => codes.purchaseWithCredit(who, { planId, requestKey, accepted: true });

  await t.test("an approved top-up credits what was received, once, with a ledger row naming the payment", async () => {
    const who = await member(), { row, outcome } = await topUp(who, 20000, 20000);
    assert.deepEqual(outcome.credit, { addedUgx: 20000, balanceUgx: 20000 });
    const stored = await db.query(tx => tx.paymentSubmission.findUniqueOrThrow({ where: { id: row.id } }));
    assert.equal(stored.purpose, "topup"); assert.equal(stored.planId, null); assert.equal(stored.status, "approved");
    assert.equal(await balance(who.accountId), 20000);
    const [entry] = await ledger(who.accountId);
    assert.equal(entry.kind, "topup"); assert.equal(entry.paymentSubmissionId, row.id); assert.equal(entry.entryNumber, 1); assert.equal(entry.actor, "admin");
    assert.notEqual((await codes.approvePayment(row.id, { network: "mtn", transactionRef: row.tid, amountReceivedUgx: 20000 }, "owner")).status, "credited");
    assert.equal(await balance(who.accountId), 20000, "a second approval adds nothing");
    assert.equal(await db.query(tx => tx.accessCode.count({ where: { accountId: who.accountId } })), 0, "a top-up opens no access period");
  });

  await t.test("a plan payment's amount above its price becomes credit beside the period", async () => {
    const who = await member(), row = await report(who, { planId: weekly });
    const outcome = await codes.approvePayment(row.id, { network: "mtn", transactionRef: row.tid, amountReceivedUgx: 8000 }, "owner");
    assert.equal(outcome.status, "created"); assert.deepEqual(outcome.grant.credit, { addedUgx: 3000, balanceUgx: 3000 });
    const [entry] = await ledger(who.accountId);
    assert.equal(entry.kind, "overpayment"); assert.equal(entry.amountUgx, 3000); assert.equal(entry.paymentSubmissionId, row.id);
  });

  await t.test("buying with credit is instant, idempotent per request key and never overdraws", async () => {
    const who = await member(); await topUp(who, 6000);
    assert.equal((await buy(who, weekly)).status, "created");
    assert.equal(await balance(who.accountId), 1000);
    assert.equal((await buy(who, weekly)).status, "insufficient");
    const key = randomUUID(), first = await buy(who, daily, key), replay = await buy(who, daily, key);
    assert.equal(first.status, "created"); assert.equal(replay.status, "created"); assert.equal(replay.grant.id, first.grant.id);
    assert.equal(await balance(who.accountId), 0, "the replay spent nothing");
    const periods = await db.query(tx => tx.accessCode.findMany({ where: { accountId: who.accountId }, orderBy: { startsAt: "asc" } }));
    assert.deepEqual(periods.map(p => p.source), ["credit", "credit"]);
    assert.equal(+periods[1].startsAt, +periods[0].endsAt, "a second plan starts where the first ends");
    const entries = await ledger(who.accountId);
    assert.deepEqual(entries.map(e => [e.kind, e.amountUgx, e.balanceAfter]), [["topup", 6000, 6000], ["purchase", -5000, 1000], ["purchase", -1000, 0]]);
    assert.ok(entries.filter(e => e.kind === "purchase").every(e => e.actor === "member" && e.accessCodeId));
  });

  await t.test("concurrent purchases that one balance covers once buy once", async () => {
    const who = await member(); await topUp(who, 5000);
    const outcomes = await Promise.all([buy(who, weekly), buy(who, weekly), buy(who, weekly)]);
    assert.deepEqual(outcomes.map(o => o.status).sort(), ["created", "insufficient", "insufficient"]);
    assert.equal(await balance(who.accountId), 0);
    assert.deepEqual((await ledger(who.accountId)).map(e => e.entryNumber), [1, 2]);
  });

  await t.test("auto-renewal renews once per period end, from credit, and only within the lead", async () => {
    const who = await member(); await topUp(who, 3000);
    assert.equal((await buy(who, daily)).status, "created");
    assert.equal((await codes.setAutoRenew(who, { on: true, planId: daily })).status, "saved");
    const end = (await db.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: who.accountId }, orderBy: { endsAt: "desc" } }))).endsAt;
    assert.equal(await codes.renewDue(who.accountId), "skipped", "a day away is not due");
    clock = +end - 30 * 60_000;
    const raced = await Promise.all([codes.renewDue(who.accountId), codes.renewDue(who.accountId), createAutoRenew(db, now).run()]);
    assert.equal(raced.filter(r => r === "renewed").length + raced[2].renewed, 1, "the job and two visits renew once");
    assert.equal(await balance(who.accountId), 1000);
    const renewed = await db.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: who.accountId, source: "renewal" } }));
    assert.equal(+renewed.startsAt, +end); assert.equal(renewed.priceUgx, 1000); assert.equal(renewed.amountReceivedUgx, null);
    // The renewal's account-update SMS is written with it and left for the outbox; none is sent from the member's request.
    const notices = await db.query(tx => tx.paymentNotice.findMany({ where: { accountId: who.accountId, kind: "renewed" } }));
    assert.deepEqual(notices.map(notice => [notice.targetId, notice.state]), [[renewed.id, "pending"]], "the job and two visits leave one renewal notice");
    const entry = (await ledger(who.accountId)).at(-1);
    assert.equal(entry.kind, "renewal"); assert.equal(entry.actor, "system"); assert.equal(entry.requestKey, `renewal:${who.accountId}:${+end}`);
    // The next end is a day later; the job skips a lapse older than a day, but the member's visit still renews it.
    clock = +renewed.endsAt + 2 * day;
    assert.equal((await createAutoRenew(db, now).run()).renewed, 0);
    assert.equal(await codes.renewDue(who.accountId), "renewed");
    const late = await db.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: who.accountId }, orderBy: { endsAt: "desc" } }));
    assert.equal(+late.startsAt, clock, "after a lapse the renewed period starts now, never backdated");
    assert.equal(await codes.renewDue(who.accountId), "skipped", "no credit left");
    assert.equal((await codes.setAutoRenew(who, { on: false })).status, "saved");
    clock = Date.parse("2026-10-24T09:00:00Z");
  });

  await t.test("reversing a spent top-up takes the balance below zero and blocks spending until cleared", async () => {
    const who = await member(), { row } = await topUp(who, 5000);
    assert.equal((await buy(who, weekly)).status, "created");
    assert.equal((await codes.reversePayment(row.id, "network-reversal", "owner")).status, "saved");
    assert.equal(await balance(who.accountId), -5000);
    assert.equal((await buy(who, daily)).status, "insufficient");
    assert.equal((await codes.adjustCredit(who.accountId, -1, "Synthetic correction", "owner")).status, "insufficient");
    assert.equal((await codes.adjustCredit(who.accountId, 5000, "Synthetic goodwill", "owner")).status, "saved");
    assert.equal(await balance(who.accountId), 0);
    assert.equal((await codes.adjustCredit(who.accountId, 1000, "Call me on 256700000123", "owner")).status, "invalid", "a reason never holds a phone number");
    assert.deepEqual((await ledger(who.accountId)).map(e => e.kind), ["topup", "purchase", "reversal", "adjustment"]);
  });

  await t.test("a number change moves credit and auto-renewal; erasure forfeits credit; purge keeps ledger accounts", async () => {
    const who = await member(); await topUp(who, 7000);
    assert.equal((await codes.setAutoRenew(who, { on: true, planId: daily })).status, "saved");
    const target = `25670000${String(++n).padStart(4, "0")}`;
    assert.equal((await codes.changeNumber(who.accountId, { newPhone: target, verifiedBy: "payment-details" }, "owner")).status, "saved");
    const moved = await db.query(tx => tx.memberAccount.findFirstOrThrow({ where: { phone: target } }));
    assert.equal(moved.creditUgx, 7000); assert.equal(moved.autoRenew, true); assert.equal(moved.autoRenewPlanId, daily);
    assert.equal(await balance(who.accountId), 0);
    assert.deepEqual((await ledger(moved.id)).map(e => [e.kind, e.amountUgx]), [["transfer", 7000]]);
    assert.equal((await subscribers.action(moved.id, "erase", undefined, "owner")).status, "saved");
    const erased = await db.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: moved.id } }));
    assert.equal(erased.creditUgx, 0); assert.equal(erased.autoRenew, false);
    assert.equal((await ledger(moved.id)).at(-1).note, "Forfeited when the account was erased");
    clock += 40 * day;
    await createMembersPurge(db, now).run();
    assert.ok(await db.query(tx => tx.memberAccount.findUnique({ where: { id: moved.id } })), "an account with a ledger is never purged");
    clock = Date.parse("2026-10-24T09:00:00Z");
  });

  const phone = () => `25670000${String(++n).padStart(4, "0")}`;
  const byPhone = (value) => db.query(tx => tx.memberAccount.findFirstOrThrow({ where: { phone: value } }));
  const kinds = async (accountId) => (await ledger(accountId)).map(e => [e.kind, e.amountUgx]);

  await t.test("a reversal's debt follows the person after a number change, spent or not; an erased account records none", async () => {
    // Spent before the move: no credit moved, but the person did.
    const spent = await member(), { row: first } = await topUp(spent, 5000);
    assert.equal((await buy(spent, weekly)).status, "created");
    clock += 60_000; // the move comes after the credit was given
    const second = phone();
    assert.equal((await codes.changeNumber(spent.accountId, { newPhone: second, verifiedBy: "payment-details" }, "owner")).status, "created");
    const now2 = await byPhone(second);
    assert.equal(await db.query(tx => tx.accountMove.count({ where: { fromAccountId: spent.accountId, toAccountId: now2.id, fromEntryNumber: 2 } })), 1);
    assert.equal((await codes.reversePayment(first.id, "network-reversal", "owner")).status, "saved");
    assert.equal(await balance(spent.accountId), 0);
    assert.equal(await balance(now2.id), -5000, "the debt sits where the person spends");
    assert.deepEqual(await kinds(spent.accountId), [["topup", 5000], ["purchase", -5000], ["reversal", -5000], ["transfer", 5000]]);
    assert.deepEqual(await kinds(now2.id), [["transfer", -5000]]);
    // Moved unspent, twice: the reversal takes the credit back from the latest account.
    const unspent = await member(), { row: paid } = await topUp(unspent, 7000);
    const hop = phone(), last = phone();
    clock += 60_000;
    await codes.changeNumber(unspent.accountId, { newPhone: hop, verifiedBy: "payment-details" }, "owner");
    const hopAccount = await byPhone(hop);
    await codes.changeNumber(hopAccount.id, { newPhone: last, verifiedBy: "payment-details" }, "owner");
    const lastAccount = await byPhone(last);
    assert.equal(await balance(lastAccount.id), 7000);
    assert.equal((await codes.reversePayment(paid.id, "network-reversal", "owner")).status, "saved");
    assert.deepEqual([await balance(unspent.accountId), await balance(hopAccount.id), await balance(lastAccount.id)], [0, 0, 0]);
    // Forfeited at erasure: nothing left to owe.
    const gone = await member(), { row: forfeited } = await topUp(gone, 3000);
    assert.equal((await subscribers.action(gone.accountId, "erase", undefined, "owner")).status, "saved");
    assert.equal((await codes.reversePayment(forfeited.id, "network-reversal", "owner")).status, "saved");
    assert.equal(await balance(gone.accountId), 0);
    assert.ok(!(await kinds(gone.accountId)).some(([kind]) => kind === "reversal"));
    clock = Date.parse("2026-10-24T09:00:00Z");
  });

  await t.test("credit the old account receives after a move keeps its debt there when reversed", async () => {
    const who = await member(); await topUp(who, 1000);
    const pending = await report(who, { planId: weekly });
    const target = phone();
    assert.equal((await codes.changeNumber(who.accountId, { newPhone: target, verifiedBy: "payment-details" }, "owner")).status, "saved");
    const moved = await byPhone(target);
    clock += 60_000;
    // The plan report waiting at the move is approved on the old account with UGX 3,000 over the price.
    const approved = await codes.approvePayment(pending.id, { network: "mtn", transactionRef: pending.tid, amountReceivedUgx: 8000 }, "owner");
    assert.equal(approved.status, "created"); assert.equal(await balance(who.accountId), 3000);
    assert.equal((await codes.reversePayment(pending.id, "network-reversal", "owner")).status, "saved");
    assert.equal(await balance(who.accountId), 0, "the old account's later credit is taken back where it was given");
    assert.equal(await balance(moved.id), 1000, "the new account keeps only what moved with the person");
    clock = Date.parse("2026-10-24T09:00:00Z");
  });

  await t.test("a report hidden by a newer one of the other purpose still shows while it waits, both ways", async () => {
    const who = await member();
    const pendingTopUp = await report(who, { purpose: "topup", topUpUgx: 4000 });
    clock += 60_000;
    const plan = await report(who, { planId: daily });
    let view = await payments.view(who, { trialDays: 2 });
    assert.equal(view.status.purpose, "plan");
    assert.equal(view.otherStatus?.purpose, "topup"); assert.equal(view.otherStatus?.status, "pending"); assert.equal(view.otherStatus?.priceUgx, 4000);
    assert.equal((await codes.approvePayment(pendingTopUp.id, { network: "mtn", transactionRef: pendingTopUp.tid, amountReceivedUgx: 4000 }, "owner")).status, "credited");
    assert.equal((await payments.view(who, { trialDays: 2 })).otherStatus, null, "an approved top-up needs no card: its credit shows");
    // The other way round: a newer top-up must not hide the plan report still waiting behind it.
    clock += 60_000;
    await report(who, { purpose: "topup", topUpUgx: 2000 });
    view = await payments.view(who, { trialDays: 2 });
    assert.equal(view.status.purpose, "topup"); assert.equal(view.otherStatus?.reference, `P${plan.reference}`);
    assert.equal((await codes.subscriptionStatus(who)).paymentPending, true);
    clock = Date.parse("2026-10-24T09:00:00Z");
  });

  await t.test("moves in any order route a reversal's debt; accounts with moves are erased, never deleted; a key buys one plan", async () => {
    const who = await member(), { row } = await topUp(who, 6000);
    const middle = phone(), again = phone(), last = phone();
    await codes.changeNumber(who.accountId, { newPhone: middle, verifiedBy: "payment-details" }, "owner");
    const middleAccount = await byPhone(middle);
    // The old account gets credit after its move and moves again; then the middle account moves on.
    assert.equal((await codes.adjustCredit(who.accountId, 1000, "Synthetic goodwill", "owner")).status, "saved");
    assert.equal((await codes.changeNumber(who.accountId, { newPhone: again, verifiedBy: "payment-details" }, "owner")).status, "saved");
    const againAccount = await byPhone(again);
    await codes.changeNumber(middleAccount.id, { newPhone: last, verifiedBy: "payment-details" }, "owner");
    const lastAccount = await byPhone(last);
    assert.equal(await balance(lastAccount.id), 6000); assert.equal(await balance(againAccount.id), 1000);
    assert.equal((await codes.reversePayment(row.id, "network-reversal", "owner")).status, "saved");
    assert.deepEqual([await balance(who.accountId), await balance(middleAccount.id), await balance(lastAccount.id), await balance(againAccount.id)], [0, 0, 0, 1000],
      "the 6,000 is taken back where it went; the later 1,000 that moved elsewhere is untouched");
    // Move history is what traces credit, so an account in it can be erased but not deleted, and the rows never change.
    const refused = await subscribers.action(middleAccount.id, "delete", undefined, "owner");
    assert.equal(refused.status, "refused"); assert.match(refused.message, /Erase/u);
    await assert.rejects(root.query("DELETE FROM MemberAccount WHERE id = ?", [middleAccount.id]), /foreign key/iu);
    await assert.rejects(root.query("DELETE FROM AccountMove WHERE fromAccountId = ?", [who.accountId]), /append-only/u);
    await assert.rejects(root.query("UPDATE AccountMove SET toAccountId = ? WHERE fromAccountId = ?", [who.accountId, middleAccount.id]), /append-only/u);
    await assert.rejects(db.query(tx => tx.accountMove.deleteMany({ where: { fromAccountId: who.accountId } })), "the application role cannot delete moves");
    assert.equal((await subscribers.action(middleAccount.id, "erase", undefined, "owner")).status, "saved");
    const kept = await subscribers.action(middleAccount.id, "delete", undefined, "owner");
    assert.equal(kept.status, "refused"); assert.match(kept.message, /accounting/u); assert.doesNotMatch(kept.message, /Erase/u);
    // A request key names one plan: reusing it for another plan never returns the first purchase as if it were the second.
    const buyer = await member(); await topUp(buyer, 6000);
    const key = randomUUID();
    assert.equal((await buy(buyer, daily, key)).status, "created");
    assert.equal((await buy(buyer, weekly, key)).status, "invalid");
    assert.equal(await balance(buyer.accountId), 5000);
  });

  await t.test("a number change waits for a top-up under review, so its credit is never stranded on the old number", async () => {
    const who = await member(); await topUp(who, 1000);
    const pending = await report(who, { purpose: "topup", topUpUgx: 2000 });
    const target = phone();
    const refused = await codes.changeNumber(who.accountId, { newPhone: target, verifiedBy: "old-number" }, "owner");
    assert.equal(refused.status, "invalid"); assert.match(refused.message, /top-up/u);
    assert.equal((await codes.approvePayment(pending.id, { network: "mtn", transactionRef: pending.tid, amountReceivedUgx: 2000 }, "owner")).status, "credited");
    assert.equal((await codes.changeNumber(who.accountId, { newPhone: target, verifiedBy: "old-number" }, "owner")).status, "saved");
    assert.equal(await balance((await byPhone(target)).id), 3000); assert.equal(await balance(who.accountId), 0);
  });

  await t.test("auto-renewal needs the current terms, records them, survives a revoked renewal and can always be turned off", async () => {
    const { createCreditHandler } = await import("../src/server/members/credit-http.ts");
    const who = await member();
    assert.equal((await codes.adjustCredit(who.accountId, 5000, "Synthetic goodwill", "owner")).status, "saved");
    assert.equal((await codes.setAutoRenew(who, { on: true, planId: daily })).status, "invalid", "no report has accepted the terms");
    assert.equal((await codes.setAutoRenew(who, { on: true, planId: daily, accepted: true })).status, "saved");
    const { termsNotice } = await import("../src/domain/terms-notice.ts");
    assert.equal((await db.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: who.accountId } }))).autoRenewTermsVersion, termsNotice.reviewedOn);
    assert.equal((await buy(who, daily)).status, "created");
    assert.equal((await codes.subscriptionStatus(who)).renewsFromCredit, true);
    const end = (await db.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: who.accountId }, orderBy: { endsAt: "desc" } }))).endsAt;
    clock = +end - 10 * 60_000;
    assert.equal(await codes.renewDue(who.accountId), "renewed");
    const renewed = await db.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: who.accountId, source: "renewal" } }));
    assert.equal(renewed.termsVersion, termsNotice.reviewedOn);
    assert.equal((await codes.revoke(renewed.id, "owner-revoked", "owner")).status, "saved");
    assert.equal(await codes.renewDue(who.accountId), "skipped", "a revoked renewal of the same end is not bought again, and nothing throws");
    assert.equal((await codes.subscriptionStatus(who)).renewsFromCredit, false, "nor is it promised");
    clock = Date.parse("2026-10-24T09:00:00Z");
    await db.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { paywallMode: "off" } }));
    try {
      assert.equal((await codes.subscriptionStatus(who)).renewsFromCredit, false, "closed sales never renew");
      const handler = createCreditHandler(async () => ({ config: { production: false }, settings: { settings: { paywallMode: "off" } },
        sessions: { async verify() { return who; } }, codes }));
      const post = (body) => handler(new Request("http://localhost/api/account/credit", { method: "POST", body: JSON.stringify(body),
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" } }));
      assert.equal((await post({ action: "purchase", planId: daily, requestKey: randomUUID(), accepted: true })).status, 403);
      assert.equal((await post({ action: "auto-renew", on: true, planId: daily, accepted: true })).status, 403);
      assert.equal((await post({ action: "auto-renew", on: false })).status, 200, "turning auto-renewal off works while sales are closed");
      assert.equal((await db.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: who.accountId } }))).autoRenew, false);
    } finally { await db.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { paywallMode: "test" } })); }
  });

  await t.test("a correction's reason never holds a phone number, however it is written", async () => {
    const who = await member();
    for (const note of ["Refund agreed on 0772 123 456", "Call +256-772-123-456", "See (0772) 123.456"]) {
      assert.equal((await codes.adjustCredit(who.accountId, 1000, note, "owner")).status, "invalid", note);
    }
    assert.equal((await codes.adjustCredit(who.accountId, 1000, "Goodwill for outage on 24 Oct 2026", "owner")).status, "saved");
    await assert.rejects(root.query(`INSERT INTO WalletEntry (id, accountId, entryNumber, kind, amountUgx, balanceAfter, actor, note, createdAt)
      VALUES (?, ?, 2, 'adjustment', 1000, 2000, 'admin', 'Call 0772 123 456', NOW(3))`, [randomUUID(), who.accountId]), /check/iu);
  });

  await t.test("the ledger refuses updates, deletes and unlinked rows; permanent deletion removes it by cascade", async () => {
    const who = await member(), { row } = await topUp(who, 2000);
    const [entry] = await ledger(who.accountId);
    await assert.rejects(db.query(tx => tx.walletEntry.update({ where: { id: entry.id }, data: { amountUgx: 9000 } })), "the application role cannot update");
    await assert.rejects(root.query("UPDATE WalletEntry SET amountUgx = 9000 WHERE id = ?", [entry.id]), /append-only/u);
    await assert.rejects(root.query("DELETE FROM WalletEntry WHERE id = ?", [entry.id]), /append-only/u);
    await assert.rejects(root.query(`INSERT INTO WalletEntry (id, accountId, entryNumber, kind, amountUgx, balanceAfter, actor, createdAt)
      VALUES (?, ?, 2, 'topup', 1000, 3000, 'admin', NOW(3))`, [randomUUID(), who.accountId]), /links exactly/u);
    await assert.rejects(root.query(`INSERT INTO WalletEntry (id, accountId, entryNumber, kind, amountUgx, balanceAfter, paymentSubmissionId, actor, createdAt)
      VALUES (?, ?, 2, 'topup', 1000, 3000, ?, 'member', NOW(3))`, [randomUUID(), who.accountId, row.id]), /check/iu, "only the owner adds credit");
    assert.equal((await subscribers.action(who.accountId, "delete", undefined, "owner")).status, "saved");
    assert.equal((await ledger(who.accountId)).length, 0);
    assert.equal(await db.query(tx => tx.paymentSubmission.count({ where: { id: row.id } })), 0);
  });
});

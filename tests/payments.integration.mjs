import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { paymentRules } from "../src/domain/payment.ts";
import { termsNotice } from "../src/domain/terms-notice.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createAuthenticatedTestSessions as createMemberSessions } from "./helpers/member-fixtures.mjs";
import { createPayments } from "../src/server/members/payments.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { jpeg } from "./helpers/payment-fixtures.mjs";
import { grantSessionAccess } from "../src/server/members/device-grants.ts";
import { lockMemberAccount } from "../src/server/members/access-codes.ts";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

test("real MySQL payment transactions, budgets, snapshots, assent and trial limits", { timeout: 180_000 }, async (t) => {
  let fixture;
  try { fixture = await paidDatabase(); } catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  const { database, config, root } = fixture;
  t.after(() => fixture.close());
  let instant = Date.parse("2026-10-19T09:00:00Z"), serial = 100;
  const now = () => instant, at = new Date(instant), planId = randomUUID();
  const sessions = createMemberSessions({ database, config, now }), payments = createPayments({ database, config, now, environment: null }), codes = createAccessCodes({ database, config, now, notifications: silentPaymentNotifications });
  await database.query((tx) => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", mtnNumber: "256700000901", mtnName: "TEST MTN", airtelNumber: "256700000902", airtelName: "TEST AIRTEL", updatedAt: at, updatedBy: "synthetic-owner" } }));
  await database.query((tx) => tx.subscriptionPlan.create({ data: { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 1, createdAt: at, updatedAt: at } }));
  async function member(phone) { const signed = await sessions.signIn(phone ?? `25670000${String(++serial).padStart(4, "0")}`, "unknown"); return sessions.verify(signed.token); }
  const fields = (overrides = {}) => ({ planId, payerPhone: "256700000101", network: "mtn", transactionId: `TEST-${++serial}`, screenshotAmount: 5000, accepted: true, ...overrides });
  const settings = { ...defaultSubscriptionSettings, paywallMode: "test", trialDays: 2 };
  const image = jpeg();
  async function report(who, values = fields(), screenshot = image) { assert.equal(await payments.begin(who, "unknown", screenshot?.length ?? 1), true); return payments.submit(who, values, screenshot); }
  const count = () => database.query((tx) => tx.paymentSubmission.count());
  const dayStart = new Date(Math.floor(instant / 86_400_000) * 86_400_000);
  async function setBudget(purpose, value, counters) {
    const key = config.key(`member-${purpose}`, value);
    await database.query((tx) => tx.rateLimitBucket.upsert({ where: { key }, create: { key, count: 0, bytes: 0, windowStartedAt: dayStart, ...counters }, update: { windowStartedAt: dayStart, ...counters } }));
  }
  await t.test("concurrent submissions leave exactly one pending; original snapshots and image bytes survive plan edits", async () => {
    const who = await member();
    const results = await Promise.all([report(who), report(who)]);
    assert.deepEqual(results.map((row) => row.status), ["saved", "saved"]);
    const rows = await database.query((tx) => tx.paymentSubmission.findMany({ where: { accountId: who.accountId }, include: { screenshot: true } }));
    assert.equal(rows.filter((row) => row.status === "pending").length, 1);
    const old = rows.find((row) => row.status === "superseded"); assert.equal(old.decidedBy, "system:superseded"); assert.equal(+old.decidedAt, instant);
    for (const row of rows) { assert.equal(row.termsVersion, termsNotice.reviewedOn); assert.equal(+row.acceptedAt, instant); assert.deepEqual(Buffer.from(row.screenshot.data), image); }
    await database.query((tx) => tx.subscriptionPlan.update({ where: { id: planId }, data: { priceUgx: 6000, durationDays: 8, name: "Edited" } }));
    const stored = await database.query((tx) => tx.paymentSubmission.findFirst({ where: { accountId: who.accountId } }));
    assert.equal(stored.priceUgx, 5000); assert.equal(stored.durationDays, 7); assert.equal(stored.planName, "Weekly");
    await database.query((tx) => tx.subscriptionPlan.update({ where: { id: planId }, data: { priceUgx: 5000, durationDays: 7, name: "Weekly" } }));
  });
  await t.test("pending ID duplicates are accepted; an approved ID across networks and punctuation stores nothing", async () => {
    const first = await member(), second = await member(), transactionId = `TEST.REUSE-${++serial}`;
    const a = await report(first, fields({ transactionId })), b = await report(second, fields({ transactionId, network: "airtel" }));
    assert.equal(a.status, "saved"); assert.equal(b.status, "saved");
    const row = await database.query((tx) => tx.paymentSubmission.findUniqueOrThrow({ where: { reference: a.reference.slice(1) } }));
    const approved = await codes.approvePayment(row.id, { network: "mtn", transactionRef: transactionId, amountReceivedUgx: 5000, planId }, "synthetic-owner"); assert.equal(approved.status, "created");
    const before = await count();
    const result = await report(await member(), fields({ transactionId: transactionId.replace(/[.-]/gu, ""), network: "airtel" }));
    assert.equal(result.status, "duplicate"); assert.equal(await count(), before);
    const otherDevice = await payments.view(await member(first.phone), settings); assert.equal(otherDevice.status.reference, a.reference);
    const visible = await payments.view(first, settings); assert.equal(visible.status.reference, a.reference); assert.ok(visible.status.endsAt);
  });
  await t.test("current account assent survives reversal and a new locked device", async () => {
    const who = await member(); assert.equal((await report(who, fields({ accepted: false }))).status, "invalid");
    const submitted = await report(who), row = await database.query((tx) => tx.paymentSubmission.findUniqueOrThrow({ where: { reference: submitted.reference.slice(1) } }));
    assert.equal((await payments.view(who, settings)).acceptedTerms, true, "The accepted report records consent before approval.");
    const approved = await codes.approvePayment(row.id, { planId, network: "mtn", transactionRef: fields().transactionId, amountReceivedUgx: 5000 }, "synthetic-owner"); assert.equal(approved.status, "created");
    assert.equal((await codes.reversePayment(row.id, "network-reversal", "synthetic-owner")).status, "saved");
    const locked = await member(who.phone); assert.equal(locked.codeEnteredAt, null);
    assert.equal((await payments.view(locked, settings)).acceptedTerms, true);
    assert.equal((await report(locked, fields({ accepted: false }))).status, "saved");
  });
  await t.test("reports use the supplied payer and plan price and keep the screenshot's amount only as a hint; approval preserves the paid-for offer", async () => {
    const who = await member(), transactionId = `HINTED-${++serial}`, sent = await report(who, fields({ payerPhone: "0700000199", transactionId, screenshotAmount: 4000 }));
    const before = await database.query((tx) => tx.paymentSubmission.findUniqueOrThrow({ where: { reference: sent.reference.slice(1) }, include: { screenshot: true } }));
    assert.equal(before.payerPhone, "256700000199"); assert.equal(before.claimedAmountUgx, 5000); assert.equal(before.claimedTxnKey, transactionId.replace("-", ""));
    assert.equal(before.claimedTxnRef, transactionId.replace("-", "")); assert.equal(before.screenshotAmountUgx, 4000, "the browser's reading, never the claim");
    assert.equal(before.status, "pending"); assert.ok(before.screenshot); assert.ok(before.imageSha256); assert.equal(before.imageBytes, image.length);
    assert.equal(await database.query((tx) => tx.accessCode.count({ where: { accountId: who.accountId } })), 0);
    assert.equal((await database.query((tx) => tx.memberSession.findUniqueOrThrow({ where: { tokenHash: who.tokenHash } }))).codeEnteredAt, null);
    await database.query((tx) => tx.subscriptionPlan.update({ where: { id: planId }, data: { priceUgx: 7000, durationDays: 30 } }));
    const approved = await codes.approvePayment(before.id, { planId, network: "mtn", transactionRef: transactionId, amountReceivedUgx: 5000 }, "owner");
    assert.equal(approved.status, "created"); assert.equal(+approved.grant.endsAt - +approved.grant.startsAt, 7 * 86_400_000);
    assert.equal(approved.grant.devicesUnlocked, 1); assert.ok(!("ready" in approved));
    const after = await database.query((tx) => tx.paymentSubmission.findUniqueOrThrow({ where: { id: before.id } }));
    assert.equal(after.priceUgx, 5000); assert.equal(after.durationDays, 7);
    await database.query((tx) => tx.subscriptionPlan.update({ where: { id: planId }, data: { priceUgx: 5000, durationDays: 7 } }));
    const again = await member(who.phone);
    await database.transaction(async (tx) => { await lockMemberAccount(tx, again.accountId); assert.equal(await grantSessionAccess(tx, { accountId: again.accountId, tokenHash: again.tokenHash, at: new Date(instant), actor: "member" }), true); });
  });
  await t.test("invalid IDs cannot replace a pending report, even when calling the service directly", async () => {
    const who = await member(), sent = await report(who), before = await count();
    for (const transactionId of [undefined, null, "", "   ", "---.", "abc", "<script>"]) {
      assert.equal((await payments.submit(who, fields({ transactionId }), null)).status, "invalid");
      assert.equal((await payments.submit(who, fields({ transactionId }), image)).status, "invalid");
    }
    assert.equal(await count(), before);
    assert.equal((await database.query(tx => tx.paymentSubmission.findUniqueOrThrow({ where: { reference: sent.reference.slice(1) } }))).status, "pending");
  });
  await t.test("a report without its screenshot stores nothing, and an out-of-range screenshot amount is kept as unread", async () => {
    const who = await member(), before = await count();
    assert.equal((await payments.submit(who, fields(), null)).status, "invalid");
    assert.equal(await count(), before);
    // A fresh member each time: one session may store only three reports.
    for (const screenshotAmount of [null, 99, 10_000_001, 1.5]) {
      const sent = await report(await member(), fields({ screenshotAmount }));
      assert.equal(sent.status, "saved", String(screenshotAmount));
      assert.equal((await database.query((tx) => tx.paymentSubmission.findUniqueOrThrow({ where: { reference: sent.reference.slice(1) } }))).screenshotAmountUgx, null);
    }
  });
  await t.test("every report consumes the stored-submission cap and retains an audit trail", async () => {
    const who = await member();
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => payments.submit(who, fields(), image)));
    assert.equal(outcomes.filter(row => row.status === "saved").length, 3);
    assert.equal(outcomes.filter(row => row.status === "busy").length, 3);
    assert.equal(await payments.begin(who, "unknown", 100), false);
    const counter = await database.query(tx => tx.rateLimitBucket.findUniqueOrThrow({ where: { key: config.key("member-upload-stored", who.tokenHash) } }));
    assert.equal(counter.count, 3); assert.equal(counter.bytes, 3 * image.length);
    const audits = await database.query(tx => tx.ownerAuditEvent.findMany({ where: { accountId: who.accountId, action: "payment_submitted" } }));
    assert.equal(audits.length, 3);
    assert.equal(await database.query(tx => tx.paymentScreenshot.count({ where: { submission: { accountId: who.accountId } } })), 3);
  });
  await t.test("stored and attempted uploads have independent daily caps, including concurrent storage", async () => {
    const who = await member();
    const outcomes = await Promise.all(Array.from({ length: 6 }, () => payments.submit(who, fields(), image)));
    assert.equal(outcomes.filter((row) => row.status === "saved").length, 3); assert.equal(outcomes.filter((row) => row.status === "busy").length, 3);
    assert.equal(await payments.begin(who, "unknown", 100), false);
    const failed = await member();
    for (let index = 0; index < 10; index++) assert.equal(await payments.begin(failed, "unknown", 100), true);
    assert.equal(await payments.begin(failed, "unknown", 100), false);
    assert.equal((await payments.submit(failed, fields(), image)).status, "saved");
    const counter = await database.query((tx) => tx.rateLimitBucket.findUniqueOrThrow({ where: { key: config.key("member-upload-stored", failed.tokenHash) } })); assert.equal(counter.count, 1);
  });
  await t.test("shared IP budgets, unknown addresses and the stored site ceiling hold with an owner alert", async () => {
    const who = await member();
    await setBudget("upload-ip", "198.51.100.10", { count: 49, bytes: 0 });
    const limits = await Promise.all([payments.begin(who, "198.51.100.10", 100), payments.begin(who, "198.51.100.10", 100)]); assert.equal(limits.filter(Boolean).length, 1);
    await setBudget("upload-ip", "198.51.100.11", { count: 0, bytes: paymentRules.ipBytes - 99 }); assert.equal(await payments.begin(who, "198.51.100.11", 100), false);
    assert.equal(await payments.begin(who, "unknown", 100), true);
    await setBudget("upload-site", "all", { count: 0, bytes: paymentRules.siteBytes }); assert.equal(await payments.begin(who, "unknown", 100), false);
    assert.ok(await database.query((tx) => tx.ownerAuditEvent.findFirst({ where: { action: "uploads_busy" } })));
    await setBudget("upload-site", "all", { count: 0, bytes: paymentRules.siteBytes - image.length + 1 });
    assert.equal((await payments.submit(who, fields(), image)).status, "busy"); await setBudget("upload-site", "all", { count: 0, bytes: 0 });
  });
  await t.test("payment submission uses environment wallets even when stored history has different networks", async () => {
    const environment = { mtnNumber: null, mtnName: null, mtnMenuShortcut: null,
      airtelNumber: "256700000910", airtelName: "ENV AIRTEL", airtelMenuShortcut: null, contactPhone: null, whatsappPhone: null };
    const configured = createPayments({ database, config, now, environment });
    const who = await member();
    await root.query("UPDATE SubscriptionSettings SET airtelNumber = NULL, airtelName = NULL WHERE id = 1");
    try {
      assert.equal(await configured.begin(who, "unknown", image.length), true);
      assert.equal((await configured.submit(who, fields({ network: "mtn" }), image)).status, "invalid", "A stale stored wallet cannot accept new reports.");
      assert.equal((await configured.submit(who, fields({ network: "airtel" }), image)).status, "saved", "An environment-only wallet accepts reports.");
      const stored = await database.query((tx) => tx.subscriptionSettings.findUniqueOrThrow({ where: { id: 1 } }));
      assert.equal(stored.airtelNumber, null, "Submission never overwrites historical settings.");
      assert.equal(stored.mtnNumber, "256700000901");
    } finally {
      await root.query("UPDATE SubscriptionSettings SET airtelNumber = '256700000902', airtelName = 'TEST AIRTEL' WHERE id = 1");
    }
  });
  await t.test("trial requests are once per account, serialized, bounded by IP and refused after any code", async () => {
    const who = await member(); assert.equal((await payments.view(who, settings)).trialEligible, true);
    const requests = await Promise.all([payments.trial(who, "unknown"), payments.trial(who, "unknown")]); assert.equal(requests.filter((row) => row === "saved").length, 1);
    assert.equal(await payments.trial(await member(who.phone), "unknown"), "refused");
    const used = await member(); await codes.manual({ phone: used.phone, planId, amountReceivedUgx: 0, note: "Synthetic prior code" }, "synthetic-owner"); assert.equal(await payments.trial(used, "unknown"), "refused");
    await setBudget("trial-ip", "198.51.100.20", { count: 19 });
    const ipResults = await Promise.all([(async () => payments.trial(await member(), "198.51.100.20"))(), (async () => payments.trial(await member(), "198.51.100.20"))()]); assert.equal(ipResults.filter((row) => row === "saved").length, 1); assert.equal(ipResults.filter((row) => row === "busy").length, 1);
    await root.query("UPDATE SubscriptionSettings SET trialDays = 0 WHERE id = 1"); assert.equal(await payments.trial(await member(), "unknown"), "refused");
    await root.query("UPDATE SubscriptionSettings SET paywallMode = 'off', trialDays = 2 WHERE id = 1"); assert.equal(await payments.trial(await member(), "unknown"), "refused"); assert.equal((await payments.submit(await member(), fields(), image)).status, "refused");
    instant += 86_400_000;
  });
});

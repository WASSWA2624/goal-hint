import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { createAuthenticatedTestSessions } from "./helpers/member-fixtures.mjs";
import { createCheckout } from "../src/server/members/checkout.ts";
import { createCheckoutReview } from "../src/server/admin/checkout-review.ts";
import { createReviewAlertRegistry, reviewAlertFeed } from "../src/server/admin/payment-alerts.ts";
import { createReviewAlertWorker } from "../src/server/admin/payment-alert-worker.ts";
import { memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createSettingsService } from "../src/server/members/settings.ts";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { authCopy } from "../src/i18n/messages/auth.ts";

test("atomic reviewer events, endpoint security and retries on real MySQL", { timeout: 240_000 }, async t => {
  let fixture;
  try { fixture = await paidDatabase(); } catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => fixture.close());
  const { database, config } = fixture;
  const before = { phones: process.env.GOAL_HINT_ADMIN_PHONES, password: process.env.GOAL_HINT_ADMIN_PASSWORD, hash: process.env.GOAL_HINT_ADMIN_PASSWORD_HASH };
  process.env.GOAL_HINT_ADMIN_PHONES = '["256700009901"]';
  process.env.GOAL_HINT_ADMIN_PASSWORD = "synthetic admin password only";
  delete process.env.GOAL_HINT_ADMIN_PASSWORD_HASH;
  t.after(() => { for (const [key, value] of Object.entries({ GOAL_HINT_ADMIN_PHONES: before.phones, GOAL_HINT_ADMIN_PASSWORD: before.password, GOAL_HINT_ADMIN_PASSWORD_HASH: before.hash })) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  let instant = Date.parse("2026-11-03T09:00:00Z"), phone = 0;
  const now = () => instant, at = () => new Date(now());
  const sessions = createAuthenticatedTestSessions({ database, config, now });
  async function member(number = `25670001${String(++phone).padStart(4, "0")}`) {
    const signed = await sessions.signIn(number, "synthetic");
    return { signed, hash: memberTokenHash(signed.token), identity: await sessions.verify(signed.token) };
  }
  const admin = await member("256700009901");
  await database.query(tx => tx.memberSession.update({ where: { tokenHash: admin.hash }, data: { adminPasswordVersion: config.key("admin-password-version", "plain:synthetic admin password only") } }));
  const customer = await member(), registry = createReviewAlertRegistry(database, config, now);
  const planId = randomUUID();
  await database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", mtnEnabled: true, mtnNumber: "256700000901", mtnName: "TEST MTN", updatedAt: at(), updatedBy: "test" } }));
  await database.query(tx => tx.subscriptionPlan.create({ data: { id: planId, name: "Weekly", durationDays: 7, priceUgx: 5000, active: true, sortOrder: 1, createdAt: at(), updatedAt: at() } }));
  const registration = { transport: "fcm", subscription: { fid: "T".repeat(22) } };
  await assert.rejects(() => registry.register(customer.hash, registration), error => error.message === authCopy.administratorRequired);
  const endpoint = await registry.register(admin.hash, registration);
  assert.equal((await registry.register(admin.hash, registration)).id, endpoint.id);
  assert.equal(await database.query(tx => tx.paymentAlertEndpoint.count()), 1);
  const checkout = createCheckout({ database, config, now }), review = createCheckoutReview(database, now);
  const selection = { purpose: "plan", planId, method: "mtn", walletUgx: 0, referralDays: 0, topUpUgx: 0 };
  const proof = { transactionId: "TEST-REVIEW-12345", amountUgx: 5000, payerPhone: "256700000123", paidAt: at().toISOString(), warningsAccepted: true,
    original: { text: "Synthetic receipt for test only", extracted: {} } };
  const quote = await checkout.quote(customer.identity, selection), key = randomUUID();
  assert.equal(quote.ok, true);
  await t.test("failed/internal submissions create no external review events", async () => {
    assert.equal((await checkout.confirm(customer.identity, selection, key, quote.value.quoteKey, false, proof)).ok, false);
    assert.equal(await database.query(tx => tx.paymentReviewEvent.count()), 0);
    const wallet = await member();
    const codes = createAccessCodes({ database, now, notifications: silentPaymentNotifications });
    await codes.adjustCredit(wallet.identity.accountId, 5000, "Synthetic fixture", "test");
    const funded = { ...selection, method: "wallet", walletUgx: 5000 }, q = await checkout.quote(wallet.identity, funded);
    assert.equal((await checkout.confirm(wallet.identity, funded, randomUUID(), q.value.quoteKey, true)).ok, true);
    assert.equal(await database.query(tx => tx.paymentReviewEvent.count()), 0);
  });
  const saved = await checkout.confirm(customer.identity, selection, key, quote.value.quoteKey, true, proof);
  assert.equal(saved.ok, true, saved.message);
  const id = saved.value.id;
  await t.test("report and retry commit one logical event; identical attachment is a no-op", async () => {
    assert.equal(await database.query(tx => tx.paymentReviewEvent.count({ where: { paymentId: id } })), 1);
    assert.equal((await checkout.confirm(customer.identity, selection, key, quote.value.quoteKey, true, proof)).value.id, id);
    const previous = await review.detail(id);
    await checkout.attach(customer.identity, id, proof);
    await checkout.attach(customer.identity, id, proof);
    assert.equal((await review.detail(id)).revision, previous.revision);
    assert.equal(await database.query(tx => tx.paymentReviewEvent.count({ where: { paymentId: id } })), 1);
    assert.equal(await database.query(tx => tx.accessCode.count({ where: { paymentSubmissionId: id } })), 0);
  });
  await t.test("configured settings save through existing service; links remain separate from referrals", async () => {
    const service = createSettingsService(database, { now, environment: null });
    const result = await service.save("synthetic-admin", { communityLinks: [{ type: "telegram-channel", url: "https://t.me/test_channel", enabled: true }], paymentAlertsEnabled: true }, { sessionAuthorized: true });
    assert.equal(result.status, "saved");
    assert.equal(result.settings.communityLinks[0].enabled, true);
    assert.equal(await database.query(tx => tx.referralCredit.count()), 0);
  });
  let outcome = "retry", calls = [];
  const transports = { configured: transport => transport === "fcm", async send(transport, subscription, payload) { calls.push({ transport, payload }); return outcome; } };
  const worker = createReviewAlertWorker({ database, config, now, transports });
  await t.test("bounded retry reuses one private payload and concurrent workers claim once", async () => {
    const results = await Promise.all([worker.run(), worker.run()]);
    assert.equal(calls.length, 1);
    assert.equal(results.reduce((sum, result) => sum + result.retried, 0), 1);
    const payload = calls[0].payload;
    assert.deepEqual(Object.keys(payload).sort(), ["createdAt", "endpointId", "eventId", "paymentId"]);
    assert.equal(payload.paymentId, id);
    await worker.run(); assert.equal(calls.length, 1);
    instant += 5000; outcome = "accepted"; await worker.run();
    assert.equal(calls.length, 2); assert.deepEqual(calls[1].payload, payload);
    assert.equal((await database.query(tx => tx.paymentAlertDelivery.findFirst())).status, "accepted");
    await worker.run(); assert.equal(calls.length, 2);
  });
  await t.test("correction closes obsolete alerts; explicit resubmission creates one new event", async () => {
    const detail = await review.detail(id);
    const correction = await review.act(id, { action: "request-correction", revision: detail.revision, reason: "Synthetic correction request" }, "test");
    assert.equal(correction.ok, true, correction.message);
    assert.equal((await reviewAlertFeed(database, admin.hash, config, at())).events.length, 0);
    assert.equal((await checkout.attach(customer.identity, id, proof)).ok, true);
    assert.equal((await checkout.attach(customer.identity, id, proof)).ok, true);
    assert.equal(await database.query(tx => tx.paymentReviewEvent.count({ where: { paymentId: id } })), 2);
    assert.equal((await reviewAlertFeed(database, admin.hash, config, at())).events.length, 1);
    const current = await review.detail(id);
    assert.equal((await review.act(id, { action: "reject-checkout", revision: current.revision, reason: "Synthetic rejected receipt" }, "test")).ok, true);
    await worker.run(); assert.equal(calls.filter(call => !call.payload.resolved).length, 2, "resolved events never dispatch as new reports");
    assert.equal(calls.at(-1).payload.resolved, true, "the same canonical event clears its obsolete OS alert");
  });
  await t.test("test uses delivery path without changing payments or granting access", async () => {
    const payments = await database.query(tx => tx.paymentSubmission.count()), grants = await database.query(tx => tx.accessCode.count());
    const queued = await registry.test(admin.hash, endpoint.id);
    assert.equal(queued.status, "queued");
    await worker.run(); assert.equal(calls.at(-1).payload.paymentId, null);
    await registry.acknowledge(admin.hash, endpoint.id, queued.eventId, "displayed");
    await registry.acknowledge(admin.hash, endpoint.id, queued.eventId, "opened");
    const delivery = await database.query(tx => tx.paymentAlertDelivery.findFirst({ where: { eventId: queued.eventId } }));
    assert.ok(delivery.acceptedAt); assert.ok(delivery.displayedAt); assert.ok(delivery.openedAt);
    assert.equal(await database.query(tx => tx.paymentSubmission.count()), payments);
    assert.equal(await database.query(tx => tx.accessCode.count()), grants);
  });
  await t.test("role removal and logout detach private endpoints", async () => {
    process.env.GOAL_HINT_ADMIN_PHONES = "[]";
    await worker.run();
    assert.equal(await database.query(tx => tx.paymentAlertEndpoint.count()), 0);
    process.env.GOAL_HINT_ADMIN_PHONES = '["256700009901"]';
    await registry.register(admin.hash, registration);
    await sessions.signOut(admin.signed.token);
    assert.equal(await database.query(tx => tx.paymentAlertEndpoint.count()), 0);
    await assert.rejects(() => registry.register(admin.hash, registration), error => error.message === authCopy.loginAgain);
  });
});

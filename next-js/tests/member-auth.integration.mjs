import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberSessions } from "../src/server/members/member-sessions.ts";
import { memberAdminCredential } from "../src/server/members/member-admin.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

const phone = "256700001001", password = "correct horse 47", address = "198.51.100.8", DAY = 86_400_000;

test("only recovery sends codes and its protections persist on isolated MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-23T09:00:00Z");
  const now = () => time, adminPhone = number => number === "256700001099", messages = [];
  const delivery = { async send(message) { messages.push(message); } };
  const adminPasswordHash = () => memberAdminCredential({ GOAL_HINT_ADMIN_PASSWORD: "configured administrator secret" });
  const restart = () => createMemberAuth({ database: f.database, config: f.config, now, adminPhone, adminPasswordHash, delivery });
  const auth = restart();
  const sessions = createMemberSessions({ database: f.database, config: f.config, now, adminPhone, adminPasswordHash });
  const registered = await auth.register(phone, password, { member: null }, address);
  assert.equal(registered.status, "authenticated"); assert.equal(registered.requiresVerification, undefined);
  const member = await sessions.verify(registered.token); assert.ok(member);
  assert.equal(await auth.verificationSession(registered.token), null);
  assert.equal((await auth.requestVerification()).status, "invalid");
  assert.equal((await auth.register(phone, password, { member: null }, address)).status, "conflict");
  assert.equal(messages.length, 0);
  assert.equal(await f.database.query(tx => tx.paymentNotificationOutbox.count()), 0);
  const phoneProof = () => f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: member.accountId },
    select: { phoneVerifiedAt: true } })).then(account => account.phoneVerifiedAt);
  assert.equal(await phoneProof(), null);
  const logged = await auth.login(phone, password, address);
  assert.equal(logged.status, "authenticated"); assert.ok(await sessions.verify(registered.token), "Two logins can coexist before recovery revokes both");
  assert.equal((await auth.requestPasswordReset(phone, address, "sms")).status, "requested");
  const obsolete = messages.at(-1).code; time++;
  assert.equal((await restart().requestPasswordReset(phone, address, "whatsapp")).status, "requested");
  const resetCode = messages.at(-1).code;
  assert.equal(messages.at(-1).purpose, "password-reset");
  assert.equal((await restart().verifyPasswordReset(phone, obsolete, address)).status, "unauthorized");
  assert.equal((await auth.verifyAccount(resetCode, registered.token, address)).status, "unauthorized");
  const proof = await f.database.query(tx => tx.memberVerification.findFirst({ where: { accountId: member.accountId, purpose: "reset", channel: "whatsapp" } }));
  assert.notEqual(proof.codeHash, resetCode); assert.match(proof.codeHash, /^[a-f0-9]{64}$/u);
  assert.equal(+proof.expiresAt - +proof.createdAt, DAY);
  const claims = await Promise.all([auth.verifyPasswordReset(phone, resetCode, address), auth.verifyPasswordReset(phone, resetCode, address)]);
  assert.deepEqual(claims.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const recovery = claims.find(result => result.status === "authenticated");
  assert.equal(recovery.requiresPasswordChange, true); assert.equal(await sessions.verify(recovery.token), null);
  assert.ok(await sessions.verify(logged.token), "Reset proof does not prematurely sign out the active device");
  assert.equal(await phoneProof(), null);
  const saved = await auth.resetPassword("self service password", recovery.token, address);
  assert.equal(saved.status, "authenticated"); assert.ok(await sessions.verify(saved.token));
  assert.equal(await sessions.verify(logged.token), null);
  assert.equal(await sessions.verify(registered.token), null);
  assert.equal(+(await phoneProof()), time);
  assert.equal((await auth.resetPassword("another password", recovery.token, address)).status, "unauthorized");
  const limited = await auth.changePassword("another password", { member: await sessions.verify(saved.token) });
  assert.equal(limited.status, "busy"); assert.match(limited.message, /24 hours/iu);
  time += DAY;
  const changed = await auth.changePassword("replacement password", { member: await sessions.verify(saved.token) });
  assert.equal(changed.status, "authenticated"); assert.ok(await sessions.verify(changed.token));
  assert.equal(await sessions.verify(saved.token), null);
  assert.equal((await restart().login(phone, "replacement password", address)).status, "authenticated");
  const otherPhone = "256700001002";
  assert.equal((await auth.register(otherPhone, password, { member: null }, "198.51.100.9")).status, "authenticated");
  const sends = await Promise.all(Array.from({ length: 5 }, (_, i) =>
    auth.requestPasswordReset(otherPhone, `198.51.100.${i + 10}`, i % 2 ? "sms" : "whatsapp")));
  assert.equal(sends.filter(result => result.status === "requested").length, 3); assert.equal(sends.filter(result => result.status === "busy").length, 2);
  time += 12 * 3_600_000;
  assert.equal((await restart().requestPasswordReset(otherPhone, address, "sms")).status, "busy");
  time += 12 * 3_600_000;
  assert.equal((await restart().requestPasswordReset(otherPhone, address, "whatsapp")).status, "requested");
  const before = messages.length;
  const admin = await auth.login("256700001099", "configured administrator secret", address);
  assert.equal(admin.administrator, true); assert.equal((await sessions.verify(admin.token)).administrator, true);
  assert.equal((await auth.requestPasswordReset("256700001099", address, "sms")).status, "requested");
  assert.equal((await auth.requestPasswordReset("256700001098", address, "whatsapp")).status, "requested");
  assert.equal(messages.length, before);
  const audits = await f.database.query(tx => tx.ownerAuditEvent.findMany({ where: { action: "password_reset" } }));
  assert.equal(audits.length, 0, "Self-service recovery never issues an administrator temporary password.");

  const legacyPhone = "256700001003", id = randomUUID(), at = new Date(time), legacyCode = "914385";
  const passwordHash = await hashPassword(password);
  await f.database.transaction(async tx => {
    await tx.memberAccount.create({ data: { id, phone: legacyPhone, passwordHash, createdAt: at, lastSignInAt: at } });
    await tx.memberVerification.create({ data: { id: randomUUID(), accountId: id, phone: legacyPhone, purpose: "account", channel: "sms",
      codeHash: f.config.key("member-verification-code", `${id}:${legacyPhone}:account:${legacyCode}`),
      bindingHash: f.config.key("member-verification-binding", id), createdAt: at, sentAt: at, expiresAt: new Date(time + DAY) } });
  });
  const pending = await auth.login(legacyPhone, password, address);
  assert.equal(pending.requiresVerification, true);
  assert.equal(await sessions.verify(pending.token), null);
  assert.deepEqual(await auth.verificationSession(pending.token), { phone: legacyPhone });
  assert.equal((await auth.requestVerification()).status, "invalid");
  assert.equal((await auth.verifyPasswordReset(legacyPhone, legacyCode, address)).status, "unauthorized");
  const legacy = await auth.verifyAccount(legacyCode, pending.token, address);
  assert.equal(legacy.status, "authenticated"); assert.ok(await sessions.verify(legacy.token));
  assert.equal((await auth.verifyAccount(legacyCode, pending.token, address)).status, "unauthorized");
  assert.equal(messages.length, before);
});

test("two active logins and concurrent oldest-session eviction preserve account access on MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const at = new Date("2026-10-23T09:00:00Z");
  let time = +at;
  const now = () => time;
  const config = { ...f.config, production: false, cookies: { session: "synthetic-owner" } };
  const auth = createMemberAuth({ database: f.database, config, now, adminPhone: () => false, adminPasswordHash: () => null,
    delivery: { send: async () => assert.fail("Sign-up must never deliver a message") } });
  const sessions = createMemberSessions({ database: f.database, config, now, adminPhone: () => false, adminPasswordHash: () => null });
  const codes = createAccessCodes({ database: f.database, config, now, notifications: silentPaymentNotifications });
  await f.database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "on", trialDays: 0, updatedAt: at, updatedBy: "synthetic-owner" } }));
  const viewer = createViewerAccess({ services: async () => ({ config, database: f.database, auth: null }), now,
    settings: async () => ({ settings: { ...defaultSubscriptionSettings, paywallMode: "on" } }) });
  const access = token => viewer(name => name === "goal-hint-member" ? token : undefined);
  const first = await auth.register(phone, password, { member: null }, address);
  const original = await sessions.verify(first.token);
  assert.ok(original);
  assert.deepEqual(await access(first.token), { tier: "free", signedIn: true, mode: "on" });
  const grant = await codes.manual({ phone, durationDays: 7, amountReceivedUgx: 0, note: "Synthetic account entitlement" }, "synthetic-owner");
  assert.equal(grant.status, "created"); assert.equal((await access(first.token)).tier, "full");
  assert.equal((await auth.login(phone, "wrong password", address, first.token)).status, "unauthorized");
  assert.ok(await sessions.verify(first.token)); assert.equal((await access(first.token)).tier, "full");
  time++;
  const second = await auth.login(phone, password, "198.51.100.9");
  assert.equal(second.status, "authenticated"); assert.equal(second.otherDeviceSignedOut, false);
  assert.ok(await sessions.verify(first.token));
  assert.deepEqual(await access(first.token), { tier: "full", signedIn: true, mode: "on" });
  assert.equal((await access(second.token)).tier, "full");
  time++;
  const third = await auth.login(phone, password, "198.51.100.10");
  assert.equal(third.otherDeviceSignedOut, true); assert.equal(await sessions.verify(first.token), null);
  assert.deepEqual(await access(first.token), { tier: "free", signedIn: false, mode: "on" });
  assert.ok(await sessions.verify(second.token)); assert.ok(await sessions.verify(third.token));
  assert.equal((await auth.changePassword("stale device password", { member: original })).status, "unauthorized");
  time++;
  const completed = [];
  await Promise.all(Array.from({ length: 3 }, (_, index) => auth.login(phone, password, `198.51.100.${index + 10}`).then(result => completed.push(result))));
  assert.ok(completed.every(result => result.status === "authenticated"));
  assert.equal(await sessions.verify(second.token), null);
  assert.equal(await sessions.verify(third.token), null);
  const retained = await Promise.all(completed.map(result => sessions.verify(result.token)));
  assert.equal(retained.filter(Boolean).length, 2, "Concurrent logins cannot exceed two active sessions, even at equal timestamps");
  const views = await Promise.all(completed.map(result => access(result.token)));
  assert.equal(views.filter(view => view.signedIn).length, 2);
  assert.equal(views.filter(view => view.tier === "full").length, 2, "Both remaining sessions inherit the active account period");
  assert.equal(await f.database.query(tx => tx.memberSession.count({ where: { accountId: first.accountId, authenticatedAt: { not: null } } })), 2);

  await t.test("historical one-login migration remains unchanged and idempotent", async () => {
    const [{ currentTime }] = await f.root.query("SELECT UTC_TIMESTAMP(3) AS currentTime");
    const stamp = new Date(currentTime), future = new Date(+stamp + DAY), before = new Date(+stamp - 1);
    await f.database.query(tx => tx.memberSession.deleteMany({ where: { accountId: first.accountId } }));
    const rows = [
      { tokenHash: "a".repeat(64), authenticatedAt: before, createdAt: future },
      { tokenHash: "b".repeat(64), authenticatedAt: stamp, createdAt: before },
      { tokenHash: "c".repeat(64), authenticatedAt: stamp, createdAt: stamp },
      { tokenHash: "d".repeat(64), authenticatedAt: stamp, createdAt: stamp },
      { tokenHash: "e".repeat(64), authenticatedAt: null, createdAt: stamp },
      { tokenHash: "f".repeat(64), authenticatedAt: null, passwordResetAt: stamp, createdAt: stamp },
      { tokenHash: "0".repeat(64), authenticatedAt: future, createdAt: stamp, expiresAt: before },
    ];
    await f.database.query(tx => tx.memberSession.createMany({ data: rows.map(row => ({ accountId: first.accountId,
      lastSeenAt: stamp, expiresAt: future, ...row })) }));
    const migration = await readFile(new URL("../prisma/migrations/20261023130000_single_member_login/migration.sql", import.meta.url), "utf8");
    await f.root.query(migration);
    const kept = await f.database.query(tx => tx.memberSession.findMany({ where: { accountId: first.accountId }, orderBy: { tokenHash: "asc" }, select: { tokenHash: true } }));
    assert.deepEqual(kept.map(row => row.tokenHash), ["0", "d", "e", "f"].map(char => char.repeat(64)));
    await f.root.query(migration);
    assert.equal(await f.database.query(tx => tx.memberSession.count({ where: { accountId: first.accountId } })), kept.length, "Cleanup is idempotent");
  });
});


test("registration grants a single configured trial atomically on MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-26T09:00:00Z");
  const now = () => time, binding = { member: null }, config = { ...f.config, production: false, cookies: { session: "synthetic-owner" } };
  await f.database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "on", trialDays: 4,
    updatedAt: new Date(time), updatedBy: "synthetic-owner" } }));
  const auth = createMemberAuth({ database: f.database, config, now, adminPhone: () => false, adminPasswordHash: () => null,
    delivery: { send: async () => assert.fail("Sign-up must never deliver a message") } });
  const sessions = createMemberSessions({ database: f.database, config, now, adminPhone: () => false, adminPasswordHash: () => null });
  const codes = createAccessCodes({ database: f.database, config, now, notifications: silentPaymentNotifications });
  const viewer = createViewerAccess({ services: async () => ({ config, database: f.database, auth: null }), now,
    settings: async () => ({ settings: { ...defaultSubscriptionSettings, paywallMode: "on" } }) });
  const access = token => viewer(name => name === "goal-hint-member" ? token : undefined);
  const countPeriods = accountId => f.database.query(tx => tx.accessCode.count({ where: { accountId, source: "trial" } }));
  const registrations = await Promise.all([auth.register(phone, password, binding, address), auth.register("+" + phone, password, binding, address)]);
  assert.deepEqual(registrations.map(result => result.status).sort(), ["authenticated", "conflict"]);
  const registered = registrations.find(result => result.status === "authenticated");
  const startsAt = new Date(time).toISOString(), endsAt = new Date(time + 4 * DAY).toISOString();
  assert.equal(registered.requiresVerification, undefined);
  assert.deepEqual(registered.trial, { days: 4, startsAt, endsAt, active: true });
  const identity = await sessions.verify(registered.token);
  assert.ok(identity);
  assert.equal((await access(registered.token)).tier, "full");
  const account = await f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: registered.accountId } }));
  assert.equal(+account.memberAdmittedAt, time);
  assert.equal(account.phoneVerifiedAt, null);
  assert.equal(account.trialEligibleAt, null);
  assert.equal(account.trialForfeitedAt, null);
  const trial = await f.database.query(tx => tx.accessCode.findFirstOrThrow({ where: { accountId: account.id, source: "trial" } }));
  assert.equal(trial.priceUgx, 0); assert.equal(trial.amountReceivedUgx, 0);
  assert.equal(+trial.activatedAt, time); assert.equal(+trial.startsAt, time); assert.equal(+trial.endsAt - time, 4 * DAY);
  assert.deepEqual((await codes.subscriptionStatus(identity)).trial, { state: "active", startsAt, endsAt });
  assert.deepEqual(await codes.activateTrial(identity), { state: "forbidden" });
  assert.equal((await auth.register(phone, password, binding, address)).status, "conflict", "Retry after commit cannot replace the account or grant time");
  assert.equal(await countPeriods(account.id), 1);

  const failedPhone = "256700001004";
  await f.root.query("CREATE TRIGGER RejectRegistrationTrial BEFORE INSERT ON AccessCode FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'synthetic grant failure'");
  try {
    await assert.rejects(auth.register(failedPhone, password, binding, address));
  } finally {
    await f.root.query("DROP TRIGGER RejectRegistrationTrial");
  }
  assert.equal(await f.database.query(tx => tx.memberAccount.count({ where: { phone: failedPhone } })), 0);
  const recovered = await auth.register(failedPhone, password, binding, address);
  assert.equal(recovered.status, "authenticated");
  assert.equal(await countPeriods(recovered.accountId), 1);

  const paid = await codes.manual({ phone: failedPhone, durationDays: 7, amountReceivedUgx: 5000, note: "Synthetic paid access" }, "synthetic-owner");
  assert.equal(paid.status, "created");
  assert.equal(paid.grant.startsAt.toISOString(), endsAt);
  assert.equal(+paid.grant.endsAt - +paid.grant.startsAt, 7 * DAY);

  await f.database.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { trialDays: 0 } }));
  const disabledPhone = "256700001005";
  const disabled = await auth.register(disabledPhone, password, binding, address);
  assert.equal(disabled.status, "authenticated");
  assert.equal(disabled.trial, undefined);
  assert.equal(await countPeriods(disabled.accountId), 0);
  await f.database.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { trialDays: 3 } }));
  const later = await auth.login(disabledPhone, password, address), laterIdentity = await sessions.verify(later.token);
  assert.equal(later.trial, undefined);
  assert.equal((await codes.subscriptionStatus(laterIdentity)).trial, undefined);
  assert.deepEqual(await codes.activateTrial(laterIdentity), { state: "forbidden" });
  assert.equal(await countPeriods(disabled.accountId), 0);

  time += 4 * DAY;
  const expired = await auth.login(phone, password, address);
  const expiredIdentity = await sessions.verify(expired.token);
  assert.equal((await access(expired.token)).tier, "free");
  assert.equal((await codes.subscriptionStatus(expiredIdentity)).trial.state, "expired");
  assert.equal(await countPeriods(account.id), 1, "Login cannot renew an expired trial");

  const legacyPhone = "256700001006", legacyId = randomUUID(), at = new Date(time), passwordHash = await hashPassword(password);
  await f.database.query(tx => tx.memberAccount.create({ data: { id: legacyId, phone: legacyPhone, passwordHash,
    createdAt: at, lastSignInAt: at, phoneVerifiedAt: at, trialEligibleAt: at } }));
  const legacy = await auth.login(legacyPhone, password, address), legacyIdentity = await sessions.verify(legacy.token);
  assert.deepEqual((await codes.subscriptionStatus(legacyIdentity)).trial, { state: "available" });
  const [first, duplicate] = await Promise.all([codes.activateTrial(legacyIdentity), codes.activateTrial(legacyIdentity)]);
  assert.deepEqual(first, { state: "active", startsAt: at.toISOString(), endsAt: new Date(time + 3 * DAY).toISOString() });
  assert.deepEqual(duplicate, first);
  assert.equal(await countPeriods(legacyId), 1);
});

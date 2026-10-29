import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberSessions } from "../src/server/members/member-sessions.ts";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

const phone = "256700001001", password = "correct horse 47", address = "198.51.100.8", DAY = 86_400_000;

test("channel verification and self-service recovery limits persist on isolated MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-23T09:00:00Z");
  const now = () => time, adminPhone = number => number === "256700001099", messages = [];
  const delivery = { async send(message) { messages.push(message); } };
  const adminHash = await hashPassword("configured administrator secret");
  const restart = () => createMemberAuth({ database: f.database, config: f.config, now, adminPhone, adminPasswordHash: () => adminHash, delivery });
  const auth = restart();
  const sessions = createMemberSessions({ database: f.database, config: f.config, now, adminPhone, adminPasswordHash: () => adminHash });
  const registered = await auth.register(phone, password, { member: null }, address);
  assert.equal(registered.status, "authenticated"); assert.equal(registered.requiresVerification, true);
  assert.equal(await sessions.verify(registered.token), null); assert.deepEqual(await auth.verificationSession(registered.token), { phone });
  assert.equal((await auth.register(phone, password, { member: null }, address)).status, "conflict");
  assert.equal((await auth.requestVerification("sms", registered.token, address)).status, "requested");
  const obsolete = messages.at(-1).code; time++;
  assert.equal((await auth.requestVerification("whatsapp", registered.token, address)).status, "requested");
  assert.equal((await restart().verifyAccount(obsolete, registered.token, address)).status, "unauthorized");
  const verified = await restart().verifyAccount(messages.at(-1).code, registered.token, address);
  assert.equal(verified.status, "authenticated");
  const member = await sessions.verify(verified.token); assert.ok(member);
  assert.equal((await auth.verifyAccount(messages.at(-1).code, registered.token, address)).status, "unauthorized");
  const proof = await f.database.query(tx => tx.memberVerification.findFirst({ where: { accountId: member.accountId, purpose: "account", channel: "whatsapp" } }));
  assert.notEqual(proof.codeHash, messages.at(-1).code); assert.match(proof.codeHash, /^[a-f0-9]{64}$/u);
  assert.equal(+proof.expiresAt - +proof.createdAt, DAY);
  const logged = await auth.login(phone, password, address);
  assert.equal(logged.status, "authenticated"); assert.equal(await sessions.verify(verified.token), null);
  assert.equal((await auth.requestPasswordReset(phone, address, "sms")).status, "requested");
  const resetCode = messages.at(-1).code;
  const claims = await Promise.all([auth.verifyPasswordReset(phone, resetCode, address), auth.verifyPasswordReset(phone, resetCode, address)]);
  assert.deepEqual(claims.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const recovery = claims.find(result => result.status === "authenticated");
  assert.equal(recovery.requiresPasswordChange, true); assert.equal(await sessions.verify(recovery.token), null);
  assert.ok(await sessions.verify(logged.token), "Reset proof does not prematurely sign out the active device");
  const saved = await auth.resetPassword("self service password", recovery.token, address);
  assert.equal(saved.status, "authenticated"); assert.ok(await sessions.verify(saved.token));
  assert.equal(await sessions.verify(logged.token), null);
  assert.equal(await sessions.verify(verified.token), null);
  assert.equal((await auth.resetPassword("another password", recovery.token, address)).status, "unauthorized");
  const limited = await auth.changePassword("another password", "self service password", { member: await sessions.verify(saved.token) });
  assert.equal(limited.status, "busy"); assert.match(limited.message, /24 hours/iu);
  time += DAY;
  const changed = await auth.changePassword("replacement password", "self service password", { member: await sessions.verify(saved.token) });
  assert.equal(changed.status, "authenticated"); assert.ok(await sessions.verify(changed.token));
  assert.equal(await sessions.verify(saved.token), null);
  assert.equal((await restart().login(phone, "replacement password", address)).status, "authenticated");
  const otherPhone = "256700001002", unverified = await auth.register(otherPhone, password, { member: null }, "198.51.100.9");
  const sends = await Promise.all(Array.from({ length: 5 }, (_, i) => auth.requestVerification(i % 2 ? "sms" : "whatsapp", unverified.token, `198.51.100.${i + 10}`)));
  assert.equal(sends.filter(result => result.status === "requested").length, 3); assert.equal(sends.filter(result => result.status === "busy").length, 2);
  time += 12 * 3_600_000;
  assert.equal((await restart().requestVerification("sms", unverified.token, address)).status, "busy");
  time += 12 * 3_600_000;
  assert.equal((await restart().requestVerification("whatsapp", unverified.token, address)).status, "requested");
  const before = messages.length;
  const admin = await auth.login("256700001099", "configured administrator secret", address);
  assert.equal(admin.administrator, true); assert.equal((await sessions.verify(admin.token)).administrator, true);
  assert.equal((await auth.requestPasswordReset("256700001099", address, "sms")).status, "requested");
  assert.equal((await auth.requestPasswordReset("256700001098", address, "whatsapp")).status, "requested");
  assert.equal(messages.length, before);
  const audits = await f.database.query(tx => tx.ownerAuditEvent.findMany({ where: { action: "password_reset" } }));
  assert.equal(audits.length, 0, "Self-service recovery never issues an administrator temporary password.");
});

test("successful and concurrent password logins transfer one device and premium access on MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const at = new Date("2026-10-23T09:00:00Z"), now = () => +at, messages = [];
  const config = { ...f.config, production: false, cookies: { session: "synthetic-owner" } };
  const auth = createMemberAuth({ database: f.database, config, now, adminPhone: () => false, adminPasswordHash: () => null,
    delivery: { async send(message) { messages.push(message); } } });
  const sessions = createMemberSessions({ database: f.database, config, now, adminPhone: () => false, adminPasswordHash: () => null });
  const codes = createAccessCodes({ database: f.database, config, now, notifications: silentPaymentNotifications });
  await f.database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", maxUnlockedDevices: 1, updatedAt: at, updatedBy: "synthetic-owner" } }));
  const viewer = createViewerAccess({ services: async () => ({ config, database: f.database, auth: null }), now,
    settings: async () => ({ settings: { ...defaultSubscriptionSettings, paywallMode: "test", maxUnlockedDevices: 1 } }) });
  const access = token => viewer(name => name === "goal-hint-member" ? token : undefined);
  const registered = await auth.register(phone, password, { member: null }, address);
  await auth.requestVerification("sms", registered.token, address);
  const first = await auth.verifyAccount(messages.at(-1).code, registered.token, address), original = await sessions.verify(first.token);
  assert.ok(original);
  const grant = await codes.manual({ phone, durationDays: 7, amountReceivedUgx: 0, note: "Synthetic one-device entitlement" }, "synthetic-owner");
  assert.equal(grant.status, "created"); assert.equal((await access(first.token)).tier, "full");
  assert.equal((await auth.login(phone, "wrong password", address, first.token)).status, "unauthorized");
  assert.ok(await sessions.verify(first.token)); assert.equal((await access(first.token)).tier, "full");
  const second = await auth.login(phone, password, "198.51.100.9");
  assert.equal(second.status, "authenticated"); assert.equal(await sessions.verify(first.token), null);
  assert.deepEqual(await access(first.token), { tier: "free", signedIn: false, mode: "test" });
  assert.equal((await access(second.token)).tier, "full");
  assert.equal((await auth.changePassword("stale device password", password, { member: original })).status, "unauthorized");
  const completed = [];
  await Promise.all(Array.from({ length: 3 }, (_, index) => auth.login(phone, password, `198.51.100.${index + 10}`).then(result => completed.push(result))));
  assert.ok(completed.every(result => result.status === "authenticated"));
  assert.equal(await sessions.verify(second.token), null);
  for (const result of completed.slice(0, -1)) {
    assert.equal(await sessions.verify(result.token), null); assert.equal((await access(result.token)).tier, "free");
  }
  const latest = completed.at(-1);
  assert.ok(await sessions.verify(latest.token)); assert.equal((await access(latest.token)).tier, "full");
  assert.equal(await f.database.query(tx => tx.memberSession.count({ where: { accountId: first.accountId, authenticatedAt: { not: null } } })), 1);

  await t.test("rollout cleanup keeps the latest full login with deterministic ties and preserves restricted sessions", async () => {
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


test("registration grants one configured trial atomically without bypassing verification on MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-26T09:00:00Z");
  const now = () => time, messages = [];
  await f.database.query(tx => tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", trialDays: 4, maxUnlockedDevices: 1,
    updatedAt: new Date(time), updatedBy: "synthetic-owner" } }));
  const auth = createMemberAuth({ database: f.database, config: f.config, now, adminPhone: () => false, adminPasswordHash: () => null,
    delivery: { async send(message) { messages.push(message); } } });
  const sessions = createMemberSessions({ database: f.database, config: f.config, now, adminPhone: () => false, adminPasswordHash: () => null });
  const registrations = await Promise.all([auth.register(phone, password, { member: null }, address), auth.register(phone, password, { member: null }, address)]);
  assert.deepEqual(registrations.map(result => result.status).sort(), ["authenticated", "conflict"]);
  const registered = registrations.find(result => result.status === "authenticated");
  assert.equal(registered.requiresVerification, true); assert.equal(registered.trial.days, 4); assert.equal(registered.trial.active, false);
  assert.equal(await sessions.verify(registered.token), null); assert.equal(messages.length, 0);
  const periods = await f.database.query(tx => tx.accessCode.findMany({ where: { accountId: registered.accountId } }));
  assert.equal(periods.length, 1); assert.equal(periods[0].source, "trial"); assert.equal(periods[0].priceUgx, 0); assert.equal(periods[0].amountReceivedUgx, 0);
  assert.equal(+periods[0].activatedAt, time); assert.equal(+periods[0].startsAt, time); assert.equal(+periods[0].endsAt - time, 4 * DAY);
  const account = await f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: registered.accountId } }));
  assert.equal(account.trialRequestedAt, null); assert.equal(account.trialDismissedAt, null);
  await f.database.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { trialDays: 1 } }));
  await auth.requestVerification("sms", registered.token, address);
  const verifications = await Promise.all([auth.verifyAccount(messages.at(-1).code, registered.token, address), auth.verifyAccount(messages.at(-1).code, registered.token, address)]);
  assert.deepEqual(verifications.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const verified = verifications.find(result => result.status === "authenticated");
  assert.equal(verified.trial.days, 4); assert.equal(verified.trial.active, true);
  assert.equal((await sessions.verify(verified.token)).accessCodeId, periods[0].id);
  assert.equal(await f.database.query(tx => tx.accessCode.count({ where: { accountId: registered.accountId } })), 1);
  const logged = await auth.login(phone, password, address);
  assert.equal((await sessions.verify(logged.token)).accessCodeId, periods[0].id);
  assert.equal(await sessions.verify(verified.token), null, "The device/session gate remains in force");
  await f.database.query(tx => tx.subscriptionSettings.update({ where: { id: 1 }, data: { trialDays: 0 } }));
  const disabled = await auth.register("256700001002", password, { member: null }, "198.51.100.9");
  assert.equal(disabled.trial, undefined); assert.equal(await f.database.query(tx => tx.accessCode.count({ where: { accountId: disabled.accountId } })), 0);
  time += 4 * DAY;
  const expired = await auth.login(phone, password, address);
  assert.equal((await sessions.verify(expired.token)).codeEnteredAt, null);
  assert.equal(await f.database.query(tx => tx.accessCode.count({ where: { accountId: registered.accountId } })), 1, "Login cannot renew an expired trial");
});

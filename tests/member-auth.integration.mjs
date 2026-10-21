import assert from "node:assert/strict";
import test from "node:test";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberSessions } from "../src/server/members/member-sessions.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { passwordRecoveryRules } from "../src/server/members/password-recovery.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

const phone = "256700001001", password = "correct horse 47", address = "198.51.100.8";

test("manual registration, temporary recovery and administrator credentials persist on isolated MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-21T09:00:00Z");
  const now = () => time, adminPhone = number => number === "256700001099";
  const adminHash = await hashPassword("configured administrator secret");
  const auth = createMemberAuth({ database: f.database, config: f.config, now, adminPhone, adminPasswordHash: () => adminHash });
  const sessions = createMemberSessions({ database: f.database, config: f.config, now, adminPhone, adminPasswordHash: () => adminHash });
  const owner = createSubscribers(f.database, now, adminPhone);
  const registered = await auth.register(phone, password, { member: null }, address);
  assert.equal(registered.status, "authenticated");
  const member = await sessions.verify(registered.token); assert.ok(member);
  assert.equal((await auth.register(phone, password, { member: null }, address)).status, "conflict");
  assert.equal((await auth.login(phone, password, address)).status, "authenticated");
  assert.equal((await auth.requestPasswordReset(phone, address)).status, "requested");
  assert.equal((await owner.passwordResetRequests())[0].id, member.accountId);
  const reset = await owner.temporaryPassword({ id: member.accountId }, "synthetic-owner");
  assert.equal(reset.status, "reset"); assert.ok(reset.sessionsDeleted >= 1);
  assert.equal(await sessions.verify(registered.token), null);
  assert.equal((await owner.passwordResetRequests()).length, 0);
  const account = await f.database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id: member.accountId } }));
  assert.equal(account.passwordHash, null); assert.notEqual(account.temporaryPasswordHash, reset.temporaryPassword);
  const attempts = await Promise.all([auth.login(phone, reset.temporaryPassword, address), auth.login(phone, reset.temporaryPassword, address)]);
  assert.deepEqual(attempts.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const temporary = attempts.find(result => result.status === "authenticated");
  assert.equal(temporary.requiresPasswordChange, true); assert.equal(await sessions.verify(temporary.token), null);
  const changed = await auth.resetPassword("replacement password", temporary.token, address);
  assert.equal(changed.status, "authenticated"); assert.ok(await sessions.verify(changed.token));
  assert.equal((await auth.resetPassword("another password", temporary.token, address)).status, "unauthorized");
  const expired = await owner.temporaryPassword({ id: member.accountId }, "synthetic-owner");
  time += passwordRecoveryRules.temporaryMs;
  assert.equal((await auth.login(phone, expired.temporaryPassword, address)).status, "unauthorized");
  const admin = await auth.login("256700001099", "configured administrator secret", address);
  assert.equal(admin.administrator, true); assert.equal((await sessions.verify(admin.token)).administrator, true);
  const audits = await f.database.query(tx => tx.ownerAuditEvent.findMany({ where: { action: "password_reset" } }));
  assert.equal(audits.length, 2); assert.ok(!JSON.stringify(audits.map(row => row.details)).includes(reset.temporaryPassword));
});

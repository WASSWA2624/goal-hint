import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { createAccountNotifications } from "../src/server/members/account-notifications.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";

test("notification persistence, account isolation, races and exact reminders work on genuine MySQL", { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); } catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  let time = Date.parse("2026-10-31T12:00:00Z"); const DAY = 86_400_000, HOUR = 3_600_000;
  const first = randomUUID(), second = randomUUID(), passwordHash = await hashPassword("synthetic notification password");
  const firstHash = "a".repeat(64), secondHash = "b".repeat(64);
  await f.database.query(async tx => {
    await tx.subscriptionSettings.create({ data: { id: 1, paywallMode: "test", trialDays: 0, updatedAt: new Date(time), updatedBy: "synthetic" } });
    for (const [id, phone, tokenHash] of [[first, "256700001101", firstHash], [second, "256700001102", secondHash]]) {
      await tx.memberAccount.create({ data: { id, phone, passwordHash, phoneVerifiedAt: new Date(time), createdAt: new Date(time), lastSignInAt: new Date(time) } });
      await tx.memberSession.create({ data: { tokenHash, accountId: id, createdAt: new Date(time), lastSeenAt: new Date(time), authenticatedAt: new Date(time), expiresAt: new Date(time + 30 * DAY) } });
    }
  });
  const member = { accountId: first, phone: "256700001101", tokenHash: firstHash, blocked: false, administrator: false, codeEnteredAt: null };
  const other = { ...member, accountId: second, phone: "256700001102", tokenHash: secondHash };
  const notices = createAccountNotifications({ database: f.database, now: () => time });
  const codes = createAccessCodes({ database: f.database, now: () => time, notifications: silentPaymentNotifications });
  const access = await codes.manual({ phone: member.phone, durationDays: 1, amountReceivedUgx: 0, note: "Synthetic notification access" }, "synthetic-owner");
  assert.equal(access.status, "created");
  const pages = await Promise.all(Array.from({ length: 4 }, () => notices.read(member)));
  assert.ok(pages.every(page => page.items.length === 1 && page.items[0].kind === "access-activated"));
  assert.equal(await f.database.query(tx => tx.memberNotification.count({ where: { accountId: first } })), 1);
  const id = pages[0].items[0].id;
  assert.equal(await notices.update(other, "dismiss", id), false);
  assert.equal(await notices.update({ ...member, accountId: second }, "read", id), false);
  assert.equal((await notices.read(other)).unread, 0);
  assert.equal(await notices.update(member, "read", id), true);
  const restarted = createAccountNotifications({ database: f.database, now: () => time });
  assert.equal((await restarted.read(member)).unread, 0);
  assert.equal(await restarted.update(member, "dismiss", id), true);
  assert.equal((await restarted.read(member)).items.length, 0);
  time += DAY - HOUR - 1;
  assert.equal((await notices.read(member)).items.length, 0);
  time++;
  assert.equal((await notices.read(member)).items[0].kind, "access-expiring");
  const queued = await codes.manual({ phone: member.phone, durationDays: 2, amountReceivedUgx: 0, note: "Synthetic queued extension" }, "synthetic-owner");
  assert.equal(queued.status, "created");
  assert.equal((await notices.read(member)).items.some(item => item.kind === "access-expiring"), false);
  time = +queued.grant.endsAt;
  const expired = await notices.read(member);
  assert.equal(expired.items.filter(item => item.kind === "access-expired").length, 1);
  await Promise.all([notices.run(), notices.read(member), notices.run()]);
  assert.equal((await notices.read(member)).items.filter(item => item.kind === "access-expired").length, 1);
  await f.database.query(tx => tx.memberSession.deleteMany({ where: { accountId: first } }));
  assert.equal(await notices.read(member), null); assert.equal(await notices.update(member, "read-all"), false);
  await f.database.query(tx => tx.memberNotification.create({ data: { id: randomUUID(), accountId: second, kind: "payment-approved", eventKey: "synthetic-cascade", occurredAt: new Date(time), createdAt: new Date(time) } }));
  await f.database.query(tx => tx.memberAccount.delete({ where: { id: second } }));
  assert.equal(await f.database.query(tx => tx.memberNotification.count({ where: { accountId: second } })), 0);
  await assert.rejects(f.database.query(tx => tx.memberNotification.create({ data: { id: randomUUID(), accountId: first, eventKey: "invalid", kind: "invalid", occurredAt: new Date(time), createdAt: new Date(time) } })));
});

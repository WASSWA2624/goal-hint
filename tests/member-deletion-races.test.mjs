import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createPaymentNotifications } from "../src/server/members/payment-notifications.ts";
import { createPayments } from "../src/server/members/payments.ts";

const instant = Date.parse("2026-10-23T12:00:00Z");

function fixture() {
  let account = { id: randomUUID(), phone: "256700000111", blockedAt: null, erasedAt: null };
  let session = { accountId: account.id, tokenHash: "a".repeat(64), authenticatedAt: new Date(instant),
    passwordResetAt: null, expiresAt: new Date(instant + 86_400_000) };
  const member = { accountId: account.id, tokenHash: session.tokenHash, phone: account.phone };
  const audits = [], buckets = new Map(), events = [];
  let inTransaction = false, pending = Promise.resolve();
  const tx = {
    async $queryRaw(parts) { assert.match(parts.join(""), /MemberAccount.*FOR UPDATE/u); events.push("account-lock"); return account ? [{ id: account.id }] : []; },
    async $executeRaw(parts, ...values) {
      assert.ok(inTransaction); assert.equal(events[0], "account-lock", "bucket writes follow account validation");
      const sql = parts.join(""); assert.match(sql, /INSERT INTO RateLimitBucket/u);
      const count = sql.includes(", 1, 0,") ? 1 : 0;
      const existing = buckets.get(values[0]);
      buckets.set(values[0], { key: values[0], count: (existing?.count ?? 0) + count, bytes: 0 });
      return 1;
    },
    memberAccount: { async findUnique() { return account; } },
    memberSession: { async findUnique() { return session; } },
    ownerAuditEvent: { async create({ data }) { assert.ok(inTransaction); audits.push(data); return data; } },
    rateLimitBucket: {
      async findUniqueOrThrow({ where }) { const row = buckets.get(where.key); assert.ok(row); return row; },
      async update({ where, data }) { const row = buckets.get(where.key); assert.ok(row); for (const [key, value] of Object.entries(data)) row[key] += value.increment; return row; },
    },
  };
  const database = {
    async transaction(run) {
      const previous = pending; let release; pending = new Promise(resolve => { release = resolve; }); await previous;
      inTransaction = true;
      try { return await run(tx); } finally { inTransaction = false; release(); }
    },
  };
  return { database, member, audits, buckets, events, config: { key: (purpose, value) => createHash("sha256").update(purpose).update(value).digest("hex") },
    get account() { return account; }, get inTransaction() { return inTransaction; },
    async removeAccount() { await database.transaction(async () => { account = null; session = null; audits.length = 0; buckets.clear(); }); },
  };
}

for (const decision of ["approved", "rejected"]) {
  test(`a delayed ${decision} SMS cannot recreate audit data after account deletion`, async () => {
    const f = fixture(); let started, finish;
    const sending = new Promise(resolve => { started = resolve; }), response = new Promise(resolve => { finish = resolve; });
    const notifications = createPaymentNotifications({ database: f.database, now: () => instant,
      delivery: { async sendSms() { assert.equal(f.inTransaction, false, "provider delivery holds no account lock"); started(); await response; } } });
    const result = notifications[decision]({ accountId: f.member.accountId, paymentId: randomUUID(), phone: f.member.phone,
      reference: "PABCD", planName: "Weekly", expiresAt: new Date(instant + 86_400_000), reason: "not-received" });
    await sending; await f.removeAccount(); finish();
    assert.equal(await result, "sent", "deletion does not change the completed provider result");
    assert.deepEqual(f.audits, []);
    assert.deepEqual(f.events, ["account-lock"]);
  });
}

test("notification auditing skips erased accounts and remains best effort", async () => {
  const f = fixture(); f.account.erasedAt = new Date(instant);
  const notification = { accountId: f.member.accountId, paymentId: randomUUID(), phone: f.member.phone, reference: "PABCD", reason: "other" };
  const delivery = { async sendSms() {} };
  assert.equal(await createPaymentNotifications({ database: f.database, delivery }).rejected(notification), "sent");
  assert.deepEqual(f.audits, []);
  assert.equal(await createPaymentNotifications({ database: { async transaction() { throw new Error("Synthetic audit outage"); } }, delivery }).rejected(notification), "sent");
});

test("stale authenticated uploads cannot recreate rate buckets after deletion", async () => {
  const f = fixture(), payments = createPayments({ database: f.database, config: f.config, now: () => instant, environment: null });
  await f.removeAccount();
  assert.equal(await payments.begin(f.member, "198.51.100.41", 1000), false);
  assert.equal(f.buckets.size, 0);
  assert.deepEqual(f.events, ["account-lock"]);
});

test("current authenticated uploads reserve rate buckets under the account lock", async () => {
  const f = fixture(), payments = createPayments({ database: f.database, config: f.config, now: () => instant, environment: null });
  assert.equal(await payments.begin(f.member, "198.51.100.41", 1000), true);
  assert.equal(f.buckets.size, 4);
  assert.equal(f.buckets.get(f.config.key("member-upload-attempts", f.member.tokenHash)).count, 1);
  assert.equal(f.buckets.get(f.config.key("member-upload-ip", "198.51.100.41")).bytes, 1000);
});

test("stale profile changes cannot recreate the account password throttle after deletion", async () => {
  const f = fixture(), auth = createMemberAuth({ database: f.database, config: f.config, now: () => instant, adminPhone: () => false });
  await f.removeAccount();
  assert.equal((await auth.changePassword("new synthetic password", "old synthetic password", { member: f.member })).status, "unauthorized");
  assert.equal((await auth.changePhone("256700000222", "old synthetic password", { member: f.member })).status, "unauthorized");
  assert.equal(f.buckets.size, 0);
  assert.deepEqual(f.events, ["account-lock", "account-lock"]);
});

test("current-password attempts retain their account throttle and refusal responses", async () => {
  const f = fixture(), auth = createMemberAuth({ database: f.database, config: f.config, now: () => instant, adminPhone: () => false });
  f.account.passwordHash = await hashPassword("current synthetic password");
  f.account.phoneVerifiedAt = new Date(instant);
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await auth.changePassword("new synthetic password", "incorrect current password", { member: f.member });
    assert.equal(result.status, "unauthorized");
    assert.equal(result.message, "Your current password is incorrect.");
  }
  assert.equal((await auth.changePassword("new synthetic password", "current synthetic password", { member: f.member })).status, "busy");
  assert.equal(f.buckets.get(f.config.key("member-current-password-account", f.member.accountId)).count, 11);
});

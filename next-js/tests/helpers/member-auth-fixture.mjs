import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { defaultSubscriptionSettings } from "../../src/domain/subscription-settings.ts";
import { hashPassword } from "../../src/server/analytics/analytics-password.ts";
import { createMemberAuth } from "../../src/server/members/member-auth.ts";
import { createMemberSessions } from "../../src/server/members/member-sessions.ts";

const phone = "256700000001", password = "correct horse 47";
const key = (purpose, value) => createHmac("sha256", "synthetic-test-secret").update(`${purpose}\0${value}`).digest("hex");

/** Small transactional store: assertions exercise the production auth service, not a second implementation of it. */
export function createMemberAuthFixture({ admins = [], adminHash = null, send, trialDays = 2 } = {}) {
  let time = Date.parse("2026-10-20T18:00:00Z"), queue = Promise.resolve();
  const accounts = new Map(), sessions = new Map(), challenges = new Map(), buckets = new Map(), accessCodes = new Map(), referrals = new Map(), sent = [], messages = [];
  function matches(row, where = {}) {
    return Object.entries(where).every(([name, value]) => {
      if (name === "OR") return value.some((part) => matches(row, part));
      if (name === "AND") return [].concat(value).every((part) => matches(row, part));
      if (name === "NOT") return !matches(row, value);
      const actual = row[name];
      if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([operator, target]) =>
        operator === "gt" ? actual > target : operator === "gte" ? actual >= target : operator === "lt" ? actual < target : operator === "lte" ? actual <= target : operator === "not" ? actual !== target
          : operator === "in" ? target.includes(actual) : false);
      return actual instanceof Date && value instanceof Date ? +actual === +value : actual === value;
    });
  }
  function table(rows, id, defaults = {}) {
    return {
      async findUnique({ where, include }) { const row = [...rows.values()].find((row) => matches(row, where)); return row ? { ...row, ...(include?.account ? { account: accounts.get(row.accountId) } : {}) } : null; },
      async upsert({ where, create, update }) { return await this.findUnique({ where }) ? this.update({ where, data: update }) : this.create({ data: create }); },
      async findUniqueOrThrow(query) { const row = await this.findUnique(query); assert.ok(row); return row; },
      async findMany({ where, orderBy, take } = {}) {
        let values = [...rows.values()].filter((row) => matches(row, where));
        if (orderBy) values.sort((a, b) => { for (const part of [].concat(orderBy)) for (const [field, direction] of Object.entries(part)) {
          const comparison = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0; if (comparison) return direction === "desc" ? -comparison : comparison;
        } return 0; });
        if (take) values = values.slice(0, take);
        return values.map((row) => ({ ...row }));
      },
      async findFirst(query) { return (await this.findMany(query))[0] ?? null; },
      async count({ where } = {}) { return [...rows.values()].filter((row) => matches(row, where)).length; },
      async create({ data }) { const row = { ...defaults, ...data }; assert.ok(!rows.has(row[id])); rows.set(row[id], row); return { ...row }; },
      async update({ where, data }) { const row = [...rows.values()].find((row) => matches(row, where)); assert.ok(row); for (const [name, value] of Object.entries(data)) row[name] = value && typeof value === "object" && "increment" in value ? row[name] + value.increment : value; return { ...row }; },
      async updateMany({ where, data }) { let count = 0; for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      async deleteMany({ where }) { let count = 0; for (const [identifier, row] of rows) if (matches(row, where)) { rows.delete(identifier); count++; } return { count }; },
    };
  }
  const settings = { ...defaultSubscriptionSettings, trialDays, updatedAt: new Date(time), updatedBy: "synthetic-owner" };
  const tx = { memberAccount: table(accounts, "id", { passwordHash: null, phoneVerifiedAt: null, passwordChangedAt: null, blockedAt: null, erasedAt: null, referralCode: null }),
    memberSession: table(sessions, "tokenHash", { codeEnteredAt: null, accessCodeId: null, authenticatedAt: null, passwordResetAt: null }),
    memberReferral: table(referrals, "id", { rewardedAt: null, accessCodeId: null, inviterId: null, accountId: null, status: "pending" }),
    memberVerification: table(challenges, "id", { sentAt: null, confirmedAt: null, consumedAt: null, proofHash: null, attempts: 0 }),
    paymentSubmission: { async findMany() { return []; } },
    accessCode: table(accessCodes, "id", { revokedAt: null, extensionDays: 0 }),
    subscriptionSettings: { async findUnique() { return settings; }, async findUniqueOrThrow() { return settings; } },
    ownerAuditEvent: { async create({ data }) { sent.push(data); return data; } },
    rateLimitBucket: { async findUniqueOrThrow({ where }) { return buckets.get(where.key); } },
    async $queryRaw() { return []; },
    async $executeRaw(strings, ...values) {
      if (strings.join("").includes("RateLimitBucket")) {
        const [bucketKey, started] = values, existing = buckets.get(bucketKey);
        buckets.set(bucketKey, { count: existing?.started.getTime() === started.getTime() ? existing.count + 1 : 1, started });
      } else if (!strings.join("").includes("SubscriptionSettings")) throw new Error("Unexpected SQL in auth fixture");
      return 1;
    },
  };
  const database = { async query(run) { return run(tx); }, transaction(run) {
    const result = queue.then(async () => {
      const snapshots = [accounts, sessions, challenges, buckets, accessCodes, referrals].map((rows) => structuredClone(rows));
      const auditCount = sent.length;
      try { return await run(tx); } catch (error) { sent.length = auditCount; [accounts, sessions, challenges, buckets, accessCodes, referrals].forEach((rows, i) => { rows.clear(); for (const entry of snapshots[i]) rows.set(...entry); }); throw error; }
    });
    queue = result.catch(() => {}); return result;
  } };
  const adminPhones = new Set(admins), adminPhone = (phone) => adminPhones.has(phone);
  const delivery = { async send(message) { messages.push(message); await send?.(message); } };
  const restart = () => createMemberAuth({ database, config: { key }, now: () => time, adminPhone, adminPasswordHash: () => adminHash, delivery });
  const service = restart();
  const sessionService = createMemberSessions({ database, config: { key }, now: () => time, adminPhone, adminPasswordHash: () => adminHash });
  async function account(fields = {}) {
    return tx.memberAccount.create({ data: { id: randomUUID(), phone, passwordHash: await hashPassword(password), phoneVerifiedAt: new Date(time), createdAt: new Date(time), lastSignInAt: new Date(time), ...fields } });
  }
  async function authenticate() {
    await account();
    const logged = await service.login(phone, password, "198.51.100.1"); assert.equal(logged.status, "authenticated");
    const member = await sessionService.verify(logged.token); assert.ok(member);
    return { member, token: logged.token };
  }
  return { service, database, tx, settings, accounts, sessions, challenges, buckets, accessCodes, sent, messages, referrals, sessionService, account, authenticate, adminPhones, restart,
    now: () => time, advance: (ms) => { time += ms; } };
}

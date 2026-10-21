import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/server/analytics/analytics-password.ts";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberAuthHandler } from "../src/server/members/member-auth-http.ts";
import { createMemberSessions } from "../src/server/members/member-sessions.ts";
import { isMemberAdminPhone, memberAdminCredential, parseMemberAdminPhones, verifyMemberAdminCredential } from "../src/server/members/member-admin.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { passwordRecoveryRules } from "../src/server/members/password-recovery.ts";

const phone = "256700000001", replacement = "256700000002", password = "correct horse 47";
const key = (purpose, value) => createHmac("sha256", "synthetic-test-secret").update(`${purpose}\0${value}`).digest("hex");
const browser = () => ({ member: null });

/** Small transactional store: assertions exercise the production auth service, not a second implementation of it. */
function fixture({ admins = [], adminHash = null } = {}) {
  let time = Date.parse("2026-10-20T18:00:00Z"), queue = Promise.resolve();
  const accounts = new Map(), sessions = new Map(), challenges = new Map(), buckets = new Map(), sent = [];
  function matches(row, where = {}) {
    return Object.entries(where).every(([name, value]) => {
      const actual = row[name];
      if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([operator, target]) =>
        operator === "gt" ? actual > target : operator === "lte" ? actual <= target : operator === "not" ? actual !== target
          : operator === "in" ? target.includes(actual) : false);
      return actual === value;
    });
  }
  function table(rows, id, defaults = {}) {
    return {
      async findUnique({ where, include }) { const row = [...rows.values()].find((row) => matches(row, where)); return row ? { ...row, ...(include?.account ? { account: accounts.get(row.accountId) } : {}) } : null; },
      async upsert({ where, create, update }) { return await this.findUnique({ where }) ? this.update({ where, data: update }) : this.create({ data: create }); },
      async findUniqueOrThrow(query) { const row = await this.findUnique(query); assert.ok(row); return row; },
      async findMany({ where, orderBy } = {}) { const values = [...rows.values()].filter((row) => matches(row, where)); if (orderBy?.createdAt) values.sort((a, b) => +a.createdAt - +b.createdAt); return values.map((row) => ({ ...row })); },
      async findFirst(query) { const values = await this.findMany(query); return query.orderBy?.createdAt === "desc" ? values.at(-1) ?? null : values[0] ?? null; },
      async create({ data }) { const row = { ...defaults, ...data }; assert.ok(!rows.has(row[id])); rows.set(row[id], row); return { ...row }; },
      async update({ where, data }) { const row = [...rows.values()].find((row) => matches(row, where)); assert.ok(row); Object.assign(row, data); return { ...row }; },
      async updateMany({ where, data }) { let count = 0; for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      async deleteMany({ where }) { let count = 0; for (const [identifier, row] of rows) if (matches(row, where)) { rows.delete(identifier); count++; } return { count }; },
    };
  }
  const tx = { memberAccount: table(accounts, "id", { passwordHash: null, temporaryPasswordHash: null, temporaryPasswordExpiresAt: null, passwordResetRequestedAt: null, blockedAt: null, erasedAt: null }),
    memberSession: table(sessions, "tokenHash", { codeEnteredAt: null, accessCodeId: null, authenticatedAt: null, passwordResetAt: null }),
    memberVerification: table(challenges, "id", { sentAt: null, confirmedAt: null, consumedAt: null, proofHash: null, attempts: 0 }),
    paymentSubmission: { async findMany() { return []; } },
    accessCode: { async findFirst() { return null; } },
    subscriptionSettings: { async findUnique() { return null; } },
    ownerAuditEvent: { async create({ data }) { sent.push(data); return data; } },
    rateLimitBucket: { async findUniqueOrThrow({ where }) { return buckets.get(where.key); } },
    async $queryRaw() { return []; },
    async $executeRaw(strings, ...values) {
      if (strings.join("").includes("RateLimitBucket")) {
        const [bucketKey, started] = values, existing = buckets.get(bucketKey);
        buckets.set(bucketKey, { count: existing?.started.getTime() === started.getTime() ? existing.count + 1 : 1, started });
      } else throw new Error("Unexpected SQL in auth fixture");
      return 1;
    },
  };
  const database = { async query(run) { return run(tx); }, transaction(run) {
    const result = queue.then(async () => {
      const snapshots = [accounts, sessions, challenges, buckets].map((rows) => structuredClone(rows));
      try { return await run(tx); } catch (error) { [accounts, sessions, challenges, buckets].forEach((rows, i) => { rows.clear(); for (const entry of snapshots[i]) rows.set(...entry); }); throw error; }
    });
    queue = result.catch(() => {}); return result;
  } };
  const adminPhones = new Set(admins), adminPhone = (phone) => adminPhones.has(phone);
  const service = createMemberAuth({ database, config: { key }, now: () => time, adminPhone, adminPasswordHash: () => adminHash });
  const sessionService = createMemberSessions({ database, config: { key }, now: () => time, adminPhone, adminPasswordHash: () => adminHash });
  async function account(fields = {}) {
    return tx.memberAccount.create({ data: { id: randomUUID(), phone, passwordHash: await hashPassword(password), createdAt: new Date(time), lastSignInAt: new Date(time), ...fields } });
  }
  async function authenticate() {
    await account();
    const logged = await service.login(phone, password, "198.51.100.1"); assert.equal(logged.status, "authenticated");
    const member = await sessionService.verify(logged.token); assert.ok(member);
    return { member, token: logged.token };
  }
  return { service, database, tx, accounts, sessions, challenges, buckets, sent, sessionService, account, authenticate, adminPhones,
    now: () => time, advance: (ms) => { time += ms; } };
}

test("registration needs only phone and password and never claims an existing passwordless account", async () => {
  const f = fixture();
  const result = await f.service.register(phone, password, browser(), "198.51.100.1");
  assert.equal(result.status, "authenticated");
  assert.equal((await f.sessionService.verify(result.token)).phone, phone);
  assert.notEqual([...f.accounts.values()][0].passwordHash, password);
  assert.ok(await verifyPassword(password, [...f.accounts.values()][0].passwordHash));
  assert.deepEqual(await f.service.register(phone, password, browser(), "198.51.100.1"), { status: "conflict", message: "An account already exists, so please log in." });
  const legacy = fixture(); await legacy.account({ passwordHash: null });
  assert.equal((await legacy.service.register(phone, password, browser(), "198.51.100.1")).status, "conflict");
});

test("configured admin numbers require the environment password and land on the dashboard", async () => {
  const hash = await hashPassword("configured admin password"), f = fixture({ admins: [phone], adminHash: hash });
  assert.equal((await f.service.register(phone, password, browser(), "198.51.100.1")).status, "unauthorized");
  const account = await f.account();
  assert.equal((await f.service.login(phone, password, "198.51.100.1")).status, "unauthorized");
  const logged = await f.service.login(phone, "configured admin password", "198.51.100.1");
  assert.equal(logged.administrator, true); assert.equal((await f.sessionService.verify(logged.token)).accountId, account.id);
  const noAccount = fixture({ admins: [replacement], adminHash: hash });
  assert.equal((await noAccount.service.login(replacement, "configured admin password", "198.51.100.1")).administrator, true);
  assert.equal(noAccount.accounts.size, 1);
  const request = new Request("https://goal.test/api/account/login", { method: "POST", headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "configured admin password", return: "/en/subscribe" }) });
  const response = await createMemberAuthHandler("login", async () => ({ config: { production: false, cookies: { secure: false } }, auth: f.service, sessions: f.sessionService }))(request);
  assert.equal(response.status, 200); assert.equal((await response.json()).next, "/admin");
});

test("private administrator password fallback works without hashing on each read and yields only opaque session metadata", async () => {
  const configured = "private admin fallback", environment = { GOAL_HINT_ADMIN_PASSWORD: configured };
  const credential = memberAdminCredential(environment);
  assert.equal(memberAdminCredential(environment), credential, "The credential identity is stable across processes");
  assert.equal(await verifyMemberAdminCredential("wrong password", credential), false);
  const f = fixture({ admins: [phone], adminHash: credential });
  const logged = await f.service.login(phone, configured, "198.51.100.1");
  assert.equal(logged.administrator, true); assert.equal((await f.sessionService.verify(logged.token)).administrator, true);
  assert.ok(!JSON.stringify([...f.accounts.values(), ...f.sessions.values(), logged]).includes(configured));
  assert.match([...f.sessions.values()][0].adminPasswordVersion, /^[a-f0-9]{64}$/u);
  const preferred = await hashPassword("preferred hashed credential");
  assert.equal(memberAdminCredential({ ...environment, GOAL_HINT_ADMIN_PASSWORD_HASH: preferred }), preferred);
  assert.equal(await verifyMemberAdminCredential(configured, preferred), false);
  assert.equal(memberAdminCredential({ ...environment, GOAL_HINT_ADMIN_PASSWORD_HASH: "malformed hash" }), null);
  assert.equal(memberAdminCredential({ ...environment, GOAL_HINT_ADMIN_PASSWORD_HASH: "   " }), credential);
  assert.equal(memberAdminCredential({ GOAL_HINT_ADMIN_PASSWORD: "        " }), null);
});

test("forgot password persists one request and returns no credential or account-existence information", async () => {
  const f = fixture(), account = await f.account();
  const result = await f.service.requestPasswordReset(phone, "198.51.100.1");
  assert.equal(result.status, "requested"); assert.ok(f.accounts.get(account.id).passwordResetRequestedAt);
  const at = +f.accounts.get(account.id).passwordResetRequestedAt; f.advance(10_000);
  assert.deepEqual(await f.service.requestPasswordReset(replacement, "198.51.100.1"), result);
  await f.service.requestPasswordReset(phone, "198.51.100.1");
  assert.equal(+f.accounts.get(account.id).passwordResetRequestedAt, at);
  assert.equal(f.sent.length, 0);
  assert.equal((await f.service.login(phone, password, "198.51.100.1")).status, "authenticated", "A request alone does not change the password");
});

async function temporary(f) {
  const account = await f.account(), owner = createSubscribers(f.database, f.now, input => f.adminPhones.has(input));
  const result = await owner.temporaryPassword({ id: account.id }, "owner");
  assert.equal(result.status, "reset"); assert.equal(Date.parse(result.expiresAt) - f.now(), passwordRecoveryRules.temporaryMs);
  assert.equal(f.accounts.get(account.id).passwordHash, null);
  assert.notEqual(f.accounts.get(account.id).temporaryPasswordHash, result.temporaryPassword);
  assert.ok(await verifyPassword(result.temporaryPassword, f.accounts.get(account.id).temporaryPasswordHash));
  assert.ok(!JSON.stringify(f.sent).includes(result.temporaryPassword));
  return { account, result };
}

test("temporary password is single-use and grants only a reset cookie until a new password is saved", async () => {
  const f = fixture(), { result } = await temporary(f);
  assert.equal((await f.service.login(phone, password, "198.51.100.1")).status, "unauthorized");
  const attempts = await Promise.all([f.service.login(phone, result.temporaryPassword, "198.51.100.1"), f.service.login(phone, result.temporaryPassword, "198.51.100.2")]);
  assert.deepEqual(attempts.map(r => r.status).sort(), ["authenticated", "unauthorized"]);
  const login = attempts.find(r => r.status === "authenticated"); assert.equal(login.requiresPasswordChange, true);
  assert.equal(await f.sessionService.verify(login.token), null);
  assert.equal((await f.service.passwordResetSession(login.token)).phone, phone);
  const changed = await f.service.resetPassword("replacement secret", login.token, "198.51.100.1");
  assert.equal(changed.status, "authenticated"); assert.equal((await f.sessionService.verify(changed.token)).phone, phone);
  assert.equal(await f.service.passwordResetSession(login.token), null);
  assert.equal((await f.service.resetPassword("another secret", login.token, "198.51.100.1")).status, "unauthorized");
  assert.equal((await f.service.login(phone, "replacement secret", "198.51.100.1")).status, "authenticated");
});

test("temporary password and reset authorization expire at their exact deadline", async () => {
  const f = fixture(), { result } = await temporary(f);
  f.advance(passwordRecoveryRules.temporaryMs);
  assert.equal((await f.service.login(phone, result.temporaryPassword, "198.51.100.1")).status, "unauthorized");
  const second = fixture(), issued = await temporary(second);
  const login = await second.service.login(phone, issued.result.temporaryPassword, "198.51.100.1");
  second.advance(passwordRecoveryRules.resetSessionMs);
  assert.equal(await second.service.passwordResetSession(login.token), null);
  assert.equal((await second.service.resetPassword("replacement secret", login.token, "198.51.100.1")).status, "unauthorized");
});

test("reissuing a temporary password invalidates the old one and request throttles are durable", async () => {
  const f = fixture(), { account, result } = await temporary(f);
  const next = await createSubscribers(f.database, f.now, () => false).temporaryPassword({ id: account.id }, "owner");
  assert.equal(next.status, "reset"); assert.notEqual(next.temporaryPassword, result.temporaryPassword);
  assert.equal((await f.service.login(phone, result.temporaryPassword, "198.51.100.1")).status, "unauthorized");
  assert.equal((await f.service.login(phone, next.temporaryPassword, "198.51.100.1")).requiresPasswordChange, true);
  for (let i = 0; i < 3; i++) assert.equal((await f.service.requestPasswordReset(phone, "198.51.100.1")).status, "requested");
  const restarted = createMemberAuth({ database: f.database, config: { key }, now: f.now, adminPhone: () => false });
  assert.equal((await restarted.requestPasswordReset(phone, "198.51.100.1")).status, "busy");
});

test("normal password changes check the current password and revoke other devices", async () => {
  const f = fixture(), binding = await f.authenticate(), second = await f.service.login(phone, password, "198.51.100.2");
  assert.equal((await f.service.changePassword("new secret password", "wrong", binding)).status, "unauthorized");
  const changed = await f.service.changePassword("new secret password", password, binding);
  assert.equal(changed.status, "authenticated"); assert.equal(await f.sessionService.verify(binding.token), null); assert.equal(await f.sessionService.verify(second.token), null);
  assert.ok(await f.sessionService.verify(changed.token));
});

test("recovery cannot reset administrator environment credentials and requires same-origin HTTP", async () => {
  const f = fixture({ admins: [phone] }), account = await f.account();
  assert.equal((await createSubscribers(f.database, f.now, () => true).temporaryPassword({ id: account.id }, "owner")).status, "refused");
  const response = await createMemberAuthHandler("forgot", async () => { assert.fail("Cross-site requests cannot reach storage"); })(
    new Request("https://goal.test/api/account/forgot", { method: "POST", headers: { Origin: "https://evil.test", "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }));
  assert.equal(response.status, 403);
  assert.deepEqual(parseMemberAdminPhones(JSON.stringify([phone, phone])), [phone]);
  assert.equal(isMemberAdminPhone(phone, { GOAL_HINT_ADMIN_PHONES: JSON.stringify([phone]) }), true);
});

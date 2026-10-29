import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/server/analytics/analytics-password.ts";
import { grantRegistrationTrial } from "../src/server/members/access-codes.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberAuthHandler } from "../src/server/members/member-auth-http.ts";
import { createMemberSessions, issueMemberSession, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { isMemberAdminPhone, memberAdminCredential, parseMemberAdminPhones, verifyMemberAdminCredential } from "../src/server/members/member-admin.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { passwordRecoveryRules } from "../src/server/members/password-recovery.ts";

const phone = "256700000001", replacement = "256700000002", password = "correct horse 47";
const key = (purpose, value) => createHmac("sha256", "synthetic-test-secret").update(`${purpose}\0${value}`).digest("hex");
const browser = () => ({ member: null });
const DAY = 86_400_000, address = "198.51.100.1";
const wrongCode = (code) => `${code[0] === "0" ? "1" : "0"}${code.slice(1)}`;

/** Small transactional store: assertions exercise the production auth service, not a second implementation of it. */
function fixture({ admins = [], adminHash = null, send, trialDays = 2 } = {}) {
  let time = Date.parse("2026-10-20T18:00:00Z"), queue = Promise.resolve();
  const accounts = new Map(), sessions = new Map(), challenges = new Map(), buckets = new Map(), accessCodes = new Map(), sent = [], messages = [];
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
  const tx = { memberAccount: table(accounts, "id", { passwordHash: null, phoneVerifiedAt: null, passwordChangedAt: null, temporaryPasswordHash: null, temporaryPasswordExpiresAt: null, passwordResetRequestedAt: null, blockedAt: null, erasedAt: null }),
    memberSession: table(sessions, "tokenHash", { codeEnteredAt: null, accessCodeId: null, authenticatedAt: null, passwordResetAt: null }),
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
      const snapshots = [accounts, sessions, challenges, buckets, accessCodes].map((rows) => structuredClone(rows));
      const auditCount = sent.length;
      try { return await run(tx); } catch (error) { sent.length = auditCount; [accounts, sessions, challenges, buckets, accessCodes].forEach((rows, i) => { rows.clear(); for (const entry of snapshots[i]) rows.set(...entry); }); throw error; }
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
  return { service, database, tx, settings, accounts, sessions, challenges, buckets, accessCodes, sent, messages, sessionService, account, authenticate, adminPhones, restart,
    now: () => time, advance: (ms) => { time += ms; } };
}

test("enabled welcome content queues only after successful account verification and stores no OTP", async () => {
  const { defaultMessageTemplates } = await import("../src/domain/message-templates.ts");
  const f = fixture(), notices = [];
  f.settings.messageTemplates = structuredClone(defaultMessageTemplates); f.settings.messageTemplates.events.welcome.enabled = true;
  f.tx.paymentNotificationOutbox = {
    async findFirst({ where }) { return notices.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null; },
    async create({ data }) { notices.push(data); return data; },
  };
  const registered = await f.service.register(phone, password, browser(), address);
  assert.equal(registered.status, "authenticated"); assert.equal(notices.length, 0);
  await f.service.requestVerification("sms", registered.token, address);
  const code = f.messages[0].code;
  assert.equal((await f.service.verifyAccount(wrongCode(code), registered.token, address)).status, "unauthorized");
  assert.equal(notices.length, 0);
  assert.equal((await f.service.verifyAccount(code, registered.token, address)).status, "authenticated");
  assert.equal(notices.length, 1); assert.equal(notices[0].decision, "welcome"); assert.equal(notices[0].targetType, "member");
  assert.equal(JSON.stringify(notices).includes(phone), false); assert.equal(JSON.stringify(notices).includes(code), false);
  assert.equal((await f.service.verifyAccount(code, registered.token, address)).status, "unauthorized"); assert.equal(notices.length, 1);
});

test("changing the recipient phone clears account-update WhatsApp consent before new verification", async () => {
  const f = fixture(), logged = await f.authenticate();
  f.accounts.get(logged.member.accountId).whatsappNotificationsAt = new Date(f.now());
  const changed = await f.service.changePhone(replacement, password, { member: logged.member });
  assert.equal(changed.status, "authenticated"); assert.equal(changed.requiresVerification, true);
  assert.equal(f.accounts.get(logged.member.accountId).whatsappNotificationsAt, null);
});

test("explicit optional signup consent is recorded only after a valid code and enables the WhatsApp welcome intent", async () => {
  const { defaultMessageTemplates } = await import("../src/domain/message-templates.ts");
  const f = fixture(), notices = [];
  f.settings.messageTemplates = structuredClone(defaultMessageTemplates);
  f.settings.messageTemplates.events.welcome = { enabled: true, channels: ["whatsapp"], sms: "Welcome to Goal Hint.",
    whatsapp: { templateName: "goal_hint_welcome", parameters: ["{{access_url}}"] } };
  f.tx.paymentNotificationOutbox = {
    async findFirst({ where }) { return notices.find(row => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null; },
    async create({ data }) { notices.push(data); return data; },
  };
  const registered = await f.service.register(phone, password, browser(), address);
  await f.service.requestVerification("whatsapp", registered.token, address);
  assert.equal(f.accounts.get(registered.accountId).whatsappNotificationsAt == null, true, "requesting an OTP never consents to account updates");
  const code = f.messages[0].code;
  assert.equal((await f.service.verifyAccount(wrongCode(code), registered.token, address, true)).status, "unauthorized");
  assert.equal(f.accounts.get(registered.accountId).whatsappNotificationsAt == null, true); assert.equal(notices.length, 0);
  assert.equal((await f.service.verifyAccount(code, registered.token, address, true)).status, "authenticated");
  assert.equal(+f.accounts.get(registered.accountId).whatsappNotificationsAt, f.now());
  assert.equal(notices.length, 1); assert.equal(notices[0].channel, "whatsapp"); assert.equal(notices[0].decision, "welcome");
});

test("verification HTTP accepts only an explicit boolean account-update consent preference", async () => {
  for (const whatsappNotifications of [null, "true", 1, {}]) {
    const handler = createMemberAuthHandler("verify", async () => { assert.fail("Invalid consent never reaches storage"); });
    assert.equal((await handler(authRequest("verify", { code: "123456", whatsappNotifications }))).status, 400);
  }
  for (const whatsappNotifications of [true, false, undefined]) {
    let selected;
    const handler = createMemberAuthHandler("verify", async () => ({ config: { production: false }, sessions: { async verify() { return null; } },
      auth: { async verifyAccount(_code, _token, _address, value) { selected = value; return { status: "unauthorized", message: "Synthetic code refused" }; } } }));
    assert.equal((await handler(authRequest("verify", { code: "123456", ...(whatsappNotifications === undefined ? {} : { whatsappNotifications }) }))).status, 401);
    assert.equal(selected, whatsappNotifications === true);
  }
});

test("registration creates a restricted verification session and never claims an existing passwordless account", async () => {
  const f = fixture();
  const result = await f.service.register(phone, password, browser(), "198.51.100.1");
  assert.equal(result.status, "authenticated");
  assert.equal(result.requiresVerification, true);
  assert.equal(await f.sessionService.verify(result.token), null);
  assert.deepEqual(await f.service.verificationSession(result.token), { phone });
  assert.equal(f.messages.length, 0, "The member selects SMS or WhatsApp before a message is sent");
  assert.equal([...f.sessions.values()][0].authenticatedAt, null);
  assert.equal([...f.sessions.values()][0].passwordResetAt, null);
  assert.notEqual([...f.accounts.values()][0].passwordHash, password);
  assert.ok(await verifyPassword(password, [...f.accounts.values()][0].passwordHash));
  assert.deepEqual(await f.service.register(phone, password, browser(), "198.51.100.1"), { status: "conflict", message: "An account already exists, so please sign in." });
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
  const response = await createMemberAuthHandler("login", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(request);
  assert.equal(response.status, 200); assert.equal((await response.json()).next, "/admin/payments");
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

test("shared sign-in cannot provision missing ordinary accounts or authenticate blocked, erased or unconfigured administrator accounts", async () => {
  const configured = "configured administrator password", hash = await hashPassword(configured);
  for (const fields of [{ blockedAt: new Date() }, { erasedAt: new Date() }]) {
    const f = fixture({ admins: [phone], adminHash: hash }); await f.account(fields);
    assert.equal((await f.service.login(phone, configured, address)).status, "unauthorized");
    assert.equal(f.sessions.size, 0);
  }
  const missingCredential = fixture({ admins: [phone] });
  assert.equal((await missingCredential.service.login(phone, configured, address)).status, "unauthorized");
  assert.equal(missingCredential.accounts.size, 0); assert.equal(missingCredential.sessions.size, 0);
  const ordinary = fixture();
  assert.equal((await ordinary.service.login(phone, password, address)).status, "unauthorized");
  assert.equal(ordinary.accounts.size, 0); assert.equal(ordinary.sessions.size, 0);
});

test("administrator password logins also allow only the latest device", async () => {
  const configured = "configured administrator password", f = fixture({ admins: [phone], adminHash: await hashPassword(configured) });
  const first = await f.service.login(phone, configured, address);
  assert.equal((await f.service.login(phone, "wrong administrator password", "198.51.100.2")).status, "unauthorized");
  assert.equal((await f.sessionService.verify(first.token)).administrator, true);
  const second = await f.service.login(phone, configured, "198.51.100.2");
  assert.equal(second.otherDeviceSignedOut, true);
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.equal((await f.sessionService.verify(second.token)).administrator, true); assert.equal(f.sessions.size, 1);
});

test("forgot password sends to a registered number and gives unknown/admin numbers the same generic response", async () => {
  const f = fixture(), account = await f.account();
  const result = await f.service.requestPasswordReset(phone, address, "sms");
  assert.equal(result.status, "requested"); assert.ok(f.accounts.get(account.id).passwordResetRequestedAt);
  assert.deepEqual(await f.service.requestPasswordReset(replacement, address, "whatsapp"), result);
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].phone, phone); assert.equal(f.messages[0].channel, "sms"); assert.equal(f.messages[0].purpose, "password-reset");
  const admin = fixture({ admins: [phone] }); await admin.account();
  assert.deepEqual(await admin.service.requestPasswordReset(phone, address, "sms"), result);
  assert.equal(admin.messages.length, 0); assert.equal(admin.challenges.size, 0);
  assert.ok(!JSON.stringify(result).includes(f.messages[0].code));
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

test("reissuing a temporary password invalidates the old one", async () => {
  const f = fixture(), { account, result } = await temporary(f);
  const next = await createSubscribers(f.database, f.now, () => false).temporaryPassword({ id: account.id }, "owner");
  assert.equal(next.status, "reset"); assert.notEqual(next.temporaryPassword, result.temporaryPassword);
  assert.equal((await f.service.login(phone, result.temporaryPassword, "198.51.100.1")).status, "unauthorized");
  assert.equal((await f.service.login(phone, next.temporaryPassword, "198.51.100.1")).requiresPasswordChange, true);
});

test("normal password changes check the current password and rotate the current device", async () => {
  const f = fixture(), binding = await f.authenticate();
  assert.equal((await f.service.changePassword("new secret password", "wrong", binding)).status, "unauthorized");
  const changed = await f.service.changePassword("new secret password", password, binding);
  assert.equal(changed.status, "authenticated"); assert.equal(await f.sessionService.verify(binding.token), null);
  assert.ok(await f.sessionService.verify(changed.token));
});

test("a successful login signs out the previous device and denies its profile writes", async () => {
  const f = fixture(), first = await f.authenticate();
  await f.account({ phone: replacement });
  const other = await f.service.login(replacement, password, "198.51.100.9");
  const second = await f.service.login(phone, password, "198.51.100.2");
  assert.equal(second.status, "authenticated"); assert.notEqual(second.token, first.token);
  assert.equal(other.otherDeviceSignedOut, false); assert.equal(second.otherDeviceSignedOut, true);
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.ok(await f.sessionService.verify(second.token)); assert.ok(await f.sessionService.verify(other.token));
  assert.equal([...f.sessions.values()].filter(row => row.accountId === first.member.accountId).length, 1);
  assert.equal((await f.service.changePassword("stale device password", password, first)).status, "unauthorized");
  assert.equal((await f.service.changePhone("256700000003", password, first)).status, "unauthorized");
  const response = await createMemberAuthHandler("password", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(
    authRequest("password", { password: "stale HTTP password", currentPassword: password }, first.token));
  assert.equal(response.status, 401); assert.equal(response.headers.get("set-cookie"), null);
  await f.sessionService.signOut(first.token);
  assert.ok(await f.sessionService.verify(second.token), "Signing out an old cookie cannot sign out the replacement device");
});

test("the login notification distinguishes the current browser from another active device", async () => {
  const f = fixture(); await f.account();
  const first = await f.service.login(phone, password, address);
  assert.equal(first.otherDeviceSignedOut, false);
  const refreshed = await f.service.login(phone, password, address, first.token);
  assert.equal(refreshed.otherDeviceSignedOut, false); assert.equal(await f.sessionService.verify(first.token), null);
  const replacement = await f.service.login(phone, password, "198.51.100.2", first.token);
  assert.equal(replacement.otherDeviceSignedOut, true, "A stale local cookie must not hide another device's active session");
  assert.equal(await f.sessionService.verify(refreshed.token), null); assert.ok(await f.sessionService.verify(replacement.token));
});

test("expired and restricted sessions do not trigger an incorrect other-device notification", async () => {
  const f = fixture(), account = await f.account();
  const pending = await f.database.transaction(tx => issueMemberSession(tx, account.id, new Date(f.now())));
  const expired = "e".repeat(43), at = new Date(f.now());
  await f.tx.memberSession.create({ data: { tokenHash: memberTokenHash(expired), accountId: account.id,
    authenticatedAt: at, createdAt: at, lastSeenAt: at, expiresAt: at } });
  const login = await f.service.login(phone, password, address);
  assert.equal(login.status, "authenticated"); assert.equal(login.otherDeviceSignedOut, false);
  assert.equal(await f.sessionService.verify(expired), null);
  assert.equal(f.sessions.has(pending.session.tokenHash), false); assert.equal(f.sessions.size, 1);
});

test("concurrent successful logins leave only the last committed device authenticated", async () => {
  const f = fixture(), first = await f.authenticate(), committed = [];
  await Promise.all(Array.from({ length: 5 }, (_, index) => f.service.login(phone, password, `198.51.100.${index + 2}`).then(result => committed.push(result))));
  assert.ok(committed.every(result => result.status === "authenticated"));
  assert.equal(f.sessions.size, 1); assert.equal(await f.sessionService.verify(first.token), null);
  for (const result of committed.slice(0, -1)) assert.equal(await f.sessionService.verify(result.token), null);
  assert.ok(await f.sessionService.verify(committed.at(-1).token));
});

test("failed and blocked logins preserve the existing device", async () => {
  const f = fixture(), active = await f.authenticate();
  const wrong = await f.service.login(phone, "wrong password", address, active.token);
  assert.equal(wrong.status, "unauthorized"); assert.ok(await f.sessionService.verify(active.token));
  const account = f.accounts.get(active.member.accountId);
  account.blockedAt = new Date(f.now());
  assert.equal((await f.service.login(phone, password, address, active.token)).status, "unauthorized");
  assert.ok(f.sessions.has(active.member.tokenHash), "A rejected login cannot delete even a blocked account's cookie");
  account.blockedAt = null;
  assert.ok(await f.sessionService.verify(active.token));
  for (let attempt = 0; attempt < 9; attempt++) await f.service.login(phone, "wrong password", address);
  assert.equal((await f.service.login(phone, password, address)).status, "busy");
  assert.ok(await f.sessionService.verify(active.token), "Throttled logins cannot sign out the current device");
});

test("a failed replacement transaction restores the active device and issues no cookie", async () => {
  const f = fixture(), active = await f.authenticate();
  f.tx.memberSession.create = async () => { throw new Error("Synthetic session insert failure"); };
  const response = await createMemberAuthHandler("login", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(
    authRequest("login", { phone, password }, undefined));
  assert.equal(response.status, 503); assert.equal(response.headers.get("set-cookie"), null);
  assert.ok(await f.sessionService.verify(active.token)); assert.equal(f.sessions.size, 1);
});

test("subscription access moves to a new login when the unlocked-device cap is one", async () => {
  const f = fixture(), first = await f.authenticate(), codeId = randomUUID();
  await f.tx.accessCode.create({ data: { id: codeId, accountId: first.member.accountId, startsAt: new Date(f.now() - 1), endsAt: new Date(f.now() + DAY) } });
  f.tx.subscriptionSettings.findUnique = async () => ({ maxUnlockedDevices: 1 });
  await f.tx.memberSession.update({ where: { tokenHash: first.member.tokenHash }, data: { codeEnteredAt: new Date(f.now()), accessCodeId: codeId } });
  const second = await f.service.login(phone, password, "198.51.100.2"), member = await f.sessionService.verify(second.token);
  assert.equal(second.status, "authenticated"); assert.ok(member.codeEnteredAt); assert.equal(member.accessCodeId, codeId);
  assert.equal(await f.sessionService.verify(first.token), null); assert.equal(f.sessions.size, 1);
});

test("restricted session requests cannot evict the authenticated device under a flood", async () => {
  const f = fixture(), active = await f.authenticate();
  for (let attempt = 0; attempt < 12; attempt++) await f.database.transaction(tx => issueMemberSession(tx, active.member.accountId, new Date(f.now())));
  assert.ok(await f.sessionService.verify(active.token));
  assert.equal(f.sessions.size, 10);
  const authenticated = [...f.sessions.values()].filter(row => row.authenticatedAt);
  assert.equal(authenticated.length, 1); assert.equal(authenticated[0].tokenHash, active.member.tokenHash);
});

async function pending(f) {
  const result = await f.service.register(phone, password, browser(), address);
  assert.equal(result.requiresVerification, true);
  return result;
}

test("account verification uses the selected channel, stores a keyed proof, and consumes the latest code once", async () => {
  const f = fixture(), registered = await pending(f);
  assert.equal((await f.service.requestVerification("whatsapp", registered.token, address)).status, "requested");
  const message = f.messages[0], challenge = [...f.challenges.values()][0];
  assert.equal(message.phone, phone); assert.equal(message.channel, "whatsapp"); assert.equal(message.purpose, "account");
  assert.match(message.code, /^\d{6}$/u); assert.notEqual(challenge.codeHash, message.code);
  assert.match(challenge.codeHash, /^[a-f0-9]{64}$/u); assert.equal(+challenge.expiresAt - +challenge.createdAt, DAY);
  assert.ok(!JSON.stringify([...f.challenges.values()]).includes(`"${message.code}"`));
  assert.equal(await f.service.passwordResetSession(registered.token), null);
  const claims = await Promise.all([f.service.verifyAccount(message.code, registered.token, address), f.service.verifyAccount(message.code, registered.token, "198.51.100.2")]);
  assert.deepEqual(claims.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const verified = claims.find(result => result.status === "authenticated");
  assert.equal(verified.status, "authenticated"); assert.equal((await f.sessionService.verify(verified.token)).phone, phone);
  assert.ok(f.accounts.get(verified.accountId).phoneVerifiedAt);
  assert.equal(await f.service.verificationSession(registered.token), null);
  assert.equal((await f.service.verifyAccount(message.code, registered.token, address)).status, "unauthorized");
  const logged = await f.service.login(phone, password, address);
  assert.equal(logged.requiresVerification, undefined); assert.ok(await f.sessionService.verify(logged.token));
});

test("unverified passwords only reopen verification and cannot access authenticated profile actions", async () => {
  const f = fixture(); await f.account({ phoneVerifiedAt: null });
  const logged = await f.service.login(phone, password, address);
  assert.equal(logged.requiresVerification, true); assert.equal(await f.sessionService.verify(logged.token), null);
  assert.deepEqual(await f.service.verificationSession(logged.token), { phone });
  assert.equal(f.messages.length, 0);
  assert.equal((await f.service.changePassword("replacement secret", password, browser())).status, "unauthorized");
  assert.equal((await f.service.changePhone(replacement, password, browser())).status, "unauthorized");
  assert.equal((await f.service.requestVerification("email", logged.token, address)).status, "invalid");
  assert.equal((await f.service.requestVerification("sms", undefined, address)).status, "unauthorized");
  assert.equal((await f.service.requestPasswordReset(phone, address, "email")).status, "invalid");
  assert.equal(f.messages.length, 0);
});

test("member sessions require both authenticated authorization and a verified phone", async () => {
  const f = fixture(), binding = await f.authenticate(), account = f.accounts.get(binding.member.accountId);
  account.phoneVerifiedAt = null;
  assert.equal(await f.sessionService.verify(binding.token), null, "An authenticated cookie cannot bypass an unverified phone");
  account.phoneVerifiedAt = new Date(f.now());
  const session = f.sessions.get(binding.member.tokenHash);
  session.passwordResetAt = new Date(f.now());
  assert.equal(await f.sessionService.verify(binding.token), null, "Reset authorization never grants normal account access");
  session.passwordResetAt = null; session.authenticatedAt = null;
  assert.equal(await f.sessionService.verify(binding.token), null);
});

test("changing the phone revokes sessions and verifies the replacement before account access", async () => {
  const f = fixture(), binding = await f.authenticate();
  const changed = await f.service.changePhone(replacement, password, binding);
  assert.equal(changed.requiresVerification, true); assert.equal(await f.sessionService.verify(binding.token), null);
  assert.equal(await f.sessionService.verify(changed.token), null);
  assert.deepEqual(await f.service.verificationSession(changed.token), { phone: replacement });
  assert.equal(f.accounts.get(changed.accountId).phoneVerifiedAt, null);
  await f.service.requestVerification("sms", changed.token, address);
  assert.equal(f.messages.at(-1).phone, replacement);
  const verified = await f.service.verifyAccount(f.messages.at(-1).code, changed.token, address);
  assert.equal((await f.sessionService.verify(verified.token)).phone, replacement);
});

test("only the newest account code works across SMS and WhatsApp, including after a restart", async () => {
  const f = fixture(), registered = await pending(f);
  await f.service.requestVerification("sms", registered.token, address);
  const first = f.messages.at(-1).code; f.advance(1);
  await f.service.requestVerification("whatsapp", registered.token, address);
  assert.equal((await f.restart().verifyAccount(first, registered.token, address)).status, "unauthorized");
  const verified = await f.restart().verifyAccount(f.messages.at(-1).code, registered.token, address);
  assert.equal(verified.status, "authenticated");
});

test("account and reset codes expire at exactly 24 hours and fail closed after five wrong guesses", async () => {
  const account = fixture(), registered = await pending(account);
  await account.service.requestVerification("sms", registered.token, address); account.advance(DAY);
  assert.equal((await account.service.verifyAccount(account.messages[0].code, registered.token, address)).status, "unauthorized");
  const reset = fixture(); await reset.account();
  await reset.service.requestPasswordReset(phone, address, "whatsapp"); reset.advance(DAY);
  assert.equal((await reset.service.verifyPasswordReset(phone, reset.messages[0].code, address)).status, "unauthorized");
  for (const purpose of ["account", "reset"]) {
    const f = fixture(), pendingMember = purpose === "account" ? await pending(f) : (await f.account(), null);
    if (pendingMember) await f.service.requestVerification("sms", pendingMember.token, address);
    else await f.service.requestPasswordReset(phone, address, "sms");
    const code = f.messages[0].code;
    const verify = (input) => pendingMember ? f.service.verifyAccount(input, pendingMember.token, address) : f.service.verifyPasswordReset(phone, input, address);
    for (let i = 0; i < 5; i++) assert.equal((await verify(wrongCode(code))).status, "unauthorized");
    assert.equal((await verify(code)).status, "unauthorized", `${purpose}: exhausted code cannot be recovered with the right value`);
  }
});

test("each purpose allows three messages across channels in a rolling 24 hours and persists the limit", async () => {
  const f = fixture(), registered = await pending(f);
  for (let i = 0; i < 3; i++) {
    assert.equal((await f.service.requestVerification(i % 2 ? "whatsapp" : "sms", registered.token, address)).status, "requested");
    assert.equal((await f.service.requestPasswordReset(phone, address, i % 2 ? "sms" : "whatsapp")).status, "requested");
  }
  f.advance(12 * 3_600_000);
  assert.equal((await f.restart().requestVerification("sms", registered.token, address)).status, "busy");
  assert.equal((await f.restart().requestPasswordReset(phone, address, "whatsapp")).status, "busy");
  assert.equal(f.messages.length, 6);
  f.advance(12 * 3_600_000);
  assert.equal((await f.service.requestVerification("sms", registered.token, address)).status, "requested");
  assert.equal((await f.service.requestPasswordReset(phone, address, "whatsapp")).status, "requested");
});

test("changing the registered phone does not reset the account's daily message allowance", async () => {
  const f = fixture(), registered = await pending(f);
  await f.service.requestVerification("sms", registered.token, address);
  const verified = await f.service.verifyAccount(f.messages.at(-1).code, registered.token, address);
  const changed = await f.service.changePhone(replacement, password, { member: await f.sessionService.verify(verified.token) });
  assert.equal(changed.requiresVerification, true);
  assert.equal((await f.service.requestVerification("sms", changed.token, address)).status, "requested");
  assert.equal((await f.service.requestVerification("whatsapp", changed.token, address)).status, "requested");
  assert.equal((await f.restart().requestVerification("sms", changed.token, address)).status, "busy");
  assert.equal(f.messages.length, 3);
});

test("parallel requests cannot exceed the shared three-message allowance", async () => {
  const f = fixture(), registered = await pending(f);
  const account = await Promise.all(Array.from({ length: 5 }, (_, i) => f.service.requestVerification(i % 2 ? "sms" : "whatsapp", registered.token, `198.51.100.${i + 1}`)));
  assert.equal(account.filter(result => result.status === "requested").length, 3);
  assert.equal(account.filter(result => result.status === "busy").length, 2);
  const reset = await Promise.all(Array.from({ length: 5 }, (_, i) => f.service.requestPasswordReset(phone, `198.51.100.${i + 1}`, i % 2 ? "sms" : "whatsapp")));
  assert.equal(reset.filter(result => result.status === "requested").length, 3);
  assert.equal(reset.filter(result => result.status === "busy").length, 2);
  assert.equal(f.messages.length, 6);
});

test("delivery runs outside the transaction; delayed older sends cannot reactivate superseded codes", { timeout: 30_000 }, async () => {
  let f, release, entered;
  const firstSend = new Promise(resolve => { entered = resolve; }), held = new Promise(resolve => { release = resolve; });
  f = fixture({ async send() { await f.database.transaction(async () => {}); if (f.messages.length === 1) { entered(); await held; } } });
  const registered = await pending(f), first = f.service.requestVerification("sms", registered.token, address);
  await firstSend; const old = f.messages[0].code;
  const second = await f.service.requestVerification("whatsapp", registered.token, address);
  assert.equal(second.status, "requested");
  assert.equal((await f.service.verifyAccount(old, registered.token, address)).status, "unauthorized", "An unsent reserved code is unusable");
  release(); await first;
  assert.equal((await f.service.verifyAccount(old, registered.token, address)).status, "unauthorized");
  assert.equal((await f.service.verifyAccount(f.messages.at(-1).code, registered.token, address)).status, "authenticated");
});

test("failed delivery consumes allowance, invalidates older codes and exposes no provider details", async () => {
  let fail = false;
  const f = fixture({ async send() { if (fail) throw new Error("provider-secret-123 returned forbidden"); } }), registered = await pending(f);
  await f.service.requestVerification("sms", registered.token, address); const old = f.messages[0].code; fail = true;
  for (let i = 0; i < 2; i++) {
    const result = await f.service.requestVerification("whatsapp", registered.token, address);
    assert.equal(result.status, "unavailable"); assert.doesNotMatch(JSON.stringify(result), /provider-secret|forbidden|\d{6}/u);
  }
  assert.equal((await f.service.verifyAccount(old, registered.token, address)).status, "unauthorized");
  assert.equal((await f.service.verifyAccount(f.messages.at(-1).code, registered.token, address)).status, "unauthorized");
  assert.equal((await f.restart().requestVerification("sms", registered.token, address)).status, "busy");
  assert.equal(f.messages.length, 3);
});

test("a password reset code grants only a short reset session and is single-use under concurrency", async () => {
  const f = fixture(), original = await f.authenticate();
  await f.service.requestPasswordReset(phone, address, "sms"); const code = f.messages[0].code;
  const attempts = await Promise.all([f.service.verifyPasswordReset(phone, code, address), f.service.verifyPasswordReset(phone, code, "198.51.100.2")]);
  assert.deepEqual(attempts.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const authorized = attempts.find(result => result.status === "authenticated");
  assert.equal(authorized.requiresPasswordChange, true); assert.equal(await f.sessionService.verify(authorized.token), null);
  assert.deepEqual(await f.service.passwordResetSession(authorized.token), { phone });
  assert.equal(await f.service.verificationSession(authorized.token), null);
  assert.equal(+f.sessions.get(memberTokenHash(authorized.token)).expiresAt - f.now(), passwordRecoveryRules.resetSessionMs);
  assert.ok(await f.sessionService.verify(original.token), "A reset proof alone must not sign out the active device");
  const saved = await f.service.resetPassword("new recovery password", authorized.token, address);
  assert.equal(saved.status, "authenticated"); assert.ok(await f.sessionService.verify(saved.token));
  assert.equal(await f.sessionService.verify(original.token), null); assert.equal(await f.service.passwordResetSession(authorized.token), null);
  assert.equal((await f.service.login(phone, password, address)).status, "unauthorized");
  assert.equal((await f.service.login(phone, "new recovery password", address)).status, "authenticated");
  assert.ok(f.accounts.get(saved.accountId).passwordChangedAt);
});

test("requesting a newer reset code revokes earlier reset authorization and never accepts account codes", async () => {
  const f = fixture(), registered = await pending(f);
  await f.service.requestVerification("sms", registered.token, address); const accountCode = f.messages.at(-1).code;
  assert.equal((await f.service.verifyPasswordReset(phone, accountCode, address)).status, "unauthorized");
  await f.service.requestPasswordReset(phone, address, "sms"); const first = f.messages.at(-1).code;
  const session = await f.service.verifyPasswordReset(phone, first, address);
  assert.equal(session.requiresPasswordChange, true); f.advance(1);
  await f.service.requestPasswordReset(phone, address, "whatsapp");
  assert.equal(await f.service.passwordResetSession(session.token), null);
  assert.equal((await f.service.resetPassword("another password", session.token, address)).status, "unauthorized");
  assert.equal((await f.service.verifyPasswordReset(phone, first, address)).status, "unauthorized");
  const latest = await f.service.verifyPasswordReset(phone, f.messages.at(-1).code, address);
  assert.equal(latest.requiresPasswordChange, true);
  const saved = await f.service.resetPassword("another password", latest.token, address);
  assert.equal(saved.status, "authenticated"); assert.ok(f.accounts.get(saved.accountId).phoneVerifiedAt, "Recovery proves control of an unverified phone");
});

test("password changes are limited across profile and code recovery for exactly 24 hours", async () => {
  const f = fixture(), binding = await f.authenticate();
  const first = await f.service.changePassword("first new password", password, binding);
  let active = { member: await f.sessionService.verify(first.token), token: first.token };
  const second = await f.service.changePassword("second new password", "first new password", active);
  assert.equal(second.status, "busy"); assert.match(second.message, /admin/iu);
  await f.service.requestPasswordReset(phone, address, "sms");
  const reset = await f.service.verifyPasswordReset(phone, f.messages.at(-1).code, address);
  assert.equal((await f.service.resetPassword("second new password", reset.token, address)).status, "busy");
  const login = await f.service.login(phone, "first new password", address);
  assert.equal(login.status, "authenticated"); active = { member: await f.sessionService.verify(login.token), token: login.token };
  f.advance(DAY - 1);
  assert.equal((await f.service.changePassword("second new password", "first new password", active)).status, "busy");
  f.advance(1);
  assert.equal((await f.service.changePassword("second new password", "first new password", active)).status, "authenticated");
});

test("administrator assistance can recover a member within the daily password-change limit", async () => {
  const f = fixture(), binding = await f.authenticate();
  const first = await f.service.changePassword("first new password", password, binding);
  await f.service.requestPasswordReset(phone, address, "sms"); const code = f.messages.at(-1).code;
  const assisted = await createSubscribers(f.database, f.now, () => false).temporaryPassword({ id: first.accountId }, "owner");
  assert.equal(assisted.status, "reset");
  assert.equal((await f.service.verifyPasswordReset(phone, code, address)).status, "unauthorized");
  const temporary = await f.service.login(phone, assisted.temporaryPassword, address);
  assert.equal(temporary.requiresPasswordChange, true);
  const saved = await f.service.resetPassword("assisted password", temporary.token, address);
  assert.equal(saved.status, "authenticated"); assert.ok(await f.sessionService.verify(saved.token));
});

const authRequest = (action, body, token, headers = {}) => new Request(`https://goal.test/api/account/${action}`, { method: "POST",
  headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", ...(token ? { Cookie: `goal-hint-member=${token}` } : {}), ...headers },
  body: JSON.stringify(body) });
const responseToken = response => /^goal-hint-member=([^;]+)/u.exec(response.headers.getSetCookie()[0] ?? "")?.[1];

test("HTTP login reports when another device was signed out and rejects its stale cookie", async () => {
  const f = fixture(); await f.account();
  const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService });
  const login = token => createMemberAuthHandler("login", source)(authRequest("login", { phone, password }, token));
  const first = await login();
  assert.equal(first.status, 200); const firstBody = await first.json();
  assert.equal(firstBody.next, "/en"); assert.equal(firstBody.otherDeviceSignedOut, false);
  const firstToken = responseToken(first), sameBrowser = await login(firstToken);
  assert.equal((await sameBrowser.json()).otherDeviceSignedOut, false);
  const replacement = await login();
  assert.equal((await replacement.json()).otherDeviceSignedOut, true);
  assert.equal(await f.sessionService.verify(responseToken(sameBrowser)), null);
  assert.ok(await f.sessionService.verify(responseToken(replacement)));
});

test("successful login goes home while administrator and restricted sessions keep their required destinations", async () => {
  const token = "l".repeat(43);
  const destinations = [{}, { return: "/en/matches/example/home-away" }, { destination: "subscribe" },
    { return: "/en/slips", destination: "subscribe" }, { return: "https://evil.test", destination: "subscribe" },
    { return: "//evil.test", destination: "https://evil.test" }];
  const outcomes = [
    { flags: {}, next: "/en" },
    { flags: { requiresVerification: true }, next: "/en/account?view=verify&return=%2Fen" },
    { flags: { requiresPasswordChange: true }, next: "/en/account?view=new-password&return=%2Fen" },
    { flags: { administrator: true }, next: "/admin/payments" },
    { flags: { administrator: true, requiresVerification: true }, next: "/en/account?view=verify&return=%2Fen" },
    { flags: { administrator: true, requiresPasswordChange: true }, next: "/en/account?view=new-password&return=%2Fen" },
  ];
  for (const destination of destinations) for (const { flags, next } of outcomes) {
    const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, sessions: { async verify() { return null; } },
      auth: { async login() { return { status: "authenticated", token, phone, ...flags }; } } });
    const response = await createMemberAuthHandler("login", source)(authRequest("login", { phone, password, ...destination }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.next, next, JSON.stringify({ destination, flags }));
    assert.equal(result.requiresVerification, flags.requiresVerification);
    assert.equal(result.requiresPasswordChange, flags.requiresPasswordChange);
    assert.equal(responseToken(response), token);
    assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
    assert.ok(response.headers.getSetCookie().some(value => value.startsWith("goal-hint-analytics=;") && value.includes("Max-Age=0")), "Every successful account sign-in clears the legacy owner identity.");
    assert.equal(response.headers.getSetCookie().some(value => value.startsWith("goal-hint-analytics-exclude=1;")), !!flags.administrator && !flags.requiresPasswordChange && !flags.requiresVerification);
    if (flags.requiresPasswordChange) assert.match(response.headers.getSetCookie()[0], /Max-Age=900/u);
  }
});

test("failed login never returns a completion destination or session cookie", async () => {
  for (const [status, expectedStatus] of [["unauthorized", 401], ["invalid", 400], ["busy", 429], ["unavailable", 503]]) {
    const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, sessions: { async verify() { return null; } },
      auth: { async login() { return { status, message: "Synthetic sign-in refusal." }; } } });
    const response = await createMemberAuthHandler("login", source)(authRequest("login", { phone, password, return: "/en/matches/example/home-away", destination: "subscribe" }));
    assert.equal(response.status, expectedStatus);
    assert.equal((await response.json()).next, undefined);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("HTTP registration, channel selection, verification and reset codes set restricted HttpOnly cookies", async () => {
  const f = fixture(), source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService });
  const handle = (action, body, token) => createMemberAuthHandler(action, source)(authRequest(action, body, token));
  const registration = await handle("register", { phone, password, return: "/en/matches/example/home-away" });
  assert.equal(registration.status, 200);
  const registrationBody = await registration.json(), verifyPage = new URL(registrationBody.next, "https://goal.test");
  assert.equal(registrationBody.requiresVerification, true); assert.equal(verifyPage.pathname, "/en/account");
  assert.equal(verifyPage.searchParams.get("view"), "verify"); assert.equal(verifyPage.searchParams.get("return"), "/en");
  const pendingToken = responseToken(registration); assert.ok(pendingToken); assert.equal(await f.sessionService.verify(pendingToken), null);
  assert.match(registration.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
  const request = await handle("verification", { channel: "whatsapp" }, pendingToken);
  assert.equal(request.status, 200); assert.equal(request.headers.get("set-cookie"), null);
  assert.ok(!JSON.stringify(await request.json()).includes(f.messages[0].code));
  const verification = await handle("verify", { code: f.messages[0].code, return: verifyPage.searchParams.get("return") }, pendingToken);
  assert.equal(verification.status, 200); assert.equal((await verification.json()).next, "/en");
  assert.ok(await f.sessionService.verify(responseToken(verification)));
  const forgot = await handle("forgot", { phone, channel: "sms" });
  assert.equal(forgot.status, 200); assert.equal(forgot.headers.get("set-cookie"), null);
  const reset = await handle("reset-code", { phone, code: f.messages.at(-1).code });
  assert.equal(reset.status, 200); assert.equal((await reset.json()).requiresPasswordChange, true);
  const resetToken = responseToken(reset); assert.equal(await f.sessionService.verify(resetToken), null);
  assert.match(reset.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Max-Age=900/u);
  const completed = await handle("reset", { password: "replacement HTTP password" }, resetToken);
  assert.equal(completed.status, 200); assert.equal((await completed.json()).next, "/en");
  const completedToken = responseToken(completed);
  assert.ok(completedToken); assert.notEqual(completedToken, resetToken);
  assert.equal((await f.sessionService.verify(completedToken)).phone, phone);
  assert.equal(await f.service.passwordResetSession(resetToken), null);
  assert.match(completed.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
});

test("signup completion goes home while keeping pending accounts restricted", async () => {
  const token = "s".repeat(43);
  for (const returnTo of [undefined, "/en/matches/example/home-away", "https://evil.test", "/en?phone=256700000001"]) {
    for (const requiresVerification of [false, true]) {
      const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, sessions: { async verify() { return null; } },
        auth: { async register() { return { status: "authenticated", token, phone, ...(requiresVerification ? { requiresVerification: true } : {}) }; } } });
      const response = await createMemberAuthHandler("register", source)(authRequest("register", { phone, password, ...(returnTo ? { return: returnTo } : {}) }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.next, requiresVerification ? "/en/account?view=verify&return=%2Fen" : "/en");
      assert.equal(result.requiresVerification, requiresVerification ? true : undefined);
      assert.equal(responseToken(response), token);
      assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
    }
  }
});

test("successful verification goes home regardless of the supplied return destination", async () => {
  const token = "v".repeat(43);
  const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, sessions: { async verify() { return null; } },
    auth: { async verifyAccount() { return { status: "authenticated", token, phone }; } } });
  for (const returnTo of [undefined, "/en", "/en/matches", "/en/slips", "/en/matches/example/home-away", "/en/account",
    "https://evil.test", "//evil.test", "/en?phone=256700000001", "/en/matches/example/%2f", "/en/../admin"]) {
    const response = await createMemberAuthHandler("verify", source)(authRequest("verify", { code: "123456", ...(returnTo ? { return: returnTo } : {}) }, token));
    assert.equal(response.status, 200); assert.equal((await response.json()).next, "/en");
    assert.equal(responseToken(response), token);
    assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
  }
});

test("successful password reset goes home regardless of the supplied return destination", async () => {
  const token = "r".repeat(43);
  const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, sessions: { async verify() { return null; } },
    auth: { async resetPassword() { return { status: "authenticated", token, phone }; } } });
  for (const returnTo of [undefined, "/en", "/en/matches", "/en/slips", "/en/matches/example/home-away", "/en/account",
    "https://evil.test", "//evil.test", "/en?phone=256700000001", "/en/matches/example/%2f", "/en/../admin"]) {
    const response = await createMemberAuthHandler("reset", source)(authRequest("reset", { password: "new HTTP password", ...(returnTo ? { return: returnTo } : {}) }, token));
    assert.equal(response.status, 200); assert.equal((await response.json()).next, "/en");
    assert.equal(responseToken(response), token);
    assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
  }
});

test("all verification writes reject cross-site requests before storage and whitelist request fields", async () => {
  for (const [action, body] of [["verification", { channel: "sms" }], ["verify", { code: "123456" }], ["forgot", { phone, channel: "sms" }], ["reset-code", { phone, code: "123456" }]]) {
    const response = await createMemberAuthHandler(action, async () => { assert.fail("Cross-site writes cannot reach storage"); })(
      authRequest(action, body, undefined, { Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" }));
    assert.equal(response.status, 403); assert.equal(response.headers.get("set-cookie"), null);
    const extra = await createMemberAuthHandler(action, async () => { assert.fail("Unexpected fields cannot reach storage"); })(authRequest(action, { ...body, accountId: "other-account" }));
    assert.equal(extra.status, 400);
  }
  const f = fixture(), source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService });
  assert.equal((await createMemberAuthHandler("forgot", source)(authRequest("forgot", { phone }))).status, 400);
  assert.equal((await createMemberAuthHandler("verification", source)(authRequest("verification", { channel: "sms" }))).status, 401);
});

test("HTTP delivery failure returns a generic 503 without provider errors or a credential", async () => {
  const f = fixture({ async send() { throw new Error("private-yoola-token: provider rejected request"); } }), registered = await pending(f);
  const response = await createMemberAuthHandler("verification", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(
    authRequest("verification", { channel: "sms" }, registered.token));
  assert.equal(response.status, 503); assert.equal(response.headers.get("set-cookie"), null);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private-yoola-token|provider rejected|\d{6}/u);
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


test("registration allocates a configured trial atomically and verification unlocks without approval", async () => {
  const f = fixture({ trialDays: 5 }), registered = await f.service.register(phone, password, browser(), address);
  assert.equal(registered.requiresVerification, true);
  assert.deepEqual(registered.trial, { days: 5, startsAt: new Date(f.now()).toISOString(), endsAt: new Date(f.now() + 5 * DAY).toISOString(), active: false });
  assert.equal(f.accessCodes.size, 1);
  const period = [...f.accessCodes.values()][0];
  assert.equal(period.source, "trial"); assert.equal(period.planName, "Free trial"); assert.equal(period.priceUgx, 0); assert.equal(period.amountReceivedUgx, 0);
  assert.equal(+period.activatedAt, f.now()); assert.equal(+period.startsAt, f.now());
  assert.equal([...f.sessions.values()][0].codeEnteredAt, null); assert.equal(await f.sessionService.verify(registered.token), null);
  assert.equal(f.messages.length, 0, "Allocating access sends no verification message");
  f.settings.trialDays = 1;
  await f.service.requestVerification("sms", registered.token, address);
  const verified = await f.service.verifyAccount(f.messages.at(-1).code, registered.token, address);
  assert.equal(verified.trial.days, 5, "The original offer is a snapshot"); assert.equal(verified.trial.active, true);
  const member = await f.sessionService.verify(verified.token);
  assert.equal(member.accessCodeId, period.id); assert.ok(member.codeEnteredAt); assert.equal(f.accessCodes.size, 1);
  assert.ok(!f.sent.some(row => ["trial_requested", "trial_sent", "trial_dismissed"].includes(row.action)));
});

test("disabled or expired registration trials do not unlock verified sessions", async () => {
  const disabled = fixture({ trialDays: 0 }), registered = await disabled.service.register(phone, password, browser(), address);
  assert.equal(registered.trial, undefined); assert.equal(disabled.accessCodes.size, 0);
  await disabled.service.requestVerification("sms", registered.token, address);
  const verified = await disabled.service.verifyAccount(disabled.messages.at(-1).code, registered.token, address);
  assert.equal(verified.trial, undefined); assert.equal((await disabled.sessionService.verify(verified.token)).codeEnteredAt, null);
  const expired = fixture({ trialDays: 1 }), pending = await expired.service.register(phone, password, browser(), address);
  expired.advance(DAY);
  await expired.service.requestVerification("sms", pending.token, address);
  const afterExpiry = await expired.service.verifyAccount(expired.messages.at(-1).code, pending.token, address);
  assert.equal(afterExpiry.trial, undefined); assert.equal((await expired.sessionService.verify(afterExpiry.token)).codeEnteredAt, null);
  assert.equal(expired.accessCodes.size, 1, "Verification cannot restart a trial");
});

test("concurrent registration and repeated allocation cannot duplicate or extend a trial", async () => {
  const f = fixture({ trialDays: 3 });
  const results = await Promise.all([f.service.register(phone, password, browser(), address), f.service.register(phone, password, browser(), address)]);
  assert.deepEqual(results.map(result => result.status).sort(), ["authenticated", "conflict"]);
  const original = [...f.accessCodes.values()][0];
  f.advance(4 * DAY); f.settings.trialDays = 7;
  const again = await f.database.transaction(tx => grantRegistrationTrial(tx, original.accountId, new Date(f.now())));
  assert.equal(again.id, original.id); assert.equal(+again.endsAt, +original.endsAt); assert.equal(f.accessCodes.size, 1);
  assert.equal((await f.service.login(phone, password, address)).requiresVerification, true); assert.equal(f.accessCodes.size, 1);
});

test("failed registration rolls back its account, trial, session and audit", async () => {
  const f = fixture();
  f.tx.memberSession.create = async () => { throw new Error("Synthetic session failure"); };
  await assert.rejects(f.service.register(phone, password, browser(), address), /Synthetic session failure/);
  assert.equal(f.accounts.size, 0); assert.equal(f.accessCodes.size, 0); assert.equal(f.sessions.size, 0); assert.equal(f.sent.length, 0);
});

test("a rolled-back trial reference collision retries registration without duplicating its account or period", async () => {
  const f = fixture(), create = f.tx.accessCode.create.bind(f.tx.accessCode);
  let attempts = 0;
  f.tx.accessCode.create = async query => {
    if (++attempts === 1) throw new DatabaseOperationError("constraint");
    return create(query);
  };
  const result = await f.service.register(phone, password, browser(), address);
  assert.equal(result.status, "authenticated"); assert.equal(attempts, 2);
  assert.equal(f.accounts.size, 1); assert.equal(f.accessCodes.size, 1); assert.equal(f.sessions.size, 1);
  assert.equal([...f.accessCodes.values()][0].accountId, result.accountId);
});

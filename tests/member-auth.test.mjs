import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/server/analytics/analytics-password.ts";
import { createMemberAuth, memberAuthRules } from "../src/server/members/member-auth.ts";
import { createMemberAuthHandler, createMemberSessionHandler } from "../src/server/members/member-auth-http.ts";
import { createMemberSessions, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createMemberSmsSender, SmsUnavailableError } from "../src/server/members/member-sms.ts";
import { createMemberWhatsAppSender, WhatsAppUnavailableError } from "../src/server/members/member-whatsapp.ts";
import { createMemberVerificationSender } from "../src/server/members/member-verification-delivery.ts";
import { isMemberAdminPhone, memberAdminPhones, parseMemberAdminPhones } from "../src/server/members/member-admin.ts";

const phone = "256700000001", replacement = "256700000002", password = "correct horse 47";
const key = (purpose, value) => createHmac("sha256", "synthetic-test-secret").update(`${purpose}\0${value}`).digest("hex");
const browser = () => ({ member: null, anonymousToken: randomBytes(32).toString("base64url") });

/** Small transactional store: assertions exercise the production auth service, not a second implementation of it. */
function fixture({ admins = [] } = {}) {
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
      async findUniqueOrThrow(query) { const row = await this.findUnique(query); assert.ok(row); return row; },
      async findMany({ where, orderBy } = {}) { const values = [...rows.values()].filter((row) => matches(row, where)); if (orderBy?.createdAt) values.sort((a, b) => +a.createdAt - +b.createdAt); return values.map((row) => ({ ...row })); },
      async findFirst(query) { const values = await this.findMany(query); return query.orderBy?.createdAt === "desc" ? values.at(-1) ?? null : values[0] ?? null; },
      async create({ data }) { const row = { ...defaults, ...data }; assert.ok(!rows.has(row[id])); rows.set(row[id], row); return { ...row }; },
      async update({ where, data }) { const row = [...rows.values()].find((row) => matches(row, where)); assert.ok(row); Object.assign(row, data); return { ...row }; },
      async updateMany({ where, data }) { let count = 0; for (const row of rows.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
      async deleteMany({ where }) { let count = 0; for (const [identifier, row] of rows) if (matches(row, where)) { rows.delete(identifier); count++; } return { count }; },
    };
  }
  const tx = { memberAccount: table(accounts, "id", { passwordHash: null, blockedAt: null, erasedAt: null }),
    memberSession: table(sessions, "tokenHash", { codeEnteredAt: null, accessCodeId: null, authenticatedAt: null }),
    memberVerification: table(challenges, "id", { sentAt: null, confirmedAt: null, consumedAt: null, proofHash: null, attempts: 0 }),
    paymentSubmission: { async findMany() { return []; } },
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
  const service = createMemberAuth({ database, config: { key }, now: () => time, adminPhone, sendVerification: async (message) => { sent.push(message); } });
  const sessionService = createMemberSessions({ database, config: { key }, now: () => time, adminPhone });
  async function account(fields = {}) {
    return tx.memberAccount.create({ data: { id: randomUUID(), phone, passwordHash: await hashPassword(password), createdAt: new Date(time), lastSignInAt: new Date(time), ...fields } });
  }
  async function authenticate() {
    await account();
    const logged = await service.login(phone, password, "198.51.100.1"); assert.equal(logged.status, "authenticated");
    const member = await sessionService.verify(logged.token); assert.ok(member);
    return { member, token: logged.token };
  }
  async function verify(purpose, binding, input = phone) {
    const challenge = await service.requestCode(purpose, input, binding, "198.51.100.1"); assert.equal(challenge.status, "sent");
    const proof = await service.confirmCode(challenge.challengeId, sent.at(-1).code, binding, "198.51.100.1"); assert.equal(proof.status, "verified");
    return { challenge, proof };
  }
  return { service, database, tx, accounts, sessions, challenges, buckets, sent, sessionService, account, authenticate, verify, adminPhones,
    now: () => time, advance: (ms) => { time += ms; } };
}

test("registration requires same-browser verification proof, stores no plain code/password, and issues a password-authenticated session", async () => {
  const f = fixture(), binding = browser();
  assert.equal((await f.service.register(phone, password, undefined, binding)).status, "invalid");
  const { proof, challenge } = await f.verify("register", binding);
  const stored = f.challenges.get(challenge.challengeId);
  assert.notEqual(stored.codeHash, f.sent[0].code); assert.match(stored.codeHash, /^[a-f0-9]{64}$/u);
  assert.equal((await f.service.register(phone, password, proof.verificationToken, browser())).status, "invalid");
  const result = await f.service.register(phone, password, proof.verificationToken, binding);
  assert.equal(result.status, "authenticated");
  const member = await f.sessionService.verify(result.token); assert.equal(member.phone, phone);
  const account = f.accounts.get(member.accountId); assert.notEqual(account.passwordHash, password); assert.ok(await verifyPassword(password, account.passwordHash));
  assert.equal((await f.service.register(phone, password, proof.verificationToken, binding)).status, "invalid");
  assert.ok(stored.consumedAt); assert.ok(!Object.values(stored).includes(f.sent[0].code));
});

test("password changes verify the registered number, allow the same password, rotate the current session and revoke other devices", async () => {
  const f = fixture(), binding = await f.authenticate();
  const second = await f.service.login(phone, password, "198.51.100.2");
  const old = f.sessions.get(memberTokenHash(binding.token)); old.codeEnteredAt = new Date(f.now()); old.accessCodeId = randomUUID();
  const original = f.accounts.get(binding.member.accountId).passwordHash;
  const { proof } = await f.verify("password", binding, replacement);
  assert.equal(f.sent[0].phone, phone, "A supplied different number never redirects the verification message");
  const result = await f.service.changePassword(password, proof.verificationToken, binding);
  assert.equal(result.status, "authenticated"); assert.notEqual(result.token, binding.token);
  assert.equal(await f.sessionService.verify(binding.token), null); assert.equal(await f.sessionService.verify(second.token), null);
  const account = f.accounts.get(binding.member.accountId); assert.notEqual(account.passwordHash, original); assert.ok(await verifyPassword(password, account.passwordHash));
  assert.equal((await f.sessionService.verify(result.token)).accessCodeId, old.accessCodeId);
  assert.equal((await f.service.changePassword("other password", proof.verificationToken, binding)).status, "unauthorized");
});

test("phone changes preserve account identity, reject phone conflicts, and require a phone-purpose proof", async () => {
  const f = fixture(), binding = await f.authenticate();
  const { proof } = await f.verify("phone", binding);
  assert.equal((await f.service.changePassword(password, proof.verificationToken, binding)).status, "invalid");
  const duplicate = await f.account({ phone: replacement });
  assert.equal((await f.service.changePhone(replacement, proof.verificationToken, binding)).status, "conflict");
  f.accounts.delete(duplicate.id);
  const result = await f.service.changePhone(replacement, proof.verificationToken, binding); assert.equal(result.status, "authenticated");
  assert.equal((await f.sessionService.verify(result.token)).accountId, binding.member.accountId);
  assert.equal(f.accounts.get(binding.member.accountId).phone, replacement);
  assert.equal((await f.service.login(phone, password, "198.51.100.1")).status, "unauthorized");
  assert.equal((await f.service.login(replacement, password, "198.51.100.1")).status, "authenticated");
});

test("both code and confirmed proof expire at exactly five minutes, without extending the proof after confirmation", async () => {
  for (const confirmFirst of [false, true]) {
    const f = fixture(), binding = browser(); await f.account();
    const challenge = await f.service.requestCode("reset", phone, binding, "198.51.100.1");
    assert.equal(+challenge.expiresAt - f.now(), memberAuthRules.codeMs);
    f.advance(memberAuthRules.codeMs - 1);
    const result = await f.service.confirmCode(challenge.challengeId, f.sent[0].code, binding, "198.51.100.1");
    assert.equal(result.status, "verified"); assert.equal(+result.expiresAt, +challenge.expiresAt);
    if (!confirmFirst) {
      const f2 = fixture(), b2 = browser(); await f2.account(); const c2 = await f2.service.requestCode("reset", phone, b2, "198.51.100.1");
      f2.advance(memberAuthRules.codeMs); assert.equal((await f2.service.confirmCode(c2.challengeId, f2.sent[0].code, b2, "198.51.100.1")).status, "invalid");
    }
    f.advance(1);
    assert.equal((await f.service.changePassword(password, result.verificationToken, binding, phone)).status, "invalid");
  }
});

test("waiting for a database lock cannot carry confirmation or phone-change authorization past expiry", async () => {
  for (const action of ["confirm", "phone"]) {
    const f = fixture(), binding = action === "phone" ? await f.authenticate() : browser();
    const challenge = await f.service.requestCode(action === "phone" ? "phone" : "register", phone, binding, "198.51.100.1");
    assert.equal(challenge.status, "sent");
    const proof = action === "phone" ? await f.service.confirmCode(challenge.challengeId, f.sent[0].code, binding, "198.51.100.1") : null;
    let release;
    const blocker = f.database.transaction(async () => new Promise((resolve) => { release = resolve; }));
    await new Promise((resolve) => setImmediate(resolve));
    const pending = action === "phone" ? f.service.changePhone(replacement, proof.verificationToken, binding)
      : f.service.confirmCode(challenge.challengeId, f.sent[0].code, binding, "198.51.100.1");
    f.advance(memberAuthRules.codeMs); release(); await blocker;
    assert.equal((await pending).status, "invalid");
    if (action === "phone") assert.equal(f.accounts.get(binding.member.accountId).phone, phone);
  }
});

test("five wrong guesses exhaust a code; successful confirmation is one use and resend invalidates earlier codes", async () => {
  const f = fixture(), binding = browser();
  const first = await f.service.requestCode("register", phone, binding, "198.51.100.1");
  const wrong = f.sent[0].code === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await f.service.confirmCode(first.challengeId, wrong, binding, "198.51.100.1")).status, "invalid");
  assert.equal((await f.service.confirmCode(first.challengeId, f.sent[0].code, binding, "198.51.100.1")).status, "invalid");
  assert.equal((await f.service.requestCode("register", phone, binding, "198.51.100.1")).status, "busy");
  f.advance(60_000);
  const second = await f.service.requestCode("register", phone, binding, "198.51.100.1");
  const secondCode = f.sent[1].code;
  f.advance(60_000);
  const third = await f.service.requestCode("register", phone, binding, "198.51.100.1");
  assert.equal((await f.service.confirmCode(second.challengeId, secondCode, binding, "198.51.100.1")).status, "invalid");
  assert.equal((await f.service.confirmCode(third.challengeId, f.sent[2].code, binding, "198.51.100.1")).status, "verified");
  assert.equal((await f.service.confirmCode(third.challengeId, f.sent[2].code, binding, "198.51.100.1")).status, "invalid");
});

test("verification recovery establishes the first password on legacy accounts; number-only sessions cannot authenticate", async () => {
  const f = fixture(), binding = browser(), account = await f.account({ passwordHash: null });
  const token = randomBytes(32).toString("base64url");
  await f.tx.memberSession.create({ data: { tokenHash: memberTokenHash(token), accountId: account.id, expiresAt: new Date(f.now() + 86_400_000) } });
  assert.equal(await f.sessionService.verify(token), null);
  assert.equal((await f.service.login(phone, password, "198.51.100.1")).status, "unauthorized");
  const { proof } = await f.verify("reset", binding);
  const result = await f.service.changePassword(password, proof.verificationToken, binding, phone);
  assert.equal(result.status, "authenticated"); assert.equal((await f.sessionService.verify(result.token)).accountId, account.id);
  assert.equal(f.accounts.size, 1);
});

test("concurrent consumption of one proof permits exactly one registration", async () => {
  const f = fixture(), binding = browser(), { proof } = await f.verify("register", binding);
  const results = await Promise.all([f.service.register(phone, password, proof.verificationToken, binding), f.service.register(phone, password, proof.verificationToken, binding)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ["authenticated", "invalid"]); assert.equal(f.accounts.size, 1);
});

test("admin phone configuration is private, canonical, bounded and fails closed", () => {
  assert.deepEqual(memberAdminPhones({}), []); assert.deepEqual(parseMemberAdminPhones(""), []);
  assert.deepEqual(memberAdminPhones({ GOAL_HINT_ADMIN_PHONES: JSON.stringify([phone, replacement, phone]) }), [phone, replacement]);
  assert.equal(isMemberAdminPhone(phone, { GOAL_HINT_ADMIN_PHONES: JSON.stringify([phone]) }), true);
  assert.equal(isMemberAdminPhone(replacement, { GOAL_HINT_ADMIN_PHONES: JSON.stringify([phone]) }), false);
  for (const setting of ["[", "{}", '"256700000001"', `[${phone}]`, JSON.stringify([`+${phone}`]), JSON.stringify([phone, "invalid"]),
    JSON.stringify(Array(101).fill(phone)), " ".repeat(4097) + JSON.stringify([phone])]) {
    assert.equal(parseMemberAdminPhones(setting), null); assert.equal(isMemberAdminPhone(phone, { GOAL_HINT_ADMIN_PHONES: setting }), false);
  }
});

test("configured admin numbers require a bound login-purpose code, without creating or requiring a password hash", async () => {
  for (const channel of ["whatsapp", "sms"]) {
    const f = fixture({ admins: [phone] }), binding = browser();
    assert.equal((await f.service.loginWithCode(phone, undefined, binding, "198.51.100.1")).status, "invalid");
    assert.equal((await f.service.login(phone, undefined, "198.51.100.1")).status, "unauthorized");
    const challenge = await f.service.requestCode("login", phone, binding, "198.51.100.1", channel); assert.equal(challenge.status, "sent");
    assert.equal(challenge.channel, channel); assert.equal(f.sent[0].purpose, "login");
    const proof = await f.service.confirmCode(challenge.challengeId, f.sent[0].code, binding, "198.51.100.1"); assert.equal(proof.status, "verified");
    assert.equal((await f.service.register(phone, password, proof.verificationToken, binding)).status, "invalid");
    assert.equal((await f.service.loginWithCode(phone, proof.verificationToken, browser(), "198.51.100.1")).status, "invalid");
    const result = await f.service.loginWithCode(phone, proof.verificationToken, binding, "198.51.100.1"); assert.equal(result.status, "authenticated");
    const member = await f.sessionService.verify(result.token); assert.equal(member.phone, phone);
    assert.equal(f.accounts.get(member.accountId).passwordHash, null, "No fake password is stored to pass a session guard");
    assert.equal((await f.service.loginWithCode(phone, proof.verificationToken, binding, "198.51.100.1")).status, "invalid");
    f.adminPhones.delete(phone);
    assert.equal(await f.sessionService.verify(result.token), null, "Removing an admin number also rejects its passwordless session");
    assert.equal((await f.service.requestCode("login", phone, binding, "198.51.100.1")).status, "unauthorized");
  }
});

test("admin code login preserves an existing account and rejects expired, revoked, blocked and non-admin proofs", async () => {
  const f = fixture({ admins: [phone] }), binding = browser(), account = await f.account();
  const originalHash = account.passwordHash, { proof } = await f.verify("login", binding);
  const passwordLogin = await f.service.login(phone, password, "198.51.100.1");
  assert.equal(passwordLogin.status, "unauthorized"); assert.match(passwordLogin.message, /verification-code login/u);
  f.adminPhones.delete(phone);
  assert.equal((await f.service.loginWithCode(phone, proof.verificationToken, binding, "198.51.100.1")).status, "unauthorized");
  f.adminPhones.add(phone);
  const result = await f.service.loginWithCode(phone, proof.verificationToken, binding, "198.51.100.1"); assert.equal(result.status, "authenticated");
  const member = await f.sessionService.verify(result.token); assert.equal(member.accountId, account.id);
  assert.equal(f.accounts.size, 1); assert.equal(f.accounts.get(account.id).passwordHash, originalHash);
  f.adminPhones.delete(phone);
  assert.equal((await f.sessionService.verify(result.token)).accountId, account.id, "An existing real password still permits ordinary member authentication");
  assert.equal((await f.service.requestCode("login", replacement, browser(), "198.51.100.1")).status, "unauthorized");
  for (const options of [{ expired: true }, { blockedAt: new Date(f.now()) }, { erasedAt: new Date(f.now()) }]) {
    const blocked = fixture({ admins: [phone] }), browserBinding = browser();
    await blocked.account(options);
    if (!options.expired) assert.equal((await blocked.service.requestCode("login", phone, browserBinding, "198.51.100.1")).status, "unauthorized");
    else {
      const { proof } = await blocked.verify("login", browserBinding); blocked.advance(memberAuthRules.codeMs);
      assert.equal((await blocked.service.loginWithCode(phone, proof.verificationToken, browserBinding, "198.51.100.1")).status, "invalid");
    }
  }
});

test("a legacy number-only cookie stays unauthenticated even if its number is configured as admin", async () => {
  const f = fixture({ admins: [phone] }), account = await f.account({ passwordHash: null }), token = randomBytes(32).toString("base64url");
  await f.tx.memberSession.create({ data: { tokenHash: memberTokenHash(token), accountId: account.id, expiresAt: new Date(f.now() + 86_400_000) } });
  assert.equal(await f.sessionService.verify(token), null);
});

test("old-phone verification cannot turn an ordinary account into a configured administrator", async () => {
  const f = fixture({ admins: [replacement] }), binding = await f.authenticate(), { proof } = await f.verify("phone", binding);
  assert.equal((await f.service.changePhone(replacement, proof.verificationToken, binding)).status, "invalid");
  assert.equal(f.accounts.get(binding.member.accountId).phone, phone);
  assert.equal((await f.sessionService.verify(binding.token)).phone, phone);
  assert.equal(f.accounts.size, 1);
});

test("a verification transport failure invalidates its unsent challenge and never returns sent", async () => {
  const f = fixture(), binding = browser();
  const failing = createMemberAuth({ database: f.database, config: { key }, now: f.now, sendVerification: async () => { throw new Error("Synthetic provider failure"); } });
  const result = await failing.requestCode("register", phone, binding, "198.51.100.1");
  assert.equal(result.status, "unavailable");
  const [stored] = f.challenges.values(); assert.equal(stored.sentAt, null); assert.ok(stored.consumedAt);
  assert.equal((await failing.confirmCode(stored.id, "123456", binding, "198.51.100.1")).status, "invalid");
});

test("WhatsApp is the default; both channels target the registered phone and share resend and hourly limits", async () => {
  for (const purpose of ["phone", "password"]) {
    const f = fixture(), binding = await f.authenticate();
    const first = await f.service.requestCode(purpose, replacement, binding, "198.51.100.1");
    assert.equal(first.status, "sent"); assert.equal(first.channel, "whatsapp");
    assert.equal(f.sent[0].channel, "whatsapp"); assert.equal(f.sent[0].phone, phone);
    assert.equal((await f.service.requestCode(purpose, replacement, binding, "198.51.100.1", "sms")).status, "busy");
    f.advance(60_000);
    const second = await f.service.requestCode(purpose, replacement, binding, "198.51.100.1", "sms");
    assert.equal(second.status, "sent"); assert.equal(second.channel, "sms");
    assert.equal(f.sent[1].phone, phone); assert.equal(f.sent[1].channel, "sms");
    assert.equal((await f.service.confirmCode(first.challengeId, f.sent[0].code, binding, "198.51.100.1")).status, "invalid");
    assert.equal(+second.expiresAt - f.now(), memberAuthRules.codeMs);
  }
  const f = fixture(), binding = browser();
  for (let i = 0; i < 5; i++) {
    const result = await f.service.requestCode("register", phone, binding, "198.51.100.1", i % 2 ? "sms" : "whatsapp");
    assert.equal(result.status, "sent"); f.advance(60_000);
  }
  for (const channel of ["sms", "whatsapp"]) assert.equal((await f.service.requestCode("register", phone, browser(), "198.51.100.2", channel)).status, "busy");
  assert.equal(f.sent.length, 5, "Changing channel, browser and address never creates another per-phone allowance");
});

test("switching channels invalidates confirmed proofs and never extends or bypasses verification", async () => {
  for (const initial of ["whatsapp", "sms"]) {
    const f = fixture(), binding = await f.authenticate(), next = initial === "sms" ? "whatsapp" : "sms";
    const challenge = await f.service.requestCode("password", phone, binding, "198.51.100.1", initial);
    const proof = await f.service.confirmCode(challenge.challengeId, f.sent[0].code, binding, "198.51.100.1");
    assert.equal(proof.status, "verified");
    f.advance(60_000);
    const replacement = await f.service.requestCode("password", phone, binding, "198.51.100.1", next);
    assert.equal(replacement.status, "sent");
    assert.equal((await f.service.changePassword(password, proof.verificationToken, binding)).status, "invalid");
    f.advance(memberAuthRules.codeMs);
    assert.equal((await f.service.confirmCode(replacement.challengeId, f.sent[1].code, binding, "198.51.100.1")).status, "invalid");
  }
  const f = fixture(), binding = browser();
  for (const value of [null, "email", "SMS", false, {}, []]) {
    assert.equal((await f.service.requestCode("register", phone, binding, "198.51.100.1", value)).status, "invalid");
  }
  assert.equal(f.sent.length, 0); assert.equal(f.challenges.size, 0); assert.equal(f.buckets.size, 0);
});

const whatsappEnvironment = Object.freeze({ GOAL_HINT_WHATSAPP_ACCESS_TOKEN: "synthetic-whatsapp-access-token",
  GOAL_HINT_WHATSAPP_PHONE_NUMBER_ID: "123456789012345", GOAL_HINT_WHATSAPP_TEMPLATE_NAME: "goal_hint_verification",
  GOAL_HINT_WHATSAPP_TEMPLATE_LANGUAGE: "en_US" });
const whatsappAccepted = () => Response.json({ messaging_product: "whatsapp", contacts: [{ input: phone, wa_id: phone }],
  messages: [{ id: "wamid.synthetic-verification-id" }] });

test("WhatsApp uses the official authentication template body and copy-code button with private bearer authentication", async () => {
  let observed;
  const sender = createMemberWhatsAppSender(whatsappEnvironment, async (target, options) => { observed = { target, options }; return whatsappAccepted(); });
  await sender({ phone, code: "012345", purpose: "password" });
  assert.equal(observed.target, "https://graph.facebook.com/v25.0/123456789012345/messages");
  assert.equal(observed.options.method, "POST"); assert.equal(observed.options.redirect, "error"); assert.equal(observed.options.cache, "no-store");
  assert.equal(observed.options.headers.Authorization, "Bearer synthetic-whatsapp-access-token");
  assert.equal(observed.options.headers["Content-Type"], "application/json"); assert.ok(observed.options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(observed.options.body), { messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "template",
    template: { name: "goal_hint_verification", language: { code: "en_US" }, components: [
      { type: "body", parameters: [{ type: "text", text: "012345" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "012345" }] },
    ] } });
  await createMemberWhatsAppSender({ ...whatsappEnvironment, GOAL_HINT_WHATSAPP_API_VERSION: "v26.0" }, async (target) => {
    assert.equal(target, "https://graph.facebook.com/v26.0/123456789012345/messages");
    return Response.json({ messaging_product: "whatsapp", messages: [{ id: "wamid.synthetic", message_status: "accepted" }] });
  })({ phone, code: "012345", purpose: "register" });
});

test("WhatsApp fails closed on missing/unsafe configuration, invalid messages, provider errors, oversized or malformed acknowledgements", async () => {
  let calls = 0;
  for (const environment of [{}, ...Object.keys(whatsappEnvironment).map((name) => ({ ...whatsappEnvironment, [name]: "" })),
    { ...whatsappEnvironment, GOAL_HINT_WHATSAPP_ACCESS_TOKEN: "secret\nheader" },
    { ...whatsappEnvironment, GOAL_HINT_WHATSAPP_PHONE_NUMBER_ID: "123/../other" },
    { ...whatsappEnvironment, GOAL_HINT_WHATSAPP_TEMPLATE_NAME: "../private" },
    { ...whatsappEnvironment, GOAL_HINT_WHATSAPP_TEMPLATE_LANGUAGE: "en_US/private" },
    { ...whatsappEnvironment, GOAL_HINT_WHATSAPP_API_VERSION: "v25.0/other" }]) {
    await assert.rejects(createMemberWhatsAppSender(environment, async () => { calls++; return whatsappAccepted(); })({ phone, code: "123456", purpose: "register" }), WhatsAppUnavailableError);
  }
  for (const message of [{ phone: `+${phone}`, code: "123456" }, { phone, code: "12345" }, { phone, code: "1234567" }]) {
    await assert.rejects(createMemberWhatsAppSender(whatsappEnvironment, async () => { calls++; return whatsappAccepted(); })({ ...message, purpose: "register" }), WhatsAppUnavailableError);
  }
  assert.equal(calls, 0);
  for (const response of [Response.json({ accepted: true }), Response.json({ messaging_product: "whatsapp", messages: [] }),
    Response.json({ messaging_product: "other", messages: [{ id: "123" }] }),
    Response.json({ messaging_product: "whatsapp", messages: [{ id: "" }] }),
    Response.json({ messaging_product: "whatsapp", messages: [{ id: "wamid.failed", message_status: "failed" }] }),
    new Response("x".repeat(8193)), new Response("{malformed"), new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } }),
    Response.json({ error: { code: 131026, message: "synthetic-private-provider-detail" } }, { status: 400 }),
    new Response(null, { status: 503 })]) {
    await assert.rejects(createMemberWhatsAppSender(whatsappEnvironment, async () => response)({ phone, code: "123456", purpose: "register" }),
      (error) => error instanceof WhatsAppUnavailableError && !String(error).includes("synthetic-private-provider-detail"));
  }
  for (const error of [new DOMException("synthetic-private-provider-detail", "TimeoutError"), new Error("synthetic-private-provider-detail")]) {
    await assert.rejects(createMemberWhatsAppSender(whatsappEnvironment, async () => { throw error; })({ phone, code: "123456", purpose: "register" }),
      (failure) => failure instanceof WhatsAppUnavailableError && !String(failure).includes("synthetic-private-provider-detail"));
  }
});

test("explicit provider selection never silently falls back when WhatsApp is unavailable", async () => {
  const smsEnvironment = { GOAL_HINT_SMS_GATEWAY_URL: "https://sms.example.test/3rdparty/v1/messages", GOAL_HINT_SMS_TOKEN: "synthetic-sms-token" };
  const calls = [], sender = createMemberVerificationSender(smsEnvironment, async (target) => {
    calls.push(String(target)); return Response.json({ id: "synthetic-sms", state: "Pending" });
  });
  await assert.rejects(sender({ phone, code: "123456", purpose: "reset", channel: "whatsapp" }), WhatsAppUnavailableError);
  assert.equal(calls.length, 0);
  await sender({ phone, code: "123456", purpose: "reset", channel: "sms" }); assert.equal(calls.length, 1);
  const all = createMemberVerificationSender({ ...smsEnvironment, ...whatsappEnvironment }, async (target) => {
    calls.push(String(target)); throw new Error("Synthetic upstream failure");
  });
  await assert.rejects(all({ phone, code: "123456", purpose: "password", channel: "whatsapp" }), WhatsAppUnavailableError);
  assert.equal(calls.length, 2); assert.match(calls.at(-1), /^https:\/\/graph.facebook.com\//u);
  await assert.rejects(all({ phone, code: "123456", purpose: "password", channel: "sms" }), SmsUnavailableError);
  assert.equal(calls.length, 3); assert.match(calls.at(-1), /^https:\/\/sms.example.test\//u);
});

test("SMS adapters fail closed without configuration, reject malformed acknowledgements, and never follow redirects", async () => {
  let calls = 0;
  await assert.rejects(createMemberSmsSender({}, async () => { calls++; })( { phone, code: "123456", purpose: "password" } ), SmsUnavailableError);
  assert.equal(calls, 0);
  const env = { GOAL_HINT_SMS_GATEWAY_URL: "https://gateway.example.test/3rdparty/v1/messages", GOAL_HINT_SMS_TOKEN: "test-token" };
  let observed;
  const sender = createMemberSmsSender(env, async (target, options) => { observed = { target, options }; return Response.json({ id: "synthetic-message", state: "Pending" }, { status: 202 }); });
  await sender({ phone, code: "123456", purpose: "phone" });
  assert.equal(observed.options.redirect, "error"); assert.equal(observed.options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(JSON.parse(observed.options.body).phoneNumbers, [`+${phone}`]);
  assert.match(JSON.parse(observed.options.body).textMessage.text, /phone change code: 123456/u);
  assert.equal(JSON.parse(observed.options.body).ttl, 300);
  const basic = { GOAL_HINT_SMS_GATEWAY_URL: env.GOAL_HINT_SMS_GATEWAY_URL, GOAL_HINT_SMS_USERNAME: "test-user", GOAL_HINT_SMS_PASSWORD: "test-password" };
  await createMemberSmsSender(basic, async (_target, options) => { assert.equal(options.headers.Authorization, `Basic ${Buffer.from("test-user:test-password").toString("base64")}`); return Response.json({ id: "basic-message", state: "Pending" }); })({ phone, code: "123456", purpose: "reset" });
  for (const response of [Response.json({ accepted: true }), Response.json({ id: "failed-message", state: "Failed" }), new Response("oops"), new Response(null, { status: 503 })]) {
    await assert.rejects(createMemberSmsSender(env, async () => response)({ phone, code: "123456", purpose: "reset" }), SmsUnavailableError);
  }
});

test("auth endpoints reject cross-origin/extra/oversized fields, keep verification browser-bound and never require old passwords", async () => {
  const f = fixture(), services = { config: { key, production: false, cookies: { secure: false } }, sessions: f.sessionService, auth: f.service };
  const source = async () => services;
  const request = (action, body, headers = {}) => new Request(`http://localhost/api/account/${action}`, { method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", ...headers }, body: JSON.stringify(body) });
  assert.equal((await createMemberAuthHandler("verification", source)(request("verification", { purpose: "register", phone }, { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal((await createMemberAuthHandler("login", source)(request("login", { phone, password, oldPassword: password }))).status, 400);
  assert.equal((await createMemberAuthHandler("login", source)(request("login", { phone, password: "x".repeat(2048) }))).status, 400);
  const challengeResponse = await createMemberAuthHandler("verification", source)(request("verification", { purpose: "register", phone }));
  assert.equal(challengeResponse.status, 200); assert.match(challengeResponse.headers.get("set-cookie"), /goal-hint-verification=.*HttpOnly; SameSite=Strict/u);
  assert.equal(challengeResponse.headers.get("cache-control"), "no-store");
  const challenge = await challengeResponse.json();
  assert.equal(challenge.channel, "whatsapp");
  assert.equal((await createMemberAuthHandler("confirm", source)(request("confirm", { challengeId: challenge.challengeId, code: f.sent[0].code }))).status, 400);
  const cookie = challengeResponse.headers.get("set-cookie").split(";")[0];
  const confirmation = await createMemberAuthHandler("confirm", source)(request("confirm", { challengeId: challenge.challengeId, code: f.sent[0].code }, { cookie }));
  assert.equal(confirmation.status, 200);
  const proof = await confirmation.json();
  const registered = await createMemberAuthHandler("register", source)(request("register", { phone, password, verificationToken: proof.verificationToken }, { cookie }));
  assert.equal(registered.status, 200); assert.deepEqual(await registered.json(), { next: "/en/account", phone });
  const memberCookie = registered.headers.getSetCookie()[0].split(";")[0];
  const session = await createMemberSessionHandler(source)(new Request("http://localhost/api/account/session", { headers: { cookie: memberCookie } }));
  assert.deepEqual(await session.json(), { phone });
});

test("verification HTTP accepts only explicit supported channels and returns the actual selected channel", async () => {
  const f = fixture(), services = { config: { production: false, cookies: { secure: false } }, sessions: f.sessionService, auth: f.service };
  const handler = createMemberAuthHandler("verification", async () => services);
  const request = (channel) => new Request("http://localhost/api/account/verification", { method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ purpose: "register", phone, channel }) });
  for (const channel of ["email", null, "SMS"]) {
    const response = await handler(request(channel)); assert.equal(response.status, 400); assert.equal((await response.json()).error, "invalid");
  }
  assert.equal(f.sent.length, 0);
  const response = await handler(request("sms")); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.channel, "sms"); assert.equal(f.sent[0].channel, "sms");
  assert.equal(Date.parse(body.expiresAt) - f.now(), 300_000);
  const confirm = createMemberAuthHandler("confirm", async () => services);
  const altered = await confirm(new Request("http://localhost/api/account/verification/confirm", { method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" },
    body: JSON.stringify({ challengeId: body.challengeId, code: f.sent[0].code, channel: "whatsapp" }) }));
  assert.equal(altered.status, 400, "A confirmation cannot override challenge delivery");
});

test("admin HTTP login requires a confirmed same-browser login-purpose proof and rejects mixed password/proof requests", async () => {
  const f = fixture({ admins: [phone] }), services = { config: { production: false, cookies: { secure: false } }, sessions: f.sessionService, auth: f.service };
  const source = async () => services;
  const request = (action, body, cookie = "") => new Request(`http://localhost/api/account/${action}`, { method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json", cookie }, body: JSON.stringify(body) });
  const unverified = await createMemberAuthHandler("login", source)(request("login", { phone })); assert.equal(unverified.status, 401);
  const denied = await createMemberAuthHandler("verification", source)(request("verification", { phone: replacement, purpose: "login" }));
  assert.equal(denied.status, 401); assert.equal(f.sent.length, 0);
  const challengeResponse = await createMemberAuthHandler("verification", source)(request("verification", { phone, purpose: "login" }));
  assert.equal(challengeResponse.status, 200); const challenge = await challengeResponse.json(); assert.equal(challenge.channel, "whatsapp");
  const cookie = challengeResponse.headers.get("set-cookie").split(";")[0];
  const confirm = await createMemberAuthHandler("confirm", source)(request("verification/confirm", { challengeId: challenge.challengeId, code: f.sent[0].code }, cookie));
  assert.equal(confirm.status, 200); const { verificationToken } = await confirm.json();
  assert.equal((await createMemberAuthHandler("login", source)(request("login", { phone, password, verificationToken }, cookie))).status, 400);
  assert.equal((await createMemberAuthHandler("login", source)(request("login", { phone, verificationToken }))).status, 400);
  const login = await createMemberAuthHandler("login", source)(request("login", { phone, verificationToken }, cookie));
  assert.equal(login.status, 200); assert.deepEqual(await login.json(), { phone, next: "/en/account" });
  assert.match(login.headers.getSetCookie()[0], /goal-hint-member=.*HttpOnly; SameSite=Lax/u);
  assert.match(login.headers.getSetCookie()[1], /goal-hint-verification=;.*Max-Age=0/u);
});

test("an anonymous resend refreshes its existing HttpOnly binding cookie for the entire new challenge", async () => {
  const f = fixture(), services = { config: { production: false, cookies: { secure: false } }, sessions: f.sessionService, auth: f.service };
  const handler = createMemberAuthHandler("verification", async () => services);
  const request = (cookie = "") => new Request("http://localhost/api/account/verification", { method: "POST",
    headers: { "sec-fetch-site": "same-origin", "content-type": "application/json", cookie }, body: JSON.stringify({ purpose: "register", phone }) });
  const first = await handler(request()); assert.equal(first.status, 200);
  const cookie = first.headers.get("set-cookie").split(";")[0];
  f.advance(9 * 60_000);
  const resent = await handler(request(cookie)); assert.equal(resent.status, 200);
  assert.match(resent.headers.get("set-cookie"), /Max-Age=600/u);
  assert.equal(resent.headers.get("set-cookie").split(";")[0], cookie);
});

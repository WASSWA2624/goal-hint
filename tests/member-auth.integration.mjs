import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import mariadb from "mariadb";
import { parseRuntimePolicy } from "../src/server/config/runtime-policy.ts";
import { createDatabase } from "../src/server/database/client.ts";
import { createMemberAuth, memberAuthRules } from "../src/server/members/member-auth.ts";
import { createMemberSessions, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import { isMemberAdminPhone } from "../src/server/members/member-admin.ts";
import { createSettingsService } from "../src/server/members/settings.ts";
import { costTestEnvironment } from "./helpers/cost-fixtures.mjs";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError, startIsolatedMysql } from "./helpers/mysql-instance.mjs";

const key = (purpose, value) => createHmac("sha256", "isolated-auth-synthetic-secret").update(`${purpose}\0${value}`).digest("hex");
const password = "correct horse 47", phone = "256700001001", movedPhone = "256700001002", legacyPhone = "256700001003";

test("password/verification authentication and schema work on an owned isolated genuine MySQL server", { timeout: 180_000 }, async (t) => {
  let instance;
  try { instance = await startIsolatedMysql(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  let root, database;
  try {
    await instance.assertOwnership();
    root = await mariadb.createConnection({ host: "127.0.0.1", port: instance.port, user: "root", database: "goal_hint_test",
      timezone: "Z", multipleStatements: true, allowPublicKeyRetrieval: true });
    // Run the actual subscription and auth migrations, including all existing FK/check constraints.
    await root.query(await readFile(new URL("../prisma/migrations/20261019142209_subscriptions/migration.sql", import.meta.url), "utf8"));
    let time = Date.parse("2026-10-20T18:00:00Z");
    const legacyId = randomUUID(), legacyToken = randomBytes(32).toString("base64url");
    await root.query("INSERT INTO MemberAccount (id,phone,createdAt,lastSignInAt) VALUES (?,?,?,?)", [legacyId, legacyPhone, new Date(time), new Date(time)]);
    await root.query("INSERT INTO MemberSession (tokenHash,accountId,createdAt,lastSeenAt,expiresAt) VALUES (?,?,?,?,?)",
      [memberTokenHash(legacyToken), legacyId, new Date(time), new Date(time), new Date(time + 86_400_000)]);
    await root.query(await readFile(new URL("../prisma/migrations/20261020193000_member_password_sms/migration.sql", import.meta.url), "utf8"));
    const syntheticPassword = randomBytes(24).toString("hex"), applicationUrl = `mysql://auth_application:${syntheticPassword}@127.0.0.1:${instance.port}/goal_hint_test`;
    await root.query(`CREATE USER 'auth_application'@'127.0.0.1' IDENTIFIED BY '${syntheticPassword}'`);
    for (const table of ["MemberAccount", "MemberSession", "MemberVerification", "SubscriptionPlan", "PaymentSubmission", "AccessCode", "RateLimitBucket"])
      await root.query(`GRANT SELECT, INSERT, UPDATE${["MemberSession", "MemberVerification"].includes(table) ? ", DELETE" : ""} ON goal_hint_test.${table} TO 'auth_application'@'127.0.0.1'`);
    database = createDatabase(parseRuntimePolicy(costTestEnvironment(applicationUrl, applicationUrl)));
    const sent = [], services = createMemberAuth({ database, config: { key }, now: () => time, sendVerification: async (message) => { sent.push(message); } });
    const sessions = createMemberSessions({ database, config: { key }, now: () => time });
    const viewer = createViewerAccess({ services: async () => ({ database, config: { production: false, cookies: { session: "owner" } }, auth: null }),
      settings: async () => ({ settings: { paywallMode: "on" } }), now: () => time });
    const anonymous = () => ({ member: null, anonymousToken: randomBytes(32).toString("base64url") });
    async function verify(purpose, binding, number = phone) {
      const challenge = await services.requestCode(purpose, number, binding, "198.51.100.8"); assert.equal(challenge.status, "sent");
      const confirmed = await services.confirmCode(challenge.challengeId, sent.at(-1).code, binding, "198.51.100.8"); assert.equal(confirmed.status, "verified");
      return { ...confirmed, challenge };
    }
    let registered, binding;
    await t.test("registration, password login and legacy session invalidation", async () => {
      assert.equal(await sessions.verify(legacyToken), null, "The migration never authenticates old number-only cookies");
      assert.deepEqual(await viewer((name) => name === "goal-hint-member" ? legacyToken : undefined), { tier: "free", signedIn: false, mode: "on" });
      const anonymousBinding = anonymous(), proof = await verify("register", anonymousBinding);
      registered = await services.register(phone, password, proof.verificationToken, anonymousBinding); assert.equal(registered.status, "authenticated");
      const member = await sessions.verify(registered.token); assert.equal(member.phone, phone); binding = { member };
      assert.deepEqual(await viewer((name) => name === "goal-hint-member" ? registered.token : undefined), { tier: "free", signedIn: true, mode: "on" });
      assert.equal((await services.login(phone, "incorrect password", "198.51.100.8")).status, "unauthorized");
      assert.equal((await services.login(phone, password, "198.51.100.8")).status, "authenticated");
      const rows = await root.query("SELECT codeHash,proofHash,consumedAt FROM MemberVerification WHERE id = ?", [proof.challenge.challengeId]);
      assert.match(rows[0].codeHash, /^[a-f0-9]{64}$/u); assert.match(rows[0].proofHash, /^[a-f0-9]{64}$/u); assert.ok(rows[0].consumedAt);
    });
    await t.test("phone change preserves current subscription unlock and account ID", async () => {
      const member = binding.member, id = randomUUID(), at = new Date(time), end = new Date(time + 7 * 86_400_000);
      await root.query("INSERT INTO AccessCode (id,accountId,codeSalt,codeHash,reference,source,planName,durationDays,priceUgx,createdAt,createdBy,activatedAt,startsAt,endsAt) VALUES (?,?,?,?,?,'manual','Synthetic access',7,0,?,'test',?,?,?)",
        [id, member.accountId, randomBytes(16), "f".repeat(64), "AA01", at, at, at, end]);
      await root.query("UPDATE MemberSession SET codeEnteredAt = ?, accessCodeId = ? WHERE tokenHash = ?", [at, id, member.tokenHash]);
      time += 60_000;
      const proof = await verify("phone", binding, movedPhone); assert.equal(sent.at(-1).phone, phone);
      const changed = await services.changePhone(movedPhone, proof.verificationToken, binding); assert.equal(changed.status, "authenticated");
      assert.equal(await sessions.verify(registered.token), null);
      const nextMember = await sessions.verify(changed.token); assert.equal(nextMember.accountId, member.accountId); assert.equal(nextMember.phone, movedPhone); assert.equal(nextMember.accessCodeId, id);
      binding = { member: nextMember };
    });
    await t.test("concurrent password updates consume one verification proof once and accept the same password", async () => {
      time += 60_000;
      const proof = await verify("password", binding);
      const results = await Promise.all([services.changePassword(password, proof.verificationToken, binding), services.changePassword(password, proof.verificationToken, binding)]);
      assert.deepEqual(results.map((result) => result.status).sort(), ["authenticated", "unauthorized"]);
      const success = results.find((result) => result.status === "authenticated");
      assert.ok((await sessions.verify(success.token)).accessCodeId); assert.equal(await sessions.verify(registered.token), null);
    });
    await t.test("verification recovery establishes a first password on the same legacy account", async () => {
      const b = anonymous(), proof = await verify("reset", b, legacyPhone);
      const recovered = await services.changePassword(password, proof.verificationToken, b, legacyPhone); assert.equal(recovered.status, "authenticated");
      assert.equal((await sessions.verify(recovered.token)).accountId, legacyId);
      assert.equal((await services.login(legacyPhone, password, "198.51.100.8")).status, "authenticated");
    });
    await t.test("proof expiry and five guesses are durable database decisions", async () => {
      time += 60_000;
      const b = anonymous(), proof = await verify("reset", b, legacyPhone);
      time += memberAuthRules.codeMs;
      assert.equal((await services.changePassword("a new password", proof.verificationToken, b, legacyPhone)).status, "invalid");
      const challenge = await services.requestCode("reset", legacyPhone, b, "198.51.100.8"); assert.equal(challenge.status, "sent");
      const code = sent.at(-1).code, wrong = code === "000000" ? "000001" : "000000";
      await Promise.all(Array.from({ length: 5 }, () => services.confirmCode(challenge.challengeId, wrong, b, "198.51.100.8")));
      assert.equal((await services.confirmCode(challenge.challengeId, code, b, "198.51.100.8")).status, "invalid");
      const [row] = await root.query("SELECT attempts,consumedAt FROM MemberVerification WHERE id = ?", [challenge.challengeId]);
      assert.equal(row.attempts, 5); assert.ok(row.consumedAt);
    });
    t.diagnostic(`Verified actual auth migration, least-privilege member writes, expiry, session rotation and row-lock serialization on ${instance.version}. Verification sender was injected; no external messages were sent.`);
  } finally { await database?.disconnect(); await root?.end(); await instance.stop(); }
});

test("admin OTP, shared verification channels and protected settings persist on restricted owned MySQL", { timeout: 180_000 }, async (t) => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  await f.instance.assertOwnership();
  assert.ok(![3306, 3307].includes(f.instance.port), "The disposable engine never addresses an installed development/service port");
  let time = Date.parse("2026-10-21T00:00:00Z");
  const administrator = "256700002001", reserved = "256700002002", ordinary = "256700002003", hashedAdministrator = "256700002004",
    channelPhone = "256700002005", limitedPhone = "256700002006";
  const environment = { GOAL_HINT_ADMIN_PHONES: JSON.stringify([administrator, reserved, hashedAdministrator]) };
  const adminPhone = (phone) => isMemberAdminPhone(phone, environment), sent = [], now = () => time;
  const auth = createMemberAuth({ database: f.database, config: f.config, now, adminPhone,
    sendVerification: async (message) => { sent.push(message); } });
  const sessions = createMemberSessions({ database: f.database, config: f.config, now, adminPhone });
  const browser = () => ({ member: null, anonymousToken: randomBytes(32).toString("base64url") });
  async function verify(purpose, binding, number, channel) {
    const challenge = await auth.requestCode(purpose, number, binding, "198.51.100.60", channel);
    assert.equal(challenge.status, "sent");
    const proof = await auth.confirmCode(challenge.challengeId, sent.at(-1).code, binding, "198.51.100.60");
    assert.equal(proof.status, "verified");
    assert.equal(+proof.expiresAt, +challenge.expiresAt);
    return { challenge, proof };
  }
  let adminToken, adminId;
  await t.test("passwordless admin login persists a real authentication marker, reuses the account and observes allowlist removal", async () => {
    const binding = browser(), { challenge, proof } = await verify("login", binding, administrator);
    assert.equal(challenge.channel, "whatsapp"); assert.equal(sent.at(-1).channel, "whatsapp");
    assert.equal((await auth.loginWithCode(administrator, proof.verificationToken, browser(), "198.51.100.60")).status, "invalid");
    const result = await auth.loginWithCode(administrator, proof.verificationToken, binding, "198.51.100.60");
    assert.equal(result.status, "authenticated");
    const member = await sessions.verify(result.token); assert.equal(member.phone, administrator);
    adminId = member.accountId; adminToken = result.token;
    const account = await f.database.query((tx) => tx.memberAccount.findUniqueOrThrow({ where: { id: adminId } }));
    const session = await f.database.query((tx) => tx.memberSession.findUniqueOrThrow({ where: { tokenHash: member.tokenHash } }));
    assert.equal(account.passwordHash, null); assert.ok(session.authenticatedAt); assert.equal(+session.authenticatedAt, time);
    assert.equal(session.codeEnteredAt, null); assert.equal(await f.database.query((tx) => tx.accessCode.count({ where: { accountId: adminId } })), 0);
    const stored = await f.database.query((tx) => tx.memberVerification.findUniqueOrThrow({ where: { id: challenge.challengeId } }));
    assert.ok(stored.consumedAt); assert.equal(stored.accountId, adminId); assert.notEqual(stored.codeHash, sent[0].code);
    const legacyToken = randomBytes(32).toString("base64url");
    await f.database.query((tx) => tx.memberSession.create({ data: { tokenHash: memberTokenHash(legacyToken), accountId: adminId,
      createdAt: new Date(time), lastSeenAt: new Date(time), expiresAt: new Date(time + 86_400_000) } }));
    assert.equal(await sessions.verify(legacyToken), null, "A real legacy marker-null row is never privileged by the allowlist");
    assert.equal((await auth.loginWithCode(administrator, proof.verificationToken, binding, "198.51.100.60")).status, "invalid");
    environment.GOAL_HINT_ADMIN_PHONES = JSON.stringify([reserved, hashedAdministrator]);
    assert.equal(await sessions.verify(adminToken), null);
    environment.GOAL_HINT_ADMIN_PHONES = JSON.stringify([administrator, reserved, hashedAdministrator]);
    assert.equal((await sessions.verify(adminToken)).accountId, adminId);
    time += 60_000;
    const nextBinding = browser(), next = await verify("login", nextBinding, administrator, "sms");
    const second = await auth.loginWithCode(administrator, next.proof.verificationToken, nextBinding, "198.51.100.60");
    assert.equal(second.status, "authenticated"); assert.equal((await sessions.verify(second.token)).accountId, adminId);
    assert.equal(await f.database.query((tx) => tx.memberAccount.count({ where: { phone: administrator } })), 1);
    assert.equal((await f.database.query((tx) => tx.memberAccount.findUniqueOrThrow({ where: { id: adminId } }))).passwordHash, null);
    adminToken = second.token;
  });
  await t.test("admin OTP preserves an existing password-bearing account while fresh password login is refused", async () => {
    const passwordHash = await hashPassword(password), id = randomUUID(), binding = browser();
    await f.database.query((tx) => tx.memberAccount.create({ data: { id, phone: hashedAdministrator, passwordHash,
      createdAt: new Date(time), lastSignInAt: new Date(time) } }));
    const refused = await auth.login(hashedAdministrator, password, "198.51.100.60");
    assert.equal(refused.status, "unauthorized"); assert.match(refused.message, /verification-code login/u);
    const { proof } = await verify("login", binding, hashedAdministrator);
    const result = await auth.loginWithCode(hashedAdministrator, proof.verificationToken, binding, "198.51.100.60");
    assert.equal(result.status, "authenticated"); assert.equal((await sessions.verify(result.token)).accountId, id);
    assert.equal((await f.database.query((tx) => tx.memberAccount.findUniqueOrThrow({ where: { id } }))).passwordHash, passwordHash);
    environment.GOAL_HINT_ADMIN_PHONES = JSON.stringify([administrator, reserved]);
    assert.equal((await sessions.verify(result.token)).accountId, id, "A removed admin with a real hash remains an ordinary authenticated member");
    assert.equal(isMemberAdminPhone(hashedAdministrator, environment), false);
  });
  await t.test("WhatsApp is default and durable resend/proof invalidation and hourly limits are shared with SMS", async () => {
    const binding = browser(), first = await verify("register", binding, channelPhone);
    assert.equal(first.challenge.channel, "whatsapp");
    assert.equal((await auth.requestCode("register", channelPhone, binding, "198.51.100.60", "sms")).status, "busy");
    time += 60_000;
    const next = await auth.requestCode("register", channelPhone, binding, "198.51.100.60", "sms");
    assert.equal(next.status, "sent"); assert.equal(next.channel, "sms"); assert.equal(sent.at(-1).channel, "sms");
    assert.equal(+next.expiresAt - time, memberAuthRules.codeMs);
    assert.equal((await auth.register(channelPhone, password, first.proof.verificationToken, binding)).status, "invalid");
    const prior = await f.database.query((tx) => tx.memberVerification.findUniqueOrThrow({ where: { id: first.challenge.challengeId } }));
    assert.ok(prior.consumedAt);
    const limitedBrowser = browser(), before = sent.length;
    for (let index = 0; index < 5; index++) {
      const result = await auth.requestCode("register", limitedPhone, limitedBrowser, "198.51.100.61", index % 2 ? "sms" : "whatsapp");
      assert.equal(result.status, "sent"); time += 60_000;
    }
    for (const channel of ["sms", "whatsapp"]) assert.equal((await auth.requestCode("register", limitedPhone, browser(), "198.51.100.62", channel)).status, "busy");
    assert.equal(sent.length - before, 5);
    assert.equal(await f.database.query((tx) => tx.memberVerification.count({ where: { phone: limitedPhone } })), 5);
  });
  await t.test("an old-phone code cannot claim an unused configured administrator identity", async () => {
    const binding = browser(), registered = await verify("register", binding, ordinary);
    const result = await auth.register(ordinary, password, registered.proof.verificationToken, binding);
    assert.equal(result.status, "authenticated");
    const member = await sessions.verify(result.token); time += 60_000;
    const proof = await verify("phone", { member }, reserved); assert.equal(sent.at(-1).phone, ordinary);
    const refused = await auth.changePhone(reserved, proof.proof.verificationToken, { member });
    assert.equal(refused.status, "invalid");
    assert.equal((await f.database.query((tx) => tx.memberAccount.findUniqueOrThrow({ where: { id: member.accountId } }))).phone, ordinary);
    assert.equal(await f.database.query((tx) => tx.memberAccount.count({ where: { phone: reserved } })), 0);
    assert.equal((await sessions.verify(result.token)).phone, ordinary);
  });
  await t.test("verified-admin protected settings write and its audit commit with application-role grants and no owner password", async () => {
    const member = await sessions.verify(adminToken); assert.equal(member.accountId, adminId); assert.equal(adminPhone(member.phone), true);
    const settings = createSettingsService(f.database, { now, environment: null }), actor = `member-admin:${member.accountId}`;
    const refused = await settings.save(actor, { contactPhone: "256700002099" }, { password: null, async confirm() { assert.fail("No password should be checked"); } });
    assert.equal(refused.status, "password-required");
    const saved = await settings.save(actor, { contactPhone: "256700002099" }, { password: null, sessionAuthorized: true,
      async confirm() { assert.fail("A verified admin session does not need owner-password reentry"); } });
    assert.equal(saved.status, "saved"); assert.deepEqual(saved.changed, ["contactPhone"]);
    const row = await f.database.query((tx) => tx.subscriptionSettings.findUniqueOrThrow({ where: { id: 1 } }));
    assert.equal(row.contactPhone, "256700002099"); assert.equal(row.updatedBy, actor);
    const audits = await f.database.query((tx) => tx.ownerAuditEvent.findMany({ where: { actor, action: "settings_changed" } }));
    assert.equal(audits.length, 1); assert.equal(audits[0].details.sessionAuthorized, true); assert.equal(audits[0].details.passwordConfirmed, false);
  });
  t.diagnostic(`Verified admin OTP, durable cross-channel limits, reserved-identity rejection and audited settings persistence on ${f.instance.version}. Only owned disposable data and injected delivery were used.`);
});

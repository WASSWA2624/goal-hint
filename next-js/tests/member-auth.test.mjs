import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createMemberAuthFixture as fixture } from "./helpers/member-auth-fixture.mjs";
import { memberStore } from "./helpers/member-store.mjs";
import { hashPassword, verifyPassword } from "../src/server/analytics/analytics-password.ts";
import { createAccessCodes, createAccessPeriod, lockMemberAccount } from "../src/server/members/access-codes.ts";
import { DatabaseOperationError } from "../src/server/database/client.ts";
import { createMemberAuthHandler, createPasswordRecoveryHandler } from "../src/server/members/member-auth-http.ts";
import { getMemberAuthServices } from "../src/server/members/member-http.ts";
import { createMemberTrialHandler } from "../src/server/members/member-trial-http.ts";
import { issueMemberSession, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { isMemberAdminPhone, memberAdminCredential, parseMemberAdminPhones, verifyMemberAdminCredential } from "../src/server/members/member-admin.ts";
import { passwordRecoveryRules } from "../src/server/members/password-recovery.ts";
import { createMemberRateLimit } from "../src/server/members/rate-limit.ts";

const phone = "256700000001", replacement = "256700000002", password = "correct horse 47";
const browser = () => ({ member: null });
const DAY = 86_400_000, address = "198.51.100.1";
const wrongCode = (code) => `${code[0] === "0" ? "1" : "0"}${code.slice(1)}`;



test("a valid legacy account code grants truthful ownership without an outbound welcome", async () => {
  const f = fixture(), restricted = await pending(f), code = await f.legacyCode(restricted.accountId);
  f.tx.paymentNotificationOutbox = { async create() { assert.fail("Legacy verification must not queue a welcome"); } };
  assert.equal((await f.service.requestVerification()).status, "invalid");
  assert.equal((await f.service.verifyAccount(wrongCode(code), restricted.token, address)).status, "unauthorized");
  const verified = await f.service.verifyAccount(code, restricted.token, address);
  assert.equal(verified.status, "authenticated");
  assert.equal((await f.sessionService.verify(verified.token)).phoneVerified, true);
  assert.equal((await f.service.verifyAccount(code, restricted.token, address)).status, "unauthorized");
  assert.equal(f.messages.length, 0);
});

test("changing the recipient phone clears account-update WhatsApp consent before new verification", async () => {
  const f = fixture(), logged = await f.authenticate();
  f.accounts.get(logged.member.accountId).whatsappNotificationsAt = new Date(f.now());
  const changed = await f.service.changePhone(replacement, password, { member: logged.member });
  assert.equal(changed.status, "authenticated"); assert.equal(changed.requiresVerification, true);
  assert.equal(f.accounts.get(logged.member.accountId).whatsappNotificationsAt, null);
});

test("a legacy verify payload may include a boolean preference without enabling outbound updates", async () => {
  for (const whatsappNotifications of [null, "true", 1, {}]) {
    const handler = createMemberAuthHandler("verify", async () => { assert.fail("Invalid legacy fields never reach storage"); });
    assert.equal((await handler(authRequest("verify", { code: "123456", whatsappNotifications }))).status, 400);
  }
  const f = fixture(), restricted = await pending(f), code = await f.legacyCode(restricted.accountId);
  const source = async () => ({ config: { production: false, cookies: { session: "goal-hint-analytics" } }, sessions: f.sessionService, auth: f.service });
  const response = await createMemberAuthHandler("verify", source)(authRequest("verify", { code, whatsappNotifications: true }, restricted.token));
  assert.equal(response.status, 200);
  assert.equal(f.accounts.get(restricted.accountId).whatsappNotificationsAt == null, true);
  assert.equal(f.messages.length, 0);
});

test("registration admits a normal member without claiming an existing passwordless account or proving the phone", async () => {
  const f = fixture();
  const result = await f.service.register(phone, password, browser());
  assert.equal(result.status, "authenticated");
  assert.equal(result.requiresVerification, undefined);
  assert.equal((await f.sessionService.verify(result.token)).phoneVerified, false);
  assert.equal(await f.service.verificationSession(result.token), null);
  assert.equal(f.messages.length, 0);
  assert.equal(+[...f.sessions.values()][0].authenticatedAt, f.now());
  assert.equal([...f.sessions.values()][0].passwordResetAt, null);
  const created = f.accounts.get(result.accountId);
  assert.equal(created.phoneVerifiedAt, null);
  assert.equal(+created.memberAdmittedAt, f.now());
  assert.notEqual(created.passwordHash, password);
  assert.ok(await verifyPassword(password, created.passwordHash));
  assert.deepEqual(await f.service.register(phone, password, browser()), { status: "conflict", message: "An account already exists, so please log in." });
  const legacy = fixture(); await legacy.account({ passwordHash: null });
  assert.equal((await legacy.service.register(phone, password, browser())).status, "conflict");
});

test("configured admin numbers require the environment password and land on the dashboard", async () => {
  const adminPassword = "configured admin password", f = fixture({ admins: [phone], adminPassword });
  assert.equal((await f.service.register(phone, password, browser())).status, "unauthorized");
  const account = await f.account();
  assert.equal((await f.service.login(phone, password, "198.51.100.1")).status, "unauthorized");
  const logged = await f.service.login(phone, "configured admin password", "198.51.100.1");
  assert.equal(logged.administrator, true); assert.equal((await f.sessionService.verify(logged.token)).accountId, account.id);
  const noAccount = fixture({ admins: [replacement], adminPassword });
  assert.equal((await noAccount.service.login(replacement, "configured admin password", "198.51.100.1")).administrator, true);
  assert.equal(noAccount.accounts.size, 1);
  const request = new Request("https://goal.test/api/account/login", { method: "POST", headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "configured admin password", return: "/en/subscribe" }) });
  const response = await createMemberAuthHandler("login", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(request);
  assert.equal(response.status, 200); assert.equal((await response.json()).next, "/admin");
});

test("shared administrator password ignores retired hashes and yields only opaque session metadata", async () => {
  const configured = "private admin password", environment = { GOAL_HINT_ADMIN_PASSWORD: configured };
  const credential = memberAdminCredential(environment);
  assert.equal(credential, `plain:${configured}`, "Existing password-bound session identity is stable");
  assert.equal(verifyMemberAdminCredential("wrong password", credential), false);
  const f = fixture({ admins: [phone], adminPassword: configured });
  const logged = await f.service.login(phone, configured, "198.51.100.1");
  assert.equal(logged.administrator, true); assert.equal((await f.sessionService.verify(logged.token)).administrator, true);
  assert.ok(!JSON.stringify([...f.accounts.values(), ...f.sessions.values(), logged]).includes(configured));
  assert.match([...f.sessions.values()][0].adminPasswordVersion, /^[a-f0-9]{64}$/u);
  const retired = await hashPassword("retired hashed credential");
  assert.equal(memberAdminCredential({ ...environment, GOAL_HINT_ADMIN_PASSWORD_HASH: retired }), credential);
  assert.equal(memberAdminCredential({ ...environment, GOAL_HINT_ADMIN_PASSWORD_HASH: "malformed hash" }), credential);
  assert.equal(memberAdminCredential({ GOAL_HINT_ADMIN_PASSWORD_HASH: retired }), null);
  assert.equal(verifyMemberAdminCredential("retired hashed credential", retired), false);
  assert.equal(memberAdminCredential({ GOAL_HINT_ADMIN_PASSWORD: "        " }), null);
});

test("shared sign-in cannot provision missing ordinary accounts or authenticate blocked, erased or unconfigured administrator accounts", async () => {
  const configured = "configured administrator password";
  for (const fields of [{ blockedAt: new Date() }, { erasedAt: new Date() }]) {
    const f = fixture({ admins: [phone], adminPassword: configured }); await f.account(fields);
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

test("administrator password logins allow two sessions and evict the oldest on the third", async () => {
  const configured = "configured administrator password", f = fixture({ admins: [phone], adminPassword: configured });
  const first = await f.service.login(phone, configured, address);
  assert.equal((await f.service.login(phone, "wrong administrator password", "198.51.100.2")).status, "unauthorized");
  assert.equal((await f.sessionService.verify(first.token)).administrator, true);
  f.advance(1);
  const second = await f.service.login(phone, configured, "198.51.100.2");
  assert.equal(second.otherDeviceSignedOut, false);
  assert.equal((await f.sessionService.verify(first.token)).administrator, true);
  f.advance(1);
  const third = await f.service.login(phone, configured, "198.51.100.3");
  assert.equal(third.otherDeviceSignedOut, true);
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.equal((await f.sessionService.verify(second.token)).administrator, true);
  assert.equal((await f.sessionService.verify(third.token)).administrator, true); assert.equal(f.sessions.size, 2);
});

test("self-service reset authorization expires at its exact deadline", async () => {
  const f = fixture(), account = await f.account();
  const code = await f.legacyResetCode(account.id);
  const authorized = await f.service.verifyPasswordReset(phone, code, address);
  assert.equal(authorized.requiresPasswordChange, true);
  f.advance(passwordRecoveryRules.resetSessionMs);
  assert.equal(await f.service.passwordResetSession(authorized.token), null);
  assert.equal((await f.service.resetPassword("replacement secret", authorized.token, address)).status, "unauthorized");
});

test("registered accounts marked for recovery reject login and remain eligible for admin-assisted recovery", async () => {
  const f = fixture(); await f.account({ passwordHash: "!self-service-recovery-required" });
  assert.equal((await f.service.login(phone, password, address)).status, "unauthorized");
  assert.equal((await f.recovery.request(phone, address)).status, "requested");
  assert.equal(await f.recovery.pendingCount(), 1);
});

test("signed-in password changes need no current password and retain only the current device", async () => {
  const f = fixture(), binding = await f.authenticate();
  const other = await f.service.login(phone, password, "198.51.100.2");
  assert.ok(await f.sessionService.verify(other.token));
  const changed = await f.service.changePassword("aaa", binding);
  assert.equal(changed.status, "authenticated"); assert.equal(await f.sessionService.verify(binding.token), null);
  assert.equal(await f.sessionService.verify(other.token), null, "A password change still revokes every old session");
  assert.ok(await f.sessionService.verify(changed.token));
  assert.equal(f.messages.length, 0, "A signed-in password change sends no verification code");
  assert.deepEqual(await f.service.login(phone, password, address), { status: "unauthorized", message: "The phone number or password is incorrect." });
  assert.deepEqual(await f.service.login(replacement, password, address), { status: "unauthorized", message: "The phone number or password is incorrect." });
  assert.equal((await f.service.login(phone, "aaa", address, changed.token)).status, "authenticated");
});

test("concurrent password changes authorize one new password and revoke both old device sessions", async () => {
  const f = fixture(), first = await f.authenticate();
  const second = await f.service.login(phone, password, "198.51.100.2");
  const attempts = ["first concurrent password", "second concurrent password"];
  const results = await Promise.all([
    f.service.changePassword(attempts[0], { member: first.member }),
    f.service.changePassword(attempts[1], { member: await f.sessionService.verify(second.token) }),
  ]);
  assert.deepEqual(results.map(row => row.status).sort(), ["authenticated", "unauthorized"]);
  const winner = results.findIndex(row => row.status === "authenticated");
  assert.ok(await f.sessionService.verify(results[winner].token));
  assert.equal(await f.sessionService.verify(first.token), null); assert.equal(await f.sessionService.verify(second.token), null);
  assert.equal(f.sessions.size, 1); assert.equal(f.messages.length, 0);
  assert.equal((await f.service.login(phone, attempts[1 - winner], address)).status, "unauthorized");
  assert.equal((await f.service.login(phone, attempts[winner], address, results[winner].token)).status, "authenticated");
});

test("a third login signs out only the oldest session and denies its profile writes", async () => {
  const f = fixture(), first = await f.authenticate();
  await f.account({ phone: replacement });
  const other = await f.service.login(replacement, password, "198.51.100.9");
  f.advance(1);
  const second = await f.service.login(phone, password, "198.51.100.2");
  assert.equal(second.status, "authenticated"); assert.notEqual(second.token, first.token);
  assert.equal(other.otherDeviceSignedOut, false); assert.equal(second.otherDeviceSignedOut, false);
  assert.ok(await f.sessionService.verify(first.token)); assert.ok(await f.sessionService.verify(second.token));
  f.advance(1);
  const third = await f.service.login(phone, password, "198.51.100.3");
  assert.equal(third.status, "authenticated"); assert.equal(third.otherDeviceSignedOut, true);
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.ok(await f.sessionService.verify(second.token)); assert.ok(await f.sessionService.verify(third.token));
  assert.ok(await f.sessionService.verify(other.token));
  assert.equal([...f.sessions.values()].filter(row => row.accountId === first.member.accountId).length, 2);
  assert.equal((await f.service.changePassword("stale device password", first)).status, "unauthorized");
  assert.equal((await f.service.changePhone("256700000003", password, first)).status, "unauthorized");
  const response = await createMemberAuthHandler("password", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(
    authRequest("password", { password: "stale HTTP password", confirm: "stale HTTP password" }, first.token));
  assert.equal(response.status, 401); assert.equal(response.headers.get("set-cookie"), null);
  await f.sessionService.signOut(first.token);
  assert.ok(await f.sessionService.verify(second.token), "Signing out an old cookie cannot sign out the replacement device");
});

test("same-browser login rotates its token without evicting the other session; stale cookies use the cap", async () => {
  const f = fixture(); await f.account();
  const first = await f.service.login(phone, password, address);
  assert.equal(first.otherDeviceSignedOut, false);
  f.advance(1);
  const second = await f.service.login(phone, password, "198.51.100.2");
  f.advance(1);
  const refreshed = await f.service.login(phone, password, "198.51.100.2", second.token);
  assert.equal(refreshed.otherDeviceSignedOut, false); assert.equal(await f.sessionService.verify(second.token), null);
  assert.ok(await f.sessionService.verify(first.token)); assert.equal(f.sessions.size, 2);
  f.advance(1);
  const third = await f.service.login(phone, password, "198.51.100.3", second.token);
  assert.equal(third.otherDeviceSignedOut, true, "A stale local cookie must not hide another device's active session");
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.ok(await f.sessionService.verify(refreshed.token)); assert.ok(await f.sessionService.verify(third.token));
});

test("expired and restricted sessions do not trigger an incorrect other-device notification", async () => {
  const f = fixture(), account = await f.account();
  const pending = await f.database.transaction(tx => issueMemberSession(tx, account.id, new Date(f.now())));
  const expired = "e".repeat(43), at = new Date(f.now());
  await f.tx.memberSession.create({ data: { tokenHash: memberTokenHash(expired), accountId: account.id,
    authenticatedAt: at, createdAt: at, lastSeenAt: at, expiresAt: at } });
  await f.tx.memberSession.create({ data: { tokenHash: "r".repeat(64), accountId: account.id,
    authenticatedAt: at, passwordResetAt: at, createdAt: at, lastSeenAt: at, expiresAt: new Date(+at + DAY) } });
  const login = await f.service.login(phone, password, address);
  assert.equal(login.status, "authenticated"); assert.equal(login.otherDeviceSignedOut, false);
  assert.equal(await f.sessionService.verify(expired), null);
  assert.equal(f.sessions.has(pending.session.tokenHash), false); assert.equal(f.sessions.size, 1);
});

test("concurrent successful logins retain exactly the two newest sessions", async () => {
  const f = fixture(), first = await f.authenticate(), committed = [];
  f.advance(1);
  const create = f.tx.memberSession.create;
  f.tx.memberSession.create = async input => { const row = await create(input); f.advance(1); return row; };
  await Promise.all(Array.from({ length: 5 }, (_, index) => f.service.login(phone, password, `198.51.100.${index + 2}`).then(result => committed.push(result))));
  assert.ok(committed.every(result => result.status === "authenticated"));
  assert.equal(f.sessions.size, 2); assert.equal(await f.sessionService.verify(first.token), null);
  for (const result of committed.slice(0, -2)) assert.equal(await f.sessionService.verify(result.token), null);
  for (const result of committed.slice(-2)) assert.ok(await f.sessionService.verify(result.token));
});

test("recent activity does not make the oldest login newer", async () => {
  const f = fixture(), first = await f.authenticate();
  f.advance(1);
  const second = await f.service.login(phone, password, "198.51.100.2");
  f.advance(DAY);
  assert.ok(await f.sessionService.verify(first.token));
  assert.ok(f.sessions.get(first.member.tokenHash).lastSeenAt > f.sessions.get(memberTokenHash(second.token)).lastSeenAt);
  const third = await f.service.login(phone, password, "198.51.100.3");
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.ok(await f.sessionService.verify(second.token)); assert.ok(await f.sessionService.verify(third.token));
});

test("an exactly expired login frees its slot without evicting the other active session", async () => {
  const f = fixture(), first = await f.authenticate();
  const second = await f.service.login(phone, password, "198.51.100.2");
  f.sessions.get(first.member.tokenHash).expiresAt = new Date(f.now());
  const third = await f.service.login(phone, password, "198.51.100.3");
  assert.equal(third.otherDeviceSignedOut, false); assert.equal(await f.sessionService.verify(first.token), null);
  assert.ok(await f.sessionService.verify(second.token)); assert.ok(await f.sessionService.verify(third.token));
  assert.equal(f.sessions.size, 2);
});

test("equal login times use creation time then token hash, and excess legacy sessions are removed", async () => {
  const f = fixture(), account = await f.account(), at = new Date(f.now());
  for (const [tokenHash, createdAt] of [["a".repeat(64), at], ["b".repeat(64), at], ["c".repeat(64), new Date(+at - 1)]]) {
    await f.tx.memberSession.create({ data: { tokenHash, accountId: account.id, authenticatedAt: at,
      createdAt, lastSeenAt: at, expiresAt: new Date(+at + DAY) } });
  }
  const login = await f.service.login(phone, password, address);
  assert.equal(login.otherDeviceSignedOut, true);
  assert.deepEqual([...f.sessions.keys()].sort(), ["b".repeat(64), memberTokenHash(login.token)].sort());
});

test("failed and blocked logins preserve the existing device", async () => {
  const f = fixture(), active = await f.authenticate();
  const other = await f.service.login(phone, password, "198.51.100.2");
  const wrong = await f.service.login(phone, "wrong password", address, active.token);
  assert.equal(wrong.status, "unauthorized"); assert.ok(await f.sessionService.verify(active.token));
  const account = f.accounts.get(active.member.accountId);
  account.blockedAt = new Date(f.now());
  assert.equal((await f.service.login(phone, password, address, active.token)).status, "unauthorized");
  assert.ok(f.sessions.has(active.member.tokenHash), "A rejected login cannot delete even a blocked account's cookie");
  account.blockedAt = null;
  assert.ok(await f.sessionService.verify(active.token));
  for (let attempt = 0; attempt < 9; attempt++) await f.service.login(phone, "wrong password", address);
  const limited = await createMemberAuthHandler("login", async () => ({
    config: { production: false, cookies: { session: "goal-hint-analytics" } }, auth: f.service, sessions: f.sessionService,
  }))(authRequest("login", { phone, password }, active.token));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), String(Math.ceil((900_000 - f.now() % 900_000) / 1000)));
  assert.equal(limited.headers.get("set-cookie"), null);
  assert.ok(await f.sessionService.verify(active.token), "Throttled logins cannot sign out the current device");
  assert.ok(await f.sessionService.verify(other.token)); assert.equal(f.sessions.size, 2);
});

test("a failed replacement transaction restores the active device and issues no cookie", async () => {
  const f = fixture(), active = await f.authenticate();
  f.advance(1);
  const other = await f.service.login(phone, password, "198.51.100.2");
  f.tx.memberSession.create = async () => { throw new Error("Synthetic session insert failure"); };
  const response = await createMemberAuthHandler("login", async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService }))(
    authRequest("login", { phone, password }, undefined));
  assert.equal(response.status, 503); assert.equal(response.headers.get("set-cookie"), null);
  assert.ok(await f.sessionService.verify(active.token)); assert.ok(await f.sessionService.verify(other.token)); assert.equal(f.sessions.size, 2);
});

test("both signed-in devices can manage an account with an access period", async () => {
  const f = fixture(), first = await f.authenticate();
  const codes = createAccessCodes({ database: f.database, now: f.now });
  await f.database.transaction(async tx => createAccessPeriod(tx, await lockMemberAccount(tx, first.member.accountId),
    { source: "manual", planName: "Manual", durationDays: 1, priceUgx: 0 }, "test", new Date(f.now())));
  const second = await f.service.login(phone, password, "198.51.100.2"), member = await f.sessionService.verify(second.token);
  assert.equal(second.status, "authenticated");
  for (const identity of [first.member, member]) {
    assert.equal((await codes.accountView(identity)).devices.length, 2);
  }
  assert.ok(await f.sessionService.signOutOthers(member));
  assert.equal(await f.sessionService.verify(first.token), null);
  assert.equal((await codes.accountView(member)).devices.length, 1);
});

test("restricted session requests cannot evict the authenticated device under a flood", async () => {
  const f = fixture(), active = await f.authenticate();
  const second = await f.service.login(phone, password, "198.51.100.2");
  for (let attempt = 0; attempt < 12; attempt++) await f.database.transaction(tx => issueMemberSession(tx, active.member.accountId, new Date(f.now())));
  assert.ok(await f.sessionService.verify(active.token));
  assert.ok(await f.sessionService.verify(second.token));
  assert.equal(f.sessions.size, 10);
  const authenticated = [...f.sessions.values()].filter(row => row.authenticatedAt);
  assert.equal(authenticated.length, 2);
});

async function pending(f) {
  await f.account({ phoneVerifiedAt: null });
  const result = await f.service.login(phone, password, address);
  assert.equal(result.requiresVerification, true);
  return result;
}

test("a previously delivered account code is consumed exactly once during concurrent legacy verification", async () => {
  const f = fixture(), restricted = await pending(f), code = await f.legacyCode(restricted.accountId, "123456", "whatsapp");
  assert.equal(await f.service.passwordResetSession(restricted.token), null);
  const attempts = await Promise.all([f.service.verifyAccount(code, restricted.token, address),
    f.service.verifyAccount(code, restricted.token, "198.51.100.2")]);
  assert.deepEqual(attempts.map(result => result.status).sort(), ["authenticated", "unauthorized"]);
  const verified = attempts.find(result => result.status === "authenticated");
  assert.equal((await f.sessionService.verify(verified.token)).phone, phone);
  assert.equal(+f.accounts.get(verified.accountId).phoneVerifiedAt, f.now());
  assert.equal(await f.service.verificationSession(restricted.token), null);
  const logged = await f.service.login(phone, password, address);
  assert.equal(logged.requiresVerification, undefined);
  assert.ok(await f.sessionService.verify(logged.token));
  assert.equal(f.messages.length, 0);
});

test("unverified passwords only reopen verification and cannot access authenticated profile actions", async () => {
  const f = fixture(); await f.account({ phoneVerifiedAt: null });
  const logged = await f.service.login(phone, password, address);
  assert.equal(logged.requiresVerification, true); assert.equal(await f.sessionService.verify(logged.token), null);
  assert.deepEqual(await f.service.verificationSession(logged.token), { phone });
  assert.equal(f.messages.length, 0);
  assert.equal((await f.service.changePassword("replacement secret", browser())).status, "unauthorized");
  assert.equal((await f.service.changePhone(replacement, password, browser())).status, "unauthorized");
  assert.equal((await f.service.requestVerification("email", logged.token, address)).status, "invalid");
  assert.equal((await f.service.requestVerification()).status, "invalid");
  assert.equal(f.messages.length, 0);
});

test("legacy member sessions without admission still require actual phone proof", async () => {
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

test("changing a phone clears its proof and admission and limits the new session to recovery", async () => {
  for (const admitted of [false, true]) {
    const f = fixture();
    if (admitted) await f.service.register(phone, password, browser());
    else await f.account();
    const logged = await f.service.login(phone, password, address);
    const changed = await f.service.changePhone(replacement, password, { member: await f.sessionService.verify(logged.token) });
    assert.equal(changed.requiresVerification, true);
    assert.equal(await f.sessionService.verify(logged.token), null);
    const member = await f.sessionService.verify(changed.token);
    assert.equal(member, null);
    assert.equal(f.accounts.get(changed.accountId).phoneVerifiedAt, null);
    assert.equal(f.accounts.get(changed.accountId).memberAdmittedAt, null);
    assert.equal(f.messages.length, 0);
  }
});

test("phone change during the recovery cooldown leaves the original number and session usable", async () => {
  const f = fixture(), binding = await f.authenticate();
  f.accounts.get(binding.member.accountId).passwordChangedAt = new Date(f.now());
  const result = await f.service.changePhone(replacement, password, binding);
  assert.equal(result.status, "busy");
  assert.equal((await f.sessionService.verify(binding.token)).phone, phone);
  assert.equal(f.accounts.get(binding.member.accountId).phone, phone);
  assert.equal(f.messages.length, 0);
});

test("only the newest previously delivered account code works after a restart", async () => {
  const f = fixture(), restricted = await pending(f);
  const first = await f.legacyCode(restricted.accountId);
  f.advance(1);
  const latest = await f.legacyCode(restricted.accountId, "654321", "whatsapp");
  assert.equal((await f.restart().verifyAccount(first, restricted.token, address)).status, "unauthorized");
  assert.equal((await f.restart().verifyAccount(latest, restricted.token, address)).status, "authenticated");
});

test("legacy account and reset codes expire at exactly 24 hours and fail closed after five wrong guesses", async () => {
  for (const purpose of ["account", "reset"]) {
    const f = fixture();
    const account = purpose === "account" ? await pending(f) : await f.account();
    const issue = () => f.legacyCode(account.accountId ?? account.id, "123456", "sms", purpose);
    const verify = (code) => purpose === "account" ? f.service.verifyAccount(code, account.token, address)
      : f.service.verifyPasswordReset(phone, code, address);
    const expired = await issue();
    f.advance(DAY);
    assert.equal((await verify(expired)).status, "unauthorized");
    const fresh = await issue();
    for (let i = 0; i < 5; i++) assert.equal((await verify(wrongCode(fresh))).status, "unauthorized");
    assert.equal((await verify(fresh)).status, "unauthorized");
  }
});

test("a password reset code grants only a short reset session and is single-use under concurrency", async () => {
  const f = fixture(), original = await f.authenticate();
  const accountCode = await f.legacyCode(original.member.accountId);
  assert.equal((await f.service.verifyPasswordReset(phone, accountCode, address)).status, "unauthorized");
  const code = await f.legacyResetCode(original.member.accountId);
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

test("password changes are limited across profile and code recovery for exactly 24 hours", async () => {
  const f = fixture(), binding = await f.authenticate();
  const first = await f.service.changePassword("first new password", binding);
  let active = { member: await f.sessionService.verify(first.token), token: first.token };
  const second = await f.service.changePassword("second new password", active);
  assert.equal(second.status, "busy"); assert.match(second.message, /24 hours/iu);
  const code = await f.legacyResetCode(binding.member.accountId);
  const reset = await f.service.verifyPasswordReset(phone, code, address);
  assert.equal((await f.service.resetPassword("second new password", reset.token, address)).status, "busy");
  const login = await f.service.login(phone, "first new password", address);
  assert.equal(login.status, "authenticated"); active = { member: await f.sessionService.verify(login.token), token: login.token };
  f.advance(DAY - 1);
  assert.equal((await f.service.changePassword("second new password", active)).status, "busy");
  f.advance(1);
  const reused = await f.service.changePassword(password, active);
  assert.equal(reused.status, "authenticated");
  assert.equal((await f.service.login(phone, password, address, reused.token)).status, "authenticated");
});

const authRequest = (action, body, token, headers = {}) => new Request(`https://goal.test/api/account/${action}`, { method: "POST",
  headers: { "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", ...(token ? { Cookie: `goal-hint-member=${token}` } : {}), ...headers },
  body: JSON.stringify(body) });
const responseToken = response => /^goal-hint-member=([^;]+)/u.exec(response.headers.getSetCookie()[0] ?? "")?.[1];

test("admin recovery expires exactly 24 hours after generation and preserves the newest request", async () => {
  const f = fixture(), account = await f.account(), admin = randomUUID();
  const created = await f.recovery.request(phone, address);
  assert.equal(created.message, "Your password reset request has been sent to our support team");
  assert.equal((await f.recovery.request(phone, address)).message, "You already have a password reset request. If support is delayed, contact the admin.");
  assert.equal((await f.recovery.request(replacement, address)).status, "requested");
  const [pending] = await f.recovery.listRequests();
  assert.equal(pending.status, "pending");
  assert.equal((await f.recovery.verifyOwnership(pending.id, admin, "payment")).status, "invalid");
  assert.equal((await f.recovery.verifyOwnership(pending.id, admin, "whatsapp")).request.ownershipVerifiedBy, admin);
  const first = (await f.recovery.generateLink(pending.id, admin, 0)).request;
  assert.equal(Date.parse(first.expiresAt) - Date.parse(first.generatedAt), DAY);
  assert.equal((await f.recovery.request(phone, address)).status, "existing");
  f.advance(DAY - 1);
  assert.equal((await f.recovery.validate(first.token, address)).status, "valid");
  assert.equal((await f.restartRecovery().requestDetail(pending.id)).token, first.token);
  f.advance(1);
  assert.equal((await f.recovery.validate(first.token, address)).status, "unusable");
  assert.equal((await f.recovery.requestDetail(pending.id)).status, "expired");
  assert.equal((await f.recovery.requestDetail(pending.id)).token, null);
  const second = (await f.recovery.generateLink(pending.id, admin, 1)).request;
  assert.notEqual(second.token, first.token);
  assert.equal((await f.recovery.validate(second.token, address)).status, "valid");
  assert.equal((await f.recovery.generateLink(pending.id, admin, 1)).status, "conflict");
  f.advance(DAY);
  assert.equal((await f.recovery.request(phone, address)).status, "requested");
  assert.equal((await f.recovery.generateLink(pending.id, admin, 2)).status, "conflict");
  assert.equal(f.passwordRequests.get(pending.id).tokenCiphertext, null);
  assert.equal((await f.recovery.listRequests()).filter(row => row.status === "pending").length, 1);
  assert.equal((await f.service.login(account.phone, password, address)).status, "authenticated");
});

test("manual recovery HTTP keeps secrets out of responses and leaves a failed reset link usable", async () => {
  const f = fixture(), active = await f.authenticate(), admin = randomUUID();
  const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics" } },
    sessions: f.sessionService, passwordRecovery: f.recovery });
  const makeRequest = createPasswordRecoveryHandler("request", source);
  assert.equal((await makeRequest(authRequest("forgot", { phone, channel: "sms" }))).status, 400);
  assert.equal((await makeRequest(authRequest("forgot", { phone }))).status, 200);
  const [pending] = await f.recovery.listRequests();
  await f.recovery.verifyOwnership(pending.id, admin, "call");
  const { request: { token } } = await f.recovery.generateLink(pending.id, admin, 0);
  const validate = createPasswordRecoveryHandler("validate", source), redeem = createPasswordRecoveryHandler("redeem", source);
  const validateRequest = authRequest("password-reset/validate", { token });
  assert.ok(!validateRequest.url.includes(token));
  const valid = await validate(validateRequest);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "no-store");
  assert.deepEqual(await valid.json(), { status: "valid" });
  const mismatch = await redeem(authRequest("password-reset/redeem", { token, password: "x", confirm: "y" }));
  assert.equal(mismatch.status, 400);
  assert.ok(await f.sessionService.verify(active.token));
  assert.equal((await f.recovery.validate(token, address)).status, "valid");
  assert.equal((await redeem(authRequest("password-reset/redeem", { token, password: "x", confirm: "x" }, undefined,
    { "Sec-Fetch-Site": "cross-site" }))).status, 403);
  const completed = await redeem(authRequest("password-reset/redeem", { token, password: "x", confirm: "x" }, active.token));
  assert.equal(completed.status, 200);
  assert.deepEqual(await completed.json(), { status: "completed", message: "Password changed successfully" });
  assert.ok(completed.headers.getSetCookie().every(value => value.includes("Max-Age=0")));
  assert.equal(await f.sessionService.verify(active.token), null);
  assert.equal((await validate(authRequest("password-reset/validate", { token }))).status, 410);
  assert.ok(await verifyPassword("x", f.accounts.get(active.member.accountId).passwordHash));
});

test("changing a registered phone invalidates its reset token and manual recovery proves the replacement", async () => {
  const f = fixture(), active = await f.authenticate(), admin = randomUUID();
  await f.recovery.request(phone, address);
  const [pending] = await f.recovery.listRequests();
  await f.recovery.verifyOwnership(pending.id, admin, "call");
  const { request: { token } } = await f.recovery.generateLink(pending.id, admin, 0);
  const changed = await f.service.changePhone(replacement, password, active);
  assert.equal(changed.requiresVerification, true);
  assert.equal((await f.recovery.validate(token, address)).status, "unusable");
  assert.equal((await f.recovery.requestDetail(pending.id)).status, "cancelled");
  assert.equal((await f.recovery.request(replacement, address)).status, "requested");
  const next = (await f.recovery.listRequests()).find(request => request.status === "pending");
  assert.equal(next.phone, replacement);
  await f.recovery.verifyOwnership(next.id, admin, "sms");
  const { request: current } = await f.recovery.generateLink(next.id, admin, 0);
  assert.equal((await f.recovery.redeem(current.token, password, password, address)).status, "completed");
  assert.equal(await f.service.verificationSession(changed.token), null);
  const login = await f.service.login(replacement, password, address);
  assert.equal((await f.sessionService.verify(login.token)).phoneVerified, true);
});

test("HTTP password change requires a matching nonempty confirmation and stores a one-character password securely", async () => {
  const f = fixture(), logged = await f.authenticate();
  const source = async () => ({ config: { production: false, cookies: { secure: false } }, auth: f.service, sessions: f.sessionService });
  const change = createMemberAuthHandler("password", source);
  for (const body of [{ password: "x" }, { password: "x", confirm: "y" }, { password: "", confirm: "" }]) {
    const response = await change(authRequest("password", body, logged.token));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.ok(await f.sessionService.verify(logged.token));
  }
  const response = await change(authRequest("password", { password: "x", confirm: "x" }, logged.token));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).next, "/en/account?status=password-changed");
  assert.ok(await f.sessionService.verify(responseToken(response)));
  assert.equal(await f.sessionService.verify(logged.token), null);
  assert.ok(await verifyPassword("x", f.accounts.get(logged.member.accountId).passwordHash));
});

test("signed-in users change passwords in Account and cannot submit recovery requests or confirm old codes", async () => {
  const f = fixture(), logged = await f.authenticate();
  const source = async () => ({ config: { production: false, cookies: { secure: false } }, auth: f.service, sessions: f.sessionService,
    passwordRecovery: f.recovery });
  const forgot = createPasswordRecoveryHandler("request", source), legacy = createMemberAuthHandler("reset-code", source);
  for (const response of [await forgot(authRequest("forgot", { phone }, logged.token)),
    await legacy(authRequest("reset-code", { phone, code: "123456" }, logged.token))]) {
    assert.equal(response.status, 409); assert.equal(response.headers.get("set-cookie"), null);
    assert.match((await response.json()).message, /Change password in Account/);
  }
  assert.equal(f.passwordRequests.size, 0); assert.equal(f.challenges.size, 0);
  assert.ok(await f.sessionService.verify(logged.token));
  const changed = await f.service.changePassword("another strong password", { member: logged.member });
  assert.equal(changed.status, "authenticated");
  await f.sessionService.signOut(changed.token);
  assert.equal((await forgot(authRequest("forgot", { phone }))).status, 200);
  assert.equal(f.passwordRequests.size, 1);
  assert.equal(f.challenges.size, 0, "Recovery makes no outbound code request");
});

test("HTTP login reports when another device was signed out and rejects its stale cookie", async () => {
  const f = fixture(); await f.account();
  const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService });
  const login = token => createMemberAuthHandler("login", source)(authRequest("login", { phone, password }, token));
  const first = await login();
  assert.equal(first.status, 200); const firstBody = await first.json();
  assert.equal(firstBody.next, "/en/matches"); assert.equal(firstBody.otherDeviceSignedOut, false);
  const firstToken = responseToken(first), sameBrowser = await login(firstToken);
  assert.equal((await sameBrowser.json()).otherDeviceSignedOut, false);
  f.advance(1);
  const second = await login();
  assert.equal((await second.json()).otherDeviceSignedOut, false);
  assert.ok(await f.sessionService.verify(responseToken(sameBrowser)));
  f.advance(1);
  const third = await login();
  assert.equal((await third.json()).otherDeviceSignedOut, true);
  assert.equal(await f.sessionService.verify(responseToken(sameBrowser)), null);
  assert.ok(await f.sessionService.verify(responseToken(second))); assert.ok(await f.sessionService.verify(responseToken(third)));
});

test("a queued login attempt uses the throttle window active after acquiring the transaction", async () => {
  const start = Date.parse("2026-11-28T09:15:00Z");
  let now = start - 1, writtenWindow;
  const database = { async transaction(run) {
    now = start + 1_500;
    return run({
      async $executeRaw(_sql, _key, window) { writtenWindow = +window; },
      rateLimitBucket: { async findUniqueOrThrow() { return { count: 11 }; } },
    });
  } };
  const check = createMemberRateLimit(database, { key: () => "synthetic-key" }, () => now);
  assert.equal(await check.retryAfter({ purpose: "password-login-phone", value: phone, maximum: 10, windowMs: 900_000 }), 899);
  assert.equal(writtenWindow, start);
});

test("authentication service setup does not depend on subscription settings storage", async () => {
  let databaseOperations = 0;
  const unavailable = async () => { databaseOperations++; throw new Error("Synthetic database outage"); };
  const database = { query: unavailable, transaction: unavailable };
  const config = { production: false, key: () => "synthetic-key" };
  const authServices = await getMemberAuthServices(async () => ({ database, config }));
  assert.ok(authServices.auth);
  assert.ok(authServices.sessions);
  assert.equal(databaseOperations, 0);
  const response = await createMemberAuthHandler("login", async () => authServices)(authRequest("login", { phone, password }));
  assert.equal(response.status, 503, "Only the failed authentication read prevents sign-in");
  assert.equal(databaseOperations, 1);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("login rotates the previous token even if the separate session lookup would fail", async () => {
  const f = fixture(); await f.account();
  const previous = await f.service.login(phone, password, "198.51.100.2");
  let verificationCalls = 0;
  const source = async () => ({ config: { production: false, cookies: { session: "goal-hint-analytics" } },
    auth: f.service, sessions: { async verify() { verificationCalls++; throw new Error("Synthetic session read failure"); } } });
  const response = await createMemberAuthHandler("login", source)(authRequest("login", { phone, password }, previous.token));
  assert.equal(response.status, 200);
  assert.equal(verificationCalls, 0);
  assert.equal(await f.sessionService.verify(previous.token), null);
  assert.ok(await f.sessionService.verify(responseToken(response)));
});

test("successful login goes home while administrator and restricted sessions keep their required destinations", async () => {
  const token = "l".repeat(43);
  const destinations = [{}, { return: "/en/matches/example/home-away" }, { destination: "subscribe" },
    { return: "/en/slips", destination: "subscribe" }, { return: "https://evil.test", destination: "subscribe" },
    { return: "//evil.test", destination: "https://evil.test" }];
  const outcomes = [
    { flags: {}, next: "/en/matches" },
    { flags: { requiresVerification: true }, next: "/en/account?view=verify&return=%2Fen%2Fmatches" },
    { flags: { requiresPasswordChange: true }, next: "/en/account?view=new-password&return=%2Fen%2Fmatches" },
    { flags: { administrator: true }, next: "/admin" },
    { flags: { administrator: true, requiresVerification: true }, next: "/en/account?view=verify&return=%2Fen%2Fmatches" },
    { flags: { administrator: true, requiresPasswordChange: true }, next: "/en/account?view=new-password&return=%2Fen%2Fmatches" },
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

test("explicit checkout journeys survive sign-in, verification and recovery while signup opens Matches", async () => {
  const target = "/en/matches/example/home-away", token = "l".repeat(43);
  for (const [action, method, body] of [["login", "login", { phone, password }], ["register", "register", { phone, password }],
    ["verify", "verifyAccount", { code: "123456" }], ["reset-code", "verifyPasswordReset", { phone, code: "123456" }], ["reset", "resetPassword", { password }]]) {
    for (const returnTo of [target, "//other.test", "/en/subscribe", "/en/slips\n", "/admin/payments?paymentId=7d444840-9dc0-4f60-9b18-050fc43b8813"]) {
      const restricted = action === "reset-code";
      const source = async () => ({ config: { production: false, cookies: { session: "goal-hint-analytics" } }, sessions: { async verify() { return null; } },
        auth: { async [method]() { return { status: "authenticated", token, phone, requiresPasswordChange: restricted }; } } });
      const response = await createMemberAuthHandler(action, source)(authRequest(action, { ...body, checkout: "1", return: returnTo }));
      assert.equal(response.status, 200);
      const redirect = new URL((await response.json()).next, "https://goal-hint.test");
      const keepsCheckout = action !== "register" && returnTo === target;
      assert.equal(redirect.pathname, restricted ? "/en/account" : keepsCheckout ? "/en/subscribe" : "/en/matches");
      assert.equal(redirect.searchParams.get("view"), restricted ? "new-password" : null);
      assert.equal(redirect.searchParams.get("checkout"), keepsCheckout ? "1" : null);
      assert.equal(redirect.searchParams.get("return"), keepsCheckout ? target : null);
    }
  }
});

test("established sign-in journeys preserve allowed returns and completed signup opens Matches", async () => {
  const shared = `/s/${"a".repeat(32)}`, review = "/admin/payments?paymentId=7d444840-9dc0-4f60-9b18-050fc43b8813";
  const token = "j".repeat(43);
  for (const action of ["login", "register", "verify", "reset"]) {
    for (const flags of [{}, { requiresVerification: true }, { requiresPasswordChange: true }]) {
      const result = { status: "authenticated", token, phone, ...flags };
      const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics" } },
        sessions: { async verify() { return null; } }, auth: {
          async login() { return result; }, async register() { return result; }, async verifyAccount() { return result; }, async resetPassword() { return result; },
        } });
      const body = action === "verify" ? { code: "123456" } : action === "reset" ? { password } : { phone, password };
      const response = await createMemberAuthHandler(action, source)(authRequest(action, { ...body, return: shared }));
      assert.equal(response.status, 200);
      const next = (await response.json()).next;
      if (flags.requiresVerification || flags.requiresPasswordChange) {
        const url = new URL(next, "https://goal-hint.test");
        assert.equal(url.pathname, "/en/account");
        assert.equal(url.searchParams.get("view"), flags.requiresVerification ? "verify" : "new-password");
        assert.equal(url.searchParams.get("return"), shared);
      } else assert.equal(next, action === "register" ? "/en/matches" : shared);
    }
  }
  for (const administrator of [false, true]) for (const destination of [review, `${review}&action=approve`, "https://other.test"]) {
    const source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } },
      sessions: { async verify() { return null; } }, auth: { async login() { return { status: "authenticated", token, phone, administrator }; } } });
    const response = await createMemberAuthHandler("login", source)(authRequest("login", { phone, password, return: destination }));
    assert.equal((await response.json()).next, administrator ? destination === review ? review : "/admin" : "/en/matches");
  }
});

test("HTTP registers a usable member immediately and preserves a restricted HttpOnly reset cookie", async () => {
  const f = fixture(), source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService });
  const handle = (action, body, token) => createMemberAuthHandler(action, source)(authRequest(action, body, token));
  const registration = await handle("register", { phone, password, return: "/en/matches/example/home-away", checkout: "1" });
  assert.equal(registration.status, 200);
  const result = await registration.json();
  assert.equal(result.next, "/en/matches"); assert.equal(result.requiresVerification, undefined); assert.equal(result.trial.active, true);
  const memberToken = responseToken(registration);
  assert.equal((await f.sessionService.verify(memberToken)).phoneVerified, false);
  assert.match(registration.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
  const retired = await handle("verification", { channel: "whatsapp" }, memberToken);
  assert.equal(retired.status, 400); assert.equal(retired.headers.get("set-cookie"), null); assert.equal(f.messages.length, 0);
  const memberAccount = await f.sessionService.verify(memberToken);
  const code = await f.legacyResetCode(memberAccount.accountId);
  const reset = await handle("reset-code", { phone, code });
  assert.equal(reset.status, 200); assert.equal((await reset.json()).requiresPasswordChange, true);
  const resetToken = responseToken(reset); assert.equal(await f.sessionService.verify(resetToken), null);
  assert.match(reset.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Max-Age=900/u);
  const completed = await handle("reset", { password: "replacement HTTP password" }, resetToken);
  assert.equal(completed.status, 200); assert.equal((await completed.json()).next, "/en/matches");
  const completedToken = responseToken(completed);
  assert.ok(completedToken); assert.notEqual(completedToken, resetToken);
  assert.equal((await f.sessionService.verify(completedToken)).phoneVerified, true);
  assert.equal(await f.sessionService.verify(memberToken), null);
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
      assert.equal(result.next, requiresVerification ? "/en/account?view=verify&return=%2Fen%2Fmatches" : "/en/matches");
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
    assert.equal(response.status, 200); assert.equal((await response.json()).next, "/en/matches");
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
    assert.equal(response.status, 200); assert.equal((await response.json()).next, "/en/matches");
    assert.equal(responseToken(response), token);
    assert.match(response.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax/u);
  }
});

test("all verification writes reject cross-site requests before storage and whitelist request fields", async () => {
  for (const [action, body] of [["verification", { channel: "sms" }], ["verify", { code: "123456" }], ["reset-code", { phone, code: "123456" }]]) {
    const response = await createMemberAuthHandler(action, async () => { assert.fail("Cross-site writes cannot reach storage"); })(
      authRequest(action, body, undefined, { Origin: "https://evil.test", "Sec-Fetch-Site": "cross-site" }));
    assert.equal(response.status, 403); assert.equal(response.headers.get("set-cookie"), null);
    const extra = await createMemberAuthHandler(action, async () => { assert.fail("Unexpected fields cannot reach storage"); })(authRequest(action, { ...body, accountId: "other-account" }));
    assert.equal(extra.status, 400);
  }
  const f = fixture(), source = async () => ({ config: { production: false, cookies: { secure: false, session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude" } }, auth: f.service, sessions: f.sessionService });
  assert.equal((await createMemberAuthHandler("verification", source)(authRequest("verification", { channel: "sms" }))).status, 400);
});

test("recovery cannot reset administrator environment credentials and requires same-origin HTTP", async () => {
  const f = fixture({ admins: [phone] }); await f.account();
  assert.equal((await f.recovery.request(phone, address)).status, "requested");
  assert.equal(f.passwordRequests.size, 0);
  const response = await createPasswordRecoveryHandler("request", async () => { assert.fail("Cross-site requests cannot reach storage"); })(
    new Request("https://goal.test/api/account/forgot", { method: "POST", headers: { Origin: "https://evil.test", "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }));
  assert.equal(response.status, 403);
  assert.deepEqual(parseMemberAdminPhones(JSON.stringify([phone, phone])), [phone]);
  assert.equal(isMemberAdminPhone(phone, { GOAL_HINT_ADMIN_PHONES: JSON.stringify([phone]) }), true);
});


test("registration starts the configured trial immediately with the server clock and no message", async () => {
  const f = fixture({ trialDays: 5 }), registered = await f.service.register(phone, password, browser());
  const codes = createAccessCodes({ database: f.database, now: f.now });
  const handler = createMemberTrialHandler(async () => ({ config: { production: false }, settings: { settings: f.settings }, sessions: f.sessionService, codes }));
  const request = (token, site = "same-origin") => new Request("https://goal.test/api/account/trial", { method: "POST",
    headers: { "Sec-Fetch-Site": site, ...(token ? { Cookie: "goal-hint-member=" + token } : {}) } });
  assert.equal(registered.requiresVerification, undefined);
  assert.deepEqual(registered.trial, { active: true, days: 5, startsAt: new Date(f.now()).toISOString(), endsAt: new Date(f.now() + 5 * DAY).toISOString() });
  assert.equal(f.accounts.get(registered.accountId).trialEligibleAt, null);
  assert.equal(f.accessCodes.size, 1); assert.equal(f.messages.length, 0); assert.equal(f.challenges.size, 0);
  assert.equal((await handler(request(registered.token))).status, 403);
  assert.equal((await handler(request(registered.token, "cross-site"))).status, 403);
  assert.equal((await handler(request())).status, 403);
  const period = [...f.accessCodes.values()][0];
  assert.equal(period.source, "trial"); assert.equal(period.priceUgx, 0); assert.equal(period.amountReceivedUgx, 0);
  assert.equal(+period.activatedAt, f.now());
  assert.equal(f.sent.filter(row => row.action === "trial_activated").length, 1);
  f.advance(5 * DAY);
  const login = await f.service.login(phone, password, address);
  assert.ok(await f.sessionService.verify(login.token)); assert.equal(f.accessCodes.size, 1);
});

test("a disabled offer permits registration and can never be activated later", async () => {
  for (const disable of [settings => { settings.trialDays = 0; }, settings => { settings.paywallMode = "off"; }]) {
    const f = fixture({ trialDays: 7 });
    disable(f.settings);
    const registered = await f.service.register(phone, password, browser());
    assert.ok(await f.sessionService.verify(registered.token)); assert.equal(registered.trial, undefined);
    Object.assign(f.settings, { trialDays: 14, paywallMode: "on" });
    const codes = createAccessCodes({ database: f.database, now: f.now });
    assert.deepEqual(await codes.activateTrial(await f.sessionService.verify(registered.token)), { state: "forbidden" });
    assert.equal(f.accessCodes.size, 0);
  }
});

test("a legacy signup claim uses the original creation date and refuses an elapsed trial", async () => {
  for (const elapsed of [DAY, 3 * DAY]) {
    const f = fixture({ trialDays: 3 });
    const createdAt = new Date(f.now());
    const account = await f.account({ trialEligibleAt: createdAt });
    f.advance(elapsed);
    const signedIn = await f.service.login(account.phone, password, address);
    const member = await f.sessionService.verify(signedIn.token);
    const codes = createAccessCodes({ database: f.database, now: f.now });
    const claim = await codes.activateTrial(member);
    if (elapsed === 3 * DAY) {
      assert.deepEqual(claim, { state: "unavailable" });
      assert.equal(f.accessCodes.size, 0);
    } else {
      assert.deepEqual(claim, { state: "active", startsAt: createdAt.toISOString(), endsAt: new Date(+createdAt + 3 * DAY).toISOString() });
      assert.equal(+[...f.accessCodes.values()][0].activatedAt, f.now());
      assert.deepEqual(await codes.activateTrial(member), claim);
      assert.equal(f.accessCodes.size, 1);
    }
  }
});

test("concurrent duplicate registration creates one account, trial and session", async () => {
  const f = fixture({ trialDays: 3 });
  const results = await Promise.all([f.service.register(phone, password, browser()), f.service.register(phone, password, browser())]);
  assert.deepEqual(results.map(result => result.status).sort(), ["authenticated", "conflict"]);
  assert.equal(results.find(result => result.status === "authenticated").trial.days, 3);
  assert.equal(f.accounts.size, 1); assert.equal(f.accessCodes.size, 1); assert.equal(f.sessions.size, 1);
  assert.equal(f.sent.filter(row => row.action === "trial_activated").length, 1);
});

test("failed registration rolls back its account, trial, session and audit", async () => {
  const f = fixture();
  f.tx.memberSession.create = async () => { throw new Error("Synthetic session failure"); };
  await assert.rejects(f.service.register(phone, password, browser()), /Synthetic session failure/);
  assert.equal(f.accounts.size, 0); assert.equal(f.accessCodes.size, 0); assert.equal(f.sessions.size, 0); assert.equal(f.sent.length, 0);
});

test("a rolled-back trial reference collision retries registration without duplicate records", async () => {
  const f = fixture(), create = f.tx.accessCode.create.bind(f.tx.accessCode);
  let attempts = 0;
  f.tx.accessCode.create = async query => {
    if (++attempts === 1) throw new DatabaseOperationError("constraint");
    return create(query);
  };
  const result = await f.service.register(phone, password, browser());
  assert.equal(result.status, "authenticated"); assert.equal(attempts, 2);
  assert.equal(f.accounts.size, 1); assert.equal(f.accessCodes.size, 1); assert.equal(f.sessions.size, 1);
  assert.equal([...f.accessCodes.values()][0].accountId, result.accountId);
});

test("the first paid grant forfeits a legacy unused offer and follows a complete automatic trial", async () => {
  for (const automatic of [false, true]) {
    const f = fixture({ trialDays: 3 });
    const accountId = automatic ? (await f.service.register(phone, password, browser())).accountId
      : (await f.account({ trialEligibleAt: new Date(f.now()) })).id;
    const trialEnd = f.now() + 3 * DAY;
    if (automatic) await f.database.transaction(async tx => {
      const account = await lockMemberAccount(tx, accountId);
      await createAccessPeriod(tx, account, { source: "referral", planName: "Earned day", durationDays: 1, priceUgx: 0 }, "test", new Date(f.now()));
    });
    f.advance(DAY / 2);
    const paid = await f.database.transaction(async tx => {
      const account = await lockMemberAccount(tx, accountId);
      return createAccessPeriod(tx, account, { source: "payment", planName: "Weekly", durationDays: 7, priceUgx: 5_000 },
        "test", new Date(f.now()), { appendAfterCurrent: true });
    });
    assert.equal(+paid.startsAt, automatic ? trialEnd : f.now());
    assert.equal(+paid.endsAt - +paid.startsAt, 7 * DAY);
    if (automatic) {
      const reward = [...f.accessCodes.values()].find(code => code.source === "referral");
      assert.equal(+reward.startsAt, +paid.endsAt);
      assert.equal(f.sent.filter(row => row.action === "trial_converted").length, 1);
    } else {
      assert.equal(+f.accounts.get(accountId).trialForfeitedAt, f.now());
      assert.equal(f.sent.filter(row => row.action === "trial_forfeited").length, 1);
    }
  }
});

test("trial expiry does not spend wallet credit through auto-renewal", async () => {
  const instant = Date.parse("2026-10-27T09:00:00Z"), f = memberStore({ instant, settings: { paywallMode: "on" } });
  await f.tx.memberAccount.update({ where: { id: f.account.id }, data: { autoRenew: true, autoRenewPlanId: f.plan.id, creditUgx: f.plan.priceUgx } });
  await f.tx.accessCode.create({ data: { id: randomUUID(), accountId: f.account.id, source: "trial", startsAt: new Date(instant - DAY), endsAt: new Date(instant) } });
  const codes = createAccessCodes({ database: f.database, now: () => instant });
  assert.equal(await codes.renewDue(f.account.id), "skipped");
  assert.equal(f.state.walletEntry.length, 0); assert.equal(f.member.creditUgx, f.plan.priceUgx);
});

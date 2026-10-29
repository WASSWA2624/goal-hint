import assert from "node:assert/strict";
import test from "node:test";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { createMemberSessions, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createMemberPreferences } from "../src/server/members/member-preferences.ts";
import { createMemberPreferencesHandler } from "../src/server/members/member-preferences-http.ts";

const at = new Date("2026-10-29T09:00:00.000Z"), token = "t".repeat(43);
const request = (body, headers = {}) => new Request("http://localhost:3000/api/account/preferences", { method: "POST",
  headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/json", cookie: `goal-hint-member=${token}`, ...headers },
  body: JSON.stringify(body) });

function fixture() {
  const account = { id: "account-one", phone: "256772123456", phoneVerifiedAt: at, passwordHash: "test-hash", erasedAt: null,
    blockedAt: null, whatsappNotificationsAt: null };
  const session = { tokenHash: memberTokenHash(token), accountId: account.id, account, authenticatedAt: at, passwordResetAt: null,
    expiresAt: new Date(+at + 86_400_000), lastSeenAt: at, codeEnteredAt: null, accessCodeId: null };
  const writes = [], locks = [];
  let present = true;
  const tx = { async $queryRaw(...args) { locks.push(args); return []; }, memberSession: {
    async findUnique({ where }) { return present && where.tokenHash === session.tokenHash ? session : null; },
  }, memberAccount: { async update({ where, data }) { assert.equal(where.id, account.id); writes.push(data); Object.assign(account, data); return account; } } };
  const database = { async query(run) { return run(tx); }, async transaction(run) { return run(tx); } };
  const config = { production: false, key() { return "test-key"; } };
  const sessions = createMemberSessions({ database, config, now: () => +at, adminPhone: () => false, adminPasswordHash: () => null });
  const preferences = createMemberPreferences({ database, now: () => +at });
  const services = { config, sessions, preferences, settings: { settings: defaultSubscriptionSettings, source: "defaults" } };
  return { account, session, writes, locks, sessions, preferences, services, handler: createMemberPreferencesHandler(async () => services), endSession() { present = false; } };
}

test("an authenticated account can explicitly enable and withdraw WhatsApp updates while subscriptions are closed", async () => {
  const f = fixture();
  assert.equal((await f.sessions.verify(token)).whatsappNotificationsAt, null);
  const enabled = await f.handler(request({ whatsappNotifications: true }));
  assert.equal(enabled.status, 200);
  assert.deepEqual(await enabled.json(), { status: "saved", whatsappNotificationsAt: at.toISOString() });
  assert.equal(f.writes.length, 1);
  assert.equal(+f.account.whatsappNotificationsAt, +at);
  assert.equal(+(await f.sessions.verify(token)).whatsappNotificationsAt, +at);
  assert.equal((await f.handler(request({ whatsappNotifications: true }))).status, 200);
  assert.equal(f.writes.length, 1, "Repeated consent keeps the original timestamp.");
  const disabled = await f.handler(request({ whatsappNotifications: false }));
  assert.equal(disabled.status, 200);
  assert.deepEqual(await disabled.json(), { status: "saved", whatsappNotificationsAt: null });
  assert.equal(f.account.whatsappNotificationsAt, null);
  assert.equal(f.writes.length, 2);
  assert.equal(f.locks.length, 3, "Each preference mutation rechecks the locked account.");
});

test("cross-site, unsigned, blocked and malformed preference changes write no consent", async () => {
  for (const [body, headers, status] of [
    [{ whatsappNotifications: true }, { "sec-fetch-site": "cross-site" }, 403],
    [{ whatsappNotifications: true }, { cookie: "" }, 403],
    [{ whatsappNotifications: "true" }, {}, 400],
    [{ whatsappNotifications: true, accountId: "another-account" }, {}, 400],
    [{}, {}, 400],
  ]) {
    const f = fixture(), response = await f.handler(request(body, headers));
    assert.equal(response.status, status);
    assert.equal(f.writes.length, 0);
  }
  const blocked = fixture(); blocked.account.blockedAt = at;
  assert.equal((await blocked.handler(request({ whatsappNotifications: true }))).status, 403);
  assert.equal(blocked.writes.length, 0);
  const ended = fixture(); ended.endSession();
  assert.equal((await ended.handler(request({ whatsappNotifications: true }))).status, 403);
  assert.equal(ended.writes.length, 0);
});

test("the consent service rechecks session ownership, authentication and recipient phone before writing", async () => {
  for (const change of [
    f => f.endSession(),
    f => { f.session.authenticatedAt = null; },
    f => { f.session.passwordResetAt = at; },
    f => { f.session.expiresAt = at; },
    f => { f.session.accountId = "another-account"; },
    f => { f.account.erasedAt = at; },
    f => { f.account.phoneVerifiedAt = null; },
    f => { f.account.phone = "256752123456"; },
  ]) {
    const f = fixture(), member = await f.sessions.verify(token);
    change(f);
    assert.deepEqual(await f.preferences.setWhatsAppNotifications(member, true), { status: "refused" });
    assert.equal(f.writes.length, 0);
  }
});

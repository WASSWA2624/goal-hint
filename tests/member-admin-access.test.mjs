import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { adminRoute } from "../src/server/admin/admin-http.ts";
import { createSettingsHandlers } from "../src/server/admin/settings-http.ts";
import { createOwnerLogoutHandler, verifyOwner } from "../src/server/admin/owner-auth.ts";
import { createLogoutHandler, createSettingsHandlers as createAnalyticsSettingsHandlers, requireAdmin, verifyAdminSession } from "../src/server/analytics/analytics-http.ts";
import { defaultSubscriptionSettings } from "../src/domain/subscription-settings.ts";
import { createMemberSessions, memberTokenHash } from "../src/server/members/member-sessions.ts";
import { createSettingsService } from "../src/server/members/settings.ts";
import { createViewerAccess } from "../src/server/members/viewer-access.ts";

import { hashPassword } from "../src/server/analytics/analytics-password.ts";

const adminHash = await hashPassword("synthetic administrator password");
const key = (purpose, value) => createHmac("sha256", "synthetic-member-admin").update(`${purpose}\0${value}`).digest("hex");
const phone = "256700000991", regularPhone = "256700000992", token = "s".repeat(43);
const sameOrigin = { "sec-fetch-site": "same-origin" };
function allowlist(run) {
  const previous = process.env.GOAL_HINT_ADMIN_PHONES, previousHash = process.env.GOAL_HINT_ADMIN_PASSWORD_HASH;
  process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = adminHash;
  process.env.GOAL_HINT_ADMIN_PHONES = JSON.stringify([phone]);
  return Promise.resolve().then(run).finally(() => {
    if (previousHash === undefined) delete process.env.GOAL_HINT_ADMIN_PASSWORD_HASH;
    else process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = previousHash;
    if (previous === undefined) delete process.env.GOAL_HINT_ADMIN_PHONES;
    else process.env.GOAL_HINT_ADMIN_PHONES = previous;
  });
}
const request = (method = "GET", headers = {}, body) => new Request("http://localhost:3000/api/admin/test", {
  method, headers: { cookie: `goal-hint-member=${token}`, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

function fixture() {
  const at = new Date(), accountId = randomUUID(), audits = [], reads = [];
  const row = { tokenHash: memberTokenHash(token), accountId, createdAt: at, lastSeenAt: at,
    authenticatedAt: at, adminPasswordVersion: key("admin-password-version", adminHash), expiresAt: new Date(+at + 86_400_000), codeEnteredAt: null, accessCodeId: null,
    account: { id: accountId, phone, passwordHash: null, blockedAt: null, erasedAt: null } };
  let present = true;
  const tx = { memberSession: {
    async findUnique({ where }) { reads.push(where.tokenHash); return present && where.tokenHash === row.tokenHash ? row : null; },
    async deleteMany({ where }) { if (where.tokenHash === row.tokenHash && present) { present = false; return { count: 1 }; } return { count: 0 }; },
    async updateMany() { return { count: 1 }; },
  } };
  const config = { production: false, cookies: { session: "owner", secure: false }, key };
  const database = { async query(run) { return run(tx); } };
  const services = { config, database, auth: null, collector: null, reporter: null, retention: null, limiter: {} };
  return { row, services, reads, audits };
}

test("dashboard policy requires an authenticated, current, unblocked allowlisted account for pages and requests", () => allowlist(async () => {
  const f = fixture(), { row, services } = f;
  const identity = await requireAdmin(services, request());
  assert.equal(identity.memberAccountId, row.accountId);
  assert.equal(identity.username, `member-admin:${row.accountId}`);
  assert.ok(!identity.username.includes(phone), "Audit identity never embeds a phone number");
  assert.deepEqual(await verifyOwner(services, token), identity, "Page gate shares the same policy");
  for (const cookie of ["", "goal-hint-member=forged", `goal-hint-member=${"f".repeat(43)}`, `phone=${phone}`]) {
    assert.equal(await requireAdmin(services, request("GET", { cookie })), null);
  }
  for (const [field, value] of [["authenticatedAt", null], ["expiresAt", new Date(0)]]) {
    const before = row[field]; row[field] = value;
    assert.equal(await requireAdmin(services, request()), null, field);
    row[field] = before;
  }
  for (const field of ["blockedAt", "erasedAt"]) {
    row.account[field] = new Date();
    assert.equal(await requireAdmin(services, request()), null, field);
    row.account[field] = null;
  }
  row.adminPasswordVersion = null;
  assert.equal(await requireAdmin(services, request()), null, "A pre-existing member cookie cannot elevate when its phone becomes allowlisted");
  row.adminPasswordVersion = key("admin-password-version", adminHash);
  process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = await hashPassword("rotated administrator password");
  assert.equal(await requireAdmin(services, request()), null, "Password rotation invalidates administrative privilege");
  process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = adminHash;
  row.account.passwordHash = "a registered password hash";
  row.account.phone = regularPhone;
  assert.equal(await requireAdmin(services, request()), null, "A password-authenticated regular member is not an administrator");
  row.account.phone = phone;
  process.env.GOAL_HINT_ADMIN_PHONES = "[]";
  assert.equal(await requireAdmin(services, request()), null, "Removing the number immediately removes dashboard access, even with a password");
  row.account.passwordHash = null;
  assert.equal(await createMemberSessions({ database: services.database, config: services.config }).verify(token), null,
    "Removed passwordless administrators also lose their member session");
}));

test("both dashboard reads and writes use verified member authorization and reject cross-site writes before lookup", () => allowlist(async () => {
  const f = fixture(), accepted = [];
  const route = adminRoute(async ({ owner, request }) => { accepted.push([owner.memberAccountId, request.method]); return Response.json({ ok: true }); },
    { services: async () => f.services });
  assert.equal((await route(request())).status, 200);
  assert.equal((await route(request("POST", sameOrigin))).status, 200);
  const before = f.reads.length;
  assert.equal((await route(request("POST", { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal(f.reads.length, before);
  assert.deepEqual(accepted, [[f.row.accountId, "GET"], [f.row.accountId, "POST"]]);
  process.env.GOAL_HINT_ADMIN_PHONES = "[]";
  assert.equal((await route(request())).status, 401);
  assert.equal((await route(request("POST", sameOrigin))).status, 401);
}));

test("legacy owner sessions cannot authorize pages, requests or another member's session", () => allowlist(async () => {
  const f = fixture(), owner = { username: "owner", expiresAt: new Date(Date.now() + 1000) };
  let ownerReads = 0;
  f.services.auth = { async verify() { ownerReads++; return owner; } };
  assert.equal(await verifyAdminSession(f.services, "existing-owner-token"), null);
  assert.equal(await requireAdmin(f.services, request("GET", { cookie: "owner=existing-owner-token" })), null);
  assert.equal((await requireAdmin(f.services, request("GET", { cookie: `owner=existing-owner-token; goal-hint-member=${token}` }))).memberAccountId, f.row.accountId);
  for (const change of [() => { f.row.account.phone = regularPhone; f.row.account.passwordHash = "registered password"; f.row.account.phoneVerifiedAt = new Date(); },
    () => { f.row.account.phone = phone; f.row.authenticatedAt = null; }, () => { f.row.authenticatedAt = new Date(); f.row.passwordResetAt = new Date(); },
    () => { f.row.passwordResetAt = null; f.row.account.blockedAt = new Date(); }]) {
    change();
    assert.equal(await requireAdmin(f.services, request("GET", { cookie: `owner=existing-owner-token; goal-hint-member=${token}` })), null);
  }
  assert.equal(ownerReads, 0, "Legacy owner authorization is never consulted.");
}));

test("analytics reads and writes share the member authorization policy and withdraw it immediately", () => allowlist(async () => {
  const f = fixture(), changed = [];
  f.services.reporter = {};
  f.services.retention = { async state() { return { days: 120 }; }, async setRetentionDays(days) { changed.push(days); },
    async purge() { return { purged: 0 }; } };
  const handlers = createAnalyticsSettingsHandlers(async () => f.services);
  assert.equal((await handlers.GET(request())).status, 200);
  assert.equal((await handlers.POST(request("POST", sameOrigin, { action: "retention", days: 120 }))).status, 200);
  assert.deepEqual(changed, [120]);
  assert.equal((await handlers.POST(request("POST", { "sec-fetch-site": "cross-site" }, { action: "retention", days: 30 }))).status, 403);
  process.env.GOAL_HINT_ADMIN_PHONES = "[]";
  assert.equal((await handlers.GET(request())).status, 401);
  assert.equal((await handlers.POST(request("POST", sameOrigin, { action: "retention", days: 30 }))).status, 401);
  assert.deepEqual(changed, [120]);
}));

test("logout from either dashboard revokes the member session so a copied cookie cannot be replayed", () => allowlist(async () => {
  for (const make of [createLogoutHandler, (services) => createOwnerLogoutHandler({ services, audit: () => {} })]) {
    const f = fixture(), handler = make(async () => f.services);
    assert.ok(await requireAdmin(f.services, request()));
    const denied = await handler(request("POST", { "sec-fetch-site": "cross-site" }));
    assert.equal(denied.status, 403);
    assert.ok(await requireAdmin(f.services, request()));
    const response = await handler(request("POST", sameOrigin));
    assert.equal(response.status, 303);
    assert.ok(response.headers.getSetCookie().some(value => /^goal-hint-member=; .*Max-Age=0/u.test(value)));
    assert.equal(await requireAdmin(f.services, request()), null);
  }
}));

test("allowlisted authenticated members receive full content without a subscription while ordinary no-password rows remain invalid", () => allowlist(async () => {
  const at = new Date(), row = { accountId: randomUUID(), phone, passwordHash: null, adminPasswordVersion: key("admin-password-version", adminHash), blockedAt: null, lastSeenAt: at, entitled: 0 };
  let legacy = false, erased = false, expired = false, unavailableSettings = false, reads = 0;
  const resolver = createViewerAccess({ now: () => +at,
    settings: async () => unavailableSettings ? { settings: null, source: "unavailable" } : { settings: { ...defaultSubscriptionSettings, paywallMode: "on" } },
    services: async () => ({ config: { production: false, cookies: { session: "owner" }, key }, auth: null,
      database: { async query(run) { return run({ async $queryRaw(strings) {
        reads++;
        assert.match(strings.join(""), /s\.authenticatedAt IS NOT NULL/u);
        assert.match(strings.join(""), /s\.expiresAt >/u);
        assert.match(strings.join(""), /a\.erasedAt IS NULL/u);
        return legacy || erased || expired ? [] : [row];
      } }); } } }) });
  const cookies = name => name === "goal-hint-member" ? token : undefined;
  assert.deepEqual(await resolver(cookies), { tier: "full", signedIn: true, mode: "on" });
  row.adminPasswordVersion = null;
  assert.equal((await resolver(cookies)).tier, "free", "Allowlisted member cookies without the env credential cannot elevate");
  row.adminPasswordVersion = "f".repeat(64);
  assert.equal((await resolver(cookies)).tier, "free");
  row.adminPasswordVersion = key("admin-password-version", adminHash);
  process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = await hashPassword("rotated administrator password");
  assert.equal((await resolver(cookies)).tier, "free", "Rotating the configured password removes old session privilege");
  process.env.GOAL_HINT_ADMIN_PASSWORD_HASH = adminHash;
  unavailableSettings = true;
  assert.equal((await resolver(cookies)).tier, "full");
  unavailableSettings = false;
  for (const flag of ["legacy", "erased", "expired"]) {
    legacy = flag === "legacy"; erased = flag === "erased"; expired = flag === "expired";
    assert.deepEqual(await resolver(cookies), { tier: "free", signedIn: false, mode: "on" }, flag);
  }
  legacy = erased = expired = false;
  row.blockedAt = at;
  assert.equal((await resolver(cookies)).tier, "free");
  row.blockedAt = null;
  process.env.GOAL_HINT_ADMIN_PHONES = "[]";
  assert.deepEqual(await resolver(cookies), { tier: "free", signedIn: false, mode: "on" });
  row.passwordHash = "registered password";
  assert.deepEqual(await resolver(cookies), { tier: "free", signedIn: true, mode: "on" });
  row.entitled = 1n;
  assert.equal((await resolver(cookies)).tier, "full", "Ordinary paid access is preserved");
  const before = reads;
  assert.equal((await resolver(() => "forged")).signedIn, false);
  assert.equal(reads, before, "Malformed member tokens never reach storage");
}));

test("protected settings accept the verified administrative session without an old password and ignore client authorization claims", () => allowlist(async () => {
  const f = fixture(), audit = [], now = new Date();
  const stored = { ...defaultSubscriptionSettings, id: 1, paymentNumbersChangedAt: null, lastMembersPurgeAt: null, updatedAt: now, updatedBy: "owner" };
  const tx = { subscriptionSettings: { async findUnique() { return stored; }, async findUniqueOrThrow() { return stored; },
    async update({ data }) { Object.assign(stored, data); return stored; } },
    async $executeRaw() { return 1; }, async $queryRaw() { return []; },
    ownerAuditEvent: { async create({ data }) { audit.push(data); } } };
  const database = { async query(run) { return run(tx); }, async transaction(run) { return run(tx); } };
  const settings = createSettingsService(database, { environment: null });
  const handlers = createSettingsHandlers({ service: () => settings });
  const owner = await requireAdmin(f.services, request());
  const response = await handlers.POST({ owner, services: { database, auth: null }, request: request("POST", { "content-type": "application/json" },
    { action: "save", changes: { contactPhone: regularPhone } }) });
  assert.equal(response.status, 200);
  assert.equal(stored.contactPhone, regularPhone);
  assert.equal(audit[0].actor, owner.username);
  assert.equal(audit[0].details.passwordConfirmed, false);
  assert.equal(audit[0].details.sessionAuthorized, true);
  const spoof = await handlers.POST({ owner: { username: "owner", expiresAt: now }, services: { database, auth: null },
    request: request("POST", { "content-type": "application/json" }, { action: "save", changes: { contactPhone: phone }, sessionAuthorized: true }) });
  assert.equal(spoof.status, 403);
  assert.equal((await spoof.json()).error, "password-required");
  assert.equal(stored.contactPhone, regularPhone);
}));

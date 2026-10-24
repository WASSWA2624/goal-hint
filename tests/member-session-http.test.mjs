import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createMemberSessionHandler } from "../src/server/members/member-auth-http.ts";
import { createAccessCodes } from "../src/server/members/access-codes.ts";
import { silentPaymentNotifications } from "./helpers/payment-notification-fixtures.mjs";
import { fixtureAdminPhone, installAdminFixtureEnvironment } from "./helpers/admin-fixtures.mjs";

after(installAdminFixtureEnvironment());
const token = "m".repeat(43);
test("navigation role and phone come from the same verified member, ignoring legacy owner cookies", async () => {
  const cases = [[null, false], [{ phone: "256700000101" }, false], [{ phone: "256700000101", administrator: true }, false],
    [{ phone: fixtureAdminPhone }, false], [{ phone: fixtureAdminPhone, administrator: true }, true],
    [{ phone: fixtureAdminPhone, administrator: true, blocked: true }, false]];
  for (const [member, administrator] of cases) for (const owner of ["", "; owner-session=opaque-owner-token"]) {
    const handler = createMemberSessionHandler(async () => ({ config: { production: false }, sessions: { async verify(value) {
      assert.equal(value, token); return member;
    } }, codes: { async subscriptionStatus() { return { activeUntil: null, paymentPending: false }; } } }));
    const response = await handler(new Request("http://localhost/api/account/session", { headers: { Cookie: `goal-hint-member=${token}${owner}` } }));
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/u);
    assert.deepEqual(await response.json(), { phone: member?.phone ?? null, administrator,
      subscription: { activeUntil: null, paymentPending: false, canSubscribe: false } });
  }
});

const instant = Date.parse("2026-10-24T10:00:00Z"), hour = 3_600_000;
const period = (from, to, revoked = false) => ({ startsAt: new Date(instant + from * hour), endsAt: new Date(instant + to * hour), revokedAt: revoked ? new Date(instant) : null });
function subscriptionFixture({ periods = [], status = null, mode = "on", blocked = false, sessionChange = {}, accountChange = {} } = {}) {
  const member = { phone: "256700000101", accountId: "account", tokenHash: "session", blocked, codeEnteredAt: null };
  const account = { blockedAt: null, erasedAt: null, codes: periods,
    submissions: status ? [{ status, endsAt: new Date(instant + 999 * hour) }] : [], ...accountChange };
  const stored = sessionChange === null ? null : { accountId: member.accountId, authenticatedAt: new Date(instant - hour), passwordResetAt: null,
    expiresAt: new Date(instant + 500 * hour), account, ...sessionChange };
  const queries = [];
  const database = { query: run => run({ memberSession: { async findUnique(query) { queries.push(query); return stored; } } }) };
  const codes = createAccessCodes({ database, now: () => instant, notifications: silentPaymentNotifications });
  const services = { config: { production: false }, settings: { settings: mode === null ? null : { paywallMode: mode } },
    sessions: { async verify() { return member; } }, codes };
  const handler = createMemberSessionHandler(async () => services);
  return { member, services, queries, handler, request: () => handler(new Request("http://localhost/api/account/session")) };
}

test("private subscription summary uses active periods and uninterrupted renewals independently of the latest payment", async () => {
  for (const status of ["pending", "rejected", "approved", "reversed", null]) {
    const f = subscriptionFixture({ status, periods: [period(2, 3), period(-2, 1), period(1, 2), period(-1, 99, true), period(4, 9)] });
    const response = await f.request();
    assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/u);
    const body = await response.json();
    assert.deepEqual(body.subscription, { activeUntil: new Date(instant + 3 * hour).toISOString(), paymentPending: status === "pending", canSubscribe: true });
    assert.equal(body.phone, f.member.phone);
    assert.equal(f.queries.length, 1, "Navigation loads a compact account projection without devices or payment proof.");
    assert.equal(f.queries[0].where.tokenHash, f.member.tokenHash);
    assert.equal(f.queries[0].select.account.select.codes.where.revokedAt, null);
  }
});

test("expired, revoked and future-only periods never become active from an approved payment or a long-lived session", async () => {
  for (const periods of [[], [period(-2, 0)], [period(1, 2)], [period(-2, 5, true)]]) {
    const response = await subscriptionFixture({ periods, status: "approved" }).request();
    assert.deepEqual((await response.json()).subscription, { activeUntil: null, paymentPending: false, canSubscribe: true });
  }
});

test("subscription purchase availability respects sales mode and blocked accounts while retaining active expiry", async () => {
  for (const mode of ["on", "test", "off", null]) {
    const response = await subscriptionFixture({ mode, periods: [period(-1, 1)] }).request();
    assert.deepEqual((await response.json()).subscription, { activeUntil: new Date(instant + hour).toISOString(), paymentPending: false,
      canSubscribe: mode === "on" || mode === "test" });
  }
  const blocked = subscriptionFixture({ blocked: true, periods: [period(-1, 1)], status: "pending" });
  assert.deepEqual((await (await blocked.request()).json()).subscription, { activeUntil: null, paymentPending: false, canSubscribe: false });
  assert.equal(blocked.queries.length, 0);
});

test("guests can discover open subscriptions and administrators never receive a purchase action", async () => {
  for (const member of [null, { phone: fixtureAdminPhone, administrator: true }]) {
    const handler = createMemberSessionHandler(async () => ({ config: { production: false }, settings: { settings: { paywallMode: "on" } },
      sessions: { async verify() { return member; } }, codes: { async subscriptionStatus() { assert.fail("No private subscription read is needed."); } } }));
    const body = await (await handler(new Request("http://localhost/api/account/session"))).json();
    assert.deepEqual(body.subscription, { activeUntil: null, paymentPending: false, canSubscribe: !member });
  }
});

test("subscription details fail closed if the verified session was removed, reset, expired or reassigned", async () => {
  for (const sessionChange of [null, { authenticatedAt: null }, { passwordResetAt: new Date(instant) }, { expiresAt: new Date(instant) }, { accountId: "another-account" }]) {
    const f = subscriptionFixture({ sessionChange, periods: [period(-1, 1)], status: "pending" });
    const body = await (await f.request()).json();
    assert.equal(body.phone, null); assert.deepEqual(body.subscription, { activeUntil: null, paymentPending: false, canSubscribe: false });
  }
  for (const accountChange of [{ blockedAt: new Date(instant) }, { erasedAt: new Date(instant) }]) {
    const body = await (await subscriptionFixture({ accountChange, periods: [period(-1, 1)] }).request()).json();
    assert.equal(body.phone, null); assert.equal(body.subscription.activeUntil, null);
  }
});

test("a subscription storage failure does not publish a false unsubscribed state", async () => {
  for (const codes of [null, { async subscriptionStatus() { throw new Error("private storage failure"); } }]) {
    const f = subscriptionFixture();
    f.services.codes = codes;
    const response = await f.request();
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { phone: null, error: "unavailable" });
  }
});

test("navigation role fails closed when member storage is unavailable", async () => {
  const response = await createMemberSessionHandler(async () => ({ config: { production: false }, sessions: { async verify() { throw new Error("storage unavailable"); } } }))(
    new Request("http://localhost/api/account/session", { headers: { Cookie: "owner-session=opaque-owner-token" } }));
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { phone: null, error: "unavailable" });
});

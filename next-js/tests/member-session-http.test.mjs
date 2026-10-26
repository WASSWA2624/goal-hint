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
      subscription: { activeUntil: null, paymentPending: false, canSubscribe: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false } });
  }
});

const instant = Date.parse("2026-10-24T10:00:00Z"), hour = 3_600_000;
const period = (from, to, revoked = false) => ({ startsAt: new Date(instant + from * hour), endsAt: new Date(instant + to * hour), revokedAt: revoked ? new Date(instant) : null });
function subscriptionFixture({ periods = [], status = null, mode = "on", blocked = false, sessionChange = {}, accountChange = {} } = {}) {
  const member = { phone: "256700000101", accountId: "account", tokenHash: "session", blocked, codeEnteredAt: null };
  const account = { blockedAt: null, erasedAt: null, creditUgx: 0, autoRenew: false, autoRenewPlan: null, codes: periods,
    _count: { codes: periods.filter(period => !period.revokedAt && period.startsAt <= new Date(instant) && period.endsAt <= new Date(instant)).length },
    submissions: status ? [{ status, endsAt: new Date(instant + 999 * hour) }] : [], ...accountChange };
  const stored = sessionChange === null ? null : { accountId: member.accountId, authenticatedAt: new Date(instant - hour), passwordResetAt: null,
    expiresAt: new Date(instant + 500 * hour), account, ...sessionChange };
  const queries = [];
  const database = { query: run => run({ memberSession: { async findUnique(query) { queries.push(query); return stored; } },
    paymentSubmission: { async count({ where }) { return status === where.status ? 1 : 0; } } }) };
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
    assert.deepEqual(body.subscription, { activeUntil: new Date(instant + 3 * hour).toISOString(), paymentPending: status === "pending", canSubscribe: true, creditUgx: 0, autoRenew: false, renewsFromCredit: false });
    assert.equal(body.phone, f.member.phone);
    assert.equal(f.queries.length, 1, "Navigation loads a compact account projection without devices or payment proof.");
    assert.equal(f.queries[0].where.tokenHash, f.member.tokenHash);
    assert.equal(f.queries[0].select.account.select.codes.where.revokedAt, null);
    assert.deepEqual(f.queries[0].select.account.select._count.select.codes.where,
      { revokedAt: null, startsAt: { lte: new Date(instant) }, endsAt: { lte: new Date(instant) } });
  }
});

test("only a confirmed ended non-revoked period marks inactive access as expired", async () => {
  for (const [periods, expired] of [[[], false], [[period(-2, 0)], true], [[period(1, 2)], false],
    [[period(-2, 5, true)], false], [[period(-2, -1, true)], false]]) {
    const response = await subscriptionFixture({ periods, status: "approved" }).request();
    assert.deepEqual((await response.json()).subscription, { activeUntil: null, paymentPending: false, canSubscribe: true,
      creditUgx: 0, autoRenew: false, renewsFromCredit: false, ...(expired ? { expired: true } : {}) });
  }
  const renewed = await subscriptionFixture({ periods: [period(-3, -2), period(-1, 1)] }).request();
  assert.equal("expired" in (await renewed.json()).subscription, false, "active access takes precedence over past periods");
});

test("subscription purchase availability respects sales mode and blocked accounts while retaining active expiry", async () => {
  for (const mode of ["on", "test", "off", null]) {
    const response = await subscriptionFixture({ mode, periods: [period(-1, 1)] }).request();
    assert.deepEqual((await response.json()).subscription, { activeUntil: new Date(instant + hour).toISOString(), paymentPending: false,
      canSubscribe: mode === "on" || mode === "test", creditUgx: 0, autoRenew: false, renewsFromCredit: false });
  }
  const blocked = subscriptionFixture({ blocked: true, periods: [period(-1, 1)], status: "pending" });
  assert.deepEqual((await (await blocked.request()).json()).subscription, { activeUntil: null, paymentPending: false, canSubscribe: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false });
  assert.equal(blocked.queries.length, 0);
});

test("guests can discover open subscriptions and administrators never receive a purchase action", async () => {
  for (const member of [null, { phone: fixtureAdminPhone, administrator: true }]) {
    const handler = createMemberSessionHandler(async () => ({ config: { production: false }, settings: { settings: { paywallMode: "on" } },
      sessions: { async verify() { return member; } }, codes: { async subscriptionStatus() { assert.fail("No private subscription read is needed."); } } }));
    const body = await (await handler(new Request("http://localhost/api/account/session"))).json();
    assert.deepEqual(body.subscription, { activeUntil: null, paymentPending: false, canSubscribe: !member, creditUgx: 0, autoRenew: false, renewsFromCredit: false });
  }
});

test("only visitors and members without access who can subscribe receive the cheapest plan, and a failed read omits it", async () => {
  const offer = { priceUgx: 1_000, durationDays: 1 };
  const cases = [[{}, offer], [{ periods: [period(-1, 1)] }, undefined], [{ mode: "off" }, undefined], [{ blocked: true }, undefined]];
  for (const [options, expected] of cases) {
    const f = subscriptionFixture(options);
    let reads = 0;
    f.services.offer = async () => { reads++; return offer; };
    assert.deepEqual((await (await f.request()).json()).subscription.offer, expected);
    assert.equal(reads, expected ? 1 : 0, "Plans are read only when the bar shows the offer.");
  }
  const guest = createMemberSessionHandler(async () => ({ config: { production: false }, settings: { settings: { paywallMode: "on" } },
    sessions: { async verify() { return null; } }, offer: async () => offer }));
  assert.deepEqual((await (await guest(new Request("http://localhost/api/account/session"))).json()).subscription.offer, offer);
  const failed = subscriptionFixture();
  failed.services.offer = async () => { throw new Error("plans unavailable"); };
  const response = await failed.request();
  assert.equal(response.status, 200); assert.equal("offer" in (await response.json()).subscription, false);
});

test("subscription details fail closed if the verified session was removed, reset, expired or reassigned", async () => {
  for (const sessionChange of [null, { authenticatedAt: null }, { passwordResetAt: new Date(instant) }, { expiresAt: new Date(instant) }, { accountId: "another-account" }]) {
    const f = subscriptionFixture({ sessionChange, periods: [period(-1, 1)], status: "pending" });
    const body = await (await f.request()).json();
    assert.equal(body.phone, null); assert.deepEqual(body.subscription, { activeUntil: null, paymentPending: false, canSubscribe: false, creditUgx: 0, autoRenew: false, renewsFromCredit: false });
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

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { accountNotificationRules, notificationCursor, subscriptionReminder } from "../src/domain/account-notifications.ts";
import { createAccountNotifications } from "../src/server/members/account-notifications.ts";
import { createAccountNotificationsHandler } from "../src/server/members/account-notifications-http.ts";
import { createMemberAuthFixture } from "./helpers/member-auth-fixture.mjs";

const DAY = 86_400_000, HOUR = 3_600_000, at = new Date("2026-10-31T12:00:00Z");
const period = (start, end, fields = {}) => ({ id: randomUUID(), startsAt: new Date(start), endsAt: new Date(end), revokedAt: null, ...fields });

test("reminders reuse the exact renewal lead and continuous paid, trial, queued and earned schedule", () => {
  const paid = period(+at - DAY, +at + HOUR + 1, { source: "payment" });
  assert.equal(accountNotificationRules.leadMs, HOUR);
  assert.equal(subscriptionReminder([paid], at), null);
  assert.equal(subscriptionReminder([paid], new Date(+at + 1)).kind, "access-expiring");
  const queued = period(+paid.endsAt, +paid.endsAt + DAY, { source: "trial" });
  const earned = period(+queued.endsAt, +queued.endsAt + DAY, { source: "referral" });
  assert.equal(subscriptionReminder([earned, paid, queued], at), null);
  const due = new Date(+earned.endsAt - HOUR);
  assert.equal(+subscriptionReminder([paid, queued, earned], due).end, +earned.endsAt);
  assert.equal(subscriptionReminder([paid, queued, earned], new Date(+earned.endsAt - 1)).kind, "access-expiring");
  assert.equal(subscriptionReminder([paid, queued, earned], earned.endsAt).kind, "access-expired");
  assert.equal(subscriptionReminder([], at), null);
  assert.equal(subscriptionReminder([{ ...paid, revokedAt: at }], at), null);
  const ended = period(+at - DAY, +at - 1), future = period(+at + HOUR, +at + DAY);
  assert.equal(subscriptionReminder([ended, future], at).kind, "access-expired", "A queued period across a real gap is not active access.");
  assert.equal(subscriptionReminder([period(+at - 100 * DAY, +at - 91 * DAY)], at), null);
});

async function fixture() {
  const f = createMemberAuthFixture({ trialDays: 0 }), signed = await f.authenticate();
  const service = createAccountNotifications({ database: f.database, now: f.now });
  return { ...f, ...signed, notificationsService: service };
}
function facts(f) {
  const date = new Date(f.now() - 60_000), accountId = f.member.accountId;
  const approved = randomUUID(), rejected = randomUUID(), reward = randomUUID();
  f.payments.set(approved, { id: approved, accountId, status: "approved", decidedAt: date, privatePayer: "never expose" });
  f.payments.set(rejected, { id: rejected, accountId, status: "rejected", decidedAt: date });
  f.referrals.set(reward, { id: reward, inviterId: accountId, status: "rewarded", rewardedAt: date });
  const access = period(f.now() - HOUR, f.now() + HOUR, { accountId }); f.accessCodes.set(access.id, access);
  return access;
}

test("durable source events produce one persistent notice each; read/dismiss survive new service instances and concurrent refresh", async () => {
  const f = await fixture(); facts(f);
  const pages = await Promise.all(Array.from({ length: 4 }, () => f.notificationsService.read(f.member)));
  assert.equal(f.notifications.size, 5); assert.ok(pages.every(page => page.unread === 5));
  assert.deepEqual(new Set(pages[0].items.map(item => item.kind)), new Set(["payment-approved", "payment-rejected", "access-activated", "access-expiring", "referral-earned"]));
  assert.doesNotMatch(JSON.stringify(pages[0]), /accountId|eventKey|privatePayer|never expose/);
  const id = pages[0].items[0].id;
  assert.equal(await f.notificationsService.update(f.member, "read", id), true);
  assert.equal(await f.notificationsService.update(f.member, "read", id), true);
  const restarted = createAccountNotifications({ database: f.database, now: f.now });
  assert.equal((await restarted.read(f.member)).unread, 4);
  assert.equal(await restarted.update(f.member, "dismiss", id), true);
  assert.equal(await restarted.update(f.member, "dismiss", id), true);
  assert.equal((await restarted.read(f.member)).items.some(item => item.id === id), false);
  assert.equal(f.notifications.size, 5, "Dismissed dedupe tombstones stay stored.");
  assert.equal(await restarted.update(f.member, "read-all"), true);
  assert.equal((await restarted.read(f.member)).unread, 0);
  assert.equal(f.messages.length, 0, "In-app reads and actions never call external delivery.");
});

test("new paid/earned coverage withdraws stale warnings; exact expiry replaces the approaching notice", async () => {
  const f = await fixture(), access = facts(f);
  assert.ok((await f.notificationsService.read(f.member)).items.some(item => item.kind === "access-expiring"));
  const rewardPeriod = period(+access.endsAt, +access.endsAt + DAY, { accountId: f.member.accountId, source: "referral" });
  f.accessCodes.set(rewardPeriod.id, rewardPeriod);
  assert.equal((await f.notificationsService.read(f.member)).items.some(item => item.kind === "access-expiring"), false);
  f.advance(DAY);
  let page = await f.notificationsService.read(f.member);
  assert.equal(page.items.filter(item => item.kind === "access-expiring").length, 1);
  f.advance(HOUR);
  page = await f.notificationsService.read(f.member);
  assert.equal(page.items.some(item => item.kind === "access-expiring"), false);
  assert.equal(page.items.filter(item => item.kind === "access-expired").length, 1);
  const renewed = period(f.now(), f.now() + DAY, { accountId: f.member.accountId }); f.accessCodes.set(renewed.id, renewed);
  assert.equal((await f.notificationsService.read(f.member)).items.some(item => item.kind === "access-expired"), false);
});

test("queued activations wait for their start and payment reversal preserves the original approval notice", async () => {
  const f = await fixture(), id = randomUUID(), accountId = f.member.accountId;
  const payment = { id, accountId, status: "approved", decidedAt: new Date(f.now()) };
  f.payments.set(id, payment);
  const queued = period(f.now() + HOUR, f.now() + DAY, { accountId });
  f.accessCodes.set(queued.id, queued);
  let page = await f.notificationsService.read(f.member);
  assert.deepEqual(page.items.map(item => item.kind), ["payment-approved"]);
  const approvalId = page.items[0].id;
  payment.status = "reversed";
  f.advance(HOUR);
  page = await f.notificationsService.read(f.member);
  assert.equal(page.items.filter(item => item.kind === "access-activated").length, 1);
  assert.equal(page.items.find(item => item.kind === "payment-approved").id, approvalId);
  assert.equal(page.items.some(item => item.kind === "access-expiring"), false);
});

test("bounded pagination and 90-day retention do not regenerate dismissed or retired old events", async () => {
  const f = await fixture();
  for (let i = 0; i < 25; i++) { const id = randomUUID(); f.payments.set(id, { id, accountId: f.member.accountId, status: "approved", decidedAt: new Date(f.now() - i * 1000) }); }
  const first = await f.notificationsService.read(f.member), second = await f.notificationsService.read(f.member, first.next);
  assert.equal(first.items.length, 20); assert.equal(second.items.length, 5);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 25);
  assert.ok(notificationCursor(first.next)); assert.equal(notificationCursor("bad"), null);
  f.advance(accountNotificationRules.retentionMs + DAY);
  const account = f.accounts.get(f.member.accountId), session = f.sessions.get(f.member.tokenHash);
  account.phoneVerifiedAt = new Date(f.now()); session.expiresAt = new Date(f.now() + DAY);
  assert.equal((await f.notificationsService.read(f.member)).items.length, 0);
  assert.equal(f.notifications.size, 0);
});

test("foreign, revoked, restricted, blocked, erased and mismatched sessions cannot read or mutate notifications", async t => {
  for (const condition of ["foreign", "revoked", "restricted", "blocked", "erased", "phone", "unverified", "expired", "administrator"]) await t.test(condition, async () => {
    const f = await fixture(); facts(f); const page = await f.notificationsService.read(f.member), member = { ...f.member };
    if (condition === "foreign") member.accountId = randomUUID();
    if (condition === "revoked") f.sessions.delete(member.tokenHash);
    if (condition === "restricted") f.sessions.get(member.tokenHash).passwordResetAt = new Date(f.now());
    if (condition === "blocked") f.accounts.get(member.accountId).blockedAt = new Date(f.now());
    if (condition === "erased") f.accounts.get(member.accountId).erasedAt = new Date(f.now());
    if (condition === "phone") member.phone = "256700000009";
    if (condition === "unverified") f.accounts.get(member.accountId).phoneVerifiedAt = null;
    if (condition === "expired") f.sessions.get(member.tokenHash).expiresAt = new Date(f.now());
    if (condition === "administrator") member.administrator = true;
    assert.equal(await f.notificationsService.read(member), null);
    assert.equal(await f.notificationsService.update(member, "dismiss", page.items[0].id), false);
    assert.equal([...f.notifications.values()].some(item => item.dismissedAt), false);
  });
});

test("maintenance prunes old notification state even for blocked accounts", async () => {
  const f = await fixture(); facts(f);
  await f.notificationsService.read(f.member);
  f.advance(accountNotificationRules.retentionMs + DAY);
  f.accounts.get(f.member.accountId).blockedAt = new Date(f.now());
  assert.deepEqual(await f.notificationsService.run(), { checked: 0, failed: 0 });
  assert.equal(f.notifications.size, 0);
});

test("notification HTTP validates origin, session ownership, bounded input and private cache headers", async () => {
  const f = await fixture(); facts(f);
  const services = async () => ({ config: { production: false }, settings: { settings: f.settings }, sessions: f.sessionService, notifications: f.notificationsService });
  const read = createAccountNotificationsHandler("read", services), write = createAccountNotificationsHandler("write", services);
  const headers = { "Sec-Fetch-Site": "same-origin", Cookie: `goal-hint-member=${f.token}` };
  const response = await read(new Request("https://goalhint.com/api/account/notifications", { headers }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
  const page = await response.json();
  for (const body of [{ accountId: randomUUID(), action: "read-all" }, { action: ["read"] }, { action: "delete", id: page.items[0].id }, { action: "read", id: "../other" }]) {
    assert.equal((await write(new Request("https://goalhint.com/api/account/notifications", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }))).status, 400);
  }
  assert.equal((await write(new Request("https://goalhint.com/api/account/notifications", { method: "POST", headers: { ...headers, "Sec-Fetch-Site": "cross-site", "Content-Type": "application/json" }, body: '{"action":"read-all"}' }))).status, 403);
  assert.equal((await read(new Request("https://goalhint.com/api/account/notifications?accountId=other", { headers }))).status, 400);
  assert.equal((await read(new Request("https://goalhint.com/api/account/notifications", { headers: { "Sec-Fetch-Site": "same-origin" } }))).status, 403);
  const foreign = randomUUID();
  assert.equal((await write(new Request("https://goalhint.com/api/account/notifications", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ action: "dismiss", id: foreign }) }))).status, 404);
});

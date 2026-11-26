import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { communityLinksWithDefaults, communityReminderIntervalMs, defaultCommunityLinks } from "../src/domain/community.ts";
import { createSubscribers } from "../src/server/admin/subscribers.ts";
import { createCommunityHandler } from "../src/server/members/community-http.ts";
import { createMemberAuth } from "../src/server/members/member-auth.ts";
import { createMemberCommunityHandler } from "../src/server/members/member-community-http.ts";
import { createMemberCommunity } from "../src/server/members/member-community.ts";
import { createMemberSessions } from "../src/server/members/member-sessions.ts";
import { createSettingsService } from "../src/server/members/settings.ts";
import { paidDatabase } from "./helpers/paid-database.mjs";
import { MysqlServerUnavailableError } from "./helpers/mysql-instance.mjs";

test("community migration and owner saves preserve public visibility and per-platform choices across service restarts", { timeout: 180_000 }, async t => {
  let fixture;
  try {
    fixture = await paidDatabase({ beforeCheckout: async root => {
      await root.query("INSERT INTO SubscriptionSettings (id,updatedAt,updatedBy) VALUES (1,?,'legacy-owner')", [new Date("2026-11-05T08:00:00Z")]);
    } });
  } catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(error.message); return;
  }
  t.after(() => fixture.close());
  const { database } = fixture;
  const service = createSettingsService(database, { environment: null });
  const migrated = await service.current();
  assert.equal(migrated.settings.communityVisible, true);
  assert.deepEqual(migrated.settings.communityLinks, defaultCommunityLinks);
  const links = communityLinksWithDefaults([
    { type: "whatsapp-group", url: "https://chat.whatsapp.com/TestInvite", enabled: true },
    { type: "instagram", url: "https://www.instagram.com/test_profile/", enabled: false },
  ]);
  const authorized = { password: null, sessionAuthorized: true, confirm: async () => assert.fail() };
  const refused = await service.save("test-owner", { communityVisible: false, communityLinks: links }, { password: null, confirm: async () => assert.fail() });
  assert.equal(refused.status, "password-required");
  assert.equal((await service.current()).settings.communityVisible, true);
  assert.equal(await database.query(tx => tx.ownerAuditEvent.count()), 0);
  const saved = await service.save("test-owner", { communityVisible: false, communityLinks: links }, authorized);
  assert.equal(saved.status, "saved");
  const restarted = createSettingsService(database, { environment: null });
  const reloaded = await restarted.current();
  assert.equal(reloaded.settings.communityVisible, false);
  assert.deepEqual(reloaded.settings.communityLinks, links);
  const GET = createCommunityHandler(() => restarted.current());
  assert.deepEqual(await (await GET()).json(), { visible: false, links: [] });
  const audits = await database.query(tx => tx.ownerAuditEvent.findMany({ where: { action: "settings_changed" } }));
  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].details.changes.communityVisible, { from: true, to: false });
  assert.equal((await restarted.save("test-owner", { communityVisible: true }, authorized)).status, "saved");
  const publicState = await (await GET()).json();
  assert.equal(publicState.visible, true);
  assert.equal(publicState.links.length, 5);
  assert.equal(publicState.links.find(link => link.type === "whatsapp-group").url, links[0].url);
  assert.equal(publicState.links.some(link => link.type === "instagram"), false);
});

test("Community invitations are account-wide while a return is bound to the claimed browser attempt", { timeout: 180_000 }, async t => {
  let fixture;
  const legacyAccountId = randomUUID();
  const initial = Date.parse("2026-11-26T07:00:00Z");
  try {
    fixture = await paidDatabase({ beforeCheckout: root => root.query(
      "INSERT INTO MemberAccount (id, phone, createdAt, lastSignInAt) VALUES (?, '256700000099', ?, ?)",
      [legacyAccountId, new Date(initial), new Date(initial)]) });
  } catch (error) {
    if (!(error instanceof MysqlServerUnavailableError)) throw error;
    t.skip(error.message); return;
  }
  t.after(() => fixture.close());
  let time = initial;
  const now = () => time;
  const { database } = fixture;
  const config = { ...fixture.config, production: false };
  const options = { database, config, now, adminPhone: () => false, adminPasswordHash: () => null };
  const auth = createMemberAuth(options);
  const sessions = createMemberSessions(options);
  const community = createMemberCommunity(options);
  const settings = { communityVisible: false, communityLinks: [
    { type: "whatsapp-group", url: "https://chat.whatsapp.com/TestInvite", enabled: true },
    { type: "whatsapp-channel", url: "https://www.whatsapp.com/channel/TestChannel", enabled: true },
  ], paywallMode: "off" };
  const handler = createMemberCommunityHandler(async () => ({ config, sessions, settings: { settings, source: "stored" }, community }));
  const request = (token, body, origin = "same-origin") => handler(new Request("http://localhost/api/account/community", {
    method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": origin,
      ...(token ? { Cookie: `goal-hint-member=${token}` } : {}) }, body: JSON.stringify(body),
  }));
  const post = async (token, body, expectedStatus = 200, origin) => {
    const response = await request(token, body, origin);
    assert.equal(response.status, expectedStatus);
    assert.match(response.headers.get("cache-control"), /no-store/u);
    return response.json();
  };
  const readState = id => database.query(tx => tx.memberAccount.findUniqueOrThrow({ where: { id }, select: {
    communityInvitedAt: true, communityJoinedAt: true, communityInvitationId: true, communityAttemptId: true,
  } }));
  assert.deepEqual(await readState(legacyAccountId), { communityInvitedAt: null, communityJoinedAt: null,
    communityInvitationId: null, communityAttemptId: null });

  const phone = "256700000101", password = "test community pass";
  const { token: deviceOne } = await auth.register(phone, password, { member: null });
  const { token: deviceTwo } = await auth.login(phone, password, "198.51.100.10");
  const { token: otherAccount } = await auth.register("256700000102", password, { member: null });
  assert.ok(deviceOne && deviceTwo && otherAccount);
  const { accountId } = await sessions.verify(deviceOne);
  const { accountKey, joined } = await post(deviceOne, { action: "status" });
  const other = await post(otherAccount, { action: "status" });
  assert.equal(joined, false);
  assert.notEqual(other.accountKey, accountKey);
  assert.deepEqual(await post(deviceTwo, { action: "status" }), { accountKey, joined: false });
  await post(undefined, { action: "status" }, 403);
  await post(deviceOne, { action: "status" }, 403, "cross-site");
  await post(deviceOne, { action: "claim", accountKey, attemptId: "invalid" }, 400);
  await post(otherAccount, { action: "reconcile", accountKey }, 403);

  const claim = (token, attemptId) => post(token, { action: "claim", accountKey, attemptId });
  assert.deepEqual(await claim(deviceOne, randomUUID()), { accountKey, joined: false, invited: false });
  assert.equal((await readState(accountId)).communityInvitedAt, null);
  settings.communityVisible = true;
  for (const link of settings.communityLinks) link.enabled = false;
  assert.deepEqual(await claim(deviceOne, randomUUID()), { accountKey, joined: false, invited: false });
  for (const link of settings.communityLinks) link.enabled = true;

  const devices = [deviceOne, deviceTwo], claimIds = [randomUUID(), randomUUID()];
  const firstClaims = await Promise.all(devices.map((device, index) => claim(device, claimIds[index])));
  const winner = firstClaims.findIndex(result => result.invited);
  assert.ok(winner >= 0);
  const device = devices[winner], otherDevice = devices[1 - winner], attemptId = claimIds[winner];
  assert.deepEqual(firstClaims[1 - winner], { accountKey, joined: false, invited: false,
    retryAt: new Date(initial + communityReminderIntervalMs).toISOString() });
  const attempt = (action, status = 200) => post(device, { action, accountKey, attemptId }, status);
  await post(otherAccount, { action: "attempt", accountKey: other.accountKey, attemptId }, 409);
  await post(otherDevice, { action: "attempt", accountKey, attemptId: claimIds[1 - winner] }, 409);
  await attempt("yes", 409);
  assert.deepEqual(await attempt("attempt"), { accountKey, joined: false });
  assert.deepEqual(await attempt("attempt"), { accountKey, joined: false });
  assert.equal((await readState(accountId)).communityAttemptId, attemptId);
  assert.deepEqual(await attempt("no"), { accountKey, joined: false });
  await attempt("attempt", 409);
  await attempt("yes", 409);

  time += communityReminderIntervalMs - 1;
  assert.equal((await claim(otherDevice, randomUUID())).invited, false);
  time += 1;
  assert.equal((await claim(otherDevice, randomUUID())).invited, true);
  assert.equal((await claim(device, randomUUID())).invited, false, "closing without an attempt stays in cooldown");
  time += communityReminderIntervalMs;
  const returnId = randomUUID();
  assert.equal((await claim(device, returnId)).invited, true);
  await post(device, { action: "attempt", accountKey, attemptId: returnId });
  time += communityReminderIntervalMs;
  assert.equal((await claim(otherDevice, randomUUID())).invited, true);
  const joinedAt = new Date(time);
  assert.deepEqual(await post(device, { action: "yes", accountKey, attemptId: returnId }), { accountKey, joined: true });
  time += communityReminderIntervalMs;
  assert.deepEqual(await post(device, { action: "yes", accountKey, attemptId: returnId }), { accountKey, joined: true });
  assert.deepEqual(await claim(otherDevice, randomUUID()), { accountKey, joined: true, invited: false });
  assert.deepEqual(await readState(accountId), { communityInvitedAt: null, communityJoinedAt: joinedAt,
    communityInvitationId: null, communityAttemptId: null });

  const mergedAt = new Date(time), { accountId: otherId } = await sessions.verify(otherAccount);
  assert.deepEqual(await post(otherAccount, { action: "reconcile", accountKey: other.accountKey }), { accountKey: other.accountKey, joined: true });
  time += communityReminderIntervalMs;
  assert.deepEqual(await post(otherAccount, { action: "reconcile", accountKey: other.accountKey }), { accountKey: other.accountKey, joined: true });
  assert.equal(+(await readState(otherId)).communityJoinedAt, +mergedAt);
  await sessions.signOut(otherAccount);
  await post(otherAccount, { action: "status" }, 403);

  assert.equal((await createSubscribers(database, now, config).action(otherId, "erase", null, "test-owner")).status, "saved");
  assert.deepEqual(await readState(otherId), { communityInvitedAt: null, communityJoinedAt: null,
    communityInvitationId: null, communityAttemptId: null });
});

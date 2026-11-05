import assert from "node:assert/strict";
import test from "node:test";
import { communityLinksWithDefaults, defaultCommunityLinks } from "../src/domain/community.ts";
import { createCommunityHandler } from "../src/server/members/community-http.ts";
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

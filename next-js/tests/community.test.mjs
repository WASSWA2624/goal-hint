import assert from "node:assert/strict";
import test from "node:test";
import { communityLinksSchema, communityLinksWithDefaults, defaultCommunityLinks, publicCommunityLinks, validCommunityUrl } from "../src/domain/community.ts";
import { defaultSubscriptionSettings, parseSettingsChanges } from "../src/domain/subscription-settings.ts";
import { createCommunityHandler } from "../src/server/members/community-http.ts";

test("new and legacy community settings show all six platforms while preserving explicit hidden links", () => {
  assert.equal(defaultSubscriptionSettings.communityVisible, true);
  assert.equal(defaultCommunityLinks.length, 6);
  for (const value of [undefined, null, []]) assert.deepEqual(publicCommunityLinks(value), defaultCommunityLinks);
  const legacy = [{ type: "whatsapp-group", url: "https://chat.whatsapp.com/TestInvite", enabled: false },
    { type: "telegram-channel", url: "https://t.me/test_channel", enabled: true }];
  const complete = communityLinksWithDefaults(legacy);
  assert.equal(complete.length, 6);
  assert.deepEqual(complete[0], legacy[0]);
  assert.deepEqual(complete[2], legacy[1]);
  assert.equal(publicCommunityLinks(legacy).some(link => link.type === "whatsapp-group"), false);
  assert.deepEqual(publicCommunityLinks(defaultCommunityLinks.map(link => ({ ...link, enabled: false }))), []);
  for (const value of [false, {}, [{ type: "other", url: "", enabled: true }], [{ type: "x", url: "https://evil.test/test", enabled: true }]]) {
    assert.deepEqual(publicCommunityLinks(value), []);
  }
  assert.equal(communityLinksSchema.safeParse(defaultCommunityLinks).success, true);
});

test("platform fields accept copied invitation/profile links and refuse other platforms, redirects and unsafe paths", () => {
  const accepted = [
    ["whatsapp-group", "https://chat.whatsapp.com/TestInvite?mode=ac_t"],
    ["whatsapp-channel", "https://www.whatsapp.com/channel/TestChannel"],
    ["telegram-channel", "https://t.me/test_channel"],
    ["telegram-channel", "https://t.me/+TestInvite_123"],
    ["telegram-channel", "https://t.me/joinchat/TestInvite_123"],
    ["tiktok", "https://www.tiktok.com/@test.profile?_t=ZM-test&_r=1"],
    ["tiktok", "https://vm.tiktok.com/ZTest123/"],
    ["x", "https://x.com/test_profile?s=21&t=TestShare"],
    ["x", "https://twitter.com/test_profile"],
    ["instagram", "https://www.instagram.com/test.profile/?igsh=TestShare%3D%3D&utm_source=qr"],
  ];
  for (const [type, url] of accepted) assert.equal(validCommunityUrl(type, url), true, url);
  for (const [type, url] of [
    ["x", "https://x.com/intent?url=https%3A%2F%2Fevil.test"], ["x", "https://x.com/test?redirect=evil"],
    ["x", "https://x.com/test/status/123"], ["x", "https://x.com/test#fragment"],
    ["x", "http://x.com/test"], ["x", "https://x.com.evil.test/test"], ["x", "https://user@x.com/test"],
    ["x", "https://x.com:444/test"], ["instagram", "https://www.instagram.com/p/Test123"],
    ["tiktok", "https://www.tiktok.com/@test/video/123"], ["telegram-channel", "https://t.me/share"],
    ["whatsapp-group", "https://www.whatsapp.com/channel/TestChannel"], ["instagram", "https://x.com/test"],
    ["instagram", "https://www.instagram.com/test/?igsh=https%3A%2F%2Fevil.test"],
  ]) assert.equal(validCommunityUrl(type, url), false, url);
  assert.equal(parseSettingsChanges({ communityVisible: false, communityLinks: defaultCommunityLinks }).ok, true);
  for (const value of [null, "true", 1]) assert.equal(parseSettingsChanges({ communityVisible: value }).ok, false);
});

test("the public community endpoint serves defaults without authentication and never exposes hidden destinations", async () => {
  const state = { source: "defaults", settings: { ...defaultSubscriptionSettings } };
  const GET = createCommunityHandler(async () => state);
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { visible: true, links: defaultCommunityLinks });
  state.settings.communityLinks = communityLinksWithDefaults([{ type: "x", url: "https://x.com/test_profile", enabled: false }]);
  const visible = await (await GET()).json();
  assert.equal(visible.links.length, 5);
  assert.equal(JSON.stringify(visible).includes("test_profile"), false);
  state.settings.communityVisible = false;
  assert.deepEqual(await (await GET()).json(), { visible: false, links: [] });
});

test("unavailable or stale settings return retryable failure instead of reopening default public links", async () => {
  for (const state of [null, { source: "unavailable", settings: null }, { source: "last-good", settings: defaultSubscriptionSettings }]) {
    const response = await createCommunityHandler(async () => state)();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(Object.hasOwn(await response.json(), "links"), false);
  }
  assert.equal((await createCommunityHandler(async () => { throw new Error("storage failure"); })()).status, 503);
});

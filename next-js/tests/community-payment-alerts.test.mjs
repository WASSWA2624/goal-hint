import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { communityLinksSchema, publicCommunityLinks, validCommunityUrl } from "../src/domain/community.ts";
import { alertRegistrationSchema, retryDelay, reviewReturnPath, validWebPushEndpoint } from "../src/domain/payment-alerts.ts";
import { defaultSubscriptionSettings, parseSettingsChanges } from "../src/domain/subscription-settings.ts";
import { createReviewTransports, fcmReviewMessage } from "../src/server/admin/payment-alert-transports.ts";

test("community links are public configuration with exact platform validation", () => {
  const links = [
    { type: "whatsapp-channel", url: "https://whatsapp.com/channel/TEST_only", enabled: true },
    { type: "telegram-channel", url: "https://t.me/test_channel", enabled: false },
    { type: "whatsapp-group", url: "", enabled: false },
  ];
  assert.equal(communityLinksSchema.safeParse(links).success, true);
  assert.deepEqual(publicCommunityLinks(links), links.slice(0, 1));
  assert.deepEqual(publicCommunityLinks(null), []);
  assert.equal(parseSettingsChanges({ communityLinks: links }).ok, true);
  for (const url of ["http://t.me/test", "javascript:alert(1)", "https://t.me.evil.test/channel", "https://t.me@evil.test/test", "https://t.me:444/test", "https://t.me/test?redirect=evil", "https://t.me/test#fragment", "https://t.me\\@evil.test/test", "https://127.0.0.1/test"]) {
    assert.equal(validCommunityUrl("telegram-channel", url), false, url);
  }
  assert.equal(validCommunityUrl("whatsapp-group", "https://whatsapp.com/channel/TEST"), false);
  assert.equal(communityLinksSchema.safeParse([...links, links[0]]).success, false);
  assert.equal(communityLinksSchema.safeParse([{ ...links[2], enabled: true }]).success, false);
});

test("payment alert controls default off, validate repeats and reject unsafe endpoints", () => {
  assert.equal(defaultSubscriptionSettings.paymentAlertsEnabled, false);
  assert.equal(defaultSubscriptionSettings.paymentAlertRepeats, 1);
  for (const value of [0, 4, -1, 1.5, "2", null]) assert.equal(parseSettingsChanges({ paymentAlertRepeats: value }).ok, false);
  assert.equal(parseSettingsChanges({ paymentAlertsEnabled: "true" }).ok, false);
  assert.equal(parseSettingsChanges({ paymentAlertRepeats: 3, paymentAlertsEnabled: true }).ok, true);
  for (const url of ["https://fcm.googleapis.com/fcm/send/TEST", "https://updates.push.services.mozilla.com/wpush/v2/TEST", "https://web.push.apple.com/TEST", "https://wns2-test.notify.windows.com/w/?token=TEST"]) assert.equal(validWebPushEndpoint(url), true);
  for (const url of ["https://localhost/test", "https://fcm.googleapis.com.evil.test/test", "http://fcm.googleapis.com/test", "https://fcm.googleapis.com:444/test", "https://user@fcm.googleapis.com/test"]) assert.equal(validWebPushEndpoint(url), false);
  assert.equal(alertRegistrationSchema.safeParse({ transport: "fcm", subscription: { fid: "T".repeat(22) } }).success, true);
  assert.equal(alertRegistrationSchema.safeParse({ transport: "web", subscription: { endpoint: "https://127.0.0.1/private" } }).success, false);
  assert.equal(createReviewTransports({}).configured("web"), false);
  assert.equal(createReviewTransports({}).configured("fcm"), false);
  assert.equal(createReviewTransports({}).configured("windows-local"), false);
});

test("review return destinations accept only the canonical UUID payment route", () => {
  const id = randomUUID(), valid = `/admin/payments?paymentId=${id}`;
  assert.equal(reviewReturnPath(valid), valid);
  for (const value of ["https://evil.test", "//evil.test", "/admin", "/admin/payments?paymentId=bad", `${valid}&action=approve`, `${valid}#activate`, `/admin/payments?paymentId=${encodeURIComponent("../secret")}`]) assert.equal(reviewReturnPath(value), null);
  assert.deepEqual([1, 2, 3, 4, 5].map(retryDelay), [5000, 10000, 20000, 40000, 80000]);
  assert.equal(retryDelay(100), 900000);
});

test("FCM uses the pinned SDK's FID contract and one native display owner", () => {
  const payload = { eventId: randomUUID(), paymentId: randomUUID(), endpointId: randomUUID(), createdAt: new Date().toISOString() };
  const message = fcmReviewMessage("T".repeat(22), payload);
  assert.equal(message.fid, "T".repeat(22)); assert.equal(message.notification, undefined);
  assert.deepEqual(message.data, payload);
  assert.equal(message.android.collapseKey, "payment-reviews");
  const resolved = fcmReviewMessage(message.fid, { ...payload, resolved: true });
  assert.equal(resolved.data.resolved, "true");
  assert.equal(resolved.android.collapseKey, undefined, "resolution cannot coalesce away a newer pending payment");
});

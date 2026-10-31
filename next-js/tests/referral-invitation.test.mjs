import assert from "node:assert/strict";
import test from "node:test";
import { referralInvitation } from "../src/domain/referral-invitation.ts";
import { telegramShareUrl, whatsAppShareUrl } from "../src/domain/share-links.ts";
import { invitationShareAvailable, shareInvitation } from "../src/components/members/invitation-share.ts";

test("all invitation destinations preserve the existing canonical link without reward promises", () => {
  const { invitation, whatsApp, telegram } = referralInvitation("a".repeat(32), "en");
  assert.equal(invitation.url, `https://goalhint.com/r/${"a".repeat(32)}`);
  assert.equal(invitation.text, "Join me on Goal Hint for football predictions and slip building.");
  assert.equal(new URL(whatsApp).searchParams.get("text"), `${invitation.text}\n${invitation.url}`);
  assert.equal(new URL(telegram).searchParams.get("url"), invitation.url);
  assert.equal(new URL(telegram).searchParams.get("text"), invitation.text);
  assert.deepEqual(referralInvitation("a".repeat(32), "unsupported"), referralInvitation("a".repeat(32), "en"));
  for (const code of [null, "", "../account", "a".repeat(31), "A".repeat(32)]) assert.throws(() => referralInvitation(code, "en"));
});

test("social handoffs encode punctuation, non-ASCII text, newlines and URL query fragments exactly once", () => {
  const text = "Join & share #GoalHint\nFootball ⚽ + friends?", url = "https://example.test/r/code?x=1&y=2#part";
  assert.equal(new URL(whatsAppShareUrl(text)).searchParams.get("text"), text);
  assert.deepEqual([...new URL(telegramShareUrl(url, text)).searchParams], [["url", url], ["text", text]]);
});

test("native sharing retains user activation, treats cancellation quietly and reports failure for explicit fallback", async t => {
  const invitation = referralInvitation("b".repeat(32), "en").invitation;
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  t.after(() => {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else delete globalThis.window;
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor); else delete globalThis.navigator;
  });
  let received;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { share: async data => { received = data; } } });
  assert.equal(invitationShareAvailable(), true);
  const operation = shareInvitation(invitation);
  assert.deepEqual(received, invitation, "The API is invoked synchronously in the click's activation.");
  assert.equal(await operation, "handed-off");
  navigator.share = async () => { throw new DOMException("Cancelled", "AbortError"); };
  assert.equal(await shareInvitation(invitation), "cancelled");
  navigator.share = async () => { throw new DOMException("Blocked", "NotAllowedError"); };
  assert.equal(await shareInvitation(invitation), "failed");
  navigator.canShare = () => false;
  assert.equal(await shareInvitation(invitation), "failed");
  delete navigator.share;
  assert.equal(invitationShareAvailable(), false);
  assert.equal(await shareInvitation(invitation), "failed");
  window.goalHintNativeShare = { version: 1, share: async data => { received = data; return "cancelled"; } };
  assert.equal(invitationShareAvailable(), true);
  assert.equal(await shareInvitation(invitation), "cancelled");
  assert.deepEqual(received, invitation);
});

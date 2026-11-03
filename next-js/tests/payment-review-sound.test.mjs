import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { acceptReviewAlertFeed, resetReviewAlerts, setReviewSound } from "../src/components/admin/payment-alert-sound.ts";

const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function browser(t, native = false) {
  const original = new Map(), storage = new Map(), calls = [];
  let queued = Promise.resolve();
  const values = {
    navigator: { userAgent: native ? "GoalHintNative/android/1.0.0/8/development" : "Synthetic browser", locks: { request(_key, fn) { queued = queued.then(fn); return queued; } } },
    document: { visibilityState: "visible", hasFocus: () => true },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    Audio: class { currentTime = 0; async play() { calls.push("play"); } pause() { calls.push("pause"); } },
  };
  for (const [key, value] of Object.entries(values)) { original.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, value }); }
  t.after(() => { resetReviewAlerts(); for (const [key, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  resetReviewAlerts();
  return { calls, storage };
}
const scope = "test-review-scope";
const event = (age = 0) => ({ id: randomUUID(), paymentId: randomUUID(), createdAt: new Date(Date.now() - age).toISOString() });
const feed = (events, repeats = 1) => ({ scope, events, repeats, enabled: true });

test("startup is quiet, profile delivery is deduplicated and old catch-up events stay quiet", async t => {
  const { calls } = browser(t);
  await setReviewSound(scope, true);
  acceptReviewAlertFeed(feed([])); await tick();
  const first = event(); acceptReviewAlertFeed(feed([first])); acceptReviewAlertFeed(feed([first])); await tick();
  assert.equal(calls.filter(call => call === "play").length, 2, "one explicit enable sound plus one new event");
  acceptReviewAlertFeed(feed([first, event(120_000)])); await tick();
  assert.equal(calls.filter(call => call === "play").length, 2);
});

test("resolving an alert cancels repeats and logout invalidates waiting sound work", async t => {
  const { calls } = browser(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await setReviewSound(scope, true); acceptReviewAlertFeed(feed([])); await tick();
  acceptReviewAlertFeed(feed([event()], 3)); await tick();
  const count = calls.filter(call => call === "play").length;
  acceptReviewAlertFeed(feed([], 3)); await tick(); t.mock.timers.tick(10_000); await tick();
  assert.equal(calls.filter(call => call === "play").length, count);
  acceptReviewAlertFeed(feed([event()], 3));
  resetReviewAlerts(); await tick(); t.mock.timers.tick(10_000); await tick();
  assert.equal(calls.filter(call => call === "play").length, count, "an old session cannot play after sign-out");
});

test("Flutter hosts suppress the embedded browser's matching chime", async t => {
  const { calls } = browser(t, true);
  await setReviewSound(scope, true); acceptReviewAlertFeed(feed([])); await tick();
  acceptReviewAlertFeed(feed([event()])); await tick();
  assert.equal(calls.filter(call => call === "play").length, 0);
});

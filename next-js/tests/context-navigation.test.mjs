import assert from "node:assert/strict";
import test from "node:test";
import { contextReturnDistance } from "../src/domain/context-navigation.ts";
import { rememberContextArrival, rememberContextOrigin, returnToContext } from "../src/components/navigation/context-history.ts";
import { backToWorkflowStep, workflowPage, workflowStep, writeWorkflowStep } from "../src/components/navigation/workflow-history.ts";
import { loadCheckoutDraft, restoredCheckoutStep, saveCheckoutDraft } from "../src/components/members/checkout-draft.ts";
import { clearProtectedDrafts, decodeDraftProgress, readDraftProgress } from "../src/components/members/draft-storage.ts";

const origin = "https://goalhint.test";
const subscription = `${origin}/en/subscribe?add=credit#plans`;
const referrals = `${origin}/en/account?section=referrals`;

test("Back returns from nested referral pages to the immediate eligible origin", () => {
  assert.equal(contextReturnDistance(new URL(`${referrals}&reviewBefore=abc`), [referrals, subscription]), 2);
  assert.equal(contextReturnDistance(new URL(referrals), [`${origin}/en/account?section=subscription`, subscription]), 1);
  assert.equal(contextReturnDistance(new URL(referrals), []), null);
  assert.equal(contextReturnDistance(new URL(referrals), ["https://outside.test/en/subscribe", subscription]), null);
  assert.equal(contextReturnDistance(new URL(referrals), [`${origin}/en/account?view=login`, subscription]), null);
});

test("Best Slips collection participates in contextual Back without merging Matches or dated slips", () => {
  const best = `${origin}/en/best-slips`, matches = `${origin}/en/matches`;
  const dated = `${best}/2026-11-05/1`;
  assert.equal(contextReturnDistance(new URL(subscription), [best, matches]), 1);
  assert.equal(contextReturnDistance(new URL(dated), [best, matches]), 1);
  assert.equal(contextReturnDistance(new URL(matches), [best]), 1);
  assert.equal(contextReturnDistance(new URL(best), [`${best}?page=2`, `${best}#filters`, matches]), 3);
  for (const invalid of ["/en/best-slips-extra", "/en/best-slips/not-a-date/1", "/en/best-slips/2026-11-05", "/en/best-slips/2026-11-05/1/private"]) {
    assert.equal(contextReturnDistance(new URL(subscription), [`${origin}${invalid}`, best]), null);
  }
  assert.equal(contextReturnDistance(new URL(best), [`${origin}/en/account?view=login`, matches]), null);
});

test("older WebViews use marked entry history for checkout steps and referral return", () => {
  const location = { href: subscription };
  const entries = [{ state: { router: "checkout" }, href: subscription }];
  let index = 0;
  const listeners = new EventTarget();
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    replaceState(state, _, href = location.href) {
      location.href = new URL(href, origin).href;
      entries[index] = { state, href: location.href };
    },
    pushState(state, _, href) {
      location.href = new URL(href, origin).href;
      entries.splice(++index, entries.length, { state, href: location.href });
    },
    go(offset) {
      index += offset;
      location.href = entries[index].href;
      listeners.dispatchEvent(new Event("popstate"));
    },
  };
  globalThis.window = { history, location, setTimeout, clearTimeout, addEventListener: listeners.addEventListener.bind(listeners), removeEventListener: listeners.removeEventListener.bind(listeners) };
  try {
    const page = workflowPage(subscription);
    writeWorkflowStep("purchase", 0, "replace");
    writeWorkflowStep("purchase", 1, "push");
    assert.equal(workflowPage(location.href), page);
    assert.equal(workflowStep(history.state, "purchase", page), 1);
    assert.equal(workflowStep(history.state, "another-attempt", page), null);
    assert.equal(workflowStep(history.state, "purchase", "/en/subscribe"), null);
    assert.equal(new URL(location.href).searchParams.get("checkoutStep"), "pay");
    rememberContextOrigin(referrals);
    history.pushState({ router: "account" }, "", referrals);
    rememberContextArrival();
    assert.equal(history.state.router, "account");
    assert.equal(returnToContext(), true);
    assert.equal(workflowStep(history.state, "purchase", page), 1);
    assert.equal(backToWorkflowStep("purchase", 0), true);
    assert.equal(location.href, subscription);
    assert.equal(returnToContext(), false);
  } finally { delete globalThis.window; }
});

test("stored checkout progress excludes proof, expires and clears across verified sessions", () => {
  const store = {};
  Object.defineProperties(store, {
    getItem: { value: key => store[key] ?? null },
    setItem: { value: (key, value) => { store[key] = value; } },
    removeItem: { value: key => { delete store[key]; } },
  });
  let deleted;
  globalThis.sessionStorage = store;
  globalThis.indexedDB = { deleteDatabase(name) { deleted = name; return {}; } };
  store["goal-hint-payment-draft:v2:old-user"] = "old receipt evidence";
  const start = { step: 0, purpose: "plan", planId: "daily", method: "", requestKey: "", usePackage: true, useWallet: false,
    useReferral: false, walletUgx: "0", referralDays: "0", topUpUgx: "", transactionId: "", amountUgx: "", payerPhone: "",
    paidAt: "", text: "", originalText: "", extracted: {}, accepted: false, attachingId: null };
  const draft = { ...start, method: "mtn", step: 3, requestKey: "39074821-6b32-4fee-8c26-729204c1983b", transactionId: "TX-private",
    payerPhone: "private-phone", text: "private-message", accepted: true, screenshot: { private: true } };
  try {
    saveCheckoutDraft("first-session", "plan", { draft, image: new Blob(["private-image"]) });
    const stored = readDraftProgress("first-session", "plan");
    assert.equal(deleted, "goal-hint-checkout");
    assert.equal(store["goal-hint-payment-draft:v2:old-user"], undefined);
    assert.equal(stored.includes("private"), false);
    assert.equal(decodeDraftProgress(stored).planId, "daily");
    assert.equal(decodeDraftProgress(stored, Date.now() + 31 * 60_000), null);
    assert.equal(loadCheckoutDraft("first-session", "plan", start).draft.text, "private-message");
    assert.equal(loadCheckoutDraft("second-session", "plan", start), null);
    assert.equal(loadCheckoutDraft("first-session", "plan", start), null);
    clearProtectedDrafts();
    saveCheckoutDraft("second-session", "plan", { draft, image: null });
    assert.deepEqual(Object.keys(store), []);
  } finally {
    clearProtectedDrafts();
    delete globalThis.sessionStorage;
    delete globalThis.indexedDB;
  }
});

test("restored payment steps recover safely when choices or evidence are gone", () => {
  const state = { validPackage: true, methodAvailable: true, external: true, evidencePresent: true };
  assert.equal(restoredCheckoutStep(3, state), 3);
  assert.equal(restoredCheckoutStep(3, { ...state, evidencePresent: false }), 2);
  assert.equal(restoredCheckoutStep(3, { ...state, methodAvailable: false }), 1);
  assert.equal(restoredCheckoutStep(3, { ...state, validPackage: false }), 0);
});

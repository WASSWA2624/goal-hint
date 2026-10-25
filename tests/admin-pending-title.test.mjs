import assert from "node:assert/strict";
import test from "node:test";
import { pendingPaymentTitle, watchPendingPaymentTitle } from "../src/components/admin/pending-title.ts";

test("pending title prefixes are idempotent, preserve page identity and disappear when the queue clears", () => {
  for (const [base, payments] of [["Codes · Admin · Goal Hint", false], ["Analytics · Goal Hint", false], ["Payments · Admin · Goal Hint", true]]) {
    const expected = payments ? "(3) Payments · Admin · Goal Hint" : `(3) Payments · ${base}`;
    assert.equal(pendingPaymentTitle(base, 3, payments), expected);
    assert.equal(pendingPaymentTitle(expected, 3, payments), expected);
    assert.equal(pendingPaymentTitle(expected, 0, payments), base);
  }
});

test("streamed title replacement restores the prefix without repeat writes, extra nodes or unrelated observation work", t => {
  let title = "Codes · Admin · Goal Hint", writes = 0, titlePresent = true, current = true, callback, connected = false;
  const original = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  const document = { head: { querySelector: () => titlePresent ? {} : null },
    get title() { return title; }, set title(value) { title = value; writes++; } };
  globalThis.MutationObserver = class {
    constructor(notify) { callback = notify; }
    observe(target, options) {
      assert.equal(target, document.head);
      assert.deepEqual(options, { childList: true, subtree: true, characterData: true });
      connected = true;
    }
    disconnect() { connected = false; }
  };
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "MutationObserver", original); else delete globalThis.MutationObserver;
  });
  const text = { type: "characterData", target: { nodeName: "#text", parentNode: { nodeName: "TITLE" } } };
  const replacement = { type: "childList", target: { nodeName: "HEAD" }, addedNodes: [{ nodeName: "TITLE" }], removedNodes: [] };
  const stop = watchPendingPaymentTitle(document, 3, false, () => current);
  assert.equal(title, "(3) Payments · Codes · Admin · Goal Hint");
  assert.equal(writes, 1);
  callback([text]);
  assert.equal(writes, 1, "the title setter's own mutation cannot loop");
  title = "Codes · Admin · Goal Hint";
  callback([{ type: "childList", target: { nodeName: "HEAD" }, addedNodes: [{ nodeName: "STYLE" }], removedNodes: [] }]);
  assert.equal(writes, 1, "unrelated head changes do not rewrite the title");
  callback([replacement]);
  assert.equal(title, "(3) Payments · Codes · Admin · Goal Hint");
  assert.equal(writes, 2);
  title = "Codes · Admin · Goal Hint";
  callback([text]);
  assert.equal(writes, 3, "same-route metadata text updates also restore the current count");
  titlePresent = false; title = "";
  callback([replacement]);
  assert.equal(writes, 3, "a temporary absence never creates an extra title node");
  titlePresent = true; current = false; title = "Matches · Goal Hint";
  callback([replacement]);
  assert.equal(writes, 3, "the previous route does not change the destination's title before effect cleanup");
  stop(); current = true;
  callback([text]);
  assert.equal(writes, 3);
  assert.equal(connected, false);
});

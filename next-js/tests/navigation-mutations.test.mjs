import assert from "node:assert/strict";
import test from "node:test";
import { changesPendingNavigation } from "../src/domain/navigation-mutations.ts";

const text = { nodeType: 3 };
const element = (self = false, descendant = false) => ({ nodeType: 1,
  matches: selector => { assert.equal(selector, "[data-navigation-pending]"); return self; },
  querySelector: selector => { assert.equal(selector, "[data-navigation-pending]"); return descendant ? {} : null; },
});
const children = (addedNodes = [], removedNodes = []) => ({ type: "childList", addedNodes, removedNodes });

test("score text, picker options and unrelated attribute changes do not trigger a global navigation check", () => {
  const changes = [children([text], [text]), children([element(), element()]),
    { type: "attributes", attributeName: "aria-selected" }, { type: "characterData" }];
  assert.equal(changesPendingNavigation(changes), false);
  assert.equal(changesPendingNavigation([]), false);
});

test("pending markers remain detectable when toggled, inserted or removed with their navigation subtree", () => {
  assert.equal(changesPendingNavigation([{ type: "attributes", attributeName: "data-navigation-pending" }]), true);
  assert.equal(changesPendingNavigation([children([element(true)])]), true);
  assert.equal(changesPendingNavigation([children([], [element(true)])]), true);
  assert.equal(changesPendingNavigation([children([element(false, true)])]), true);
  assert.equal(changesPendingNavigation([children([], [element(false, true)])]), true);
  assert.equal(changesPendingNavigation([children([text]), children([element(true)])]), true);
});

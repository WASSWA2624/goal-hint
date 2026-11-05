import assert from "node:assert/strict";
import test from "node:test";
import { closeDetails, listenForOutsideDismiss } from "../src/components/ui/outside-dismiss.ts";
import { watchNavigationMenu } from "../src/components/navigation/navigation-menu-dismissal.ts";

function fire(target, type, { path = [], key, modal = false, prevented = false } = {}) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "composedPath", { value: () => path });
  if (key) Object.defineProperty(event, "key", { value: key });
  if (modal) Object.defineProperty(event, "target", { value: { closest: () => ({}) } });
  if (prevented) event.preventDefault();
  target.dispatchEvent(event);
  return event;
}

test("navigation opts into immediate outside pointers while shared filters retain click dismissal", () => {
  const document = new EventTarget(), menu = { ownerDocument: document }, filter = { ownerDocument: document };
  let menusClosed = 0, filtersClosed = 0;
  const stopMenu = listenForOutsideDismiss(menu, () => menusClosed++, true);
  const stopFilter = listenForOutsideDismiss(filter, () => filtersClosed++);
  assert.equal(fire(document, "pointerdown").defaultPrevented, false, "Dismissal does not consume the outside interaction");
  assert.deepEqual([menusClosed, filtersClosed], [1, 0]);
  fire(document, "pointerdown", { path: [{}, menu, document] });
  assert.deepEqual([menusClosed, filtersClosed], [1, 0], "Pointer interaction within the menu keeps it open");
  fire(document, "click");
  assert.deepEqual([menusClosed, filtersClosed], [2, 1], "Click-only and keyboard activation still dismiss");
  stopMenu(); stopFilter();
  fire(document, "pointerdown"); fire(document, "click");
  assert.deepEqual([menusClosed, filtersClosed], [2, 1], "Unmount removes both listener types");
});

test("navigation closes on focus, Escape, history and hidden breakpoints without stealing destination focus", () => {
  const previousObserver = globalThis.ResizeObserver;
  let resize, disconnected = false;
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe() {}
    disconnect() { disconnected = true; }
  };
  try {
    const document = new EventTarget(), window = new EventTarget(), link = {}, outside = {}, closed = [];
    document.defaultView = window;
    let visible = true, focusReturns = 0;
    const summary = { focus() { focusReturns++; document.activeElement = summary; } };
    const menu = { ownerDocument: document, open: false, contains: element => element === link || element === summary,
      querySelector: () => summary, getClientRects: () => visible ? [{}] : [] };
    const stop = watchNavigationMenu(menu, restoreFocus => closeDetails(menu, () => closed.push(restoreFocus), { restoreFocus }));

    menu.open = true; document.activeElement = link;
    assert.equal(fire(document, "keydown", { key: "Escape", path: [link, menu, document] }).defaultPrevented, true);
    assert.deepEqual([menu.open, focusReturns, document.activeElement], [false, 1, summary]);

    menu.open = true; document.activeElement = outside;
    fire(document, "keydown", { key: "Escape" });
    assert.deepEqual([menu.open, focusReturns, document.activeElement], [false, 1, outside]);

    menu.open = true;
    fire(document, "keydown", { key: "Escape", prevented: true });
    fire(document, "keydown", { key: "Escape", modal: true });
    assert.equal(menu.open, true, "Nested widgets and modal dialogs keep their own Escape handling");
    fire(document, "focusin", { path: [summary, menu, document] });
    assert.equal(menu.open, true);
    fire(document, "focusin", { path: [outside, document] });
    assert.equal(menu.open, false);
    assert.equal(focusReturns, 1);

    for (const event of ["popstate", "hashchange"]) {
      menu.open = true; document.activeElement = link;
      fire(window, event);
      assert.equal(menu.open, false, event);
      assert.equal(focusReturns, 1, "Navigation never refocuses the old menu trigger");
    }
    menu.open = true;
    fire(document, "scroll", { path: [link, menu, document] });
    fire(window, "scroll");
    resize();
    assert.equal(menu.open, true, "Internal scrolling and visible resizing keep the menu usable");
    visible = false; resize();
    assert.equal(menu.open, false, "The hidden desktop/mobile copy cannot retain an open disclosure");
    assert.equal(focusReturns, 1);
    assert.deepEqual(closed, [true, false, false, false, false, false]);

    stop(); menu.open = true;
    fire(document, "keydown", { key: "Escape" }); fire(document, "focusin"); fire(window, "popstate");
    assert.equal(menu.open, true);
    assert.equal(disconnected, true);
  } finally {
    if (previousObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previousObserver;
  }
});

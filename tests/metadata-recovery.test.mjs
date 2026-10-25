import assert from "node:assert/strict";
import test from "node:test";
import { watchNavigationMetadata } from "../src/components/navigation/watch-navigation-metadata.ts";

const singletons = ["title", 'meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:url"]'];

function metadataHead(t, initial = {}) {
  const counts = new Map(Object.entries(initial));
  const head = { querySelectorAll: (selector) => Array.from({ length: counts.get(selector) ?? 0 }, () => ({})) };
  const original = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.connected = false;
      observers.push(this);
    }
    observe(target, options) {
      assert.equal(target, head);
      assert.deepEqual(options, { childList: true });
      this.connected = true;
    }
    disconnect() { this.connected = false; }
  };
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "MutationObserver", original);
    else delete globalThis.MutationObserver;
  });
  return {
    head,
    set: (selector, count) => counts.set(selector, count),
    notify: () => observers.at(-1).callback([], observers.at(-1)),
    connected: () => observers.at(-1).connected,
  };
}

test("valid or missing metadata and repeatable head tags do not trigger recovery", (t) => {
  const fixture = metadataHead(t, {
    ...Object.fromEntries(singletons.map((selector) => [selector, 1])),
    'meta[property="og:image"]': 3,
    'link[rel="alternate"]': 4,
    'link[rel="stylesheet"]': 4,
    script: 10,
    style: 10,
  });
  let recoveries = 0;
  const stop = watchNavigationMetadata(fixture.head, () => recoveries++);
  fixture.notify();
  for (const selector of singletons) {
    fixture.set(selector, 0);
    fixture.notify();
  }
  assert.equal(recoveries, 0);
  assert.equal(fixture.connected(), true);
  stop();
});

for (const selector of singletons) {
  test(`already committed duplicate ${selector} recovers immediately and disconnects`, (t) => {
    const fixture = metadataHead(t, { [selector]: 2 });
    let recoveries = 0;
    const stop = watchNavigationMetadata(fixture.head, () => recoveries++);
    assert.equal(recoveries, 1);
    assert.equal(fixture.connected(), false);
    fixture.notify();
    fixture.notify();
    stop();
    assert.equal(recoveries, 1);
  });
}

test("a later streamed duplicate triggers exactly one recovery across subsequent callbacks", async (t) => {
  const fixture = metadataHead(t, { title: 1 });
  let recoveries = 0;
  const stop = watchNavigationMetadata(fixture.head, () => recoveries++);
  fixture.notify();
  assert.equal(recoveries, 0);
  await Promise.resolve();
  fixture.set('link[rel="canonical"]', 2);
  fixture.notify();
  fixture.set("title", 2);
  fixture.notify();
  assert.equal(recoveries, 1);
  assert.equal(fixture.connected(), false);
  stop();
});

test("cleanup disconnects and makes a queued observer callback harmless", async (t) => {
  const fixture = metadataHead(t);
  let recoveries = 0;
  const stop = watchNavigationMetadata(fixture.head, () => recoveries++);
  fixture.set('meta[name="description"]', 2);
  const queued = Promise.resolve().then(fixture.notify);
  stop();
  await queued;
  fixture.notify();
  stop();
  assert.equal(fixture.connected(), false);
  assert.equal(recoveries, 0);
});

test("cleanup from a previous navigation cannot disable the next navigation's observer", (t) => {
  const fixture = metadataHead(t);
  let recoveries = 0;
  const stopPrevious = watchNavigationMetadata(fixture.head, () => recoveries++);
  stopPrevious();
  const stopCurrent = watchNavigationMetadata(fixture.head, () => recoveries++);
  stopPrevious();
  assert.equal(fixture.connected(), true);
  fixture.set("title", 2);
  fixture.notify();
  assert.equal(recoveries, 1);
  stopCurrent();
});

test("private owner destinations never reload for metadata duplicates, including a previous public observer", t => {
  const fixture = metadataHead(t);
  let pathname = "/en", recoveries = 0;
  const stop = watchNavigationMetadata(fixture.head, () => recoveries++, () => pathname);
  fixture.set("title", 2);
  for (const destination of ["/admin", "/admin/payments", "/admin/codes", "/analytics", "/analytics/report"]) {
    pathname = destination;
    fixture.notify();
    assert.equal(recoveries, 0, destination);
  }
  pathname = "/en/matches";
  fixture.notify();
  assert.equal(recoveries, 1, "public SEO recovery still handles duplicated metadata");
  stop();
});

test("owner exclusion matches path boundaries and does not exempt public lookalike routes", t => {
  const fixture = metadataHead(t, { title: 2 });
  for (const pathname of ["/administrator", "/analytics-guide", "/en/account"]) {
    let recoveries = 0;
    const stop = watchNavigationMetadata(fixture.head, () => recoveries++, () => pathname);
    assert.equal(recoveries, 1, pathname);
    stop();
  }
});

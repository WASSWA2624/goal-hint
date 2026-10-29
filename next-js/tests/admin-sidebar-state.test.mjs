import assert from "node:assert/strict";
import test from "node:test";
import { adminSidebarSize, clampSidebarWidth, getServerSidebarSnapshot, getSidebarSnapshot, readSidebarPreference } from "../src/components/admin/admin-sidebar-state.ts";

test("sidebar width bounds reject invalid values and retain a usable content area", () => {
  assert.equal(clampSidebarWidth(120), adminSidebarSize.min);
  assert.equal(clampSidebarWidth(800), adminSidebarSize.max);
  assert.equal(clampSidebarWidth(Number.NaN), adminSidebarSize.default);
  assert.equal(clampSidebarWidth(251.4), 251);
  assert.equal(clampSidebarWidth(320, 304), 304);
});

test("malformed stored sidebar preferences fall back without accepting arbitrary state", () => {
  for (const value of [null, "", "{", "false", "[]", '{"collapsed":"true","width":"320"}']) {
    assert.deepEqual(readSidebarPreference(value), { collapsed: false, width: 232 });
  }
  assert.deepEqual(readSidebarPreference('{"collapsed":true,"width":280,"phone":"discarded"}'), { collapsed: true, width: 280 });
  assert.deepEqual(readSidebarPreference('{"collapsed":false,"width":999}'), { collapsed: false, width: 320 });
});

test("SSR sidebar snapshots are stable and browser width caps leave 720px for content", () => {
  assert.equal(getServerSidebarSnapshot(), "0:232:320");
  assert.equal(getSidebarSnapshot(), getServerSidebarSnapshot());
  const original = globalThis.window;
  const originalDocument = globalThis.document;
  try {
    globalThis.window = { innerWidth: 1024, localStorage: { getItem: () => '{"collapsed":false,"width":320}' } };
    assert.equal(getSidebarSnapshot(), "0:298:298");
    globalThis.document = { documentElement: { getBoundingClientRect: () => ({ width: 1008.6667 }) } };
    assert.equal(getSidebarSnapshot(), "0:282:282");
    assert.ok(1008.6667 - Number(getSidebarSnapshot().split(":")[1]) - adminSidebarSize.handle >= adminSidebarSize.contentMin);
    globalThis.document.documentElement.getBoundingClientRect = () => ({ width: 0 });
    assert.equal(getSidebarSnapshot(), "0:298:298");
    globalThis.window.innerWidth = 1440;
    assert.equal(getSidebarSnapshot(), "0:320:320");
    globalThis.window.localStorage.getItem = () => { throw new Error("storage unavailable"); };
    assert.equal(getSidebarSnapshot(), "0:232:320");
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

import assert from "node:assert/strict";
import vm from "node:vm";
import test from "node:test";
import nextConfig from "../next.config.ts";
import { GET } from "../src/app/api/development/offline-worker/route.ts";
import { updateDevelopmentOfflineWorker } from "../src/components/offline/update-development-offline-worker.ts";

async function withMode(mode, run) {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = mode;
  try { return await run(); }
  finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

async function worker({ denied = false, failingTab = false } = {}) {
  const response = await withMode("development", GET);
  const events = new Map(), calls = [], navigations = [];
  const stored = new Set(["goal-hint-offline-meta-v1", "goal-hint-offline-bundle-v1-old", "another-app-cache"]);
  const windows = ["http://localhost:3000/en?tab=best", "http://localhost:3000/en/matches"]
    .map((url, index) => ({ url, async navigate(target) {
      navigations.push(target);
      if (failingTab && index === 0) throw new Error("Tab closed");
    } }));
  vm.runInNewContext(await response.text(), {
    self: {
      addEventListener: (name, callback) => events.set(name, callback),
      skipWaiting: async () => { calls.push("skipWaiting"); },
      registration: { unregister: async () => { calls.push("unregister"); return true; } },
      clients: {
        claim: async () => { calls.push("claim"); },
        matchAll: async (options) => {
          assert.equal(options.type, "window");
          assert.equal(options.includeUncontrolled, undefined);
          return windows;
        },
      },
    },
    caches: {
      keys: async () => { if (denied) throw new Error("Storage denied"); return [...stored]; },
      delete: async (name) => stored.delete(name),
    },
  });
  return { calls, stored, navigations, events, async dispatch(name) {
    let pending;
    events.get(name)({ waitUntil: (promise) => { pending = promise; } });
    await pending;
  } };
}

test("development replaces the public worker before filesystem lookup and preserves sitemap rewrites", async () => {
  await withMode("development", async () => {
    const rules = await nextConfig.rewrites();
    assert.deepEqual(rules.beforeFiles, [{ source: "/offline-worker.js", destination: "/api/development/offline-worker" }]);
    assert.deepEqual(rules.afterFiles, [
      { source: "/sitemap-matches-:id.xml", destination: "/matches/sitemap/:id.xml" },
      { source: "/sitemap-archive-:id.xml", destination: "/archive/sitemap/:id.xml" },
    ]);
    const response = GET();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /application\/javascript/);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("service-worker-allowed"), "/");
  });
});

for (const mode of ["production", "test"]) test(`${mode} never serves or rewrites to the retirement worker`, async () => {
  await withMode(mode, async () => {
    assert.deepEqual((await nextConfig.rewrites()).beforeFiles, []);
    const response = GET();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(await response.text(), "");
  });
});

test("replacement immediately activates, unregisters, removes only owned caches and reloads controlled tabs", async () => {
  const fixture = await worker();
  assert.equal(fixture.events.has("fetch"), false, "The replacement cannot intercept development resources");
  await fixture.dispatch("install");
  await fixture.dispatch("activate");
  assert.deepEqual(fixture.calls, ["skipWaiting", "claim", "unregister"]);
  assert.deepEqual([...fixture.stored], ["another-app-cache"]);
  assert.deepEqual(fixture.navigations, ["http://localhost:3000/en?tab=best", "http://localhost:3000/en/matches"]);
});

test("denied CacheStorage cannot trap an already open saved page", async () => {
  const fixture = await worker({ denied: true });
  await fixture.dispatch("activate");
  assert.ok(fixture.calls.includes("unregister"));
  assert.equal(fixture.navigations.length, 2);
});

test("one tab closing cannot prevent recovery of another controlled tab", async () => {
  const fixture = await worker({ failingTab: true });
  await fixture.dispatch("activate");
  assert.equal(fixture.navigations.length, 2);
});

test("loaded development pages update an existing Goal Hint worker without registering one", async () => {
  for (const state of ["active", "waiting", "installing"]) {
    let updates = 0;
    await updateDevelopmentOfflineWorker({ getRegistration: async (scope) => {
      assert.equal(scope, "/");
      return { [state]: { scriptURL: "http://localhost:3000/offline-worker.js" }, update: async () => { updates++; } };
    } });
    assert.equal(updates, 1, state);
  }
});

test("fresh origins and unrelated registrations are left alone", async () => {
  await updateDevelopmentOfflineWorker({ getRegistration: async () => undefined });
  await updateDevelopmentOfflineWorker({ getRegistration: async () => ({
    active: { scriptURL: "http://localhost:3000/another-worker.js" },
    update: () => assert.fail("Unrelated workers must not be updated"),
  }) });
});

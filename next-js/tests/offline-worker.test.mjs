import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/offline-worker.js", import.meta.url), "utf8");
const origin = "https://offline.example.test";
const at = Date.parse("2026-10-26T09:00:00Z");
const prefix = "goal-hint-offline-";
const absolute = (path) => new URL(path, origin).href;
const encode = (value) => new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
async function hash(bytes) { return Buffer.from(await webcrypto.subtle.digest("SHA-256", bytes)).toString("hex"); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class MemoryCache {
  constructor(owner, name) { this.owner = owner; this.name = name; this.entries = new Map(); }
  async match(key) {
    if (this.owner.failMatch?.(this.name, key)) throw new Error("Synthetic transient read failure");
    return this.entries.get(typeof key === "string" ? key : key.url)?.clone();
  }
  async put(key, value) {
    if (this.owner.failPut?.(this.name, key)) throw new Error("Synthetic storage failure");
    this.entries.set(typeof key === "string" ? key : key.url, value.clone());
  }
  async delete(key) { return this.entries.delete(typeof key === "string" ? key : key.url); }
}
class MemoryLocks {
  constructor() { this.held = new Set(); }
  async request(name, options, callback) {
    assert.equal(options.mode, "exclusive");
    assert.equal(options.ifAvailable, true);
    if (this.held.has(name)) return callback(null);
    this.held.add(name);
    try { return await callback({ name, mode: "exclusive" }); }
    finally { this.held.delete(name); }
  }
}
class MemoryStorage {
  constructor() { this.stores = new Map(); this.locks = new MemoryLocks(); }
  async open(name) {
    if (this.deny) throw new Error("Synthetic denied storage");
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache(this, name));
    return this.stores.get(name);
  }
  async keys() { return [...this.stores.keys()]; }
  async delete(name) {
    if (this.failDelete?.(name)) throw new Error("Synthetic cleanup failure");
    return this.stores.delete(name);
  }
}

function snapshot(overrides = {}) {
  return { schemaVersion: 1, capturedAt: at, expiresAt: at + 86_400_000, reportingDate: "2026-10-26", records: [{
    fixtureId: "public-fixture", dataVersion: "12", homeTeam: { id: "home", name: "Home", code: "HOM" },
    awayTeam: { id: "away", name: "Away", code: null }, competition: { id: "league", name: "Public league", country: "Uganda" },
    kickoffAt: at, syncedAt: at, status: "live", score: { home: 1, away: 0 }, scorePeriod: "live",
  }], ...overrides };
}

async function bundle({ name = "one", data = snapshot(), badAsset = false, policy = "public, max-age=0" } = {}) {
  const entryBody = `<html><body data-offline-view>Saved ${name}</body></html>`;
  const assetBody = `window.syntheticOffline = ${JSON.stringify(name)};`;
  const entry = { url: "/offline", sha256: await hash(encode(entryBody)), bytes: encode(entryBody).byteLength };
  const assets = [{ url: `/_next/static/chunks/${name}.js`, sha256: await hash(encode(assetBody)), bytes: encode(assetBody).byteLength }];
  const manifest = { schemaVersion: 1, version: await hash(encode({ schemaVersion: 1, entry, assets })), createdAt: data.capturedAt, entry, assets };
  const headers = (type, marker) => ({ "cache-control": policy, "content-type": type, ...(marker ? { [marker]: "1" } : {}) });
  const responses = new Map([
    ["/offline-manifest.json", new Response(JSON.stringify(manifest), { headers: headers("application/json", "x-goalhint-offline-manifest") })],
    ["/offline", new Response(entryBody, { headers: headers("text/html", "x-goalhint-offline-entry") })],
    ["/api/offline/snapshot", new Response(JSON.stringify(data), { headers: headers("application/json", "x-goalhint-offline-snapshot") })],
    [assets[0].url, new Response(badAsset ? "incomplete" : assetBody, { headers: headers("application/javascript") })],
  ]);
  return { manifest, data, responses, entryBody, assetBody };
}

function worker({ storage = new MemoryStorage(), current, now = at + 1000, locks = storage.locks, clients, timerCap = Infinity } = {}) {
  const events = new Map(), calls = [];
  const clock = { now };
  const network = { current, offline: false, navigationStatus: 200, navigationBody: "Online private document" };
  class Clock extends Date { static now() { return clock.now; } }
  const context = vm.createContext({
    self: { location: { origin }, addEventListener: (name, callback) => events.set(name, callback),
      navigator: { locks }, clients: { claim: async () => {}, ...(clients ? { get: async (id) => clients.get(id) } : {}) } },
    caches: storage, crypto: webcrypto, URL, Request, Response, Headers, TextEncoder, TextDecoder, AbortController,
    setTimeout: (callback, delay) => setTimeout(callback, Math.min(delay, timerCap)), clearTimeout, Date: Clock, Intl,
    fetch: async (input, options = {}) => {
      const url = typeof input === "string" ? input : input.url;
      calls.push({ url, options, mode: input.mode });
      network.onFetch?.({ url, options });
      const overridden = await network.respond?.({ url, options, input });
      if (overridden !== undefined) return overridden;
      if (network.offline) throw new TypeError("Synthetic offline network");
      if (input.mode === "navigate") return new Response(network.navigationBody, { status: network.navigationStatus, headers: { "cache-control": "private, no-store" } });
      const found = network.current?.responses.get(new URL(url).pathname);
      return found ? found.clone() : new Response("Missing", { status: 404, headers: { "cache-control": "no-store" } });
    },
  });
  vm.runInContext(source, context);
  function beginMessage(type = "PREPARE", extra = {}, clientId = "client-1") {
    let pending, value, resolve;
    const reply = new Promise((done) => { resolve = done; });
    const port = { onmessage: null, start() {}, close() {}, postMessage(data) {
      if (value === undefined) { value = JSON.parse(JSON.stringify(data)); resolve(value); }
    } };
    events.get("message")({ data: { type, ...extra }, source: { url: absolute("/en/matches"), id: clientId },
      ports: [port], waitUntil(result) { pending = result; } });
    return { reply, settled: pending ?? Promise.resolve(), value: () => value,
      cancel: () => port.onmessage?.({ data: { type: "CANCEL" } }) };
  }
  return { storage, calls, network, clock,
    beginMessage,
    async message(type = "PREPARE", extra = {}) {
      const request = beginMessage(type, extra);
      await request.settled;
      return request.value();
    },
    async request(path, { mode = "cors", method = "GET" } = {}) {
      let response;
      events.get("fetch")({ request: { url: absolute(path), method, mode }, respondWith(value) { response = value; } });
      return response === undefined ? undefined : await response;
    },
  };
}

test("complete anonymous bundle survives a cold worker restart and renders with all network requests failing", async () => {
  const first = await bundle(), online = worker({ current: first });
  assert.deepEqual(await online.message(), { ok: true, refreshed: true, activated: true, version: first.manifest.version,
    capturedAt: first.data.capturedAt, expiresAt: first.data.expiresAt, records: 1 });
  assert.ok(online.calls.every(({ options }) => options.credentials === "omit"));
  const cold = worker({ storage: online.storage });
  cold.network.offline = true;
  assert.equal(await (await cold.request("/en/matches", { mode: "navigate" })).text(), first.entryBody);
  assert.equal(await (await cold.request(first.manifest.assets[0].url)).text(), first.assetBody);
  assert.deepEqual(await (await cold.request("/offline-cache/snapshot")).json(), first.data);
  const state = await (await cold.request("/offline-cache/status")).json();
  assert.equal(state.ok, true);
  assert.equal(state.records, 1);
  assert.deepEqual(await cold.message("STATUS"), state);
});

test("both theme branding variants remain available after an offline restart", async () => {
  const initial = await bundle();
  const branding = ["/brand/goal-hint-logo-primary.svg", "/brand/goal-hint-logo-inverse.svg",
    "/brand/goal-hint-mark-primary.svg", "/brand/goal-hint-mark-inverse.svg",
    "/brand/goal-hint-header-primary.svg", "/brand/goal-hint-header-inverse.svg"];
  for (const url of branding) {
    const body = `<svg data-brand="${url}"/>`, bytes = encode(body);
    initial.manifest.assets.push({ url, sha256: await hash(bytes), bytes: bytes.byteLength });
    initial.responses.set(url, new Response(body, { headers: { "cache-control": "public", "content-type": "image/svg+xml" } }));
  }
  initial.manifest.assets.sort((left, right) => left.url < right.url ? -1 : left.url > right.url ? 1 : 0);
  const { schemaVersion, entry, assets } = initial.manifest;
  initial.manifest.version = await hash(encode({ schemaVersion, entry, assets }));
  initial.responses.set("/offline-manifest.json", new Response(JSON.stringify(initial.manifest), {
    headers: { "cache-control": "public", "content-type": "application/json", "x-goalhint-offline-manifest": "1" },
  }));
  const online = worker({ current: initial });
  assert.equal((await online.message()).ok, true);
  const cold = worker({ storage: online.storage });
  cold.network.offline = true;
  for (const url of branding) assert.equal(await (await cold.request(url)).text(), `<svg data-brand="${url}"/>`);
});

test("private/no-store responses, cookies, missing markers and unapproved assets cannot bootstrap", async () => {
  for (const mutate of [
    (candidate) => candidate.responses.get("/api/offline/snapshot").headers.set("cache-control", "private, no-store"),
    (candidate) => candidate.responses.get("/api/offline/snapshot").headers.set("vary", "Accept, Cookie"),
    (candidate) => candidate.responses.get("/api/offline/snapshot").headers.set("set-cookie", "synthetic=not-permitted"),
    (candidate) => candidate.responses.get("/offline").headers.delete("x-goalhint-offline-entry"),
    (candidate) => candidate.responses.get(candidate.manifest.assets[0].url).headers.set("cache-control", "no-store"),
  ]) {
    const candidate = await bundle(); mutate(candidate);
    const host = worker({ current: candidate }), result = await host.message();
    assert.equal(result.ok, false);
    assert.equal((await host.message("STATUS")).ok, false);
    assert.equal((await host.storage.keys()).filter((name) => name.includes("bundle")).length, 0);
  }
});

test("snapshot validation rejects extra secret fields, coercion and invalid retention", async () => {
  for (const mutate of [
    (data) => { data.session = "synthetic-secret"; },
    (data) => { data.records[0].forecast = { subscriber: true }; },
    (data) => { data.records[0].homeTeam.logoUrl = "https://third-party.test/logo"; },
    (data) => { data.records[0].fixtureId = 123; },
    (data) => { data.records[0].homeTeam.id = 123; },
    (data) => { data.records[0].dataVersion = "18446744073709551616"; },
    (data) => { data.expiresAt += 1; },
    (data) => { data.capturedAt = at + 302_000; data.expiresAt = data.capturedAt + 86_400_000; },
    (data) => { data.reportingDate = "2026-10-25"; },
  ]) {
    const data = snapshot(); mutate(data);
    const host = worker({ current: await bundle({ data }) });
    assert.equal((await host.message()).ok, false);
    assert.equal((await host.request("/offline-cache/snapshot")).status, 503);
  }
});

test("bounded server/device clock skew permits saved reads without extending snapshot retention", async () => {
  for (const skew of [1000, 300_000]) {
    const capturedAt = at + 1000 + skew;
    const data = snapshot({ capturedAt, expiresAt: capturedAt + 86_400_000 });
    const host = worker({ current: await bundle({ data }) });
    assert.equal((await host.message()).ok, true);
    assert.equal((await (await host.request("/offline-cache/snapshot")).json()).expiresAt, capturedAt + 86_400_000);
    host.clock.now = data.expiresAt;
    assert.equal((await host.request("/offline-cache/snapshot")).status, 503);
  }
});

test("unapproved asset URLs, duplicate assets and incompatible manifest hashes cannot activate", async () => {
  for (const mutate of [
    (manifest) => { manifest.assets[0].url = "/api/account/session"; },
    (manifest) => { manifest.assets[0].url = "https://third-party.test/code.js"; },
    (manifest) => { manifest.assets.push({ ...manifest.assets[0] }); },
    (manifest) => { manifest.version = "0".repeat(64); },
    (manifest) => { manifest.entry.bytes = 4 * 1024 * 1024 + 1; },
  ]) {
    const candidate = await bundle(); mutate(candidate.manifest);
    candidate.responses.set("/offline-manifest.json", new Response(JSON.stringify(candidate.manifest), {
      headers: { "cache-control": "public", "x-goalhint-offline-manifest": "1" },
    }));
    const host = worker({ current: candidate });
    assert.equal((await host.message()).ok, false);
    assert.equal((await host.message("STATUS")).ok, false);
  }
});

test("failed asset downloads, integrity checks and activation writes retain the complete prior version", async () => {
  for (const failure of ["asset", "activation", "manifest"]) {
    const initial = await bundle(), host = worker({ current: initial });
    await host.message();
    const next = await bundle({ name: "two", data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_400_000 + 2000 }), badAsset: failure === "asset" });
    if (failure === "manifest") next.responses.get("/offline-manifest.json").headers.set("cache-control", "private, no-store");
    host.network.current = next;
    host.clock.now = at + 3000;
    host.storage.failPut = (name, key) => failure === "activation" && name.includes("meta") && key.endsWith("/active");
    const result = await host.message();
    assert.equal(result.ok, true);
    assert.equal(result.retained, true);
    assert.equal(result.version, initial.manifest.version);
    host.network.offline = true;
    assert.equal(await (await host.request("/", { mode: "navigate" })).text(), initial.entryBody);
  }
});

test("valid updates activate atomically, retain one prior bundle and never touch another application's cache", async () => {
  const initial = await bundle(), host = worker({ current: initial });
  await (await host.storage.open("other-application-cache")).put(absolute("/private"), new Response("unrelated"));
  await host.message();
  for (const [index, name] of ["two", "three", "four"].entries()) {
    host.clock.now = at + (index + 1) * 2000;
    const current = await bundle({ name, data: snapshot({ capturedAt: host.clock.now, expiresAt: host.clock.now + 86_400_000 }) });
    host.network.current = current;
    assert.equal((await host.message()).version, current.manifest.version);
    assert.equal((await host.storage.keys()).filter((key) => key.startsWith(`${prefix}bundle-`)).length, 2);
  }
  assert.equal(await (await (await host.storage.open("other-application-cache")).match(absolute("/private"))).text(), "unrelated");
});

test("projection refresh reuses verified unchanged assets while a changed build downloads its new assets", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  const firstDownloads = host.calls.length;
  host.clock.now = at + 3000;
  const refreshed = await bundle({ data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  host.network.current = refreshed;
  assert.equal((await host.message()).version, initial.manifest.version);
  assert.deepEqual(host.calls.slice(firstDownloads).map(({ url }) => new URL(url).pathname), ["/offline-manifest.json", "/api/offline/snapshot"]);
  assert.equal((await (await host.request("/offline-cache/snapshot")).json()).capturedAt, at + 2000);

  const refreshDownloads = host.calls.length;
  host.clock.now = at + 5000;
  const changed = await bundle({ name: "two", data: snapshot({ capturedAt: at + 4000, expiresAt: at + 86_404_000 }) });
  host.network.current = changed;
  assert.equal((await host.message()).version, changed.manifest.version);
  assert.deepEqual(host.calls.slice(refreshDownloads).map(({ url }) => new URL(url).pathname),
    ["/offline-manifest.json", "/api/offline/snapshot", "/offline", "/_next/static/chunks/two.js"]);
});

test("an unavailable copied asset is fetched and verified without changing the active bundle early", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  host.clock.now = at + 3000;
  host.network.current = await bundle({ data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  let reads = 0;
  host.storage.failMatch = (name, key) => name.includes("bundle") && key.endsWith("/one.js") && ++reads === 2;
  const firstDownloads = host.calls.length;
  assert.equal((await host.message()).version, initial.manifest.version);
  assert.deepEqual(host.calls.slice(firstDownloads).map(({ url }) => new URL(url).pathname),
    ["/offline-manifest.json", "/api/offline/snapshot", "/_next/static/chunks/one.js"]);
  host.network.offline = true;
  assert.equal(await (await host.request("/en/matches", { mode: "navigate" })).text(), initial.entryBody);
});

test("a copied asset that fails its integrity check cannot activate a refreshed projection", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  const cacheName = (await host.storage.keys()).find((name) => name.includes("bundle"));
  const cache = await host.storage.open(cacheName), originalMatch = cache.match.bind(cache);
  let reads = 0;
  cache.match = async (key) => {
    const response = await originalMatch(key);
    return key.endsWith("/one.js") && ++reads === 2 ? new Response("tampered", { headers: response.headers }) : response;
  };
  host.clock.now = at + 3000;
  host.network.current = await bundle({ data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  const result = await host.message();
  assert.equal(result.retained, true);
  assert.equal(result.updateError, "integrity-failure");
  assert.equal((await (await host.request("/offline-cache/snapshot")).json()).capturedAt, at);
});

test("a bounded preparation deadline and a transient read failure preserve the active bundle", async () => {
  for (const failure of ["deadline", "read"]) {
    const initial = await bundle(), host = worker({ current: initial }); await host.message();
    host.clock.now = at + 3000;
    const candidate = await bundle({ name: "two", data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }), badAsset: failure === "read" });
    host.network.current = candidate;
    if (failure === "deadline") host.network.onFetch = ({ url }) => {
      if (url.endsWith("/two.js")) host.clock.now += 46_000;
    };
    let readFailed = false;
    host.storage.failMatch = (name, key) => {
      if (failure === "read" && !readFailed && name.includes("bundle") && key.endsWith("/snapshot")) {
        readFailed = true; return true;
      }
      return false;
    };
    const result = await host.message();
    assert.equal(result.retained, true);
    assert.equal(result.version, initial.manifest.version);
    host.network.offline = true;
    assert.equal(await (await host.request("/en/matches", { mode: "navigate" })).text(), initial.entryBody);
  }
});

test("concurrent preparation requests share a single staged download", async () => {
  const candidate = await bundle(), host = worker({ current: candidate });
  const replies = await Promise.all([host.message(), host.message(), host.message()]);
  assert.ok(replies.every((reply) => reply.ok && reply.version === candidate.manifest.version));
  assert.equal(host.calls.filter(({ url }) => url.endsWith("/offline-manifest.json")).length, 1);
});

test("a corrupt or evicted required asset and expired content fail honestly after a cold restart", async () => {
  for (const failure of ["corrupt", "missing", "expired"]) {
    const initial = await bundle(), warm = worker({ current: initial });
    await warm.message();
    const name = (await warm.storage.keys()).find((key) => key.includes("bundle"));
    const cache = await warm.storage.open(name), key = absolute(initial.manifest.assets[0].url);
    if (failure === "corrupt") await cache.put(key, new Response("corrupt"));
    if (failure === "missing") await cache.delete(key);
    const cold = worker({ storage: warm.storage, now: failure === "expired" ? at + 86_400_001 : at + 1000 });
    cold.network.offline = true;
    assert.equal((await cold.request("/offline-cache/status")).status, 503);
    assert.equal((await cold.request("/offline-cache/snapshot")).status, 503);
    await assert.rejects(cold.request("/en/matches", { mode: "navigate" }), /network-unreachable/);
    if (failure === "expired") assert.equal((await cold.storage.keys()).filter((key) => key.includes("bundle")).length, 0);
  }
});

test("cleanup failure after activation never deletes the newly committed bundle", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  const candidate = await bundle({ name: "two", data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  host.network.current = candidate;
  host.clock.now = at + 3000;
  let activationWritten = false;
  host.storage.failPut = (name, key) => {
    if (name.includes("meta") && key.endsWith("/active")) activationWritten = true;
    return false;
  };
  // Simulate another incomplete candidate becoming visible just after commit.
  const orphan = `${prefix}bundle-v1-${"a".repeat(64)}`;
  const originalKeys = host.storage.keys.bind(host.storage);
  host.storage.keys = async () => activationWritten ? [...await originalKeys(), orphan] : originalKeys();
  host.storage.failDelete = (name) => name === orphan;
  const result = await host.message();
  assert.equal(result.version, candidate.manifest.version);
  host.network.offline = true;
  assert.equal(await (await host.request("/en/matches", { mode: "navigate" })).text(), candidate.entryBody);
});

test("first-use offline and denied storage do not claim a saved startup", async () => {
  const offline = worker(); offline.network.offline = true;
  assert.equal((await offline.message()).ok, false);
  await assert.rejects(offline.request("/", { mode: "navigate" }), /network-unreachable/);
  const denied = worker({ current: await bundle() }); denied.storage.deny = true;
  assert.equal((await denied.message()).ok, false);
  assert.equal((await denied.request("/offline-cache/status")).status, 503);
});

test("normal private documents, RSC, account APIs and mutations are never persisted or replayed", async () => {
  const host = worker({ current: await bundle() }); await host.message();
  assert.equal(await (await host.request("/en/account", { mode: "navigate" })).text(), "Online private document");
  for (const path of ["/api/account/session", "/api/matches", "/en/matches?_rsc=private", "/api/account/password"]) {
    assert.equal(await host.request(path), undefined);
    assert.equal(await host.request(path, { method: "POST" }), undefined);
  }
  const allKeys = [...host.storage.stores.values()].flatMap((cache) => [...cache.entries.keys()]);
  assert.ok(allKeys.every((key) => !/account|api\/matches|_rsc/.test(key)));
  const allBodies = await Promise.all([...host.storage.stores.values()].flatMap((cache) => [...cache.entries.values()].map((response) => response.clone().text())));
  assert.ok(allBodies.every((body) => !body.includes("Online private document")));
});

test("HTTP authorization errors remain authoritative while an unavailable server uses the complete cache", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  for (const code of [401, 403, 404, 429]) {
    host.network.navigationStatus = code;
    assert.equal((await host.request("/en/account", { mode: "navigate" })).status, code);
  }
  host.network.navigationStatus = 503;
  assert.equal(await (await host.request("/en/matches", { mode: "navigate" })).text(), initial.entryBody);
});

test("older snapshots or fixture versions cannot replace a newer retained projection", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  const older = snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 });
  older.records[0].dataVersion = "11";
  host.network.current = await bundle({ name: "old-data", data: older });
  host.clock.now = at + 3000;
  const result = await host.message();
  assert.equal(result.retained, true);
  assert.equal(result.updateError, "older-version");
  assert.equal((await host.request("/offline-cache/snapshot")).status, 200);
});

test("retained cache availability is distinct from successful server refresh and finite HTTP failure reasons", async () => {
  const cases = [
    [401, "authentication-required"], [403, "authentication-required"], [429, "rate-limited", "999999", 300],
    [503, "server-unavailable", "30", 30], [302, "unexpected-response"],
  ];
  for (const [status, reason, retry, expectedRetry] of cases) {
    const initial = await bundle(), host = worker({ current: initial }); await host.message();
    initial.responses.set("/offline-manifest.json", new Response("Unusable deployment response", { status,
      headers: { "cache-control": "no-store", ...(retry ? { "retry-after": retry } : {}) } }));
    const result = await host.message();
    assert.equal(result.ok, true);
    assert.equal(result.refreshed, false);
    assert.equal(result.retained, true);
    assert.equal(result.updateError, reason);
    assert.equal(result.retryAfterSeconds, expectedRetry);
    assert.equal(result.capturedAt, initial.data.capturedAt);
    host.network.offline = true;
    assert.equal(await (await host.request("/en/matches", { mode: "navigate" })).text(), initial.entryBody);
  }
});

test("captive, wrong-type and malformed manifest responses never count as reachability success", async () => {
  for (const [body, headers, reason] of [
    ["<html>Captive portal</html>", { "content-type": "text/html" }, "unexpected-response"],
    ["<html>Wrong type</html>", { "content-type": "text/html", "x-goalhint-offline-manifest": "1" }, "unexpected-response"],
    ["malformed-json", { "content-type": "application/json", "x-goalhint-offline-manifest": "1" }, "invalid-bundle"],
  ]) {
    const initial = await bundle(), host = worker({ current: initial }); await host.message();
    initial.responses.set("/offline-manifest.json", new Response(body, { headers: { "cache-control": "public", ...headers } }));
    const result = await host.message();
    assert.equal(result.refreshed, false);
    assert.equal(result.updateError, reason);
  }
});

test("network refusal, fetch timeout and stalled-body timeout have distinct bounded failure results", async () => {
  for (const failure of ["unreachable", "fetch-timeout", "body-timeout"]) {
    const initial = await bundle(), warm = worker({ current: initial }); await warm.message();
    const host = worker({ storage: warm.storage, current: initial, timerCap: 30 });
    let canceledBody = false;
    if (failure === "unreachable") host.network.offline = true;
    else host.network.respond = ({ url, options }) => {
      if (!url.endsWith("/offline-manifest.json")) return undefined;
      if (failure === "fetch-timeout") return new Promise((_, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      return new Response(new ReadableStream({ cancel() { canceledBody = true; } }), {
        headers: { "cache-control": "public", "content-type": "application/json", "x-goalhint-offline-manifest": "1" },
      });
    };
    const result = await host.message();
    assert.equal(result.retained, true);
    assert.equal(result.refreshed, false);
    assert.equal(result.updateError, failure === "unreachable" ? "network-unreachable" : "network-timeout");
    if (failure === "body-timeout") assert.equal(canceledBody, true);
  }
});

test("canceling the sole preparation lease aborts network work, removes its candidate and preserves active data", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  host.clock.now = at + 3000;
  const candidate = await bundle({ name: "two", data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  host.network.current = candidate;
  const started = deferred();
  let aborted = false;
  host.network.respond = ({ url, options }) => {
    if (!url.endsWith("/two.js")) return undefined;
    return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Canceled", "AbortError")); }, { once: true });
      started.resolve();
    });
  };
  const request = host.beginMessage();
  await started.promise;
  request.cancel();
  assert.deepEqual(await request.reply, { ok: false, refreshed: false, error: "canceled" });
  await request.settled;
  assert.equal(aborted, true);
  assert.equal((await (await host.request("/offline-cache/snapshot")).json()).capturedAt, at);
  assert.equal((await host.storage.keys()).filter((name) => name.includes("bundle")).length, 1);
});

test("canceling a stalled response stream consumes no further body and leaves the prior bundle usable", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  const started = deferred();
  let canceled = false;
  host.network.respond = ({ url }) => {
    if (!url.endsWith("/api/offline/snapshot")) return undefined;
    const response = new Response(new ReadableStream({ cancel() { canceled = true; } }), {
      headers: { "cache-control": "public", "content-type": "application/json", "x-goalhint-offline-snapshot": "1" },
    });
    started.resolve();
    return response;
  };
  const request = host.beginMessage();
  await started.promise;
  request.cancel();
  assert.equal((await request.reply).error, "canceled");
  await request.settled;
  assert.equal(canceled, true);
  assert.equal((await host.message("STATUS")).ok, true);
});

test("one canceled client cannot interrupt another visible client's shared preparation", async () => {
  const initial = await bundle(), host = worker({ current: initial }); await host.message();
  host.clock.now = at + 3000;
  const candidate = await bundle({ name: "two", data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  host.network.current = candidate;
  const started = deferred(), release = deferred();
  let aborted = false;
  host.network.respond = async ({ url, options }) => {
    if (!url.endsWith("/two.js")) return undefined;
    options.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
    started.resolve();
    await release.promise;
    return candidate.responses.get(candidate.manifest.assets[0].url).clone();
  };
  const first = host.beginMessage();
  await started.promise;
  const second = host.beginMessage("PREPARE", {}, "client-2");
  first.cancel();
  assert.equal((await first.reply).error, "canceled");
  assert.equal(aborted, false);
  release.resolve();
  const result = await second.reply;
  await Promise.all([first.settled, second.settled]);
  assert.equal(result.refreshed, true);
  assert.equal(result.version, candidate.manifest.version);
});

test("closed or hidden clients lose only their own lease before further staged work", async () => {
  for (const state of ["hidden", "closed"]) {
    const initial = await bundle(), clients = new Map([["client-1", { visibilityState: "visible" }]]);
    const host = worker({ current: initial, clients }); await host.message();
    const before = host.calls.length;
    host.network.onFetch = ({ url }) => {
      if (url.endsWith("/offline-manifest.json")) {
        if (state === "closed") clients.delete("client-1");
        else clients.set("client-1", { visibilityState: "hidden" });
      }
    };
    const request = host.beginMessage();
    assert.equal((await request.reply).error, "canceled");
    await request.settled;
    assert.deepEqual(host.calls.slice(before).map(({ url }) => new URL(url).pathname), ["/offline-manifest.json"]);
    assert.equal((await host.message("STATUS")).ok, true);
  }
});

test("separate worker writers use one nonqueued origin lock and a busy peer preserves the committed cache", async () => {
  const initial = await bundle(), first = worker({ current: initial }); await first.message();
  const candidate = await bundle({ name: "two", data: snapshot({ capturedAt: at + 2000, expiresAt: at + 86_402_000 }) });
  first.clock.now = at + 3000;
  first.network.current = candidate;
  const started = deferred(), release = deferred();
  first.network.respond = async ({ url }) => {
    if (!url.endsWith("/offline-manifest.json")) return undefined;
    started.resolve(); await release.promise;
    return candidate.responses.get("/offline-manifest.json").clone();
  };
  const active = first.beginMessage();
  await started.promise;
  const peer = worker({ storage: first.storage, current: candidate, now: at + 3000 });
  const busy = await peer.message();
  assert.equal(busy.retained, true);
  assert.equal(busy.refreshed, false);
  assert.equal(busy.updateError, "preparation-busy");
  assert.equal(peer.calls.length, 0);
  release.resolve();
  assert.equal((await active.reply).version, candidate.manifest.version);
  await active.settled;
  assert.equal((await peer.message("STATUS")).version, candidate.manifest.version);
});

test("missing cross-context coordination fails closed without network or cache mutation", async () => {
  const initial = await bundle(), warm = worker({ current: initial }); await warm.message();
  const retained = worker({ storage: warm.storage, current: initial, locks: null });
  const result = await retained.message();
  assert.equal(result.updateError, "coordination-unavailable");
  assert.equal(result.refreshed, false);
  assert.equal(result.retained, true);
  assert.equal(retained.calls.length, 0);
  const firstUse = worker({ current: initial, locks: null });
  assert.deepEqual(await firstUse.message(), { ok: false, refreshed: false, error: "coordination-unavailable" });
  assert.equal(firstUse.calls.length, 0);
});

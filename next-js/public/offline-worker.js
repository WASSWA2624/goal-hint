/* Goal Hint's only durable content store: a complete, anonymous, versioned bundle.
 * Normal documents, RSC, private APIs, credentials and writes never enter it. */
"use strict";

const CACHE_PREFIX = "goal-hint-offline-";
const META_CACHE = `${CACHE_PREFIX}meta-v1`;
const BUNDLE_PREFIX = `${CACHE_PREFIX}bundle-v1-`;
const PREPARATION_LOCK = `${CACHE_PREFIX}prepare-v1`;
const ACTIVE_KEY = "/offline-cache/active";
const RECORD_KEY = "/offline-cache/record";
const SNAPSHOT_KEY = "/offline-cache/snapshot";
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 128 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_RECORD_BYTES = 96 * 1024;
const MAX_ASSETS = 256;
const RETENTION_MS = 86_400_000;
const CLOCK_SKEW_MS = 300_000;
const FETCH_TIMEOUT_MS = 8_000;
const PREPARATION_TIMEOUT_MS = 45_000;
const NAVIGATION_TIMEOUT_MS = 4_000;
const hashPattern = /^[a-f0-9]{64}$/;
const identityPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const statuses = new Set(["scheduled", "live", "finished-regulation", "finished-extra-time", "finished-penalties",
  "postponed", "canceled", "abandoned", "awarded", "unknown"]);
const brandAssets = new Set(["/brand/goal-hint-logo-primary.svg", "/brand/goal-hint-logo-inverse.svg",
  "/brand/goal-hint-mark-primary.svg", "/brand/goal-hint-mark-inverse.svg",
  "/brand/goal-hint-header-primary.svg", "/brand/goal-hint-header-inverse.svg"]);
let preparation;

class CacheFailure extends Error {
  constructor(code, retryAfterSeconds) { super(code); this.code = code; this.retryAfterSeconds = retryAfterSeconds; }
}
const fail = (code = "invalid-bundle") => { throw new CacheFailure(code); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const instant = (value) => Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000;
const text = (value, maximum) => value === null || typeof value === "string" && value.length <= maximum;
const absolute = (path) => new URL(path, self.location.origin).href;
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const errorCode = (error) => error instanceof CacheFailure ? error.code : "storage-unavailable";
const retryDetails = (error) => error instanceof CacheFailure && integer(error.retryAfterSeconds, 1, 300)
  ? { retryAfterSeconds: error.retryAfterSeconds } : {};
const bundleDetails = ({ manifest, snapshot }) => ({ version: manifest.version,
  capturedAt: snapshot.capturedAt, expiresAt: snapshot.expiresAt, records: snapshot.records.length });

async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

async function readBounded(response, maximum, timeout = FETCH_TIMEOUT_MS, signal) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(), parts = [];
  let length = 0, timedOut = false;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeout);
  try {
    for (;;) {
      if (signal?.aborted) fail("canceled");
      const { done, value } = await reader.read();
      if (signal?.aborted) fail("canceled");
      if (timedOut) fail("network-timeout");
      if (done) break;
      length += value.byteLength;
      if (length > maximum) { await reader.cancel(); fail("size-limit"); }
      parts.push(value);
    }
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); if (signal?.aborted) cancel(); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

async function boundedFetch(input, options = {}, timeout = FETCH_TIMEOUT_MS, signal) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    if (signal?.aborted) fail("canceled");
    return await fetch(input, { ...options, signal: controller.signal });
  } catch (error) {
    if (signal?.aborted) fail("canceled");
    if (controller.signal.aborted) fail("network-timeout");
    if (error instanceof CacheFailure) throw error;
    fail("network-unreachable");
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}

function preparationTime(deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) fail("preparation-timeout");
  return Math.min(FETCH_TIMEOUT_MS, remaining);
}

function readJson(bytes, code) {
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail(code); }
}

async function readNetwork(response, maximum, timeout, signal) {
  try { return await readBounded(response, maximum, timeout, signal); }
  catch (error) { if (error instanceof CacheFailure) throw error; fail("network-unreachable"); }
}

function retryAfter(response) {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = /^\d+$/.test(header) ? Number(header) : Math.ceil((Date.parse(header) - Date.now()) / 1000);
  return Number.isFinite(seconds) ? Math.max(1, Math.min(300, seconds)) : undefined;
}

function publicResponse(response, path, marker) {
  if (response.status === 401 || response.status === 403) fail("authentication-required");
  if (response.status === 429) throw new CacheFailure("rate-limited", retryAfter(response));
  if (response.status >= 500) throw new CacheFailure("server-unavailable", retryAfter(response));
  if (response.status !== 200 || response.redirected || response.type === "opaqueredirect") fail("unexpected-response");
  const policy = response.headers.get("cache-control") ?? "";
  const vary = response.headers.get("vary") ?? "";
  if (/(?:^|,)\s*(?:private|no-store)\b/i.test(policy)
    || !/(?:^|,)\s*public\b/i.test(policy) || /(?:^|,)\s*(?:cookie|\*)\s*(?:,|$)/i.test(vary)
    || response.headers.has("set-cookie")) fail("response-policy");
  if (marker && response.headers.get(marker) !== "1" || response.url && response.url !== absolute(path)) fail("unexpected-response");
}

function assetPath(path) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return false;
  try {
    const url = new URL(path, self.location.origin), decoded = decodeURIComponent(url.pathname);
    return url.origin === self.location.origin && !url.search && !url.hash && url.pathname === path
      && !decoded.includes("\\") && !decoded.split("/").some((part) => part === "." || part === "..")
      && (brandAssets.has(path) || decoded.startsWith("/_next/static/") && /\.(?:js|css|woff2?|ttf|otf|png|svg|ico)$/i.test(decoded));
  } catch { return false; }
}

async function validateManifest(value) {
  if (!exact(value, ["schemaVersion", "version", "createdAt", "entry", "assets"]) || value.schemaVersion !== 1
    || !hashPattern.test(value.version) || !integer(value.createdAt) || !Array.isArray(value.assets)
    || value.assets.length === 0 || value.assets.length > MAX_ASSETS) fail();
  const entryValid = (entry, document = false) => exact(entry, ["url", "sha256", "bytes"])
    && (document ? entry.url === "/offline" : assetPath(entry.url)) && hashPattern.test(entry.sha256)
    && integer(entry.bytes, 1, document ? MAX_ASSET_BYTES : MAX_ASSET_BYTES);
  if (!entryValid(value.entry, true) || value.assets.some((entry) => !entryValid(entry))) fail();
  const paths = value.assets.map(({ url }) => url);
  if (new Set(paths).size !== paths.length || paths.join() !== [...paths].sort().join()
    || value.entry.bytes + value.assets.reduce((sum, entry) => sum + entry.bytes, 0) + MAX_SNAPSHOT_BYTES + MAX_RECORD_BYTES > MAX_BUNDLE_BYTES) fail("size-limit");
  const expected = await digest(encode({ schemaVersion: 1, entry: value.entry, assets: value.assets }));
  if (value.version !== expected) fail("integrity-failure");
  return value;
}

function validateSnapshot(value, now = Date.now()) {
  if (!exact(value, ["schemaVersion", "capturedAt", "expiresAt", "reportingDate", "records"]) || value.schemaVersion !== 1
    || !integer(value.capturedAt, 0, 8_640_000_000_000_000) || !integer(value.expiresAt, 0, 8_640_000_000_000_000)
    || value.expiresAt <= value.capturedAt || value.expiresAt - value.capturedAt > RETENTION_MS
    // Server and device clocks can differ slightly. This bounded read tolerance
    // neither extends retention nor changes server-side freshness validation.
    || value.capturedAt > now + CLOCK_SKEW_MS || !Array.isArray(value.records) || value.records.length > 30) fail("invalid-snapshot");
  const team = (entry) => exact(entry, ["id", "name", "code"]) && typeof entry.id === "string" && identityPattern.test(entry.id)
    && text(entry.name, 512) && (entry.code === null || typeof entry.code === "string" && /^[A-Z0-9]{2,5}$/.test(entry.code));
  const record = (entry) => exact(entry, ["fixtureId", "dataVersion", "homeTeam", "awayTeam", "competition", "kickoffAt", "syncedAt", "status", "score", "scorePeriod"])
    && typeof entry.fixtureId === "string" && identityPattern.test(entry.fixtureId) && typeof entry.dataVersion === "string" && /^[1-9]\d{0,19}$/.test(entry.dataVersion)
    && (entry.dataVersion.length < 20 || entry.dataVersion <= "18446744073709551615")
    && team(entry.homeTeam) && team(entry.awayTeam)
    && exact(entry.competition, ["id", "name", "country"]) && typeof entry.competition.id === "string" && identityPattern.test(entry.competition.id)
    && text(entry.competition.name, 512) && text(entry.competition.country, 256)
    && (entry.kickoffAt === null || instant(entry.kickoffAt)) && (entry.syncedAt === null || instant(entry.syncedAt))
    && statuses.has(entry.status) && (entry.score === null || exact(entry.score, ["home", "away"])
      && integer(entry.score.home, 0, 1000) && integer(entry.score.away, 0, 1000))
    && (entry.scorePeriod === null || entry.scorePeriod === "regulation" || entry.scorePeriod === "live");
  if (typeof value.reportingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.reportingDate)
    || value.records.some((entry) => !record(entry)) || new Set(value.records.map(({ fixtureId }) => fixtureId)).size !== value.records.length) fail("invalid-snapshot");
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(value.capturedAt));
  const part = (type) => date.find((entry) => entry.type === type)?.value;
  if (`${part("year")}-${part("month")}-${part("day")}` !== value.reportingDate) fail("invalid-snapshot");
  if (value.expiresAt <= now) fail("expired");
  return value;
}

async function checkedBytes(response, entry, timeout, signal) {
  const bytes = await readBounded(response, entry.bytes, timeout, signal);
  if (bytes.byteLength !== entry.bytes || await digest(bytes) !== entry.sha256) fail("integrity-failure");
  return bytes;
}

function storedResponse(bytes, response) {
  const headers = new Headers(response.headers);
  // Fetch exposes decoded bytes; do not save stale wire-encoding/length headers.
  for (const name of ["content-encoding", "content-length", "transfer-encoding", "set-cookie"]) headers.delete(name);
  return new Response(bytes, { status: 200, headers });
}

async function activePointer() {
  const response = await (await caches.open(META_CACHE)).match(absolute(ACTIVE_KEY));
  if (!response) fail("cache-unavailable");
  const pointer = readJson(await readBounded(response, 1024), "corrupt-cache");
  if (!exact(pointer, ["cacheName", "previousCacheName"]) || !validCacheName(pointer.cacheName)
    || pointer.previousCacheName !== null && !validCacheName(pointer.previousCacheName)) fail("corrupt-cache");
  return pointer;
}
const validCacheName = (name) => typeof name === "string" && new RegExp(`^${BUNDLE_PREFIX}[a-f0-9]{64}$`).test(name);

async function readBundle(cacheName, complete = true) {
  if (!validCacheName(cacheName)) fail("corrupt-cache");
  if (!(await caches.keys()).includes(cacheName)) fail("cache-unavailable");
  const cache = await caches.open(cacheName), response = await cache.match(absolute(RECORD_KEY));
  if (!response) fail("cache-unavailable");
  const record = readJson(await readBounded(response, MAX_RECORD_BYTES), "corrupt-cache");
  if (!exact(record, ["manifest", "snapshot"]) || !exact(record.snapshot, ["sha256", "bytes"])
    || !hashPattern.test(record.snapshot.sha256) || !integer(record.snapshot.bytes, 1, MAX_SNAPSHOT_BYTES)) fail("corrupt-cache");
  const manifest = await validateManifest(record.manifest);
  if (cacheName !== BUNDLE_PREFIX + await digest(encode({ version: manifest.version, snapshot: record.snapshot.sha256 }))) fail("corrupt-cache");
  const saved = await cache.match(absolute(SNAPSHOT_KEY));
  if (!saved) fail("corrupt-cache");
  let snapshot;
  try { snapshot = validateSnapshot(readJson(await checkedBytes(saved, record.snapshot), "invalid-snapshot")); }
  catch (error) {
    // Closed apps do not run timers. Enforce retention and remove expired data
    // at the next attempted read; do not keep serving it as merely stale.
    if (error instanceof CacheFailure && error.code === "expired") await caches.delete(cacheName).catch(() => {});
    throw error;
  }
  if (complete) for (const entry of [manifest.entry, ...manifest.assets]) {
    const asset = await cache.match(absolute(entry.url));
    if (!asset) fail("corrupt-cache");
    await checkedBytes(asset, entry);
  }
  return { cache, cacheName, manifest, snapshot };
}

async function readActive(complete = true) { return readBundle((await activePointer()).cacheName, complete); }

async function removeOtherBundles(keep) {
  await Promise.all((await caches.keys()).filter((name) => validCacheName(name) && !keep.includes(name)).map((name) => caches.delete(name)));
}

async function downloadEntry(cache, entry, document, deadline, previous, signal) {
  const prior = document ? previous?.manifest.entry : previous?.manifest.assets.find(({ url }) => url === entry.url);
  let response;
  if (prior?.url === entry.url && prior.sha256 === entry.sha256 && prior.bytes === entry.bytes) {
    try { response = await previous.cache.match(absolute(entry.url)); }
    catch { /* A transient cache read can recover through the same verified network asset. */ }
  }
  const fromNetwork = !response;
  response ??= await boundedFetch(absolute(entry.url), { credentials: "omit", cache: "no-store", redirect: "manual" }, preparationTime(deadline), signal);
  publicResponse(response, entry.url, document ? "x-goalhint-offline-entry" : undefined);
  const type = response.headers.get("content-type") ?? "";
  if (document ? !type.toLowerCase().includes("text/html") : /\.css$/i.test(entry.url) && !type.toLowerCase().includes("text/css")) fail("unexpected-response");
  let bytes;
  try { bytes = await checkedBytes(response, entry, preparationTime(deadline), signal); }
  catch (error) { if (fromNetwork && !(error instanceof CacheFailure)) fail("network-unreachable"); throw error; }
  if (signal.aborted) fail("canceled");
  await cache.put(absolute(entry.url), storedResponse(bytes, response));
}

function cancelLease(job, lease) {
  if (lease.canceled) return;
  lease.canceled = true;
  job.leases.delete(lease);
  if (job.leases.size === 0) job.controller.abort();
  lease.port.onmessage = null;
  try {
    lease.port.postMessage({ ok: false, refreshed: false, error: "canceled" });
    lease.port.close?.();
  } catch { /* A closed owner must not prevent shared-job cancellation/cleanup. */ }
}

async function preparationCheckpoint(job, deadline) {
  if (job.controller.signal.aborted) fail("canceled");
  if (typeof self.clients.get === "function") {
    await Promise.all([...job.leases].map(async (lease) => {
      if (!lease.clientId) return;
      try {
        const client = await self.clients.get(lease.clientId);
        if (!client || client.visibilityState === "hidden") cancelLease(job, lease);
      } catch { /* A failed client lookup is not proof that its visible owner closed. */ }
    }));
  }
  if (job.controller.signal.aborted) fail("canceled");
  return preparationTime(deadline);
}

async function failureReply(error, protectedName) {
  try {
    const retained = protectedName ? await readBundle(protectedName) : await readActive();
    return { ok: true, refreshed: false, retained: true, ...bundleDetails(retained), updateError: errorCode(error), ...retryDetails(error) };
  } catch { return { ok: false, refreshed: false, error: errorCode(error), ...retryDetails(error) }; }
}

async function prepareBundle(job) {
  const deadline = Date.now() + PREPARATION_TIMEOUT_MS;
  const signal = job.controller.signal;
  let previous, protectedName;
  try {
    protectedName = (await activePointer()).cacheName;
    previous = await readBundle(protectedName);
  } catch { /* Preserve the pointer's bundle even if a transient read failed. */ }
  let candidateName;
  try {
    await preparationCheckpoint(job, deadline);
    const manifestResponse = await boundedFetch(absolute("/offline-manifest.json"), { credentials: "omit", cache: "no-store", redirect: "manual" }, preparationTime(deadline), signal);
    publicResponse(manifestResponse, "/offline-manifest.json", "x-goalhint-offline-manifest");
    if (!(manifestResponse.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) fail("unexpected-response");
    const manifest = await validateManifest(readJson(await readNetwork(manifestResponse, MAX_MANIFEST_BYTES, preparationTime(deadline), signal), "invalid-bundle"));
    await preparationCheckpoint(job, deadline);
    const response = await boundedFetch(absolute("/api/offline/snapshot"), { credentials: "omit", cache: "no-store", redirect: "manual" }, preparationTime(deadline), signal);
    publicResponse(response, "/api/offline/snapshot", "x-goalhint-offline-snapshot");
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) fail("unexpected-response");
    const bytes = await readNetwork(response, MAX_SNAPSHOT_BYTES, preparationTime(deadline), signal), snapshot = validateSnapshot(readJson(bytes, "invalid-snapshot"));
    if (previous && (manifest.createdAt < previous.manifest.createdAt || snapshot.capturedAt < previous.snapshot.capturedAt)) fail("older-version");
    if (previous) {
      const prior = new Map(previous.snapshot.records.map((entry) => [entry.fixtureId, entry.dataVersion]));
      if (snapshot.records.some((entry) => {
        const version = prior.get(entry.fixtureId);
        return version && (version.length > entry.dataVersion.length || version.length === entry.dataVersion.length && version > entry.dataVersion);
      })) fail("older-version");
    }
    const snapshotEntry = { sha256: await digest(bytes), bytes: bytes.byteLength };
    candidateName = BUNDLE_PREFIX + await digest(encode({ version: manifest.version, snapshot: snapshotEntry.sha256 }));
    await preparationCheckpoint(job, deadline);
    if (previous?.cacheName === candidateName) return { ok: true, refreshed: true, activated: false, ...bundleDetails(previous) };
    // Stage at most one candidate beside the active bundle: at most 20 MiB total.
    await removeOtherBundles(protectedName ? [protectedName] : []);
    const candidate = await caches.open(candidateName);
    await candidate.put(absolute(SNAPSHOT_KEY), storedResponse(bytes, response));
    await downloadEntry(candidate, manifest.entry, true, deadline, previous, signal);
    // Bounded concurrency prevents a large build from opening hundreds of fetches.
    for (let index = 0; index < manifest.assets.length; index += 4) {
      await preparationCheckpoint(job, deadline);
      const results = await Promise.allSettled(manifest.assets.slice(index, index + 4).map((entry) => downloadEntry(candidate, entry, false, deadline, previous, signal)));
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
    }
    await preparationCheckpoint(job, deadline);
    await candidate.put(absolute(RECORD_KEY), jsonResponse({ manifest, snapshot: snapshotEntry }));
    const accepted = await readBundle(candidateName);
    await preparationCheckpoint(job, deadline);
    await (await caches.open(META_CACHE)).put(absolute(ACTIVE_KEY), jsonResponse({ cacheName: candidateName, previousCacheName: previous?.cacheName ?? null }));
    // Cleanup failure cannot roll back or delete an already committed version.
    await removeOtherBundles([candidateName, ...(previous ? [previous.cacheName] : [])]).catch(() => {});
    return { ok: true, refreshed: true, activated: true, ...bundleDetails(accepted) };
  } catch (error) {
    if (candidateName && candidateName !== protectedName) await caches.delete(candidateName).catch(() => {});
    return failureReply(error, protectedName);
  }
}

async function coordinatePreparation(job) {
  if (job.controller.signal.aborted) return { ok: false, refreshed: false, error: "canceled" };
  if (typeof self.navigator?.locks?.request !== "function") return failureReply(new CacheFailure("coordination-unavailable"));
  try {
    return await self.navigator.locks.request(PREPARATION_LOCK, { mode: "exclusive", ifAvailable: true },
      (lock) => lock ? prepareBundle(job) : failureReply(new CacheFailure("preparation-busy")));
  } catch { return failureReply(new CacheFailure("coordination-unavailable")); }
}

async function status() {
  try {
    return { ok: true, ...bundleDetails(await readActive()) };
  } catch (error) { return { ok: false, error: errorCode(error) }; }
}

async function offlineDocument() {
  try {
    const { cache, manifest } = await readActive();
    return await cache.match(absolute(manifest.entry.url));
  } catch { return null; }
}

async function navigate(request) {
  try {
    const response = await boundedFetch(request, {}, NAVIGATION_TIMEOUT_MS);
    // Authorization and application 4xx responses remain server-owned.
    return response.status >= 500 ? await offlineDocument() ?? response : response;
  } catch (error) {
    const saved = await offlineDocument();
    if (saved) return saved;
    throw error;
  }
}

async function savedAsset(request) {
  try {
    const pointer = await activePointer();
    for (const name of [pointer.cacheName, pointer.previousCacheName].filter(Boolean)) {
      try {
        const { cache, manifest } = await readBundle(name, false);
        const entry = manifest.assets.find(({ url }) => absolute(url) === request.url);
        if (!entry) continue;
        const response = await cache.match(request.url);
        if (!response) continue;
        await checkedBytes(response.clone(), entry);
        return response;
      } catch { /* Never return a corrupt or expired bundle's resource. */ }
    }
  } catch { /* Storage may be denied or evicted; normal network loading still works. */ }
  return fetch(request);
}

// Worker-code upgrades wait for existing clients to close. Do not swap the
// controller beneath an active form or overlap this writer with a legacy one.
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener("message", (event) => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin || event.ports.length !== 1
    || !exact(event.data, ["type"]) || !["PREPARE", "STATUS"].includes(event.data.type)) return;
  const port = event.ports[0];
  if (event.data.type === "STATUS") {
    event.waitUntil(status().then((reply) => { port.postMessage(reply); port.close?.(); }));
    return;
  }
  let job = preparation;
  if (!job || job.controller.signal.aborted) {
    job = { controller: new AbortController(), leases: new Set(), promise: null };
    preparation = job;
    job.promise = Promise.resolve().then(() => coordinatePreparation(job)).finally(() => {
      if (preparation === job) preparation = undefined;
    });
  }
  const lease = { clientId: event.source.id, port, canceled: false };
  job.leases.add(lease);
  port.onmessage = ({ data }) => {
    if (exact(data, ["type"]) && data.type === "CANCEL") cancelLease(job, lease);
  };
  port.start?.();
  // Cancellation acknowledges only this port's lease. The lifetime promise
  // still anchors shared work, or its bounded abort/cleanup when no lease stays.
  event.waitUntil(job.promise.then((reply) => {
    if (!lease.canceled) { port.postMessage(reply); port.close?.(); }
  }).finally(() => { port.onmessage = null; job.leases.delete(lease); }));
});
self.addEventListener("fetch", (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname === "/offline-cache/status" && !url.search) {
    event.respondWith(status().then((value) => jsonResponse(value, value.ok ? 200 : 503)));
  } else if (url.pathname === SNAPSHOT_KEY && !url.search) {
    event.respondWith(readActive().then(({ snapshot }) => jsonResponse(snapshot)).catch((error) => jsonResponse({ ok: false, error: errorCode(error) }, 503)));
  } else if (request.mode === "navigate") event.respondWith(navigate(request));
  else if (!url.search && assetPath(url.pathname)) event.respondWith(savedAsset(request));
});

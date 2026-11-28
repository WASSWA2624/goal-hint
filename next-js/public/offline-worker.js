/* Only the anonymous connection page and its verified build assets are stored.
 * Normal documents, RSC, API data, credentials and writes never enter this cache. */
"use strict";

const CACHE_PREFIX = "goal-hint-offline-";
const META_CACHE = `${CACHE_PREFIX}meta-v2`;
const BUNDLE_PREFIX = `${CACHE_PREFIX}bundle-v2-`;
const PREPARATION_LOCK = `${CACHE_PREFIX}prepare-v1`;
const ACTIVE_KEY = "/offline-cache/active";
const RECORD_KEY = "/offline-cache/record";
const MAX_BUNDLE_BYTES = 10 * 1024 * 1024;
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ASSETS = 256;
const ASSET_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 8_000;
const PREPARATION_TIMEOUT_MS = 45_000;
const NAVIGATION_RESPONSE_TIMEOUT_MS = 15_000;
const hashPattern = /^[a-f0-9]{64}$/;
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
const absolute = (path) => new URL(path, self.location.origin).href;
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const errorCode = (error) => error instanceof CacheFailure ? error.code : "storage-unavailable";
const retryDetails = (error) => error instanceof CacheFailure && integer(error.retryAfterSeconds, 1, 300)
  ? { retryAfterSeconds: error.retryAfterSeconds } : {};
const bundleDetails = ({ manifest }) => ({ kind: "connection-page", version: manifest.version });

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
  if (!exact(value, ["schemaVersion", "version", "createdAt", "entry", "assets"]) || value.schemaVersion !== 2
    || !hashPattern.test(value.version) || !integer(value.createdAt) || !Array.isArray(value.assets)
    || value.assets.length === 0 || value.assets.length > MAX_ASSETS) fail();
  const entryValid = (entry, document = false) => exact(entry, ["url", "sha256", "bytes"])
    && (document ? entry.url === "/offline" : assetPath(entry.url)) && hashPattern.test(entry.sha256)
    && integer(entry.bytes, 1, MAX_ASSET_BYTES);
  if (!entryValid(value.entry, true) || value.assets.some((entry) => !entryValid(entry))) fail();
  const paths = value.assets.map(({ url }) => url);
  if (new Set(paths).size !== paths.length || paths.join() !== [...paths].sort().join()
    || value.entry.bytes + value.assets.reduce((sum, entry) => sum + entry.bytes, 0) + MAX_MANIFEST_BYTES > MAX_BUNDLE_BYTES) fail("size-limit");
  const expected = await digest(encode({ schemaVersion: value.schemaVersion, entry: value.entry, assets: value.assets }));
  if (value.version !== expected) fail("integrity-failure");
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

// A page requests many static assets together. Share only pending validation;
// later reads still detect eviction and corruption in durable storage.
const bundleReads = new Map();
async function readBundle(cacheName, complete = true) {
  const key = `${complete ? "complete" : "metadata"}:${cacheName}`;
  let pending = bundleReads.get(key);
  if (!pending) {
    pending = readBundleFromCache(cacheName, complete).finally(() => bundleReads.delete(key));
    bundleReads.set(key, pending);
  }
  return pending;
}

async function readBundleFromCache(cacheName, complete) {
  if (!validCacheName(cacheName)) fail("corrupt-cache");
  if (!(await caches.keys()).includes(cacheName)) fail("cache-unavailable");
  const cache = await caches.open(cacheName), response = await cache.match(absolute(RECORD_KEY));
  if (!response) fail("cache-unavailable");
  const manifest = await validateManifest(readJson(await readBounded(response, MAX_MANIFEST_BYTES), "corrupt-cache"));
  if (cacheName !== BUNDLE_PREFIX + manifest.version) fail("corrupt-cache");
  if (complete) {
    const entries = [manifest.entry, ...manifest.assets];
    // Cache reads and integrity checks are independent. Keep their working set
    // bounded like downloads without serializing the entire offline startup.
    for (let index = 0; index < entries.length; index += ASSET_CONCURRENCY) {
      const results = await Promise.allSettled(entries.slice(index, index + ASSET_CONCURRENCY).map(async (entry) => {
        const asset = await cache.match(absolute(entry.url));
        if (!asset) fail("corrupt-cache");
        await checkedBytes(asset, entry);
      }));
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
    }
  }
  return { cache, cacheName, manifest };
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
  // Fingerprinted Next assets may already be in the browser's HTTP cache from this page load.
  // The manifest digest still governs eligibility for the offline bundle.
  const cacheMode = entry.url.startsWith("/_next/static/") ? "default" : "no-store";
  response ??= await boundedFetch(absolute(entry.url), { credentials: "omit", cache: cacheMode, redirect: "manual" }, preparationTime(deadline), signal);
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
    if (previous && manifest.createdAt < previous.manifest.createdAt) fail("older-version");
    candidateName = BUNDLE_PREFIX + manifest.version;
    await preparationCheckpoint(job, deadline);
    if (previous?.cacheName === candidateName) return { ok: true, refreshed: true, activated: false, ...bundleDetails(previous) };
    // Stage at most one candidate beside the active bundle: at most 20 MiB total.
    await removeOtherBundles(protectedName ? [protectedName] : []);
    const candidate = await caches.open(candidateName);
    await downloadEntry(candidate, manifest.entry, true, deadline, previous, signal);
    // Bounded concurrency prevents a large build from opening hundreds of fetches.
    for (let index = 0; index < manifest.assets.length; index += ASSET_CONCURRENCY) {
      await preparationCheckpoint(job, deadline);
      const results = await Promise.allSettled(manifest.assets.slice(index, index + ASSET_CONCURRENCY).map((entry) => downloadEntry(candidate, entry, false, deadline, previous, signal)));
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected) throw rejected.reason;
    }
    await preparationCheckpoint(job, deadline);
    await candidate.put(absolute(RECORD_KEY), jsonResponse(manifest));
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

async function recoveryDocument(saved, reason, response) {
  // Only annotate the outgoing copy. The verified static entry remains byte-identical in storage.
  const html = await saved.text();
  const headers = new Headers(saved.headers);
  headers.set("cache-control", "no-store");
  headers.delete("etag");
  headers.delete("last-modified");
  const retry = response?.headers.get("retry-after");
  if (retry) headers.set("retry-after", retry);
  return new Response(html.replace(/<html(?=[\s>])/i, `<html data-goalhint-offline-reason="${reason}"`),
    { headers, status: response?.status ?? 200 });
}

async function navigate(request) {
  try {
    // Give slow live documents time to return headers. Once they arrive, the
    // response body can keep streaming without the offline deadline.
    const response = await boundedFetch(request, {}, NAVIGATION_RESPONSE_TIMEOUT_MS, request.signal);
    // Authorization and application 4xx responses remain server-owned.
    if (response.status < 500 || request.signal.aborted) return response;
    const saved = await offlineDocument();
    if (!saved) return response;
    return await recoveryDocument(saved, "server-unavailable", response);
  } catch (error) {
    if (request.signal.aborted) throw error;
    const saved = await offlineDocument();
    if (saved) return errorCode(error) === "network-timeout" ? recoveryDocument(saved, "navigation-timeout") : saved;
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
      } catch { /* Never return a corrupt bundle's resource. */ }
    }
  } catch { /* Storage may be denied or evicted; normal network loading still works. */ }
  return fetch(request);
}

// Worker-code upgrades wait for existing clients to close. Do not swap the
// controller beneath an active form or overlap this writer with a legacy one.
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.allSettled(names.filter((name) => name === `${CACHE_PREFIX}meta-v1`
        || /^goal-hint-offline-bundle-v1-[a-f0-9]{64}$/u.test(name)).map((name) => caches.delete(name)));
    } catch { /* Storage denial must not prevent control of subsequent navigation. */ }
    await self.clients.claim();
  })());
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "payment-alert-reconcile") { reconcileReviewNotifications(event); return; }
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
  } else if (request.mode === "navigate") event.respondWith(navigate(request));
  else if (!url.search && assetPath(url.pathname)) event.respondWith(savedAsset(request));
});

// Payment alerts share the root worker, but never its public/offline response caches.
const reviewUuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
function reviewPayload(value) {
  return value && reviewUuid(value.eventId) && reviewUuid(value.endpointId) && (value.paymentId === null || reviewUuid(value.paymentId))
    && typeof value.createdAt === "string" && Date.now() - Date.parse(value.createdAt) < 86_400_000 && Date.parse(value.createdAt) <= Date.now() + 300_000;
}
async function reviewAllowed(data) {
  try {
    const response = await fetch(`/api/admin/payment-alerts?${new URLSearchParams({ eventId: data.eventId, endpointId: data.endpointId })}`,
      { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return response.ok && (await response.json()).allowed === true;
  } catch { return false; }
}
async function reviewAck(data, state) {
  try { await fetch("/api/admin/payment-alerts", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "ack", endpointId: data.endpointId, eventId: data.eventId, state }), signal: AbortSignal.timeout(10_000) }); } catch { /* Acceptance and observation stay separate. */ }
}
async function rememberReview(id) {
  // Only opaque event IDs/times. Never cache evidence, accounts, private API responses or push credentials.
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("goal-hint-payment-alerts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("seen", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise(resolve => {
      const tx = db.transaction("seen", "readwrite"), store = tx.objectStore("seen");
      const request = store.add({ id, at: Date.now() });
      let fresh = true;
      request.onerror = event => { event.preventDefault(); event.stopPropagation(); fresh = false; };
      const cursor = store.openCursor();
      cursor.onsuccess = () => { const entry = cursor.result; if (!entry) return; if (entry.value.at < Date.now() - 86_400_000) entry.delete(); entry.continue(); };
      tx.oncomplete = () => resolve(fresh); tx.onerror = () => resolve(false);
    });
  } finally { db.close(); }
}
self.addEventListener("push", event => {
  event.waitUntil((async () => {
    let data; try { data = event.data?.json(); } catch { return; }
    if (!reviewPayload(data)) return;
    if (data.resolved === true) {
      try { await rememberReview(data.eventId); } catch { /* Closing is safe even without deduplication storage. */ }
      const notifications = await self.registration.getNotifications();
      for (const notification of notifications) if (notification.tag === `payment-review:${data.eventId}`) notification.close();
      for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) client.postMessage({ type: "payment-review-update" });
      return;
    }
    if (!await reviewAllowed(data)) return;
    try { if (!await rememberReview(data.eventId)) return; } catch { /* A stable tag still coalesces when storage is unavailable. */ }
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // A focused client already owns the in-app badge and optional foreground chime.
    if (clients.some(client => client.focused && client.visibilityState === "visible")) {
      for (const client of clients) client.postMessage({ type: "payment-review-update" });
      return;
    }
    await self.registration.showNotification(data.paymentId ? "Payment awaiting review" : "Payment alert test", {
      body: data.paymentId ? "Open to review this payment." : "Open to check payment alerts.",
      tag: `payment-review:${data.eventId}`, renotify: false, data,
    });
    await reviewAck(data, "displayed");
  })());
});
self.addEventListener("notificationclick", event => {
  const data = event.notification.data;
  if (!event.notification.tag.startsWith("payment-review:") || !reviewPayload(data)) return;
  event.notification.close();
  event.waitUntil((async () => {
    await reviewAck(data, "opened");
    // Construct a fixed same-origin entry; never navigate to a payload-supplied URL.
    const target = new URL(data.paymentId ? `/payment-review/${data.paymentId}` : "/admin/settings", self.location.origin).href;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (client) { await client.navigate(target); await client.focus(); }
    else await self.clients.openWindow(target);
  })());
});
function reconcileReviewNotifications(event) {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type !== "payment-alert-reconcile" || !Array.isArray(event.data.events) || event.data.events.length > 50) return;
  const active = event.data.events.filter(reviewUuid);
  event.waitUntil(self.registration.getNotifications().then(notifications => {
    for (const notification of notifications) if (notification.tag.startsWith("payment-review:") && !active.includes(notification.data?.eventId)) notification.close();
  }));
}

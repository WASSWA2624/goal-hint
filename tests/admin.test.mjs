import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fixtureAdminSessions, installAdminFixtureEnvironment } from "./helpers/admin-fixtures.mjs";
after(installAdminFixtureEnvironment());
import { NextRequest } from "next/server.js";
import nextConfig from "../next.config.ts";
import { isOwnerPage, isPrivatePage, ownerPagePaths, privatePagePaths } from "../src/domain/private-paths.ts";
import { adminRoute } from "../src/server/admin/admin-http.ts";
import { createOwnerLogoutHandler, ownerRoutes, requireOwner } from "../src/server/admin/owner-auth.ts";
import { adminSessionRules, createAdminAuth } from "../src/server/analytics/analytics-auth.ts";
import * as analyticsHttp from "../src/server/analytics/analytics-http.ts";
import { hashPassword } from "../src/server/analytics/analytics-password.ts";
import * as privateHttp from "../src/server/http/private-http.ts";
import { createDiscoveryRoutes } from "../src/server/seo/discovery-routes.ts";
import { createDiscoveryProxy } from "../src/server/seo/proxy.ts";

const { BodyDeadlineError, cookie, empty, json, privateHeaders, readCookie, readLimitedBody, redirect } = privateHttp;
const token = "t".repeat(43);
const sameSite = { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" };
const request = (path, { method = "GET", headers = {}, body } = {}) => new Request(`http://localhost:3000${path}`, {
  method, body, headers: { host: "localhost:3000", ...headers } });

/** Throttle and username keys shaped like the real HMACs: one fixed length, never the raw value. */
const hmacKey = (purpose, value) => createHash("sha256").update(`${purpose}\0${value}`).digest("hex");

/**
 * Analytics services with a scripted owner login: `right` signs in, `locked` starts a lock, `still-locked` is refused during
 * one, anything else is refused. `storageDown` makes every session lookup and deletion fail.
 */
function fakeServices({ auth = true, storageDown = false } = {}) {
  const calls = { verify: [], login: [], logout: [], memberReads: [], memberLogout: [] };
  const config = { production: false, admin: { username: "owner", passwordHash: "x" }, adminProblem: null, usingDevelopmentCredentials: false,
    cookies: { session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude", secure: false }, key: hmacKey };
  const sessions = fixtureAdminSessions({ token, key: hmacKey, read: hash => calls.memberReads.push(hash), remove: hash => calls.memberLogout.push(hash) });
  const services = { config, database: { async query(run) { if (storageDown) throw new Error("storage down"); return run({ memberSession: sessions }); } }, collector: null, reporter: null, retention: null, auth: auth ? {
    async verify(value, options) {
      calls.verify.push(options ?? {});
      if (storageDown) throw new Error("Too many connections");
      return value === token ? { username: "owner", expiresAt: new Date() } : null;
    },
    async login(username, password, address) {
      calls.login.push({ username, address });
      const ownerUsername = username.trim().toLowerCase() === "owner";
      return password === "right" ? { status: "signed-in", token, expiresAt: new Date(), username: "owner" }
        : password === "locked" ? { status: "locked", retryAfterSeconds: 900, newlyLocked: true, ownerUsername }
          : password === "still-locked" ? { status: "locked", retryAfterSeconds: 600, newlyLocked: false, ownerUsername } : { status: "invalid", ownerUsername };
    },
    async logout(value) { calls.logout.push(value); if (storageDown) throw new Error("Too many connections"); },
  } : null };
  return { services, calls, resolve: async () => services };
}

const expectPrivate = (response, label) => {
  for (const [name, value] of Object.entries(privateHeaders)) assert.equal(response.headers.get(name), value, `${label}: ${name}`);
};

test("the private helpers moved to one module; analytics re-exports the same functions", () => {
  for (const name of ["readCookie", "cookie", "isSameOrigin", "clientAddress", "readLimitedBody", "privateHeaders", "json", "empty", "redirect"]) {
    assert.ok(privateHttp[name], name);
    assert.equal(analyticsHttp[name], privateHttp[name], `${name} is re-exported, not copied`);
  }
  assert.deepEqual({ ...privateHeaders }, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY", "Content-Security-Policy": "frame-ancestors 'none'", "Referrer-Policy": "same-origin" });
});

test("private responses are never cached, indexed, framed or leaked by referrer; redirects are fixed 303s", async () => {
  expectPrivate(json({ ok: true }), "json");
  expectPrivate(empty(204), "empty");
  const moved = redirect("/admin", ["a=1; Path=/", "b=2; Path=/"]);
  assert.equal(moved.status, 303); assert.equal(moved.headers.get("location"), "/admin");
  assert.deepEqual(moved.headers.getSetCookie(), ["a=1; Path=/", "b=2; Path=/"]);
  expectPrivate(moved, "redirect");
  const custom = json({ error: "x" }, 401, { "Retry-After": "60" });
  assert.equal(custom.status, 401); assert.equal(custom.headers.get("retry-after"), "60"); assert.deepEqual(await custom.json(), { error: "x" });
});

test("cookies are HttpOnly on Path=/; owner cookies stay Strict and member cookies may be Lax", () => {
  const development = { cookies: { secure: false } }, production = { cookies: { secure: true } };
  assert.equal(cookie(development, "goal-hint-analytics", "v", 60), "goal-hint-analytics=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=60");
  assert.equal(cookie(production, "__Host-goal-hint-analytics", "v", 60), "__Host-goal-hint-analytics=v; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure");
  assert.equal(cookie(production, "__Host-goal-hint-member", "v", 60, "Lax"), "__Host-goal-hint-member=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure");
  const sent = request("/", { headers: { cookie: "a=1; goal-hint-analytics=abc%20d; bad=%" } });
  assert.equal(readCookie(sent, "goal-hint-analytics"), "abc d");
  assert.equal(readCookie(sent, "bad"), "%", "A malformed escape is returned raw.");
  assert.equal(readCookie(sent, "missing"), undefined);
});

test("bounded body reads stop at the limit and abandon a body that misses its deadline", async () => {
  const body = (chunks, { stall = false } = {}) => {
    const progress = { pulls: 0, cancelled: false };
    const stream = new ReadableStream({
      pull(controller) {
        if (progress.pulls >= chunks) { if (!stall) controller.close(); return stall ? new Promise(() => {}) : undefined; }
        progress.pulls++;
        controller.enqueue(new Uint8Array(1024).fill(120));
      },
      cancel() { progress.cancelled = true; },
    });
    return { request: new Request("http://localhost:3000/api/admin/x", { method: "POST", body: stream, duplex: "half" }), progress };
  };
  const complete = body(3);
  assert.equal((await readLimitedBody(complete.request, 4096, { deadlineMs: 5_000 })).byteLength, 3072);
  const large = body(1024);
  assert.equal(await readLimitedBody(large.request, 4096), null);
  assert.ok(large.progress.pulls < 16, "An oversized body is refused without reading all of it.");
  const slow = body(1, { stall: true });
  const started = Date.now();
  await assert.rejects(readLimitedBody(slow.request, 4096, { deadlineMs: 50 }), BodyDeadlineError);
  assert.ok(Date.now() - started < 2_000, "The deadline ends the read, not the sender.");
  assert.equal(slow.progress.cancelled, true, "The stalled body is cancelled.");
  assert.equal((await readLimitedBody(request("/"), 10)).byteLength, 0, "No body reads as empty.");
});

test("owner sign-out deletes the session, clears the cookie, returns to the shared login and audits the member identity", async () => {
  const { resolve, calls } = fakeServices();
  const events = [];
  const logout = createOwnerLogoutHandler({ services: resolve, audit: (event) => { events.push(event); } });
  assert.equal((await logout(request(ownerRoutes.logout, { method: "POST", headers: { "sec-fetch-site": "cross-site", cookie: `goal-hint-analytics=${token}; goal-hint-member=${token}` } })))
    .status, 403);
  const response = await logout(request(ownerRoutes.logout, { method: "POST", headers: { ...sameSite, cookie: `goal-hint-analytics=${token}; goal-hint-member=${token}` } }));
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/en/matches");
  assert.match(response.headers.getSetCookie().find(value => value.startsWith("goal-hint-analytics=")), /^goal-hint-analytics=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
  assert.deepEqual(calls.logout, [token]);
  assert.deepEqual(calls.verify, [], "The legacy owner session cannot authorize a sign-out audit.");
  assert.deepEqual(events, [{ action: "sign-out", username: "member-admin:00000000-0000-4000-8000-000000000991" }]);
  for (const [label, scripted, cookieValue] of [["a lapsed session", fakeServices(), "s".repeat(43)], ["no session cookie", fakeServices(), null],
    ["failing storage", fakeServices({ storageDown: true }), token], ["no owner sign-in", fakeServices({ auth: false }), token]]) {
    const ended = await createOwnerLogoutHandler({ services: scripted.resolve, audit: (event) => { events.push(event); } })(request(ownerRoutes.logout,
      { method: "POST", headers: { ...sameSite, ...(cookieValue === null ? {} : { cookie: `goal-hint-analytics=${cookieValue}` }) } }));
    assert.equal(ended.headers.get("location"), "/en/matches", label);
    assert.match(ended.headers.getSetCookie().find(value => value.startsWith("goal-hint-analytics=")), /^goal-hint-analytics=; .*Max-Age=0$/, `${label}: the cookie is cleared regardless`);
  }
  assert.equal(events.length, 1, "Only a verified session is audited as a sign-out.");
});

test("the admin guard refuses cross-site writes before any lookup, then requires an owner session", async () => {
  const { resolve, calls } = fakeServices();
  let resolved = 0;
  const services = async () => { resolved++; return resolve(); };
  const seen = [];
  const route = adminRoute(async ({ owner, request: received }) => { seen.push([owner.username, received.method]); return json({ ok: true }); }, { services });
  const cookieHeader = { cookie: `goal-hint-analytics=${token}; goal-hint-member=${token}` };
  const cases = [
    ["cross-site POST with a session", "POST", { ...cookieHeader, "sec-fetch-site": "cross-site" }, 403],
    ["same-site (not same-origin) POST", "POST", { ...cookieHeader, "sec-fetch-site": "same-site" }, 403],
    ["POST from another origin", "POST", { ...cookieHeader, origin: "https://evil.example" }, 403],
    ["POST without origin evidence", "POST", cookieHeader, 403],
    ["DELETE cross-site", "DELETE", { ...cookieHeader, "sec-fetch-site": "cross-site" }, 403],
  ];
  for (const [label, method, headers, status] of cases) {
    const response = await route(request("/api/admin/x", { method, headers }));
    assert.equal(response.status, status, label); expectPrivate(response, label);
    assert.equal((await response.json()).error, "forbidden", label);
  }
  assert.equal(resolved, 0, "Cross-site requests never reach services or the database.");
  for (const [label, method, headers] of [["GET without a session", "GET", {}], ["GET with a forged cookie", "GET", { cookie: "goal-hint-analytics=forged" }],
    ["same-origin POST without a session", "POST", sameSite]]) {
    const response = await route(request("/api/admin/x", { method, headers }));
    assert.equal(response.status, 401, label); expectPrivate(response, label);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  assert.equal((await route(request("/api/admin/x", { headers: cookieHeader }))).status, 200, "Reads need the session, not an Origin header.");
  assert.equal((await route(request("/api/admin/x", { method: "POST", headers: { ...cookieHeader, ...sameSite } }))).status, 200);
  assert.deepEqual(seen, [["member-admin:00000000-0000-4000-8000-000000000991", "GET"], ["member-admin:00000000-0000-4000-8000-000000000991", "POST"]]);
  assert.deepEqual(calls.verify, [], "Owner cookies are never an authorization fallback.");
  const unavailable = await adminRoute(async () => json({}), { services: async () => ({ ...fakeServices({ auth: false }).services, database: null }) })(request("/api/admin/x", { headers: cookieHeader }));
  assert.equal(unavailable.status, 503);
  assert.equal(await requireOwner((await resolve()), request("/", { headers: cookieHeader })).then((owner) => owner.username), "member-admin:00000000-0000-4000-8000-000000000991");
});

test("the sign-out form of the guard refuses cross-site posts but never needs a verifiable session", async () => {
  for (const scripted of [fakeServices(), fakeServices({ storageDown: true }), fakeServices({ auth: false })]) {
    let resolved = 0;
    const services = async () => { resolved++; return scripted.resolve(); };
    const seen = [];
    const route = adminRoute(async (context) => { seen.push(Object.keys(context).sort().join()); return empty(204); }, { services, session: "optional" });
    const crossSite = await route(request("/api/admin/logout", { method: "POST", headers: { "sec-fetch-site": "cross-site", cookie: `goal-hint-analytics=${token}; goal-hint-member=${token}` } }));
    assert.equal(crossSite.status, 403); expectPrivate(crossSite, "cross-site sign-out");
    assert.equal(resolved, 0, "A cross-site sign-out never reaches services or the database.");
    for (const headers of [sameSite, { ...sameSite, cookie: "goal-hint-analytics=forged" }, { ...sameSite, cookie: `goal-hint-analytics=${token}; goal-hint-member=${token}` }]) {
      assert.equal((await route(request("/api/admin/logout", { method: "POST", headers }))).status, 204);
    }
    assert.deepEqual(seen, ["request,services", "request,services", "request,services"], "The handler runs with or without an owner.");
    assert.deepEqual(scripted.calls.verify, [], "The guard neither checks nor extends the session it is about to end.");
  }
});

/**
 * In-memory stand-ins for the two Prisma tables the owner login uses. Transactions run one at a time, as concurrent ones
 * do when they lock the same throttle rows FOR UPDATE.
 */
function memoryDatabase() {
  const throttles = new Map(), sessions = new Map(), touches = [];
  let queue = Promise.resolve();
  const client = {
    /** `INSERT … ON DUPLICATE KEY UPDATE`: creates a missing throttle row and leaves an existing one alone. */
    async $executeRaw(_strings, key, at) { if (!throttles.has(key)) throttles.set(key, { failures: 0, windowStartedAt: at, lockedUntil: null }); },
    async $queryRaw(_strings, key) { const row = throttles.get(key); return row ? [{ ...row }] : []; },
    analyticsLoginThrottle: {
      async findMany({ where }) {
        return [...throttles].filter(([key, row]) => where.key.in.includes(key) && row.lockedUntil > where.lockedUntil.gt).map(([, row]) => ({ lockedUntil: row.lockedUntil }));
      },
      async update({ where, data }) { throttles.set(where.key, { ...data }); },
      async updateMany({ where: { key, windowStartedAt }, data: { failures, ...data } }) {
        const row = throttles.get(key);
        if (row?.windowStartedAt.getTime() === windowStartedAt.getTime()) Object.assign(row, data, { failures: row.failures - failures.decrement });
      },
      async deleteMany({ where }) { throttles.delete(where.key); },
    },
    analyticsAdminSession: {
      async create({ data }) { sessions.set(data.tokenHash, { ...data }); },
      async findUnique({ where }) { const row = sessions.get(where.tokenHash); return row ? { ...row } : null; },
      async update({ where, data }) { touches.push(data.lastSeenAt); Object.assign(sessions.get(where.tokenHash), data); },
      async deleteMany({ where }) { sessions.delete(where.tokenHash); },
    },
  };
  const transaction = (run) => { const done = queue.then(() => run(client)); queue = done.catch(() => {}); return done; };
  return { throttles, sessions, touches, database: { query: (run) => run(client), transaction } };
}

test("failures from one address never lock the owner out from another; 50 an hour lock the username everywhere", async () => {
  const clock = { now: Date.parse("2026-10-19T07:00:00.000Z") };
  const right = "a long test passphrase", passwordHash = await hashPassword(right);
  const config = { admin: { username: "owner", passwordHash }, key: hmacKey };
  const auth = createAdminAuth({ database: memoryDatabase().database, config, now: () => clock.now });
  /** Wrong passwords against an unverifiable hash fail without scrypt (the real-MySQL test pays that cost); throttling is under test. */
  const attempt = async (username, address) => {
    config.admin = { username: "owner", passwordHash: "unverifiable" };
    try { return await auth.login(username, "guess", address); } finally { config.admin = { username: "owner", passwordHash }; }
  };
  const fail = async (username, address) => (await attempt(username, address)).status;
  for (let attempt = 1; attempt <= 4; attempt++) assert.equal(await fail("owner", "198.51.100.7"), "invalid");
  const locked = { status: "locked", retryAfterSeconds: adminSessionRules.lockMs / 1000, ownerUsername: true };
  assert.deepEqual(await attempt("owner", "198.51.100.7"), { ...locked, newlyLocked: true }, "The fifth failure from one address locks it.");
  assert.deepEqual(await auth.login("owner", right, "198.51.100.7"), { ...locked, newlyLocked: false },
    "That address stays locked, even with the right password; only the failure that started the lock is marked new.");
  assert.equal((await auth.login("owner", right, "203.0.113.20")).status, "signed-in", "Another address still signs in.");
  for (let attempt = 1; attempt <= 5; attempt++) await fail(`user${attempt}`, "192.0.2.77");
  assert.equal(await fail("someone", "192.0.2.77"), "locked", "One address cannot spray usernames.");
  for (let attempt = 1; attempt <= 5; attempt++) assert.equal(await fail("owner", `192.0.2.${attempt}`), "invalid", "Spread failures do not lock the username early.");
  // 10 failures so far count towards the owner's hour; the 50th locks the username from every address.
  for (let attempt = 11; attempt < 50; attempt++) assert.equal(await fail("Owner ", `10.0.${attempt}.1`), "invalid", `failure ${attempt}`);
  assert.equal(await fail("owner", "10.0.50.1"), "locked");
  assert.equal((await auth.login("owner", right, "10.0.99.1")).status, "locked", "The username-wide lock holds on a fresh address.");
  clock.now += adminSessionRules.lockMs + 1;
  assert.equal((await auth.login("owner", right, "10.0.99.1")).status, "signed-in", "The username-wide lock expires.");
  assert.equal((await auth.login("owner", right, "10.0.99.2")).status, "signed-in",
    "A right password hands back its counted attempt, with the lock that attempt started, so it never locks the owner out.");
});

test("a concurrent burst cannot outrun the throttle: each attempt is counted before its password is checked", async () => {
  const right = "a long test passphrase";
  const auth = createAdminAuth({ database: memoryDatabase().database, now: () => Date.parse("2026-10-19T07:00:00.000Z"),
    config: { admin: { username: "owner", passwordHash: await hashPassword(right) }, key: hmacKey } });
  const burst = await Promise.all([...Array.from({ length: 29 }, (_, attempt) => auth.login("owner", `guess-${attempt}`, "198.51.100.7")),
    auth.login("owner", right, "198.51.100.7")]);
  const tally = (status, newlyLocked) => burst.filter((result) => result.status === status && (newlyLocked === undefined || result.newlyLocked === newlyLocked)).length;
  assert.deepEqual([tally("invalid"), tally("locked", true), tally("locked", false), tally("signed-in")], [4, 1, 25, 0],
    "Five attempts reach the password check; the right password, sent after 29 wrong ones, is refused with the rest.");
});

test("password re-entry is the login check and throttle without a session: it shares the locks and creates nothing", async () => {
  const clock = { now: Date.parse("2026-10-19T07:00:00.000Z") };
  const right = "a long test passphrase";
  const memory = memoryDatabase();
  const config = { admin: { username: "owner", passwordHash: await hashPassword(right) }, key: hmacKey };
  const auth = createAdminAuth({ database: memory.database, config, now: () => clock.now });
  const fail = async (address) => {
    const real = config.admin.passwordHash;
    config.admin = { username: "owner", passwordHash: "unverifiable" };
    try { return await auth.confirmPassword("owner", "guess", address); } finally { config.admin = { username: "owner", passwordHash: real }; }
  };
  assert.deepEqual(await auth.confirmPassword("owner", right, "198.51.100.7"), { status: "confirmed", username: "owner" });
  assert.equal(memory.sessions.size, 0, "A confirmed re-entry creates no session.");
  for (let attempt = 1; attempt <= 4; attempt++) assert.equal((await fail("198.51.100.7")).status, "invalid");
  assert.deepEqual(await fail("198.51.100.7"), { status: "locked", retryAfterSeconds: adminSessionRules.lockMs / 1000, newlyLocked: true, ownerUsername: true });
  assert.equal((await auth.confirmPassword("owner", right, "198.51.100.7")).status, "locked", "The address lock holds for the right password too.");
  assert.equal((await auth.login("owner", right, "198.51.100.7")).status, "locked", "Re-entry failures lock sign-in from that address: one throttle.");
  assert.equal((await auth.confirmPassword("owner", right, "203.0.113.20")).status, "confirmed", "Another address is unaffected.");
  assert.equal(memory.sessions.size, 0);
  config.admin = null;
  assert.deepEqual(await auth.confirmPassword("owner", right, "203.0.113.20"), { status: "unavailable" });
});

test("verify({ touch: false }) checks a session without extending it", async () => {
  const clock = { now: Date.parse("2026-10-19T07:00:00.000Z") };
  const memory = memoryDatabase();
  const auth = createAdminAuth({ database: memory.database, now: () => clock.now,
    config: { admin: { username: "owner", passwordHash: await hashPassword("a long test passphrase") }, key: hmacKey } });
  const session = await auth.login("owner", "a long test passphrase", "198.51.100.1");
  const stored = () => memory.sessions.get(createHash("sha256").update(session.token).digest("hex"));
  const signedInAt = stored().lastSeenAt.getTime();
  clock.now += 30 * 60_000;
  assert.equal((await auth.verify(session.token, { touch: false })).username, "owner");
  assert.equal(stored().lastSeenAt.getTime(), signedInAt, "lastSeenAt is unchanged.");
  clock.now += adminSessionRules.idleMs - 30 * 60_000;
  assert.equal(await auth.verify(session.token, { touch: false }), null, "Untouched checks never keep an idle session alive.");
  assert.equal(memory.touches.length, 0);
  const fresh = await auth.login("owner", "a long test passphrase", "198.51.100.1");
  clock.now += adminSessionRules.touchAfterMs;
  assert.ok(await auth.verify(fresh.token));
  assert.equal(memory.touches.length, 1, "A default check still slides the idle limit.");
});

test("every private exclusion point covers /admin; member pages stay crawlable but noindex", async () => {
  const rules = await nextConfig.headers();
  assert.deepEqual(rules[0], { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] }, "The global rule stays first.");
  const sources = ["/analytics", "/api/analytics/:path*", "/admin", "/admin/:path*", "/api/admin/:path*", "/en/account", "/en/subscribe", "/api/account/:path*"];
  // Public asset caching (tests/seo-performance.test.mjs) sits between; the private rules stay last, so they win.
  assert.deepEqual(rules.slice(-sources.length).map((rule) => rule.source), sources);
  for (const rule of rules.slice(-sources.length)) {
    assert.deepEqual(Object.fromEntries(rule.headers.map(({ key, value }) => [key, value])),
      Object.fromEntries(Object.entries(privateHeaders).filter(([key]) => key !== "X-Content-Type-Options")), rule.source);
  }
  const proxy = createDiscoveryProxy(() => ({ deployment: "production", index: true }));
  for (const path of privatePagePaths) assert.equal(proxy(new NextRequest(`https://goalhint.com${path}`)).headers.get("x-robots-tag"), "noindex, nofollow", path);
  const robots = await createDiscoveryRoutes({ policy: () => ({ deployment: "staging", index: false }), reader: () => { throw new Error("unused"); } }).robots();
  assert.deepEqual(robots.rules.disallow, ["/api/", "/analytics", "/admin"]);
  assert.deepEqual(ownerPagePaths, ["/analytics", "/admin"]);
  for (const path of ["/admin", "/admin/payments", "/analytics"]) assert.equal(isOwnerPage(path), true, `${path} is never tracked`);
  for (const path of ["/administrator", "/en", "/en/account", "/en/subscribe"]) assert.equal(isOwnerPage(path), false, `${path} is tracked with consent`);
  assert.equal(isPrivatePage("/en/account"), true); assert.equal(isPrivatePage("/en/accounts"), false);
  const tracker = await readFile(new URL("../src/components/analytics/analytics-tracker.tsx", import.meta.url), "utf8");
  assert.match(tracker, /const excluded = isOwnerPage\(pathname\);/, "The tracker excludes every owner page.");
  const layout = await readFile(new URL("../src/app/(owner)/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /robots: \{ index: false, follow: false, nocache: true \}/, "Every /admin page answers noindex in its metadata.");
});

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { NextRequest } from "next/server.js";
import nextConfig from "../next.config.ts";
import { isOwnerPage, isPrivatePage, ownerPagePaths, privatePagePaths } from "../src/domain/private-paths.ts";
import { adminRoute } from "../src/server/admin/admin-http.ts";
import { createOwnerLoginHandler, createOwnerLogoutHandler, ownerRoutes, requireOwner } from "../src/server/admin/owner-auth.ts";
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
const form = (fields, headers = {}) => request(ownerRoutes.login, { method: "POST", body: new URLSearchParams(fields).toString(),
  headers: { ...sameSite, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": "203.0.113.9", ...headers } });

/** Throttle and username keys shaped like the real HMACs: one fixed length, never the raw value. */
const hmacKey = (purpose, value) => createHash("sha256").update(`${purpose}\0${value}`).digest("hex");

/**
 * Analytics services with a scripted owner login: `right` signs in, `locked` starts a lock, `still-locked` is refused during
 * one, anything else is refused. `storageDown` makes every session lookup and deletion fail.
 */
function fakeServices({ auth = true, storageDown = false } = {}) {
  const calls = { verify: [], login: [], logout: [] };
  const config = { production: false, admin: { username: "owner", passwordHash: "x" }, adminProblem: null, usingDevelopmentCredentials: false,
    cookies: { session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude", secure: false }, key: hmacKey };
  const services = { config, database: {}, collector: null, reporter: null, retention: null, auth: auth ? {
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

test("owner sign-in lands on /admin under every outcome, sets the Strict owner cookies and audits without credentials", async () => {
  const { resolve, calls } = fakeServices();
  const events = [];
  const login = createOwnerLoginHandler({ services: resolve, audit: (event) => { events.push(event); } });
  assert.equal((await login(request(ownerRoutes.login, { method: "POST", headers: { origin: "https://evil.example" },
    body: "username=owner&password=right" }))).status, 403);
  assert.equal(calls.login.length, 0, "A cross-site form never reaches sign-in.");
  const invalid = await login(form({ username: "intruder", password: "wrong" }));
  assert.equal(invalid.status, 303); assert.equal(invalid.headers.get("location"), "/admin?login=invalid");
  assert.equal(invalid.headers.get("set-cookie"), null);
  assert.equal((await login(form({ username: "intruder", password: "locked" }))).headers.get("location"), "/admin?login=locked&retry=900");
  assert.equal(events.length, 0, "Refusals for another username are not audited.");
  assert.equal((await login(form({ username: " Owner", password: "wrong" }))).headers.get("location"), "/admin?login=invalid");
  assert.equal((await login(form({ username: "owner", password: "locked" }))).headers.get("location"), "/admin?login=locked&retry=900");
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal((await login(form({ username: "owner", password: "still-locked" }))).headers.get("location"), "/admin?login=locked&retry=600");
  }
  const ok = await login(form({ username: "owner", password: "right" }));
  assert.equal(ok.headers.get("location"), "/admin", "Sign-in from /admin lands on /admin.");
  const cookies = ok.headers.getSetCookie();
  assert.match(cookies[0], new RegExp(`^goal-hint-analytics=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${adminSessionRules.absoluteMs / 1000}$`));
  assert.match(cookies[1], /^goal-hint-analytics-exclude=1; .*SameSite=Strict/);
  assert.deepEqual(events, [{ action: "sign-in-refused", reason: "invalid" }, { action: "sign-in-refused", reason: "locked" },
    { action: "sign-in", username: "owner" }], "Only counted refusals of the owner's username are audited: attempts during a lock write nothing.");
  assert.equal(/intruder|Owner|wrong|right/.test(JSON.stringify(events)), false, "The audit never sees a typed username or password.");
  const stalled = createOwnerLoginHandler({ services: resolve, audit: () => new Promise(() => {}) });
  assert.equal((await stalled(form({ username: "owner", password: "wrong" }))).headers.get("location"), "/admin?login=invalid",
    "A refusal is answered without waiting for its audit, so the response time never shows whether the username was the owner's.");
  assert.equal((await createOwnerLoginHandler({ services: fakeServices({ auth: false }).resolve })(form({ username: "owner", password: "right" })))
    .headers.get("location"), "/admin?login=unavailable");
  const failing = createOwnerLoginHandler({ services: resolve, audit: () => { throw new Error("audit storage down"); } });
  assert.equal((await failing(form({ username: "owner", password: "right" }))).headers.get("location"), "/admin", "A failed audit never locks the owner out.");
  assert.equal((await analyticsHttp.createLoginHandler(resolve)(form({ username: "owner", password: "right" }))).headers.get("location"),
    "/analytics", "The analytics sign-in still lands on /analytics.");
});

test("owner sign-out deletes the session, clears the cookie, lands on /admin and audits without extending the session", async () => {
  const { resolve, calls } = fakeServices();
  const events = [];
  const logout = createOwnerLogoutHandler({ services: resolve, audit: (event) => { events.push(event); } });
  assert.equal((await logout(request(ownerRoutes.logout, { method: "POST", headers: { "sec-fetch-site": "cross-site", cookie: `goal-hint-analytics=${token}` } })))
    .status, 403);
  const response = await logout(request(ownerRoutes.logout, { method: "POST", headers: { ...sameSite, cookie: `goal-hint-analytics=${token}` } }));
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/admin?login=signed-out");
  assert.match(response.headers.get("set-cookie"), /^goal-hint-analytics=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
  assert.deepEqual(calls.logout, [token]);
  assert.deepEqual(calls.verify, [{ touch: false }]);
  assert.deepEqual(events, [{ action: "sign-out", username: "owner" }]);
  for (const [label, scripted, cookieValue] of [["a lapsed session", fakeServices(), "s".repeat(43)], ["no session cookie", fakeServices(), null],
    ["failing storage", fakeServices({ storageDown: true }), token], ["no owner sign-in", fakeServices({ auth: false }), token]]) {
    const ended = await createOwnerLogoutHandler({ services: scripted.resolve, audit: (event) => { events.push(event); } })(request(ownerRoutes.logout,
      { method: "POST", headers: { ...sameSite, ...(cookieValue === null ? {} : { cookie: `goal-hint-analytics=${cookieValue}` }) } }));
    assert.equal(ended.headers.get("location"), "/admin?login=signed-out", label);
    assert.match(ended.headers.get("set-cookie"), /^goal-hint-analytics=; .*Max-Age=0$/, `${label}: the cookie is cleared regardless`);
  }
  assert.equal(events.length, 1, "Only a verified session is audited as a sign-out.");
});

test("the admin guard refuses cross-site writes before any lookup, then requires an owner session", async () => {
  const { resolve, calls } = fakeServices();
  let resolved = 0;
  const services = async () => { resolved++; return resolve(); };
  const seen = [];
  const route = adminRoute(async ({ owner, request: received }) => { seen.push([owner.username, received.method]); return json({ ok: true }); }, { services });
  const cookieHeader = { cookie: `goal-hint-analytics=${token}` };
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
  assert.deepEqual(seen, [["owner", "GET"], ["owner", "POST"]]);
  assert.ok(calls.verify.every((options) => options.touch === undefined), "Owner pages and actions extend the session.");
  const unavailable = await adminRoute(async () => json({}), { services: fakeServices({ auth: false }).resolve })(request("/api/admin/x", { headers: cookieHeader }));
  assert.equal(unavailable.status, 503);
  assert.equal(await requireOwner((await resolve()), request("/", { headers: cookieHeader }), { touch: false }).then((owner) => owner.username), "owner");
  assert.deepEqual(calls.verify.at(-1), { touch: false });
});

test("the sign-out form of the guard refuses cross-site posts but never needs a verifiable session", async () => {
  for (const scripted of [fakeServices(), fakeServices({ storageDown: true }), fakeServices({ auth: false })]) {
    let resolved = 0;
    const services = async () => { resolved++; return scripted.resolve(); };
    const seen = [];
    const route = adminRoute(async (context) => { seen.push(Object.keys(context).sort().join()); return empty(204); }, { services, session: "optional" });
    const crossSite = await route(request("/api/admin/logout", { method: "POST", headers: { "sec-fetch-site": "cross-site", cookie: `goal-hint-analytics=${token}` } }));
    assert.equal(crossSite.status, 403); expectPrivate(crossSite, "cross-site sign-out");
    assert.equal(resolved, 0, "A cross-site sign-out never reaches services or the database.");
    for (const headers of [sameSite, { ...sameSite, cookie: "goal-hint-analytics=forged" }, { ...sameSite, cookie: `goal-hint-analytics=${token}` }]) {
      assert.equal((await route(request("/api/admin/logout", { method: "POST", headers }))).status, 204);
    }
    assert.deepEqual(seen, ["request,services", "request,services", "request,services"], "The handler runs with or without an owner.");
    assert.deepEqual(scripted.calls.verify, [], "The guard neither checks nor extends the session it is about to end.");
  }
});

test("the sign-in page notice comes only from the fixed redirect's known values", async () => {
  const { services } = fakeServices();
  assert.deepEqual(analyticsHttp.loginNotice(services, {}), { status: null, problem: null, retryAfterSeconds: null });
  assert.deepEqual(analyticsHttp.loginNotice(services, { login: "locked", retry: "900" }), { status: "locked", problem: null, retryAfterSeconds: 900 });
  assert.deepEqual(analyticsHttp.loginNotice(services, { login: "<script>", retry: "9999999" }), { status: null, problem: null, retryAfterSeconds: null });
  assert.deepEqual(analyticsHttp.loginNotice(services, { login: ["invalid", "locked"] }).status, null);
  assert.equal(analyticsHttp.loginNotice(fakeServices({ auth: false }).services, {}).problem, "storage");
  assert.equal(analyticsHttp.loginNotice({ ...services, config: { ...services.config, adminProblem: "missing-secret" } }, {}).problem, "missing-secret");
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

test("refusals are audited only for the owner's username, so rotating addresses cannot grow the audit without bound", async () => {
  const clock = { now: Date.parse("2026-10-19T07:00:00.000Z") };
  const { services: scripted } = fakeServices();
  // An unverifiable hash fails every password without scrypt; the throttle and the audit are under test.
  const config = { ...scripted.config, admin: { username: "owner", passwordHash: "unverifiable" } };
  const services = { ...scripted, config, auth: createAdminAuth({ database: memoryDatabase().database, config, now: () => clock.now }) };
  const events = [];
  const login = createOwnerLoginHandler({ services: async () => services, audit: (event) => { events.push(event); } });
  const send = (username, address) => login(form({ username, password: "guess" }, { "x-forwarded-for": address }));
  for (let attempt = 0; attempt < 200; attempt++) {
    assert.equal((await send(`user-${randomUUID()}`, `2001:db8::${attempt.toString(16)}`)).headers.get("location"), "/admin?login=invalid");
  }
  assert.equal(events.length, 0, "Random usernames from fresh addresses write nothing.");
  for (let attempt = 0; attempt < 200; attempt++) await send(attempt % 2 ? "owner" : " OWNER ", `2001:db8:1::${attempt.toString(16)}`);
  assert.equal(events.length, adminSessionRules.usernameMaximumFailures, "The owner's username is audited only until its hourly lock.");
  assert.deepEqual(events.at(-1), { action: "sign-in-refused", reason: "locked" });
  clock.now += adminSessionRules.lockMs + 1;
  for (let attempt = 0; attempt < 100; attempt++) await send("owner", `2001:db8:2::${attempt.toString(16)}`);
  assert.equal(events.length, adminSessionRules.usernameMaximumFailures + 1, "Once the lock lapses inside the hour, the next attempt locks it again.");
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
  assert.deepEqual(rules.slice(1).map((rule) => rule.source), sources);
  for (const rule of rules.slice(1)) {
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
  const layout = await readFile(new URL("../src/app/admin/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /robots: \{ index: false, follow: false, nocache: true \}/, "Every /admin page answers noindex in its metadata.");
});

test("the owner login form keeps password-manager autocomplete and describes the new throttle", async () => {
  const login = await readFile(new URL("../src/components/analytics/dashboard/analytics-login.tsx", import.meta.url), "utf8");
  assert.match(login, /autoComplete="username"/); assert.match(login, /autoComplete="current-password"/);
  assert.match(login, /action = "\/api\/analytics\/login", title = "Analytics sign-in"/, "/analytics keeps its own form unless a page overrides it.");
  assert.match(login, /Five failed attempts from one network pause sign-in there for 15 minutes; 50 in an hour pause it everywhere\./);
  const page = await readFile(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");
  assert.match(page, /action=\{ownerRoutes\.login\} title="Owner sign-in"/);
});

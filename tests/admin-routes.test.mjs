import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// Every later prompt that adds an /admin page or an /api/admin route is covered here automatically: the scan finds it,
// the structural check requires the shared guard, and the table below runs its real handlers.
const root = fileURLToPath(new URL("../", import.meta.url));
const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const loginRoute = "src/app/api/admin/login/route.ts";
const signOutRoute = "src/app/api/admin/logout/route.ts";

async function find(directory, name) {
  const found = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true }).catch(() => [])) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...await find(relative, name));
    else if (entry.name === name) found.push(relative);
  }
  return found.sort();
}
const pages = await find("src/app/admin", "page.tsx");
const routes = await find("src/app/api/admin", "route.ts");
const source = (file) => readFile(path.join(root, file), "utf8");

test("the scan sees the admin shell, sign-in and sign-out", () => {
  assert.ok(pages.includes("src/app/admin/page.tsx"), pages.join());
  for (const route of [loginRoute, signOutRoute]) assert.ok(routes.includes(route), routes.join());
});

test("every /admin page renders through the shared page gate", async () => {
  for (const page of pages) {
    const text = await source(page);
    assert.match(text, /import \{[^}]*\badminPageGate\b[^}]*\} from "@\/server\/admin\/admin-http";/, page);
    assert.match(text, /export default async function \w+\([^)]*\)[^{]*\{\s*const \w+ = await adminPageGate\(/, `${page} gates before anything else`);
    // The gate is the only session check: no page reads the owner cookie or verifies a session itself.
    assert.doesNotMatch(text, /\bcookies\(\)|\.verify\(|getAnalyticsServices/, page);
  }
});

test("every /api/admin route except sign-in exports only handlers wrapped in the shared guard", async () => {
  for (const route of routes) {
    const text = await source(route);
    assert.doesNotMatch(text, /export\s+(async\s+)?function|export\s*\{|export\s+const\s*\{|export\s+default/,
      `${route}: export each handler as \`export const METHOD = …\` so the guard can be checked`);
    const exported = [...text.matchAll(/export\s+const\s+(\w+)\s*=\s*([^;]+);/g)].map(([, name, value]) => ({ name, value: value.trim() }));
    const handlers = exported.filter(({ name }) => methods.includes(name));
    assert.ok(handlers.length > 0, `${route} exports a handler`);
    for (const { name } of exported) assert.ok(methods.includes(name) || ["runtime", "dynamic", "maxDuration"].includes(name), `${route}: ${name}`);
    if (route === loginRoute) {
      assert.deepEqual(handlers, [{ name: "POST", value: "createOwnerLoginHandler()" }], "Sign-in is the only unguarded admin route.");
      continue;
    }
    assert.match(text, /import \{[^}]*\badminRoute\b[^}]*\} from "(\.\.\/)+server\/admin\/admin-http\.ts";/, route);
    for (const { name, value } of handlers) assert.match(value, /^adminRoute\(/, `${route}: ${name} uses the shared guard`);
    // Only sign-out may run without a verifiable session, so a lapsed session or a storage error can never keep the cookie.
    if (route === signOutRoute) assert.match(handlers[0].value, /, \{ session: "optional" \}\)$/, route);
    else assert.doesNotMatch(text, /\bsession:\s*["'`]optional/, `${route} requires an owner session`);
  }
});

test("the admin foundation reads no environment variable, so no env key is added", async () => {
  const files = [...pages, ...routes, "src/app/admin/layout.tsx", "src/server/admin/owner-auth.ts", "src/server/admin/admin-http.ts",
    "src/server/http/private-http.ts", "src/components/admin/admin-shell.tsx", "src/domain/private-paths.ts"];
  for (const file of files) assert.doesNotMatch(await source(file), /process\.env/, file);
});

// The real route modules resolve their services lazily from this process-wide slot (getAnalyticsServices), so seeding it
// with a scripted owner login runs every exported handler without a database.
const token = "t".repeat(43);
/** A session the database cannot read or delete right now (a pool timeout, "Too many connections"). */
const unreachable = "u".repeat(43);
const calls = { login: [], logout: [], verify: 0 };
globalThis.goalHintAnalytics = Promise.resolve({
  config: { production: false, admin: { username: "owner", passwordHash: "x" }, adminProblem: null, usingDevelopmentCredentials: false,
    cookies: { session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude", secure: false }, key: (purpose, value) => `${purpose}:${value}` },
  database: {}, collector: null, reporter: null, retention: null,
  auth: {
    async verify(value) {
      calls.verify++;
      if (value === unreachable) throw new Error("Too many connections");
      return value === token ? { username: "owner", expiresAt: new Date(Date.now() + 3_600_000) } : null;
    },
    async login(username, password) { calls.login.push(username); return password === "right" ? { status: "signed-in", token, expiresAt: new Date(), username: "owner" } : { status: "invalid" }; },
    async logout(value) { calls.logout.push(value); if (value === unreachable) throw new Error("Too many connections"); },
  },
});

const request = (route, method, headers = {}, body) => new Request(`http://localhost:3000${route.replace(/^src\/app|\/route\.ts$/g, "")}`, {
  method, headers: { host: "localhost:3000", ...headers }, ...(body === undefined || method === "GET" || method === "HEAD" ? {} : { body }) });
const signedIn = { cookie: `goal-hint-analytics=${token}` };
const sameOrigin = { "sec-fetch-site": "same-origin", origin: "http://localhost:3000" };
const refusals = [
  { name: "no session", headers: sameOrigin, status: 401 },
  { name: "a forged session", headers: { ...sameOrigin, cookie: "goal-hint-analytics=forged" }, status: 401 },
  { name: "an empty session cookie", headers: { ...sameOrigin, cookie: "goal-hint-analytics=" }, status: 401 },
  { name: "a cross-site request with a session", headers: { ...signedIn, "sec-fetch-site": "cross-site" }, status: 403, writes: true },
  { name: "another origin with a session", headers: { ...signedIn, origin: "https://evil.example" }, status: 403, writes: true },
  { name: "a write without origin evidence", headers: signedIn, status: 403, writes: true },
  { name: "a cross-site request without a session", headers: { "sec-fetch-site": "cross-site" }, status: 403, writes: true },
];

test("every guarded /api/admin handler refuses missing sessions (401) and cross-site writes (403); sign-out still signs out", async () => {
  let checked = 0;
  for (const route of routes.filter((route) => route !== loginRoute)) {
    const handlers = await import(pathToFileURL(path.join(root, route)).href);
    for (const method of methods.filter((name) => typeof handlers[name] === "function")) {
      for (const refusal of refusals.filter(({ writes }) => !writes || (method !== "GET" && method !== "HEAD"))) {
        const before = { ...calls, login: calls.login.length, logout: calls.logout.length };
        const response = await handlers[method](request(route, method, refusal.headers, "{}"));
        const label = `${method} ${route} with ${refusal.name}`;
        assert.equal(response.headers.get("cache-control"), "no-store", label);
        assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", label);
        if (route === signOutRoute && refusal.status === 401) {
          // Sign-out needs no verifiable session: whatever cookie arrived is cleared and the owner lands on the sign-in.
          assert.equal(response.status, 303, label); assert.equal(response.headers.get("location"), "/admin?login=signed-out", label);
          assert.match(response.headers.get("set-cookie"), /^goal-hint-analytics=; .*Max-Age=0/, label);
          assert.equal(calls.verify, before.verify, `${label} neither checks nor extends a session`);
        } else {
          assert.equal(response.status, refusal.status, label);
          assert.equal(response.headers.get("set-cookie"), null, label);
          assert.equal(calls.logout.length, before.logout, `${label} changes nothing`);
        }
        if (refusal.status === 403) assert.equal(calls.verify, before.verify, `${label} is refused before any session lookup`);
        checked++;
      }
    }
  }
  assert.ok(checked >= refusals.length, `ran ${checked} refusal cases`);
});

test("sign-in (unguarded) refuses cross-site posts and lands on /admin; sign-out ends the session even while storage fails", async () => {
  const { POST: login } = await import(pathToFileURL(path.join(root, loginRoute)).href);
  const form = (password, headers = sameOrigin) => request(loginRoute, "POST", { ...headers, "content-type": "application/x-www-form-urlencoded" },
    new URLSearchParams({ username: "owner", password }).toString());
  const attempts = calls.login.length;
  assert.equal((await login(form("right", { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal(calls.login.length, attempts);
  assert.equal((await login(form("wrong"))).headers.get("location"), "/admin?login=invalid");
  const ok = await login(form("right"));
  assert.equal(ok.status, 303); assert.equal(ok.headers.get("location"), "/admin");
  assert.match(ok.headers.getSetCookie()[0], new RegExp(`^goal-hint-analytics=${token}; Path=/; HttpOnly; SameSite=Strict;`));
  const { POST: logout } = await import(pathToFileURL(path.join(root, signOutRoute)).href);
  for (const [label, value] of [["a live session", token], ["a session storage cannot reach", unreachable]]) {
    const before = { verify: calls.verify, logout: calls.logout.length };
    const out = await logout(request(signOutRoute, "POST", { ...sameOrigin, cookie: `goal-hint-analytics=${value}` }));
    assert.equal(out.status, 303, label); assert.equal(out.headers.get("location"), "/admin?login=signed-out", label);
    assert.match(out.headers.get("set-cookie"), /^goal-hint-analytics=; .*Max-Age=0/, `${label}: the cookie is cleared regardless`);
    assert.deepEqual(calls.logout.slice(before.logout), [value], `${label}: the session the cookie names is deleted`);
    assert.equal(calls.verify, before.verify, `${label}: signing out never extends the session it ends`);
  }
});

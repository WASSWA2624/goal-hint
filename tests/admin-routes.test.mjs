import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createMemberSignInHandler, createMemberDevicesHandler, createMemberCodeHandler } from "../src/server/members/member-http.ts";
import { fileURLToPath, pathToFileURL } from "node:url";

// Every later prompt that adds an /admin page or an /api/admin route is covered here automatically: the scan finds it,
// the structural check requires the shared guard, and the table below runs its real handlers.
const root = fileURLToPath(new URL("../", import.meta.url));
const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
const loginRoute = "src/app/api/admin/login/route.ts";
const signOutRoute = "src/app/api/admin/logout/route.ts";
const plansRoute = "src/app/api/admin/plans/route.ts";
const settingsRoute = "src/app/api/admin/settings/route.ts";

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
const memberRoutes = await find("src/app/api/account", "route.ts");
const routes = await find("src/app/api/admin", "route.ts");
const source = (file) => readFile(path.join(root, file), "utf8");

test("member write routes use the shared factories; sign-in and devices enforce origin, mode and device unlock", async () => {
  for (const [segment, factory] of [["sign-in", "createMemberSignInHandler"], ["sign-out", "createMemberSignOutHandler"], ["devices", "createMemberDevicesHandler"], ["code", "createMemberCodeHandler"], ["payments", "createPaymentHandler"], ["trial", "createTrialHandler"]]) {
    const route = `src/app/api/account/${segment}/route.ts`;
    assert.ok(memberRoutes.includes(route));
    assert.match(await source(route), new RegExp(`export const POST = ${factory}\\(\\);`));
  }
  for (const mode of ["off", "test", "on"]) for (const member of [null, { codeEnteredAt: null }, { codeEnteredAt: new Date(0), blocked: false }]) {
    const services = async () => ({ config: { production: false, cookies: { secure: false } }, settings: { settings: { paywallMode: mode } }, sessions: {
      verify: async () => member, signIn: async () => ({ status: "signed-in", token: "t".repeat(43) }), signOutOthers: async () => true,
    } });
    for (const [factory, devices] of [[createMemberSignInHandler, false], [createMemberDevicesHandler, true]]) {
      for (const site of ["same-origin", "cross-site"]) {
        const response = await factory(services)(new Request("http://localhost:3000/api/account/test", { method: "POST", headers: {
          "sec-fetch-site": site, "content-type": "application/json" }, body: JSON.stringify({ phone: "256700000101" }) }));
        assert.equal(response.status, site === "cross-site" || mode === "off" || devices && !member?.codeEnteredAt ? 403 : devices ? 303 : 200);
      }
    }
  }
});

test("code entry requires same origin, an open mode and a nonblocked member, without requiring an unlock", async () => {
  for (const mode of ["off", "test", "on"]) for (const member of [null, { codeEnteredAt: null }, { codeEnteredAt: new Date(), blocked: true }]) {
    const services = async () => ({ config: { production: false, cookies: { secure: false } }, settings: { settings: { paywallMode: mode, maxUnlockedDevices: 2 } },
      sessions: { verify: async () => member }, codes: { redeem: async () => ({ status: "accepted", token: "t".repeat(43) }) } });
    for (const site of ["same-origin", "cross-site"]) {
      const response = await createMemberCodeHandler(services)(new Request("http://localhost:3000/api/account/code", { method: "POST",
        headers: { "sec-fetch-site": site, "content-type": "application/json" }, body: JSON.stringify({ code: "0123-4567-89AB" }) }));
      const denied = site === "cross-site" || mode === "off" || !member || member.blocked;
      assert.equal(response.status, denied ? 403 : 200);
      if (member?.blocked && mode !== "off" && site === "same-origin") assert.equal((await response.json()).message, "We couldn't complete this. Please contact us.");
    }
  }
});

test("the scan sees the admin shell, sign-in and sign-out, and the Plans and Settings pages and routes", () => {
  for (const page of ["src/app/admin/page.tsx", "src/app/admin/plans/page.tsx", "src/app/admin/settings/page.tsx", "src/app/admin/payments/page.tsx", "src/app/admin/codes/page.tsx"]) assert.ok(pages.includes(page), pages.join());
  for (const route of [loginRoute, signOutRoute, plansRoute, settingsRoute]) assert.ok(routes.includes(route), routes.join());
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

test("the admin foundation, plans and settings read no environment variable, so no env key is added", async () => {
  const files = [...pages, ...routes, "src/app/admin/layout.tsx", "src/server/admin/owner-auth.ts", "src/server/admin/admin-http.ts",
    "src/server/http/private-http.ts", "src/components/admin/admin-shell.tsx", "src/domain/private-paths.ts",
    "src/server/admin/audit.ts", "src/server/admin/plans-http.ts", "src/server/admin/settings-http.ts", "src/server/members/settings.ts",
    "src/server/members/plans.ts", "src/domain/subscription-settings.ts", "src/domain/subscription-plans.ts", "src/domain/phone.ts",
    "src/components/admin/admin-form.tsx", "src/components/admin/plans-editor.tsx", "src/components/admin/settings-editor.tsx"];
  for (const file of files) assert.doesNotMatch(await source(file), /process\.env/, file);
});

// The real route modules resolve their services lazily from this process-wide slot (getAnalyticsServices), so seeding it
// with a scripted owner login runs every exported handler without a database.
const token = "t".repeat(43);
/** A session the database cannot read or delete right now (a pool timeout, "Too many connections"). */
const unreachable = "u".repeat(43);
const calls = { login: [], logout: [], verify: [], audit: [], confirm: [] };
/**
 * A database that has no plans and no settings row yet and records audit rows. Anything a handler reaches beyond these
 * reads (a transaction) fails, as storage that is down would.
 */
const client = {
  subscriptionPlan: { async findMany() { return []; }, async count() { return 0; } },
  subscriptionSettings: { async findUnique() { return null; } },
  paymentScreenshot: { async findUnique() { return { data: new Uint8Array([255,216,255,217]) }; } },
  ownerAuditEvent: { async create({ data }) { calls.audit.push(data); return data; } },
};
globalThis.goalHintAnalytics = Promise.resolve({
  config: { production: false, admin: { username: "owner", passwordHash: "x" }, adminProblem: null, usingDevelopmentCredentials: false,
    cookies: { session: "goal-hint-analytics", exclude: "goal-hint-analytics-exclude", secure: false }, key: (purpose, value) => `${purpose}:${value}` },
  database: { query: async (run) => run(client), transaction: async () => { throw new Error("storage is down"); } },
  collector: null, reporter: null, retention: null,
  auth: {
    async verify(value, options = {}) {
      calls.verify.push(options);
      if (value === unreachable) throw new Error("Too many connections");
      return value === token ? { username: "owner", expiresAt: new Date(Date.now() + 3_600_000) } : null;
    },
    async login(username, password) {
      calls.login.push(username);
      return password === "right" ? { status: "signed-in", token, expiresAt: new Date(), username: "owner" } : { status: "invalid", ownerUsername: username === "owner" };
    },
    async logout(value) { calls.logout.push(value); if (value === unreachable) throw new Error("Too many connections"); },
    async confirmPassword(username, password, address) {
      calls.confirm.push({ username, address });
      return password === "right" ? { status: "confirmed", username } : { status: "invalid", ownerUsername: true };
    },
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
        const before = { login: calls.login.length, logout: calls.logout.length, verify: calls.verify.length };
        const response = await handlers[method](request(route, method, refusal.headers, "{}"));
        const label = `${method} ${route} with ${refusal.name}`;
        assert.equal(response.headers.get("cache-control"), "no-store", label);
        assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow", label);
        if (route === signOutRoute && refusal.status === 401) {
          // Sign-out needs no verifiable session: whatever cookie arrived is cleared and the owner lands on the sign-in.
          assert.equal(response.status, 303, label); assert.equal(response.headers.get("location"), "/admin?login=signed-out", label);
          assert.match(response.headers.get("set-cookie"), /^goal-hint-analytics=; .*Max-Age=0/, label);
          // Its only session read names the owner for the audit (058) and never extends the session.
          assert.ok(calls.verify.slice(before.verify).every((options) => options.touch === false), `${label} never extends a session`);
        } else {
          assert.equal(response.status, refusal.status, label);
          assert.equal(response.headers.get("set-cookie"), null, label);
          assert.equal(calls.logout.length, before.logout, `${label} changes nothing`);
        }
        if (refusal.status === 403) assert.equal(calls.verify.length, before.verify, `${label} is refused before any session lookup`);
        checked++;
      }
    }
  }
  assert.ok(checked >= refusals.length, `ran ${checked} refusal cases`);
});

test("sign-in (unguarded) refuses cross-site posts, lands on /admin and is audited; sign-out ends the session even while storage fails", async () => {
  const { POST: login } = await import(pathToFileURL(path.join(root, loginRoute)).href);
  const form = (password, headers = sameOrigin) => request(loginRoute, "POST", { ...headers, "content-type": "application/x-www-form-urlencoded" },
    new URLSearchParams({ username: "owner", password }).toString());
  const attempts = calls.login.length, audited = calls.audit.length;
  assert.equal((await login(form("right", { "sec-fetch-site": "cross-site" }))).status, 403);
  assert.equal(calls.login.length, attempts);
  assert.equal((await login(form("wrong"))).headers.get("location"), "/admin?login=invalid");
  const ok = await login(form("right"));
  assert.equal(ok.status, 303); assert.equal(ok.headers.get("location"), "/admin");
  assert.match(ok.headers.getSetCookie()[0], new RegExp(`^goal-hint-analytics=${token}; Path=/; HttpOnly; SameSite=Strict;`));
  const { POST: logout } = await import(pathToFileURL(path.join(root, signOutRoute)).href);
  for (const [label, value] of [["a live session", token], ["a session storage cannot reach", unreachable]]) {
    const before = { verify: calls.verify.length, logout: calls.logout.length };
    const out = await logout(request(signOutRoute, "POST", { ...sameOrigin, cookie: `goal-hint-analytics=${value}` }));
    assert.equal(out.status, 303, label); assert.equal(out.headers.get("location"), "/admin?login=signed-out", label);
    assert.match(out.headers.get("set-cookie"), /^goal-hint-analytics=; .*Max-Age=0/, `${label}: the cookie is cleared regardless`);
    assert.deepEqual(calls.logout.slice(before.logout), [value], `${label}: the session the cookie names is deleted`);
    assert.deepEqual(calls.verify.slice(before.verify), [{ touch: false }], `${label}: signing out never extends the session it ends`);
  }
  // The real routes carry the owner audit: the counted refusal, the sign-in and the live session's sign-out. The session that
  // storage could not read names no owner, so its sign-out writes nothing.
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.audit.slice(audited).map(({ action, actor, targetType, targetId, details }) => ({ action, actor, targetType, targetId, details })), [
    { action: "owner_sign_in_refused", actor: "unverified", targetType: "owner-session", targetId: "admin", details: { surface: "admin", reason: "invalid" } },
    { action: "owner_signed_in", actor: "owner", targetType: "owner-session", targetId: "admin", details: { surface: "admin" } },
    { action: "owner_signed_out", actor: "owner", targetType: "owner-session", targetId: "admin", details: { surface: "admin" } },
  ]);
  assert.equal(JSON.stringify(calls.audit.slice(audited)).includes("right"), false, "No password reaches the audit.");
});

const postJson = (route, body, headers = {}) => request(route, "POST", { ...signedIn, ...sameOrigin, "content-type": "application/json", ...headers },
  JSON.stringify(body));

test("Plans and Settings: reads show stored data, writes are JSON only, protected fields ask for the password, and nothing deletes a plan", async () => {
  const plans = await import(pathToFileURL(path.join(root, plansRoute)).href);
  const settings = await import(pathToFileURL(path.join(root, settingsRoute)).href);
  for (const handlers of [plans, settings]) assert.deepEqual(Object.keys(handlers).filter((name) => methods.includes(name)).sort(), ["GET", "POST"]);
  const listed = await plans.GET(request(plansRoute, "GET", signedIn));
  assert.equal(listed.status, 200); assert.deepEqual(await listed.json(), { plans: [] });
  const view = await settings.GET(request(settingsRoute, "GET", { ...signedIn, "x-forwarded-for": "198.51.100.4, 203.0.113.8", "x-real-ip": "203.0.113.8" }));
  assert.equal(view.status, 200); assert.equal(view.headers.get("cache-control"), "no-store");
  const shown = await view.json();
  assert.equal(shown.source, "defaults");
  assert.equal(shown.settings.paywallMode, "off", "A missing row reads off.");
  assert.equal(shown.settings.trialDays, 2, "A missing row offers the 2-day trial.");
  assert.deepEqual(shown.requirements.test.map(({ key }) => key), ["plan", "payment-number", "contact"]);
  assert.deepEqual(shown.requirements.on.map(({ key }) => key), ["plan", "payment-number", "contact", "privacy", "terms"]);
  assert.equal(shown.diagnostics.address, "203.0.113.8", "The diagnostics name the address the throttles use.");
  assert.deepEqual(shown.diagnostics.headers.filter(({ value }) => value !== null), [{ name: "x-forwarded-for", value: "198.51.100.4, 203.0.113.8" },
    { name: "x-real-ip", value: "203.0.113.8" }]);
  const form = await plans.POST(request(plansRoute, "POST", { ...signedIn, ...sameOrigin, "content-type": "application/x-www-form-urlencoded" }, "action=create"));
  assert.equal(form.status, 415, "Owner actions are JSON, which a cross-site form cannot send without a preflight.");
  assert.equal((await plans.POST(request(plansRoute, "POST", { ...signedIn, ...sameOrigin, "content-type": "application/json" }, "[1,2]"))).status, 400);
  const deletion = await plans.POST(postJson(plansRoute, { action: "delete", id: "00000000-0000-4000-8000-000000000000" }));
  assert.equal(deletion.status, 400); assert.match((await deletion.json()).message, /never deleted/);
  const invalid = await plans.POST(postJson(plansRoute, { action: "create", plan: { name: "", durationDays: 0, priceUgx: 50 } }));
  assert.equal(invalid.status, 400); assert.deepEqual(Object.keys((await invalid.json()).errors).sort(), ["durationDays", "name", "priceUgx"]);
  const confirms = calls.confirm.length;
  const protectedChange = await settings.POST(postJson(settingsRoute, { action: "save", changes: { mtnNumber: "0700 000 001" } }));
  assert.equal(protectedChange.status, 403);
  assert.deepEqual(await protectedChange.json(), { error: "password-required", message: "Enter your owner password to change payment and contact details.",
    fields: ["mtnNumber"] });
  assert.equal(calls.confirm.length, confirms, "Without a password nothing is checked or counted.");
  const wrong = await settings.POST(postJson(settingsRoute, { action: "save", changes: { mtnNumber: "0700 000 001" }, password: "wrong" },
    { "x-forwarded-for": "198.51.100.23" }));
  assert.equal(wrong.status, 403); assert.equal((await wrong.json()).error, "password-invalid");
  assert.deepEqual(calls.confirm.slice(confirms), [{ username: "owner", address: "198.51.100.23" }], "Re-entry is checked by the owner login for this address.");
  const unknown = await settings.POST(postJson(settingsRoute, { action: "save", changes: { paywallMode: "on" } }));
  assert.equal(unknown.status, 400, "The mode is never part of a save."); assert.match((await unknown.json()).errors.changes, /Unknown setting/);
  const down = await settings.POST(postJson(settingsRoute, { action: "mode", mode: "test" }));
  assert.equal(down.status, 503, "A mode change runs in a transaction; storage that is down answers 503, never 500.");
});

// Payments and trials intentionally require a number-only member, rather than an unlocked device.
test("payment and trial writes guard origin, mode, session and blocked accounts before body or storage", async () => {
  const { createPaymentHandler, createTrialHandler } = await import("../src/server/members/payment-http.ts");
  const { paymentRequest } = await import("./helpers/payment-fixtures.mjs");
  for (const mode of ["off", "test", "on"]) for (const member of [null, { codeEnteredAt: null, blocked: false }, { codeEnteredAt: new Date(), blocked: true }]) for (const site of ["same-origin", "cross-site"]) {
    const services = async () => ({ config: { production: false }, settings: { settings: { paywallMode: mode } }, sessions: { verify: async () => member },
      payments: { begin: async () => true, submit: async () => ({ status: "saved", reference: "P-TEST" }), trial: async () => "saved" } });
    const denied = mode === "off" || !member || member.blocked || site === "cross-site";
    for (const [handler, request, status] of [[createPaymentHandler(services), await paymentRequest({ headers: { "sec-fetch-site": site } }), 201],
      [createTrialHandler(services), new Request("http://localhost/api/account/trial", { method: "POST", headers: { "sec-fetch-site": site } }), 200]]) {
      const response = await handler(request); assert.equal(response.status, denied ? 403 : status);
      if (denied) assert.equal(request.bodyUsed, false);
      if (member?.blocked && mode !== "off" && site === "same-origin") assert.equal((await response.json()).message, "We couldn't complete this. Please contact us.");
    }
  }
});

test("owner screenshot is private JPEG with a sandbox and cannot return data without the owner", async () => {
  const route = "src/app/api/admin/payments/[id]/screenshot/route.ts";
  const { GET } = await import(pathToFileURL(path.join(root, route)).href);
  const url = "http://localhost:3000/api/admin/payments/00000000-0000-4000-8000-000000000001/screenshot";
  assert.equal((await GET(new Request(url))).status,401);
  const r = await GET(new Request(url,{headers:signedIn})); assert.equal(r.status,200);
  for (const [key,value] of Object.entries({"content-type":"image/jpeg","content-disposition":"inline","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"sandbox; default-src 'none'","cross-origin-resource-policy":"same-origin","x-robots-tag":"noindex, nofollow"})) assert.equal(r.headers.get(key),value,key);
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[255,216,255,217]);
});

test("owner phone forms have POST fallbacks so disabled JavaScript cannot put phones in URLs",async()=>{
  for(const file of ["src/components/admin/code-tools.tsx","src/components/admin/payments-editor.tsx"]){
    const text=await source(file);
    const forms=[...text.matchAll(/<form\b[^>]*?onSubmit=/gu)];assert.ok(forms.length>0);
    for(const [form] of forms)assert.match(form,/method="post"/u,file);
  }
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createOwnerLoginHandler } from "../src/server/admin/owner-auth.ts";
import { createLoginHandler, loginNotice } from "../src/server/analytics/analytics-http.ts";
import { adminSessionRules } from "../src/server/analytics/analytics-auth.ts";
import { memberSessionRules } from "../src/server/members/member-sessions.ts";

const phone = "256700000981", regularPhone = "256700000982", password = "synthetic admin password";
const token = "a".repeat(43), accountId = "c57a5ab4-e363-40d6-a332-3333860542ec";
const key = (purpose, value) => createHmac("sha256", "synthetic-admin-sign-in-secret").update(`${purpose}\0${value}`).digest("hex");

/** Each test restores the real process configuration without reading or displaying its values. */
async function configured(run) {
  const names = ["GOAL_HINT_ADMIN_PHONES", "GOAL_HINT_ADMIN_PASSWORD", "GOAL_HINT_ADMIN_PASSWORD_HASH"];
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.GOAL_HINT_ADMIN_PHONES = JSON.stringify([phone]);
  process.env.GOAL_HINT_ADMIN_PASSWORD = password;
  delete process.env.GOAL_HINT_ADMIN_PASSWORD_HASH;
  try { return await run(); } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}

function fixture({ owner = true, production = false } = {}) {
  const calls = { owner: [], member: [], factories: [], audits: [] };
  const prefix = production ? "__Host-" : "";
  const config = { production, admin: owner ? { username: "owner", passwordHash: "synthetic" } : null,
    adminProblem: owner ? null : "not-configured", key,
    cookies: { session: `${prefix}goal-hint-analytics`, exclude: `${prefix}goal-hint-analytics-exclude`, secure: production } };
  const services = { config, database: {}, auth: owner ? {
    async login(...args) { calls.owner.push(args); return { status: "signed-in", username: "owner", token }; },
  } : null };
  let outcome = { status: "authenticated", token, phone, accountId, administrator: true };
  const memberAuth = (resolved) => {
    calls.factories.push(resolved);
    return { async login(...args) { calls.member.push(args); if (outcome instanceof Error) throw outcome; return outcome; } };
  };
  const resolve = async () => services, audit = (event) => { calls.audits.push(event); };
  return { calls, services, resolve, memberAuth, audit, result(value) { outcome = value; } };
}

function form(username = phone, { headers = {}, body, path = "/api/admin/login" } = {}) {
  return new Request(`http://localhost:3000${path}`, { method: "POST",
    headers: { host: "localhost:3000", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "198.51.100.44", ...headers },
    body: body ?? new URLSearchParams({ username, password, return: "https://outside.example" }).toString() });
}

test("the admin form accepts normalized configured phones through member auth and returns the administrative session", () => configured(async () => {
  const f = fixture(), handler = createOwnerLoginHandler({ services: f.resolve, memberAuth: f.memberAuth, audit: f.audit });
  const response = await handler(form("+256 700 000 981", { headers: { cookie: `goal-hint-member=${"p".repeat(43)}` } }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/admin");
  assert.deepEqual(f.calls.member, [[phone, password, "198.51.100.44", "p".repeat(43)]]);
  assert.deepEqual(f.calls.factories, [f.services]);
  assert.equal(f.calls.owner.length, 0, "The phone is never compared with the separate owner username.");
  assert.deepEqual(response.headers.getSetCookie(), [
    `goal-hint-member=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${memberSessionRules.cookieSeconds}`,
    `goal-hint-analytics-exclude=1; Path=/; HttpOnly; SameSite=Strict; Max-Age=${adminSessionRules.excludeMaxAgeSeconds}`,
  ]);
  assert.deepEqual(f.calls.audits, [{ action: "sign-in", username: `member-admin:${accountId}` }]);
  assert.ok(!JSON.stringify(f.calls.audits).includes(phone), "The audit does not expose the administrator phone or password.");
  assert.ok(!JSON.stringify(f.calls.audits).includes(password));
}));

test("phone administrator sign-in works without legacy owner credentials and supports secure analytics sessions", () => configured(async () => {
  const f = fixture({ owner: false, production: true });
  const response = await createLoginHandler(f.resolve, { memberAuth: f.memberAuth, audit: f.audit })(form(phone));
  assert.equal(response.headers.get("location"), "/analytics");
  const cookies = response.headers.getSetCookie();
  assert.match(cookies[0], /^__Host-goal-hint-member=.*; SameSite=Lax; .*; Secure$/u);
  assert.match(cookies[1], /^__Host-goal-hint-analytics-exclude=1; .*; Secure$/u);
  assert.equal(f.calls.owner.length, 0);
}));

test("phone refusals cannot fall back to owner auth or install an ordinary member session", () => configured(async () => {
  const f = fixture(), handler = createOwnerLoginHandler({ services: f.resolve, memberAuth: f.memberAuth, audit: f.audit });
  for (const outcome of [
    { status: "unauthorized", message: "Wrong password" },
    { status: "invalid", message: "Invalid" },
    { status: "conflict", message: "Conflict" },
    { status: "authenticated", token, phone, accountId },
    { status: "authenticated", token, phone, accountId, requiresPasswordChange: true },
  ]) {
    f.result(outcome);
    const response = await handler(form());
    assert.equal(response.headers.get("location"), "/admin?login=invalid");
    assert.equal(response.headers.get("set-cookie"), null);
  }
  f.result({ status: "busy", message: "Wait" });
  const locked = await handler(form());
  assert.equal(locked.headers.get("location"), "/admin?login=locked&retry=900");
  assert.equal(locked.headers.get("set-cookie"), null);
  f.result(new Error("storage unavailable"));
  const unavailable = await handler(form());
  assert.equal(unavailable.headers.get("location"), "/admin?login=unavailable");
  assert.equal(unavailable.headers.get("set-cookie"), null);
  const absent = await createOwnerLoginHandler({ services: f.resolve, memberAuth: () => null, audit: f.audit })(form());
  assert.equal(absent.headers.get("location"), "/admin?login=unavailable");
  assert.equal(f.calls.owner.length, 0);
  assert.ok(f.calls.audits.every((event) => event.action !== "sign-in"));
}));

test("ordinary phone numbers and owner usernames retain the owner path without creating member sessions", () => configured(async () => {
  const f = fixture(), handler = createOwnerLoginHandler({ services: f.resolve, memberAuth: f.memberAuth, audit: f.audit });
  for (const username of [regularPhone, "owner"]) {
    const response = await handler(form(username));
    assert.equal(response.headers.get("location"), "/admin");
    assert.match(response.headers.getSetCookie()[0], /^goal-hint-analytics=.*; SameSite=Strict;/u);
  }
  assert.equal(f.calls.factories.length, 0);
  assert.equal(f.calls.member.length, 0);
  assert.deepEqual(f.calls.owner.map(([username]) => username), [regularPhone, "owner"]);
}));

test("cross-site, oversized, and malformed admin forms do not reach either credential verifier", () => configured(async () => {
  const f = fixture(), handler = createOwnerLoginHandler({ services: f.resolve, memberAuth: f.memberAuth, audit: f.audit });
  assert.equal((await handler(form(phone, { headers: { "sec-fetch-site": "cross-site" } }))).status, 403);
  assert.equal((await handler(form(phone, { headers: { "content-length": "4097" } }))).status, 413);
  assert.equal((await handler(form(phone, { body: "x".repeat(4097) }))).status, 413);
  const malformed = await handler(form(phone, { headers: { "content-type": "application/json" }, body: "{}" }));
  assert.equal(malformed.headers.get("location"), "/admin?login=invalid");
  assert.equal(f.calls.factories.length, 0);
  assert.equal(f.calls.owner.length, 0);
}));

test("available phone credentials keep sign-in enabled when legacy owner credentials are absent", () => configured(async () => {
  const f = fixture({ owner: false });
  assert.equal(loginNotice(f.services, {}).problem, null);
  assert.notEqual(loginNotice({ ...f.services, database: null }, {}).problem, null);
  assert.equal(loginNotice({ ...f.services, config: { ...f.services.config, adminProblem: "missing-secret", key() { throw new Error("missing secret"); } } }, {}).problem,
    "missing-secret");
  delete process.env.GOAL_HINT_ADMIN_PASSWORD;
  assert.equal(loginNotice(f.services, {}).problem, "not-configured");
  process.env.GOAL_HINT_ADMIN_PASSWORD = password;
  process.env.GOAL_HINT_ADMIN_PHONES = "malformed";
  assert.equal(loginNotice(f.services, {}).problem, "not-configured");
}));

test("the shared admin sign-in form explains that configured phone numbers are accepted", async () => {
  const source = await readFile(new URL("../src/components/analytics/dashboard/analytics-login.tsx", import.meta.url), "utf8");
  assert.match(source, /Phone number or owner username/u);
  assert.match(source, /autoComplete="username"/u);
  assert.match(source, /autoComplete="current-password"/u);
});

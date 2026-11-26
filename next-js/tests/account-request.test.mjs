import assert from "node:assert/strict";
import test from "node:test";
import { accountRequest, requestMemberLogout } from "../src/components/members/account-request.ts";

test("account writes preserve body-only credentials and require a local navigation response", async t => {
  const sent = [];
  t.mock.method(globalThis, "fetch", async (url, init) => { sent.push({ url, init }); return Response.json({ next: "/en/matches" }); });
  assert.deepEqual(await accountRequest("login", { phone: "256700000101", password: "synthetic" }), { next: "/en/matches" });
  assert.equal(sent[0].url, "/api/account/login");
  assert.equal(sent[0].init.credentials, "same-origin");
  assert.equal(sent[0].init.cache, "no-store");
  assert.equal(sent[0].init.method, "POST");
  assert.equal(JSON.parse(sent[0].init.body).password, "synthetic");
  for (const next of [undefined, "https://outside.test", "//outside.test", "/\\outside.test", " /en", "/en\n"]) {
    globalThis.fetch = async () => Response.json({ next });
    await assert.rejects(accountRequest("login", {}), /Unable to complete/);
  }
});

test("account errors tolerate proxy HTML and malformed JSON while retaining server feedback", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ message: "The phone number or password is incorrect." }, { status: 401 }));
  await assert.rejects(accountRequest("login", {}), /phone number or password/);
  for (const response of [new Response("<html>gateway error</html>", { status: 502 }), Response.json(null), Response.json([]), Response.json({})]) {
    globalThis.fetch = async () => response;
    await assert.rejects(accountRequest("register", {}), /Unable to complete/);
  }
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(accountRequest("verify", {}), /Unable to complete/);
  await assert.rejects(accountRequest("login", {}), /Check your internet connection/);
});

test("a stalled account write times out and is never automatically retried", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  t.mock.method(globalThis, "fetch", (_url, { signal }) => new Promise((_resolve, reject) => {
    calls++;
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  const result = accountRequest("register", { phone: "256700000101", password: "synthetic" });
  const failure = assert.rejects(result, /took too long/);
  t.mock.timers.tick(15_000);
  await failure;
  assert.equal(calls, 1);
});

test("logout posts once and follows the server's signed-out destination even when revocation is unconfirmed", async t => {
  const sent = [];
  const fallback = "/en/account?view=login&status=logout-unconfirmed";
  t.mock.method(globalThis, "fetch", async (url, init) => {
    sent.push({ url, init });
    return url === "/api/account/sign-out" ? Response.json({ phone: null, next: "/en/matches" })
      : Response.json({ phone: null, next: fallback, error: "logout-unconfirmed" }, { status: 503 });
  });
  assert.equal(await requestMemberLogout("/api/account/sign-out"), "/en/matches");
  assert.equal(await requestMemberLogout("/api/admin/logout"), fallback);
  assert.deepEqual(sent.map(({ url }) => url), ["/api/account/sign-out", "/api/admin/logout"]);
  for (const { init } of sent) {
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.headers.Accept, "application/json");
    assert.equal(init.redirect, "error");
  }
});

test("logout refuses unexpected responses and destinations without an automatic retry", async t => {
  let calls = 0;
  const responses = [Response.json({ next: "/en/matches" }), Response.json({ phone: null, next: "//outside.test" }),
    Response.json({ phone: null, next: "/en/matches" }, { status: 403 }), new Response("Unavailable", { status: 503 })];
  t.mock.method(globalThis, "fetch", async () => { calls++; return responses.shift(); });
  for (let index = 0; index < 4; index++) await assert.rejects(requestMemberLogout("/api/account/sign-out"));
  assert.equal(calls, 4);
});

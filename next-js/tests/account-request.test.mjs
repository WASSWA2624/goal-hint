import assert from "node:assert/strict";
import test from "node:test";
import { AccountRequestError, accountRequest } from "../src/components/members/account-request.ts";

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
  const result = accountRequest("login", { phone: "256700000101", password: "synthetic" });
  const failure = assert.rejects(result, /took too long/);
  t.mock.timers.tick(15_000);
  await failure;
  assert.equal(calls, 1);
});

test("login classifies credential refusal, throttling and gateway failure from status regardless of response shape", async t => {
  let response;
  const fetcher = t.mock.method(globalThis, "fetch", async () => response);
  for (const [body, status, headers, message] of [
    ["Unexpected upstream text", 401, {}, /phone number or password is incorrect/],
    ["Too many attempts", 429, { "Retry-After": "60" }, /Try again in 60 seconds/],
    ["Too many attempts", 429, { "Retry-After": "unknown" }, /Please wait/],
    ["<html>bad gateway</html>", 502, {}, /Account access is unavailable/],
    ["", 503, {}, /Account access is unavailable/],
    ["", 504, {}, /Account access is unavailable/],
  ]) {
    response = new Response(body, { status, headers });
    await assert.rejects(accountRequest("login", {}), failure =>
      failure instanceof AccountRequestError && failure.status === status && message.test(failure.message));
  }
  assert.equal(fetcher.mock.callCount(), 6);
});

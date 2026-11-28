import assert from "node:assert/strict";
import test from "node:test";
import { timedRequestPhase, withRequestTiming } from "../src/server/http/request-timing.ts";

test("request timing correlates a failed read without logging private inputs or exceptions", async (t) => {
  const log = t.mock.method(console, "warn", () => {});
  const input = new Request("https://goalhint.com/api/admin/users?private=filtered-account", {
    method: "POST",
    headers: { Cookie: "session=secret-token", "X-Request-Id": "untrusted-id" },
  });
  const handle = withRequestTiming("admin-users", async (request) => {
    await assert.rejects(timedRequestPhase("session", async () => {
      throw new Error(request.headers.get("cookie"));
    }));
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  });
  const response = await handle(input);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("server-timing"), /^app;dur=\d+$/u);
  const id = response.headers.get("x-request-id");
  assert.match(id, /^[\da-f-]{36}$/u);
  const logged = log.mock.calls[0].arguments[0];
  assert.doesNotMatch(logged, /secret-token|filtered-account|untrusted-id|https:/u);
  assert.deepEqual(JSON.parse(logged), { event: "request-timing", requestId: id,
    operation: "admin-users", durationMs: Number(response.headers.get("server-timing").split("=")[1]), status: 503,
    phases: [{ name: "session", durationMs: JSON.parse(logged).phases[0].durationMs, failed: true }] });
});

test("parallel requests keep their phases separate and return the handler's cookies untouched", async (t) => {
  const log = t.mock.method(console, "warn", () => {});
  const handle = withRequestTiming("account-login", async (phase) => {
    await timedRequestPhase(phase, () => new Promise(resolve => setImmediate(resolve)));
    return new Response(null, { status: 503, headers: { "Set-Cookie": "fixture=value; Secure; HttpOnly; Path=/" } });
  });
  const responses = await Promise.all([handle("first"), handle("second")]);
  const entries = log.mock.calls.map(call => JSON.parse(call.arguments[0]));
  assert.notEqual(responses[0].headers.get("x-request-id"), responses[1].headers.get("x-request-id"));
  for (const [index, phase] of ["first", "second"].entries()) {
    const { headers } = responses[index];
    assert.equal(headers.get("set-cookie"), "fixture=value; Secure; HttpOnly; Path=/");
    const entry = entries.find(entry => entry.requestId === headers.get("x-request-id"));
    assert.deepEqual(entry.phases.map(({ name }) => name), [phase]);
  }
});

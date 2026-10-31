import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { createClientAddressResolver, installClientAddressTransport } from "../src/server/http/client-address.ts";
import { clientAddress, isSameOrigin } from "../src/server/http/private-http.ts";
import { createMemberAuthHandler } from "../src/server/members/member-auth-http.ts";
import { createMemberAuthFixture } from "./helpers/member-auth-fixture.mjs";

test("IP trust starts at the socket and stops at the first untrusted hop, without trusting an attacker prefix", () => {
  const direct = createClientAddressResolver();
  assert.equal(direct("198.51.100.7", "1.1.1.1, 2.2.2.2"), "198.51.100.7");
  assert.equal(direct("::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(direct("::ffff:c633:6407"), "198.51.100.7");
  const proxy = createClientAddressResolver("10.0.0.1/32, 10.1.0.0/24, 2001:db8:1::/64");
  for (const prefix of ["1.1.1.1", "malformed", "unknown", "[::1]:80"])
    assert.equal(proxy("10.0.0.1", `${prefix}, 198.51.100.7, 10.1.0.2`), "198.51.100.7");
  assert.equal(proxy("10.0.0.1", "1.1.1.1, 198.51.100.7, 10.9.0.1"), "10.9.0.1");
  assert.equal(proxy("2001:db8:1::1", "::ffff:198.51.100.7"), "198.51.100.7");
  assert.equal(proxy("198.51.100.8", "10.0.0.1"), "198.51.100.8");
  assert.equal(proxy("10.0.0.1", "unknown"), "10.0.0.1");
  assert.equal(proxy("10.0.0.1"), "10.0.0.1");
  assert.equal(proxy(undefined, "198.51.100.7"), "unknown");
  for (const config of ["0.0.0.0/0", "::/0", "localhost", "10.0.0.1/33", "::1/129", "10.0.0.1/", "127.0.0.1:80", "10.0.0.1,,10.0.0.2"])
    assert.throws(() => createClientAddressResolver(config));
});

test("unsigned forwarding/proof/host headers fail closed without transport provenance", () => {
  for (const headers of [{ "x-forwarded-for": "198.51.100.1" }, { "x-real-ip": "198.51.100.1", "cf-connecting-ip": "198.51.100.1" },
    { "x-goal-hint-client-address": `198.51.100.1|${Date.now()}|${"a".repeat(64)}` }]) assert.equal(clientAddress(new Headers(headers)), "unknown");
  const request = new Request("https://goal.test/api/account/register", { headers: {
    host: "goal.test", origin: "https://evil.test", "x-forwarded-host": "evil.test",
  } });
  assert.equal(isSameOrigin(request), false);
});

test("real HTTP transport overwrites forged proofs and rotated forwarding headers cannot evade registration limits", async t => {
  const previous = process.env.GOAL_HINT_TRUSTED_PROXY_CIDRS;
  delete process.env.GOAL_HINT_TRUSTED_PROXY_CIDRS;
  t.after(() => { if (previous === undefined) delete process.env.GOAL_HINT_TRUSTED_PROXY_CIDRS; else process.env.GOAL_HINT_TRUSTED_PROXY_CIDRS = previous; });
  installClientAddressTransport(); installClientAddressTransport();
  const fixture = createMemberAuthFixture({ trialDays: 0 });
  const config = { production: false, cookies: { secure: false, session: "owner" } };
  const register = createMemberAuthHandler("register", async () => ({ config, auth: fixture.service, sessions: fixture.sessionService }));
  const server = createServer(async (incoming, response) => {
    const headers = new Headers(Object.entries(incoming.headers).flatMap(([name, value]) => value === undefined ? [] : [[name, [].concat(value).join(",")]]));
    if (incoming.url === "/probe") { response.end(JSON.stringify({ address: clientAddress(headers) })); return; }
    const parts = []; for await (const part of incoming) parts.push(part);
    const result = await register(new Request("http://goal.test/api/account/register", { method: "POST", headers, body: Buffer.concat(parts) }));
    response.writeHead(result.status); response.end(await result.text());
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const forged = { "x-goal-hint-client-address": `1.1.1.1|${Date.now()}|${"a".repeat(64)}`, "x-real-ip": "1.1.1.1" };
  assert.deepEqual(await (await fetch(origin + "/probe", { headers: forged })).json(), { address: "127.0.0.1" });
  for (let index = 0; index < 11; index++) {
    const result = await fetch(origin + "/register", { method: "POST", headers: { ...forged,
      "x-forwarded-for": `198.51.100.${index + 1}`, "sec-fetch-site": "same-origin", "content-type": "application/json" },
      body: JSON.stringify({ phone: `256700000${String(index + 100)}`, password: "correct horse 47" }) });
    assert.equal(result.status, index < 10 ? 200 : 429);
  }
  assert.equal(fixture.accounts.size, 10);
  assert.equal(fixture.messages.length, 0);
});

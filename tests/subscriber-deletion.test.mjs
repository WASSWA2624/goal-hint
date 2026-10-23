import assert from "node:assert/strict";
import test from "node:test";
import { adminRoute } from "../src/server/admin/admin-http.ts";
import { createSubscriberHandlers } from "../src/server/admin/subscribers-http.ts";

const accountId = "a39140b9-0ed7-40bf-8e33-34aa3a90ef3b";
const token = "t".repeat(43);
const url = `http://localhost:3000/api/admin/subscribers/${accountId}`;
const sameOrigin = { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" };
const request = (body, headers = {}, target = url) => new Request(target, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
function unavailableDatabase() {
  const calls = { queries: 0, transactions: 0 };
  return { calls, database: {
    async query() { calls.queries++; throw new Error("Storage is unavailable."); },
    async transaction() { calls.transactions++; throw new Error("Storage is unavailable."); },
  } };
}
const context = (database, body, target) => ({
  services: { database, config: { production: false } }, owner: { username: "owner" }, request: request(body, {}, target),
});

test("permanent deletion requires a literal confirmation before touching subscriber storage", async () => {
  const { database, calls } = unavailableDatabase();
  const { POST } = createSubscriberHandlers();
  for (const confirmed of [undefined, false, null, 0, 1, "true", "false", {}, []]) {
    const response = await POST(context(database, { action: "delete", ...(confirmed === undefined ? {} : { confirmed }) }));
    assert.equal(response.status, 400, `confirmation ${JSON.stringify(confirmed)}`);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(calls, { queries: 0, transactions: 0 });
  const confirmed = await POST(context(database, { action: "delete", confirmed: true }));
  assert.equal(confirmed.status, 503, "a confirmed deletion reaches storage and reports its failure");
  assert.ok(calls.queries + calls.transactions > 0);
  assert.doesNotMatch(await confirmed.text(), /Storage is unavailable\./u, "internal exceptions stay private");
});

test("permanent deletion refuses malformed account IDs and non-JSON requests before storage", async () => {
  const { database, calls } = unavailableDatabase();
  const { POST } = createSubscriberHandlers();
  for (const id of ["not-an-account", "256700000101", "a39140b9-0ed7-40bf-8e33-34aa3a90ef3b-extra"]) {
    assert.equal((await POST(context(database, { action: "delete", confirmed: true }, `http://localhost:3000/api/admin/subscribers/${id}`))).status, 400);
  }
  const form = new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "action=delete&confirmed=true" });
  assert.equal((await POST({ ...context(database, {}), request: form })).status, 415);
  assert.deepEqual(calls, { queries: 0, transactions: 0 });
});

test("permanent deletion is protected by owner authentication and same-origin checks", async () => {
  const { database, calls } = unavailableDatabase();
  let serviceReads = 0, verifications = 0;
  const services = async () => {
    serviceReads++;
    return { database, config: { production: false, cookies: { session: "owner-session" } },
      auth: { async verify(value) { verifications++; return value === token ? { username: "owner", expiresAt: new Date(Date.now() + 3_600_000) } : null; } },
    };
  };
  const POST = adminRoute(createSubscriberHandlers().POST, { services });
  for (const headers of [
    { cookie: `owner-session=${token}`, "sec-fetch-site": "cross-site" },
    { cookie: `owner-session=${token}`, origin: "https://other.example" },
    { cookie: `owner-session=${token}` },
  ]) assert.equal((await POST(request({ action: "delete", confirmed: true }, headers))).status, 403);
  assert.deepEqual([serviceReads, verifications, calls.queries, calls.transactions], [0, 0, 0, 0]);
  for (const cookie of [undefined, "owner-session=forged"]) {
    const response = await POST(request({ action: "delete", confirmed: true }, { ...sameOrigin, ...(cookie ? { cookie } : {}) }));
    assert.equal(response.status, 401);
  }
  assert.deepEqual(calls, { queries: 0, transactions: 0 }, "an unauthorized owner cannot reach deletion");
  const allowed = await POST(request({ action: "delete", confirmed: true }, { ...sameOrigin, cookie: `owner-session=${token}` }));
  assert.equal(allowed.status, 503, "an authorized, confirmed same-origin request reaches the service");
  assert.ok(calls.queries + calls.transactions > 0);
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  assert.equal(allowed.headers.get("x-robots-tag"), "noindex, nofollow");
});

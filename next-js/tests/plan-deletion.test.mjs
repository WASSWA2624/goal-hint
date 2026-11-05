import assert from "node:assert/strict";
import test from "node:test";
import { createPlansHandlers } from "../src/server/admin/plans-http.ts";
import { createPlansService } from "../src/server/members/plans.ts";

const id = "00000000-0000-4000-8000-000000000123";
const context = (body) => ({ owner: { username: "owner" }, services: { database: {} },
  request: new Request("http://localhost:3000/api/admin/plans", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });

test("permanent deletion refuses missing or non-boolean confirmation before touching storage", async () => {
  const storage = { query() { throw new Error("Unexpected read"); }, transaction() { throw new Error("Unexpected write"); } };
  const service = createPlansService(storage);
  for (const confirmed of [undefined, false, 1, "true", {}]) {
    assert.deepEqual(await service.remove("owner", id, confirmed),
      { status: "invalid", errors: { confirmation: "Confirm permanently deleting this plan." } });
  }
  assert.deepEqual(await service.remove("owner", "invalid", true), { status: "not-found" });
  assert.deepEqual(await service.usage("invalid"), { status: "not-found" });
});

test("plan usage previews and confirmed deletion carry the guarded actor and return private responses", async () => {
  const calls = [], usage = { payments: 2, accessCodes: 1, autoRenewals: 0 };
  const handlers = createPlansHandlers({ service: () => ({
    async usage(...args) { calls.push(["usage", ...args]); return { status: "usage", usage }; },
    async remove(...args) { calls.push(["remove", ...args]); return { status: "saved", plans: [] }; },
  }) });
  const preview = await handlers.POST(context({ action: "usage", id }));
  assert.equal(preview.status, 200); assert.deepEqual(await preview.json(), { usage });
  const removed = await handlers.POST(context({ action: "delete", id, confirmed: true, actor: "forged-owner" }));
  assert.equal(removed.status, 200); assert.deepEqual(await removed.json(), { plans: [] });
  assert.deepEqual(calls, [["usage", id], ["remove", "owner", id, true]]);
  for (const response of [preview, removed]) assert.equal(response.headers.get("cache-control"), "no-store");
});

test("in-use references, active-plan requirements and missing plans return actionable refusals", async () => {
  const usage = { payments: 1, accessCodes: 2, autoRenewals: 3 };
  for (const [outcome, status, error] of [
    [{ status: "in-use", usage }, 409, "in-use"],
    [{ status: "requirements", mode: "test", missing: [{ key: "plan", message: "Keep an active plan." }] }, 409, "requirements"],
    [{ status: "not-found" }, 404, "not-found"],
    [{ status: "invalid", errors: { confirmation: "Confirm deletion." } }, 400, "invalid"],
    [new Error("Storage is down"), 503, "unavailable"],
  ]) {
    const handlers = createPlansHandlers({ service: () => ({ async remove() {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    } }) });
    const response = await handlers.POST(context({ action: "delete", id, confirmed: true }));
    const body = await response.json();
    assert.equal(response.status, status); assert.equal(body.error, error);
    if (error === "in-use") assert.deepEqual(body.usage, usage);
  }
});

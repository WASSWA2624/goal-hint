import assert from "node:assert/strict";
import test from "node:test";
import { createSubscribers } from "../src/server/admin/subscribers.ts";

const now = () => Date.parse("2026-10-29T09:00:00Z");
function fixture() {
  const queries = [];
  const database = { query: async run => run({ ownerAuditEvent: { findMany: async query => {
    queries.push(query);
    return [{ id: 42n, at: new Date("2025-01-15T09:00:00Z"), actor: "owner", action: "payment_approved",
      accountId: null, targetType: "payment", targetId: "example" }];
  } } }) };
  return { queries, audit: createSubscribers(database, now).audit };
}

test("audit applies historical date and event filters before its bounded database read", async () => {
  const { audit, queries } = fixture();
  const rows = await audit("payment_approved", { period: "custom", startDate: "2025-01-15", endDate: "2025-01-15" });
  assert.deepEqual(queries[0].where, { action: "payment_approved", at: {
    gte: new Date("2025-01-14T21:00:00Z"), lt: new Date("2025-01-15T21:00:00Z"),
  } });
  assert.equal(queries[0].take, 100);
  assert.deepEqual(queries[0].orderBy, [{ at: "desc" }, { id: "desc" }]);
  assert.equal(queries[0].select.details, undefined);
  assert.equal(rows[0].id, "42");
  assert.equal(rows[0].at, "2025-01-15T09:00:00.000Z");
});

test("any date remains unrestricted and rolling presets use the service clock", async () => {
  const { audit, queries } = fixture();
  await audit("unknown_action");
  assert.deepEqual(queries[0].where, {});
  await audit("", { period: "1hour" });
  assert.deepEqual(queries[1].where.at, { gte: new Date(now() - 3_600_000), lt: new Date(now() + 1) });
});

test("invalid custom ranges are rejected before querying storage", async () => {
  const { audit, queries } = fixture();
  await assert.rejects(audit("", { period: "custom", startDate: "2025-02-30", endDate: "2025-03-01" }));
  await assert.rejects(audit("", { period: "custom", startDate: "2025-03-02", endDate: "2025-03-01" }));
  assert.deepEqual(queries, []);
});

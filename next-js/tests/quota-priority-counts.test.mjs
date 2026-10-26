import assert from "node:assert/strict";
import test from "node:test";
import { createMysqlQuotaStore } from "../src/server/football/quota-mysql-store.ts";
import { quotaPriorities } from "../src/server/football/quota-contract.ts";

const accountId = "a".repeat(64), periodId = "b".repeat(64);
function storeFor(rows) {
  const aggregate = [];
  const database = { async transaction(operation) { return operation({
    async $executeRaw() { return 1; },
    async $queryRaw(parts, ...values) {
      const sql = parts.join("?");
      if (sql.includes("FOR UPDATE")) return [{ id: accountId }];
      aggregate.push({ sql, values }); return rows;
    },
  }); } };
  return { store: createMysqlQuotaStore(database), aggregate };
}

test("priority bootstrap returns bounded grouped counts scoped to one account and provider period", async () => {
  const state = storeFor([{ name: "live-details", priorityRank: quotaPriorities["live-details"].rank, count: 2n },
    { name: "results-cutoff", priorityRank: quotaPriorities["results-cutoff"].rank, count: 3n }]);
  assert.deepEqual(await state.store.transaction(accountId, (tx) => tx.priorityCounts(periodId)), { "live-details": 2, "results-cutoff": 3 });
  assert.equal(state.aggregate.length, 1);
  assert.deepEqual(state.aggregate[0].values, [accountId, periodId]);
  assert.match(state.aggregate[0].sql, /dispatchedAt IS NOT NULL/u);
  assert.match(state.aggregate[0].sql, /GROUP BY/u);
  assert.doesNotMatch(state.aggregate[0].sql, /SELECT id, workKey/u);
});

test("unknown priorities, mismatched indexed ranks and invalid aggregate counts fail closed", async () => {
  const valid = { name: "live-details", priorityRank: quotaPriorities["live-details"].rank, count: 1n };
  for (const rows of [[{ ...valid, name: "unknown-private-value" }], [{ ...valid, name: null }],
    [{ ...valid, priorityRank: valid.priorityRank + 1 }], [{ ...valid, count: 0n }], [{ ...valid, count: -1n }],
    [{ ...valid, count: 9007199254740993n }], [valid, valid]]) {
    const state = storeFor(rows);
    await assert.rejects(state.store.transaction(accountId, (tx) => tx.priorityCounts(periodId)),
      (error) => error.name === "QuotaStorageError" && !error.message.includes("unknown-private-value"));
  }
});

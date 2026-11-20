import assert from "node:assert/strict";
import test from "node:test";
import { API_FOOTBALL_CONTRACT_VERSION } from "../src/server/football/api-football-contract.ts";
import { createMysqlProviderCoverageStore } from "../src/server/football/provider-coverage-store.ts";

test("raw replay is scoped, idempotent, bounded, and verifies persisted bytes", async () => {
  const pages = new Map();
  const store = createMysqlProviderCoverageStore({ query: async (operation) => operation({ footballHistorySourcePage: {
    async createMany({ data, skipDuplicates }) {
      assert.equal(skipDuplicates, true);
      if (!pages.has(data.id)) pages.set(data.id, data);
    },
    async findFirst({ where }) {
      return [...pages.values()].filter((page) => page.endpoint === where.endpoint && page.selectorHash === where.selectorHash &&
        page.contract === where.contract && page.retrievedAt >= where.retrievedAt.gte && page.retrievedAt <= where.retrievedAt.lte)
        .sort((a, b) => +b.retrievedAt - +a.retrievedAt)[0] ?? null;
    },
  } }) });
  const at = Date.now() - 2000, requestKey = "a".repeat(64);
  const body = Buffer.from('{"get":"predictions","parameters":{"fixture":"123"},"errors":[],"results":1,"paging":{"current":1,"total":1},"response":[{"future":null}]}');
  const other = Buffer.from(body.toString().replace("null", '"updated"'));
  const request = { endpoint: "predictions", requestParameters: { fixture: "123" }, contractVersion: API_FOOTBALL_CONTRACT_VERSION };
  const save = (retrievedAt, payload) => store.archive.save({ requestKey, body: payload, rowCount: 1,
    provenance: { ...request, retrievedAt, currentPage: 1 } });
  const replay = { ...request, requestKey, notBefore: at, now: at + 1500, maxResponseBytes: 1024 };
  await save(at, body);
  await save(at, body);
  await save(at + 1000, other);
  assert.equal(pages.size, 2);
  assert.deepEqual(await store.archive.replay(replay), { body: other, retrievedAt: at + 1000 });
  assert.deepEqual(await store.archive.replay({ ...replay, now: at + 500 }), { body, retrievedAt: at });
  assert.equal(await store.archive.replay({ ...replay, requestKey: "b".repeat(64) }), null);
  assert.equal(await store.archive.replay({ ...replay, maxResponseBytes: 2 }), null);
  assert.equal(await store.archive.replay({ ...replay, notBefore: at + 1200 }), null);
  const latest = [...pages.values()].find((page) => +page.retrievedAt === at + 1000);
  latest.compressedRows = new Uint8Array([0]);
  assert.equal(await store.archive.replay(replay), null);
});

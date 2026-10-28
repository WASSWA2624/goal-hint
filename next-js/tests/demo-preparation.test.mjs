import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function run(script) {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-test-module-mocks", "--input-type=module"], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true",
      DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_preparation_test" },
    input: script, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
}

const setup = `
  import assert from "node:assert/strict";
  import { mock } from "node:test";
  let memberSeeds = 0;
  mock.module("./src/server/demo/member-seed.ts", { exports: { seedDemoMember: async () => { memberSeeds++; } } });
  const first = await import("./src/server/demo/seed.ts?bundle=first");
  const second = await import("./src/server/demo/seed.ts?bundle=second");
  const sqlText = query => Array.isArray(query) ? query.join("?") : query.sql;
  const now = Date.parse("2026-10-28T10:00:00Z"), date = "2026-10-26";
`;

test("route bundles reuse one catalog preparation and recent date observations for the shared database", () => {
  run(setup + `
    const { demoFixturesForDate } = await import("./src/server/demo/api-football.ts");
    const { demoId } = await import("./src/server/demo/forecast.ts");
    const fixtures = demoFixturesForDate(date, now), ids = fixtures.map(fixture => demoId("fixture", fixture.fixture.id));
    let validations = 0, writes = 0, publishedReads = 0, proofs = 0;
    const tx = {
      $queryRaw: async query => {
        const sql = sqlText(query);
        if (sql.includes("SELECT DATABASE()")) { validations++; return [{ name: "goal_hint_demo_preparation_test" }]; }
        if (sql.includes("FROM PredictionSet s WHERE s.fixtureId IN")) {
          publishedReads++; return ids.map(fixtureId => ({ fixtureId, id: fixtureId, marketCount: 4n }));
        }
        if (sql.includes("COUNT(*) AS fixtures")) {
          proofs++; return [{ fixtures: 560n, forecasts: 560n, markets: 560n, states: 560n, prices: 560n, coherent: 560n,
            oldestQuote: new Date(now - 1000), generation: 1n }];
        }
        if (sql.includes("COUNT(*) AS count")) return [{ count: 0n }];
        return [];
      },
      $executeRaw: async () => 1,
      fixtureResultState: { findMany: async () => ids.map(fixtureId => ({ fixtureId, lastSyncAt: new Date(now), result: null })) },
    };
    const database = { query: operation => operation(tx), transaction: async operation => { writes++; return operation(tx); } };
    await Promise.all([first.ensureDemoDates(database, [], now), second.ensureDemoDates(database, [], now)]);
    assert.deepEqual([validations, writes, memberSeeds], [1, 1, 1]);
    await first.ensureDemoDates(database, [date], now);
    await second.ensureDemoDates(database, [date], now + 1000);
    assert.deepEqual([publishedReads, proofs, validations, writes, memberSeeds], [1, 1, 1, 1, 1]);
    // The existing one-minute freshness boundary remains unchanged.
    await second.ensureDemoDates(database, [date], now + 60_000);
    assert.deepEqual([publishedReads, proofs], [2, 2]);
  `);
});

test("concurrent bundles share date preparation failures and the next request can retry", () => {
  run(setup + `
    let publishedReads = 0, rejectPublished, started;
    const publishedStarted = new Promise(resolve => { started = resolve; });
    const blocked = new Promise((_, reject) => { rejectPublished = reject; });
    const tx = {
      $queryRaw: async query => {
        const sql = sqlText(query);
        if (sql.includes("SELECT DATABASE()")) return [{ name: "goal_hint_demo_preparation_test" }];
        if (sql.includes("FROM PredictionSet s WHERE s.fixtureId IN")) { publishedReads++; started(); return blocked; }
        return [];
      },
      $executeRaw: async () => 1,
    };
    const database = { query: operation => operation(tx), transaction: operation => operation(tx) };
    await first.ensureDemoDates(database, [], now);
    const one = first.ensureDemoDates(database, [date], now);
    await publishedStarted;
    const two = second.ensureDemoDates(database, [date], now);
    await new Promise(setImmediate);
    rejectPublished(new Error("Synthetic preparation failed."));
    const results = await Promise.allSettled([one, two]);
    assert.ok(results.every(result => result.status === "rejected"));
    assert.equal(publishedReads, 1, "both route bundles must await the same date operation");
    await assert.rejects(second.ensureDemoDates(database, [date], now + 1000), /Synthetic preparation failed/u);
    assert.equal(publishedReads, 2, "a failed operation must not poison later requests");
  `);
});

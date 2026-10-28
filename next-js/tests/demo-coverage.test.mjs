import assert from "node:assert/strict";
import test from "node:test";

test("database coverage verifies the exact January–November dates, not only the total", async (t) => {
  const keys = ["NODE_ENV", "NEXT_PUBLIC_GOAL_HINT_DEMO", "DATABASE_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true",
    DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo" });
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const { verifyDemoDatabase } = await import("../src/server/demo/seed.ts");
  const start = Date.parse("2026-01-01T00:00:00Z");
  const coverage = Array.from({ length: 334 }, (_, day) => ({ day: new Date(start + day * 86_400_000), matches: 560n }));
  const database = (rows) => ({ query: async (operation) => operation({
    $queryRaw: async (sql) => sql.join("").includes("SELECT DATABASE()") ? [{ name: "goal_hint_demo" }] : rows,
  }) });
  assert.deepEqual(await verifyDemoDatabase(database(coverage)), { days: 334, fixtures: 187_040, minimumPerDay: 560 });
  for (const invalid of [coverage.slice(1), coverage.map((row) => ({ ...row, day: new Date(row.day.getTime() + 86_400_000) })),
    coverage.map((row, index) => index === 100 ? { ...row, day: null } : row),
    coverage.map((row, index) => index === 100 ? { ...row, matches: 559n } : row)]) {
    await assert.rejects(verifyDemoDatabase(database(invalid)), /daily fixture coverage is incomplete/u);
  }
});

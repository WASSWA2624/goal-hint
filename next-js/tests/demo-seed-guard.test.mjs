import assert from "node:assert/strict";
import test from "node:test";

test("demo initialization refuses remote/private targets and production before issuing SQL", async (t) => {
  const keys = ["NODE_ENV", "NEXT_PUBLIC_GOAL_HINT_DEMO", "DATABASE_URL"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true" });
  t.after(() => { for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } });
  const { ensureDemoDates } = await import("../src/server/demo/seed.ts");
  for (const [mode, url] of [["development", "mysql://demo@remote.invalid/goal_hint_demo"],
    ["development", "mysql://demo@127.0.0.1/private_application"], ["production", "mysql://demo@127.0.0.1/goal_hint_demo"]]) {
    Object.assign(process.env, { NODE_ENV: mode, DATABASE_URL: url });
    let queries = 0;
    const database = { query: async () => { queries++; throw new Error("SQL must not be reached."); } };
    await assert.rejects(ensureDemoDates(database, ["2026-10-28"]), /loopback|development demo mode/u);
    assert.equal(queries, 0);
  }
});

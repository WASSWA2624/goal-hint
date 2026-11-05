import assert from "node:assert/strict";
import test from "node:test";
import { createAnalyticsReporter } from "../src/server/analytics/analytics-report.ts";

const query = { from: "2026-10-10", to: "2026-10-10", compare: "previous", filters: {} };
const now = () => Date.parse("2026-10-11T00:00:00.000Z");
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function fixtureRows(sql) {
  if (sql.includes("AS newVisitors")) return [{ visits: 4n, visitors: 3n, pageviews: 8n, bounces: 1n,
    avgVisitMs: 2000, conversions: 1n, newVisitors: 2n, returningVisitors: 1n }];
  if (sql.includes("s.exitPath AS path")) return [{ path: "/en/help", exits: 2n }];
  if (sql.includes("j.journey AS journey")) return [{ journey: "/[locale]/help", visits: 1n }];
  if (sql.includes("e.name AS name")) return [{ name: "match-analysis", target: null, count: 2n, visitors: 1n }];
  return [];
}

test("analytics breakdown reads start while comparison queries remain pending and retain summary-based shares", async () => {
  const slow = deferred(), calls = [];
  const database = { query: operation => operation({ $queryRaw: async statement => {
    const sql = statement.sql;
    calls.push(sql);
    if (sql.includes("GROUP BY weekday, hour")) await slow.promise;
    return fixtureRows(sql);
  } }) };
  let settled = false;
  const report = createAnalyticsReporter(database, { now }).report(query).finally(() => { settled = true; });
  await Promise.resolve();
  try {
    assert.ok(calls.some(sql => sql.includes("s.exitPath AS path")), "independent breakdown SQL must not wait for the heatmap");
    assert.equal(settled, false, "the response still waits for all required report data");
  } finally { slow.resolve(); }
  const result = await report;
  assert.equal(calls.length, 36, "the optimization must not duplicate report queries");
  assert.equal(result.summary.visits, 4);
  assert.equal(result.breakdowns.exits[0].share, 0.5);
  assert.equal(result.breakdowns.journeys[0].share, 0.25);
  assert.equal(result.breakdowns.conversions[0].rate, 0.5);
  assert.equal(result.generatedAt, new Date(now()).toISOString());
});

test("a failed parallel breakdown rejects the complete report without leaving an unhandled read", async () => {
  const failure = new Error("read unavailable");
  const database = { query: operation => operation({ $queryRaw: async statement => {
    if (statement.sql.includes("s.exitPath AS path")) throw failure;
    return fixtureRows(statement.sql);
  } }) };
  await assert.rejects(createAnalyticsReporter(database, { now }).report(query), error => error === failure);
});

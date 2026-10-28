import assert from "node:assert/strict";
import test from "node:test";
import { warmDemoFeedSummaries } from "../src/server/demo/feed-summary.ts";

const at = Date.parse("2026-10-28T10:00:00Z");
const counts = { total: 3, won: 1, lost: 1, pending: 1, void: 0, unavailable: 0 };

test("startup validates both page and unrestricted summaries with one captured clock", async () => {
  const calls = [];
  let clockReads = 0, current = at;
  await warmDemoFeedSummaries({ now: () => { clockReads++; return current; } }, [39], async (parameters, context, clock) => {
    calls.push({ query: parameters.toString(), locale: context.locale, at: clock.now() });
    current += 90_000;
    return { total: 3, performance: counts };
  });
  assert.equal(clockReads, 1);
  assert.deepEqual(calls, [{ query: "picks=only", locale: "en", at }, { query: "", locale: "en", at }]);
});

test("equivalent page and API SQL scopes warm only once", async () => {
  const calls = [];
  await warmDemoFeedSummaries({ now: () => at }, [39], async parameters => {
    calls.push(parameters.toString());
    return { total: 3, performance: counts };
  }, "all");
  assert.deepEqual(calls, ["picks=all"]);
});

test("startup never accepts missing, incomplete or mismatched summary counts", async () => {
  for (const performance of [null, { ...counts, pending: 0 }, { ...counts, lost: -1 }, { ...counts, total: 4, pending: 2 }]) {
    await assert.rejects(warmDemoFeedSummaries({ now: () => at }, [39], async () => ({ total: 3, performance })),
      /validated default match summary is not ready/u);
  }
  const failure = new Error("Stored match read unavailable");
  await assert.rejects(warmDemoFeedSummaries({ now: () => at }, [39], async () => { throw failure; }), failure);
});

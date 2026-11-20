import assert from "node:assert/strict";
import test from "node:test";
import { createMatchFeedMarketsHandler } from "../src/server/matches/feed-markets-http.ts";

const full = { tier: "full", signedIn: true, mode: "on" };
const free = { tier: "free", signedIn: false, mode: "on" };
const request = (query = "") => new Request(`https://example.test/api/matches/markets${query}`);

test("market availability uses the authenticated scope and stays private", async () => {
  for (const [access, suffix, finishedOnly] of [[full, "", false], [free, "?status=finished", true]]) {
    const picks = finishedOnly ? ["total-goals:under-1.5"] : ["match-result:home-win", "total-goals:under-1.5"];
    const read = createMatchFeedMarketsHandler(async (scope) => {
      assert.equal(scope, finishedOnly);
      return picks;
    }, async () => access);
    const response = await read(request(suffix));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("vary"), "Cookie");
    assert.deepEqual(await response.json(), { marketPicks: picks });
  }
});

test("unauthorized and invalid requests cannot inspect market availability", async () => {
  const unavailable = async () => assert.fail("The catalog must remain unread");
  const read = createMatchFeedMarketsHandler(unavailable, async () => free);
  for (const query of ["", "?status=live", "?status=scheduled"]) {
    const response = await read(request(query));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "subscription-required");
  }
  for (const query of ["?date=2026-11-20", "?status=Finished", "?status=finished&status=all", "?leagues=0"]) {
    assert.equal((await read(request(query))).status, 400);
  }
});

test("a subscription expiring during a read cannot disclose unrestricted choices", async () => {
  let access = full;
  const read = createMatchFeedMarketsHandler(async () => {
    access = free;
    return ["match-result:home-win"];
  }, async () => access);
  const response = await read(request("?status=finished"));
  assert.equal(response.status, 403);
  assert.equal(Object.hasOwn(await response.json(), "marketPicks"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { feedQueryHref, feedQueryKey, resolveFeedDates, serializeFeedQuery } from "../src/domain/feed-query.ts";
import { query, today } from "./helpers/client-state-fixtures.mjs";

test("URL queries round trip with one canonical order and explicit EAT context", () => {
  for (const parameters of ["", "when=tomorrow", "when=next-7-days", "date=2020-02-29", "from=2020-02-29&to=2020-03-06",
    "q=Example+FC&league=league-a&status=live&market=total-goals&sort=probability&page=3&pageSize=40",
    "market=match-result&sort=probability", "status=finished", "market=both-teams-to-score", "market=double-chance"]) {
    const parsed = query(parameters);
    assert.deepEqual(query(serializeFeedQuery(parsed, today).toString()), parsed);
    const url = new URL(feedQueryHref(parsed, today), "https://example.test");
    const date = url.pathname.split("/")[3];
    assert.deepEqual(query(url.searchParams.toString(), date ? { routeDate: date } : {}), parsed);
  }
  assert.equal(serializeFeedQuery(query("page=1&status=all&market=match-result&when=today"), today).toString(), "");
  assert.equal(serializeFeedQuery(query("q=+Cafe%CC%81+++FC+"), today).toString(), "q=Caf%C3%A9+FC");
  assert.equal(feedQueryHref(query("from=2020-02-29&to=2020-03-06&status=finished"), today),
    "/en/predictions/2020-02-29?to=2020-03-06&status=finished");
});

test("canonical list identity includes filters, market sort, locale and resolved dates, but excludes loaded page", () => {
  const key = feedQueryKey(query(), today);
  assert.equal(feedQueryKey(query("date=2026-10-09&page=2"), today), key);
  assert.equal(feedQueryKey(query("from=2026-10-09&to=2026-10-09"), today), key);
  for (const input of ["q=team", "league=a", "status=live", "market=total-goals", "market=match-result&sort=probability", "pageSize=20", "when=tomorrow"]) {
    assert.notEqual(feedQueryKey(query(input), today), key, input);
  }
  assert.equal(resolveFeedDates(query("when=next-7-days"), today).endDate, "2026-10-15");
  assert.equal(resolveFeedDates(query("when=tomorrow"), today).startDate, "2026-10-10");
});

test("malformed, ambiguous, unbounded and unsupported URL values are rejected", () => {
  for (const input of ["other=x", "q=a&q=b", "date=2026-02-29", "date=2026-1-01", "date=2026-10-09&when=today",
    "date=2026-10-09&to=2026-10-10", "from=2026-10-09", "to=2026-10-09", "from=2026-10-10&to=2026-10-09",
    "from=2026-10-09&to=2026-10-16", "when=next-week", "q=%00", "q=%0a", `q=${"a".repeat(121)}`,
    "league=../x", "league=", "status=correct", "status=", "market=exact-score", "market=", "sort=asc",
    "page=0", "page=-1", "page=01", "page=1.5", "page=1e2", "page=10001", "pageSize=101", "pageSize=0"]) {
    assert.throws(() => query(input), undefined, input);
  }
  assert.throws(() => query("when=today", { routeDate: "2026-10-09" }));
  assert.throws(() => query("date=2026-10-09", { routeDate: "2026-10-09" }));
});

test("probability sorting keeps its market and rejects stale or missing selections", () => {
  assert.throws(() => query("sort=probability"));
  assert.throws(() => query("market=total-goals&sort=probability&sortMarket=match-result"));
  assert.throws(() => query("sort=kickoff&sortMarket=total-goals"));
  const sorted = query("market=total-goals&sort=probability&sortMarket=total-goals");
  assert.deepEqual(sorted.sort, { by: "probability", market: "total-goals" });
  assert.throws(() => serializeFeedQuery({ ...sorted, market: "double-chance" }, today));
  assert.throws(() => serializeFeedQuery({ ...sorted, search: " unnormalized " }, today));
});

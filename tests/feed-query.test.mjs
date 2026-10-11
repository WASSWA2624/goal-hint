import assert from "node:assert/strict";
import test from "node:test";
import { activeFeedFilterCount, feedQueryHref, feedQueryKey, FeedQueryError, isAnyOdds, panelFilterCount, parseFeedQuery, resolveFeedDates,
  serializeFeedQuery } from "../src/domain/feed-query.ts";
import { publicPolicy } from "../src/domain/public-policy.ts";
import { query, today } from "./helpers/client-state-fixtures.mjs";

test("URL queries round trip with one canonical order and explicit EAT context", () => {
  for (const parameters of ["", "when=tomorrow", "when=next-3-days", "when=next-7-days", "when=next-30-days", "date=2020-02-29",
    "from=2020-02-29&to=2020-03-06", "from=2026-10-01&to=2026-10-31",
    "q=Example+FC&league=league-b,league-a&country=Spain,England&status=live&market=total-goals,match-result&prob=55-90&sort=probability&dir=asc&page=3&pageSize=40",
    "sort=probability", "sort=kickoff&dir=desc", "status=finished", "market=both-teams-to-score", "market=double-chance", "prob=0-60", "picks=only"]) {
    const parsed = query(parameters);
    assert.deepEqual(query(serializeFeedQuery(parsed, today).toString()), parsed);
    const url = new URL(feedQueryHref(parsed, today), "https://example.test");
    const date = url.pathname.split("/")[3];
    assert.deepEqual(query(url.searchParams.toString(), date ? { routeDate: date } : {}), parsed);
  }
  assert.equal(serializeFeedQuery(query("page=1&status=all&market=match-result&prob=0-100&picks=all&sort=kickoff&dir=asc&when=today"), today).toString(), "");
  assert.equal(serializeFeedQuery(query("q=+Cafe%CC%81+++FC+"), today).toString(), "q=Caf%C3%A9+FC");
  assert.equal(feedQueryHref(query("from=2020-02-29&to=2020-03-06&status=finished"), today),
    "/en/predictions/2020-02-29?to=2020-03-06&status=finished");
});

test("list filters are deduplicated, sorted and in policy order, so equivalent URLs share a key", () => {
  const parsed = query("league=b,a,b&country=Spain,England&market=both-teams-to-score,match-result");
  assert.deepEqual(parsed.leagues, ["a", "b"]);
  assert.deepEqual(parsed.countries, ["England", "Spain"]);
  assert.deepEqual(parsed.markets, ["match-result", "both-teams-to-score"]);
  assert.equal(serializeFeedQuery(parsed, today).toString(), "league=a%2Cb&country=England%2CSpain&market=match-result%2Cboth-teams-to-score");
  // Plain checkbox forms repeat list keys; they join exactly like comma lists.
  assert.deepEqual(parseFeedQuery(new URLSearchParams("league=b&league=a&market=match-result&market=total-goals"), { today }),
    query("league=a,b&market=match-result,total-goals"));
  assert.deepEqual(query("league=").leagues, []);
  assert.equal(activeFeedFilterCount(query()), 0);
  assert.equal(activeFeedFilterCount(query("q=x&league=a,b&country=Spain&market=total-goals&prob=50-100&status=live")), 7);
  assert.equal(activeFeedFilterCount(query("picks=only")), 1);
});

test("canonical list identity includes filters, order, locale and resolved dates, but excludes loaded page", () => {
  const key = feedQueryKey(query(), today);
  assert.equal(feedQueryKey(query("date=2026-10-09&page=2"), today), key);
  assert.equal(feedQueryKey(query("from=2026-10-09&to=2026-10-09"), today), key);
  for (const input of ["q=team", "league=a", "country=Spain", "status=live", "market=total-goals", "market=match-result,total-goals",
    "prob=50-100", "sort=probability", "dir=desc", "pageSize=20", "when=tomorrow"]) {
    assert.notEqual(feedQueryKey(query(input), today), key, input);
  }
  assert.equal(resolveFeedDates(query("when=next-7-days"), today).endDate, "2026-10-15");
  assert.equal(resolveFeedDates(query("when=next-3-days"), today).endDate, "2026-10-11");
  assert.equal(resolveFeedDates(query("when=next-30-days"), today).endDate, "2026-11-07");
  assert.equal(resolveFeedDates(query("when=tomorrow"), today).startDate, "2026-10-10");
});

test("malformed, ambiguous, unbounded and unsupported URL values are rejected", () => {
  for (const input of ["other=x", "q=a&q=b", "status=live&status=all", "date=2026-02-29", "date=2026-1-01", "date=2026-10-09&when=today",
    "date=2026-10-09&to=2026-10-10", "from=2026-10-09", "to=2026-10-09", "from=2026-10-10&to=2026-10-09",
    "from=2026-10-09&to=2026-11-09", "when=next-week", "q=%00", "q=%0a", `q=${"a".repeat(121)}`,
    "league=../x", "league=a,,b", "league=a,", "league=a&league=", `league=${Array.from({ length: 51 }, (_, index) => `l${index}`).join(",")}`,
    "country=Eng%2Fland", "country=+Spain", "country=Spain,", "status=correct", "status=", "market=exact-score", "market=", "market=match-result,match-result",
    "picks=yes", "picks=", "picks=only&picks=only", "prob=50", "prob=60-50", "prob=0-101", "prob=-1-50", "prob=05-50", "sort=asc", "sort=score", "dir=up", "sortMarket=match-result",
    "page=0", "page=-1", "page=01", "page=1.5", "page=1e2", "page=10001", "pageSize=101", "pageSize=0",
    // The API's `leagues=0` response option is never part of a feed query or page URL.
    "leagues=0"]) {
    assert.throws(() => query(input), undefined, input);
  }
  assert.throws(() => query("when=today", { routeDate: "2026-10-09" }));
  assert.throws(() => query("date=2026-10-09", { routeDate: "2026-10-09" }));
});

test("sorting defaults direction per field and serializes only non-default directions", () => {
  assert.deepEqual(query().sort, { by: "kickoff", direction: "asc" });
  assert.deepEqual(query("sort=probability").sort, { by: "probability", direction: "desc" });
  assert.deepEqual(query("sort=probability&dir=asc").sort, { by: "probability", direction: "asc" });
  assert.equal(serializeFeedQuery(query("sort=probability&dir=desc"), today).toString(), "sort=probability");
  assert.equal(serializeFeedQuery(query("dir=desc"), today).toString(), "dir=desc");
  const sorted = query("sort=probability");
  assert.throws(() => serializeFeedQuery({ ...sorted, sort: { by: "probability", direction: "sideways" } }, today));
  assert.throws(() => serializeFeedQuery({ ...sorted, markets: [] }, today));
  assert.throws(() => serializeFeedQuery({ ...sorted, search: " unnormalized " }, today));
});

test("odds= (052) is an unknown key while provider odds are not public, whatever its value", () => {
  // Owner decision 3: display rights are unconfirmed, so the public feed never accepts an odds filter.
  assert.equal(publicPolicy.features.providerOdds, false);
  assert.equal(query().odds, null);
  for (const input of ["odds=1.50-3.00", "odds=1.01-1000.00", "odds=", "odds=abc", "prob=50-100&odds=1.50-3.00", "odds=1.50-3.00&odds=1.50-3.00"]) {
    assert.throws(() => query(input), FeedQueryError, input);
  }
});

test("odds= (052) round trips with two places, inclusive bounds and omitted extremes once provider odds are on", () => {
  const on = (parameters, context = {}) => query(parameters, { providerOdds: true, ...context });
  for (const parameters of ["odds=1.50-3.00", "prob=55-90&odds=1.50-3.00", "odds=1.01-1.50", "odds=1.50-1000.00", "odds=20.00-1000.00",
    "odds=2.00-2.00", "odds=999.99-1000.00", "date=2020-02-29&market=total-goals&odds=1.85-1.85&sort=probability"]) {
    const parsed = on(parameters);
    assert.deepEqual(on(serializeFeedQuery(parsed, today).toString()), parsed, parameters);
    const url = new URL(feedQueryHref(parsed, today), "https://example.test"), date = url.pathname.split("/")[3];
    assert.deepEqual(on(url.searchParams.toString(), date ? { routeDate: date } : {}), parsed, parameters);
  }
  assert.deepEqual(on("odds=1.50-3.00").odds, { min: 150, max: 300 });
  assert.ok(Object.isFrozen(on("odds=1.50-3.00").odds));
  // Canonical order puts odds right after prob.
  assert.equal(serializeFeedQuery(on("sort=probability&odds=1.50-3.00&prob=55-90&market=total-goals"), today).toString(),
    "market=total-goals&prob=55-90&odds=1.50-3.00&sort=probability");
  // Both slider extremes (1.01 and the 20.00+ stop's 1000.00) mean no bound, so they are omitted like prob=0-100.
  assert.equal(on("odds=1.01-1000.00").odds, null);
  assert.equal(serializeFeedQuery(on("odds=1.01-1000.00"), today).toString(), "");
  assert.equal(serializeFeedQuery({ ...query(), odds: { min: 101, max: 100_000 } }, today).toString(), "");
  assert.equal(isAnyOdds(null), true); assert.equal(isAnyOdds({ min: 101, max: 2_000 }), false);
  // Identity and filter counts include the bounds.
  assert.notEqual(feedQueryKey(on("odds=1.50-3.00"), today), feedQueryKey(query(), today));
  assert.notEqual(feedQueryKey(on("odds=1.50-3.00"), today), feedQueryKey(on("odds=1.50-3.01"), today));
  assert.equal(feedQueryKey(on("odds=1.50-3.00&page=2"), today), feedQueryKey(on("odds=1.50-3.00"), today));
  assert.equal(feedQueryKey(on("odds=1.01-1000.00"), today), feedQueryKey(query(), today));
  assert.equal(activeFeedFilterCount(on("odds=1.50-3.00")), 1);
  assert.equal(activeFeedFilterCount(on("odds=1.01-1000.00")), 0);
  assert.equal(panelFilterCount(on("prob=50-100&odds=1.50-3.00")), 2);
  assert.equal(panelFilterCount({ leagues: [], countries: [], markets: ["match-result"], probability: { min: 0, max: 100 } }), 0);
  for (const input of ["odds=1.5-3.00", "odds=01.50-3.00", "odds=3.00-1.50", "odds=1.00-2.00", "odds=1.50", "odds=", "odds=1,50-3,00",
    "odds=1.50-3.00&odds=1.50-3.00", "odds=1.50-1000.01", "odds=1.505-3.00", "odds=+1.50-3.00", "odds=1.50 - 3.00", "odds=0.50-3.00",
    "odds=10000.00-10000.00", "odds=9999.99-9999.99", "odds=1.50-3.00-4.00", "odds=1.50-3", "odds=1e2-3.00", "odds=%EF%BC%91.50-3.00"]) {
    assert.throws(() => on(input), FeedQueryError, input);
  }
  // Hand-built queries are validated, never silently normalized.
  const base = on("");
  for (const odds of [{ min: 300, max: 150 }, { min: 100, max: 200 }, { min: 150, max: 100_001 }, { min: 1.5, max: 3 }, { min: "150", max: 300 }, {}]) {
    assert.throws(() => serializeFeedQuery({ ...base, odds }, today), FeedQueryError, JSON.stringify(odds));
  }
});

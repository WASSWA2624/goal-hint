import assert from "node:assert/strict";
import test from "node:test";
import { activeFeedFilterCount, defaultMarkets, feedQueryHref, feedQueryKey, FeedQueryError, isAnyMarkets, isAnyOdds, panelFilterCount, parseFeedQuery, resolveFeedDates,
  serializeFeedQuery, formatProbabilityValue, parseProbabilityValue, probabilityFraction, validProbabilityRange } from "../src/domain/feed-query.ts";
import { publicPolicy } from "../src/domain/public-policy.ts";
import { parseReportingDate } from "../src/domain/calendar.ts";
import { fullDayKickoffTime } from "../src/domain/kickoff-time.ts";
import { query, today } from "./helpers/client-state-fixtures.mjs";

test("URL queries round trip with one canonical order and explicit EAT context", () => {
  for (const parameters of ["", "when=last-30-days", "when=last-7-days", "when=last-3-days", "when=yesterday", "when=today", "when=tomorrow", "when=next-3-days", "when=next-7-days", "when=next-30-days", "date=2020-02-29",
    "from=2020-02-29&to=2020-03-06", "from=2026-10-01&to=2026-10-31",
    "q=Example+FC&league=league-b,league-a&country=Spain,England&status=live&market=total-goals,match-result&prob=55-90&sort=probability&dir=asc&page=3&pageSize=40",
    "sort=probability", "sort=kickoff&dir=desc", "sort=kickoff&dir=asc", "status=finished", "market=both-teams-to-score", "market=double-chance", "prob=0-60", "picks=only"]) {
    const parsed = query(parameters);
    assert.deepEqual(query(serializeFeedQuery(parsed, today).toString()), parsed);
    const url = new URL(feedQueryHref(parsed, today), "https://example.test");
    const date = url.pathname.split("/")[3];
    assert.deepEqual(query(url.searchParams.toString(), date ? { routeDate: date } : {}), parsed);
  }
  assert.equal(serializeFeedQuery(query(`page=1&status=all&market=${defaultMarkets.join(",")}&prob=0-100&picks=all&sort=kickoff&dir=desc&when=last-30-days`), today).toString(), "");
  assert.equal(serializeFeedQuery(query("when=today"), today).toString(), "when=today");
  assert.equal(serializeFeedQuery(query("q=+Cafe%CC%81+++FC+"), today).toString(), "q=Caf%C3%A9+FC");
  assert.equal(feedQueryHref(query("from=2020-02-29&to=2020-03-06&status=finished"), today),
    "/en/predictions/2020-02-29?to=2020-03-06&status=finished&picks=all");
});

test("default markets are Any; page links retain an explicit all-fixture choice", () => {
  const defaults = query();
  assert.deepEqual(defaults.dates, { kind: "last-30-days" });
  assert.deepEqual(defaults.markets, publicPolicy.markets);
  assert.equal(defaults.time, undefined); assert.deepEqual(defaults.leagues, []); assert.deepEqual(defaults.countries, []);
  assert.deepEqual(defaults.probability, { min: 0, max: 100 }); assert.equal(defaults.odds, null);
  assert.equal(isAnyMarkets(defaults.markets), true);
  assert.equal(isAnyMarkets([...defaultMarkets].reverse()), true);
  assert.equal(isAnyMarkets(["match-result"]), false);
  assert.equal(feedQueryHref(query(`market=${defaultMarkets.join(",")}`), today), "/en/matches?picks=all&when=last-30-days&sort=kickoff");
  assert.equal(feedQueryHref(query("market=match-result"), today), "/en/matches?market=match-result&picks=all&when=last-30-days&sort=kickoff");
  assert.equal(panelFilterCount(defaults), 0); assert.equal(panelFilterCount(query("market=match-result")), 1);
  assert.notEqual(feedQueryKey(defaults, today), feedQueryKey(query("market=match-result"), today));
});

test("home resolves the rolling last 30 calendar days inclusively across month, leap-day and year boundaries", () => {
  for (const [day, from] of [["2026-10-09", "2026-09-10"], ["2024-03-01", "2024-02-01"], ["2026-01-15", "2025-12-17"]]) {
    const current = parseReportingDate(day), selected = parseFeedQuery({}, { today: current });
    const range = resolveFeedDates(selected, current);
    assert.equal(range.startDate, from); assert.equal(range.endDate, day); assert.equal(range.dayCount, 30);
    assert.equal(feedQueryHref(selected, current), "/en/matches?picks=all&when=last-30-days&sort=kickoff");
    assert.deepEqual(parseFeedQuery({ when: "last-30-days" }, { today: current }), selected);
  }
  const current = query(), tomorrow = parseReportingDate("2026-10-10");
  assert.equal(resolveFeedDates(current, tomorrow).startDate, "2026-09-11");
  assert.equal(resolveFeedDates(current, tomorrow).endDate, tomorrow);
  assert.notEqual(feedQueryKey(current, today), feedQueryKey(current, tomorrow));
  const explicit = query("from=2026-09-10&to=2026-10-09");
  assert.equal(resolveFeedDates(explicit, tomorrow).startDate, "2026-09-10");
  assert.equal(resolveFeedDates(explicit, tomorrow).endDate, today);
  assert.equal(feedQueryHref(explicit, today), "/en/predictions/2026-09-10?to=2026-10-09&picks=all");
  assert.equal(feedQueryHref(query("when=today"), today), "/en/matches?when=today&picks=all&sort=kickoff");
  assert.equal(resolveFeedDates(query("when=today"), today).dayCount, 1);
});

test("recent-day presets stay relative across leap-day and year boundaries", () => {
  for (const [kind, count, from, to, nextFrom, nextTo] of [
    ["last-7-days", 7, "2024-02-24", "2024-03-01", "2024-02-25", "2024-03-02"],
    ["last-3-days", 3, "2024-02-28", "2024-03-01", "2024-02-29", "2024-03-02"],
    ["yesterday", 1, "2024-02-29", "2024-02-29", "2024-03-01", "2024-03-01"],
  ]) {
    const current = parseReportingDate("2024-03-01"), nextDay = parseReportingDate("2024-03-02");
    const selected = parseFeedQuery({ when: kind }, { today: current });
    const range = resolveFeedDates(selected, current), shifted = resolveFeedDates(selected, nextDay);
    assert.equal(range.startDate, from); assert.equal(range.endDate, to); assert.equal(range.dayCount, count);
    assert.equal(shifted.startDate, nextFrom); assert.equal(shifted.endDate, nextTo); assert.equal(shifted.dayCount, count);
    assert.equal(feedQueryHref(selected, current), `/en/matches?when=${kind}&picks=all&sort=kickoff`);
    assert.notEqual(feedQueryKey(selected, current), feedQueryKey(selected, nextDay));
  }
  const newYear = parseReportingDate("2026-01-02");
  for (const [kind, from, to] of [["last-7-days", "2025-12-27", "2026-01-02"],
    ["last-3-days", "2025-12-31", "2026-01-02"], ["yesterday", "2026-01-01", "2026-01-01"]]) {
    const range = resolveFeedDates(parseFeedQuery({ when: kind }, { today: newYear }), newYear);
    assert.equal(range.startDate, from); assert.equal(range.endDate, to);
  }
});

test("full-day time bounds are unrestricted and canonicalize without adding an active filter", () => {
  for (const input of ["timeFrom=&timeTo=", "timeFrom=00:00&timeTo=23:59"]) {
    assert.deepEqual(query(input), query());
    assert.equal(feedQueryHref(query(input), today), "/en/matches?picks=all&when=last-30-days&sort=kickoff");
    assert.equal(panelFilterCount(query(input)), 0);
  }
  const zoned = query("tz=America%2FNew_York");
  const allDay = query("timeFrom=00:00&timeTo=23:59&tz=America%2FNew_York");
  assert.deepEqual(allDay, zoned);
  assert.equal(feedQueryKey(allDay, today), feedQueryKey(zoned, today));
  const draft = { ...query(), time: { ...fullDayKickoffTime, zone: "America/New_York" } };
  assert.equal(feedQueryHref(draft, today), "/en/matches?tz=America%2FNew_York&picks=all&when=last-30-days&sort=kickoff");
  assert.equal(panelFilterCount(draft), 0);
  assert.equal(activeFeedFilterCount(draft), 0);
  const limited = query("timeFrom=00:00&timeTo=23:58&tz=Africa%2FKampala");
  assert.equal(limited.time.to, "23:58"); assert.equal(panelFilterCount(limited), 1);
  assert.throws(() => query("timeFrom=00:00&timeTo=23:59&tz=Invalid%2FZone"), FeedQueryError);
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
  assert.equal(feedQueryKey(query("from=2026-09-10&to=2026-10-09&page=2"), today), key);
  const todayKey = feedQueryKey(query("when=today"), today);
  assert.notEqual(todayKey, key);
  assert.equal(feedQueryKey(query("date=2026-10-09&page=2"), today), todayKey);
  assert.equal(feedQueryKey(query("from=2026-10-09&to=2026-10-09"), today), todayKey);
  for (const input of ["q=team", "league=a", "country=Spain", "status=live", "market=total-goals", "market=match-result,total-goals",
    "prob=50-100", "sort=probability", "dir=asc", "pageSize=20", "when=tomorrow"]) {
    assert.notEqual(feedQueryKey(query(input), today), key, input);
  }
  assert.equal(resolveFeedDates(query("when=next-7-days"), today).endDate, "2026-10-15");
  assert.equal(resolveFeedDates(query("when=next-3-days"), today).endDate, "2026-10-11");
  assert.equal(resolveFeedDates(query("when=next-30-days"), today).endDate, "2026-11-07");
  assert.equal(resolveFeedDates(query("when=tomorrow"), today).startDate, "2026-10-10");
});

test("the last 30 days is only the default: explicit ranges may span up to a year", () => {
  assert.equal(resolveFeedDates(query("from=2026-09-10&to=2026-10-18"), today).dayCount, 39);
  assert.equal(resolveFeedDates(query("from=2025-10-10&to=2026-10-10"), today).dayCount, 366);
  assert.throws(() => query("from=2025-10-09&to=2026-10-10"));
});

test("malformed, ambiguous, unbounded and unsupported URL values are rejected", () => {
  for (const input of ["other=x", "q=a&q=b", "status=live&status=all", "date=2026-02-29", "date=2026-1-01", "date=2026-10-09&when=today",
    "date=2026-10-09&to=2026-10-10", "from=2026-10-09", "to=2026-10-09", "from=2026-10-10&to=2026-10-09",
    "from=2026-10-09&to=2027-10-10", "when=next-week", "q=%00", "q=%0a", `q=${"a".repeat(121)}`,
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

test("sorting defaults to Latest first and preserves explicit ascending and probability orders", () => {
  assert.deepEqual(query().sort, { by: "kickoff", direction: "desc" });
  assert.deepEqual(query("sort=kickoff").sort, query().sort);
  assert.deepEqual(query("dir=asc").sort, { by: "kickoff", direction: "asc" });
  assert.deepEqual(query("sort=probability").sort, { by: "probability", direction: "desc" });
  assert.deepEqual(query("sort=probability&dir=asc").sort, { by: "probability", direction: "asc" });
  assert.equal(serializeFeedQuery(query("sort=probability&dir=desc"), today).toString(), "sort=probability");
  assert.equal(serializeFeedQuery(query("dir=desc"), today).toString(), "");
  assert.equal(serializeFeedQuery(query("dir=asc"), today).toString(), "dir=asc");
  assert.equal(feedQueryHref(query("sort=kickoff&dir=desc"), today), "/en/matches?picks=all&when=last-30-days&sort=kickoff");
  assert.equal(feedQueryHref(query("sort=kickoff&dir=asc"), today), "/en/matches?dir=asc&picks=all&when=last-30-days&sort=kickoff");
  assert.equal(feedQueryKey(query("dir=desc"), today), feedQueryKey(query(), today));
  assert.notEqual(feedQueryKey(query("dir=asc"), today), feedQueryKey(query(), today));
  const sorted = query("sort=probability");
  assert.throws(() => serializeFeedQuery({ ...sorted, sort: { by: "probability", direction: "sideways" } }, today));
  assert.throws(() => serializeFeedQuery({ ...sorted, markets: [] }, today));
  assert.throws(() => serializeFeedQuery({ ...sorted, search: " unnormalized " }, today));
});

test("probability bounds accept decimals and equality, normalize plain decimal URLs, and retain their identity", () => {
  for (const [raw, canonical, expected] of [
    ["0.125-100.000", "0.125-100", { min: 0.125, max: 100 }],
    ["35.7500-45.200", "35.75-45.2", { min: 35.75, max: 45.2 }],
    ["58.2-58.2", "58.2-58.2", { min: 58.2, max: 58.2 }],
    ["0.0000001-0.0000002", "0.0000001-0.0000002", { min: 1e-7, max: 2e-7 }],
  ]) {
    const parsed = query(`prob=${raw}`);
    assert.deepEqual(parsed.probability, expected);
    assert.equal(serializeFeedQuery(parsed, today).get("prob"), canonical);
    assert.deepEqual(query(serializeFeedQuery(parsed, today).toString()), parsed);
    assert.equal(feedQueryKey(parsed, today), feedQueryKey(query(`prob=${canonical}`), today));
  }
  assert.equal(serializeFeedQuery(query("prob=0.00-100.00"), today).has("prob"), false);
  const tiny = { ...query(), probability: { min: Number.MIN_VALUE, max: 100 } };
  const serialized = serializeFeedQuery(tiny, today);
  assert.doesNotMatch(serialized.get("prob"), /e/u);
  assert.deepEqual(query(serialized.toString()).probability, tiny.probability);
  assert.notEqual(feedQueryKey(query("prob=58.2-60"), today), feedQueryKey(query("prob=58.21-60"), today));
});

test("probability values reject incomplete, reversed, out-of-range and nonfinite input", () => {
  for (const raw of ["", " ", "1.", ".5", "01", "00.5", "-0", "-1", "+1", "1e1", "0x10", "NaN", "Infinity", "100.01", "100.000000000000000001", "5%", "5x", " 5", "5 ", 5, null]) {
    assert.equal(parseProbabilityValue(raw), null, String(raw));
  }
  for (const raw of ["0.5-", "-0.5", "5.25-5.24", "0-100.01", "1e-7-100", "NaN-100", "0-Infinity", "0-5.5-6", "0-100.000000000000000001"]) {
    assert.throws(() => query(`prob=${raw}`), FeedQueryError, raw);
  }
  for (const bounds of [{ min: -1, max: 100 }, { min: 0, max: 100.01 }, { min: 58.21, max: 58.2 }, { min: NaN, max: 100 }, { min: 0, max: Infinity }]) {
    assert.equal(validProbabilityRange(bounds), false);
    assert.throws(() => serializeFeedQuery({ ...query(), probability: bounds }, today), FeedQueryError);
  }
  assert.equal(validProbabilityRange({ min: 0, max: 0 }), true);
  assert.equal(validProbabilityRange({ min: 100, max: 100 }), true);
  assert.equal(parseProbabilityValue("0.5"), 0.5);
  assert.equal(formatProbabilityValue(58.2), "58.2");
});

test("percentage-to-fraction conversion preserves decimal equality without an arithmetic division error", () => {
  assert.notEqual(58.2 / 100, 0.582);
  for (const [percent, probability] of [[0, 0], [100, 1], [58.2, 0.582], [60.0049, 0.600049], [0.0000001, 0.000000001]]) {
    assert.equal(probabilityFraction(percent), probability);
  }
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
  assert.equal(panelFilterCount({ leagues: [], countries: [], markets: [...defaultMarkets], probability: { min: 0, max: 100 } }), 0);
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

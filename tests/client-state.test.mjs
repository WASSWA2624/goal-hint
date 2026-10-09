import assert from "node:assert/strict";
import test from "node:test";
import { parseFeedQuery } from "../src/domain/feed-query.ts";
import { compareFixtureVersions, maximumFixtureVersion, parseFixtureSnapshot, parseFixtureVersion } from "../src/domain/fixture-snapshot.ts";
import { calendarChanged, draftChanged, navigationRestored, navigationSaved, pageReceived, queryApplied, refreshFailed, restorationRules } from "../src/state/feed.ts";
import { preferencesChanged, preferencesStorageKey, readPreferences, serializePreferences } from "../src/state/preferences.ts";
import { beginFeedRequest, makeStore } from "../src/state/store.ts";
import { bootstrap, fixture, now, query, today } from "./helpers/client-state-fixtures.mjs";

const state = (store) => store.getState().feed;
function receive(store, records, mode = "refresh", page = 1, nextPage = null) {
  const request = beginFeedRequest(store, { page, mode });
  store.dispatch(pageReceived({ request, data: { records, page, nextPage } }));
}

test("store factories isolate queries, drafts, records, history and preferences", () => {
  const seed = bootstrap();
  const a = makeStore(seed), b = makeStore(seed);
  assert.notEqual(state(a), state(b));
  assert.notEqual(state(a).records["fixture-a"], state(b).records["fixture-a"]);
  a.dispatch(draftChanged(query("q=draft")));
  a.dispatch(preferencesChanged({ density: "compact" }));
  assert.equal(state(a).query.search, "");
  assert.equal(state(a).draft.search, "draft");
  assert.equal(state(b).draft.search, "");
  assert.equal(b.getState().preferences.density, "comfortable");
  receive(a, [fixture({ dataVersion: "10" })]);
  assert.equal(state(b).records["fixture-a"].dataVersion, "9");
  a.dispatch(queryApplied(query("q=applied")));
  assert.equal(state(a).draft.search, "applied");
  assert.equal(state(b).query.search, "");
  assert.equal(state(a).view.phase, "idle");
  assert.deepEqual(JSON.parse(JSON.stringify(a.getState())), a.getState());
});

test("versions use exact unsigned integer ordering, including values above JS precision", () => {
  assert.equal(compareFixtureVersions("10", "9"), 1);
  assert.equal(compareFixtureVersions("9007199254740993", "9007199254740992"), 1);
  assert.equal(compareFixtureVersions(maximumFixtureVersion, maximumFixtureVersion), 0);
  assert.equal(compareFixtureVersions("1", maximumFixtureVersion), -1);
  for (const value of [0, 9, 9n, "0", "01", "-1", "1.0", "1e3", "18446744073709551616", "", " 9"])
    assert.throws(() => parseFixtureVersion(value));
});

test("newer versions replace a whole coherent snapshot regardless of opaque cycle or revision order", () => {
  const store = makeStore(bootstrap());
  const next = fixture({ dataVersion: "10", cycleId: "cycle-a", status: "live", score: { home: 1, away: 0 },
    kickoffAt: now + 1, syncedAt: now + 2 }, "api-football", { "home-win": 0.4, draw: 0.2, "away-win": 0.4 });
  next.forecast.runId = "run-a";
  next.forecast.revisionId = "revision-a";
  next.forecast.markets.forEach((item) => { item.reasons = ["Replacement explanation"]; item.uncertainty = null; });
  receive(store, [next]);
  assert.deepEqual(state(store).records["fixture-a"], next);
  const accepted = state(store).records["fixture-a"];
  receive(store, [fixture({ dataVersion: "9", status: "scheduled" })]);
  assert.strictEqual(state(store).records["fixture-a"], accepted);
  assert.equal(state(store).view.error, "stale-data");
  receive(store, [fixture({ dataVersion: "10", cycleId: "cycle-zz" })]);
  assert.strictEqual(state(store).records["fixture-a"], accepted);
  receive(store, [fixture({ dataVersion: "11", cycleId: "cycle-b", forecast: null, score: null, status: "postponed" })]);
  assert.equal(state(store).records["fixture-a"].forecast, null);
  assert.equal(state(store).records["fixture-a"].score, null);
  assert.equal(state(store).records["fixture-a"].cycleId, "cycle-b");
});

test("latest request identity wins independently of fixture version, including A to B to A", () => {
  const store = makeStore(bootstrap());
  const old = beginFeedRequest(store, { page: 1, mode: "refresh" });
  const current = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(pageReceived({ request: old, data: { records: [fixture({ dataVersion: "99" })], page: 1, nextPage: null } }));
  assert.equal(state(store).records["fixture-a"].dataVersion, "9");
  assert.equal(state(store).request.id, current.id);
  store.dispatch(queryApplied(query("status=live")));
  const b = beginFeedRequest(store, { page: 1, mode: "replace" });
  store.dispatch(queryApplied(query()));
  const a = beginFeedRequest(store, { page: 1, mode: "replace" });
  for (const request of [old, current, b]) {
    store.dispatch(pageReceived({ request, data: { records: [fixture({ dataVersion: "99" })], page: 1, nextPage: 2 } }));
    store.dispatch(refreshFailed({ request, error: "network" }));
  }
  assert.equal(state(store).request.id, a.id);
  assert.equal(state(store).query.status, "all");
  assert.deepEqual(state(store).view.ids, []);
  store.dispatch(pageReceived({ request: a, data: { records: [fixture({ dataVersion: "10" })], page: 1, nextPage: null } }));
  assert.equal(state(store).records["fixture-a"].dataVersion, "10");
});

test("invalid responses and any stale batch retain records and loaded pagination atomically", () => {
  const store = makeStore(bootstrap());
  receive(store, [fixture(), fixture({ fixtureId: "fixture-b", dataVersion: "20" })], "replace", 1, 2);
  const accepted = state(store).records;
  receive(store, [fixture({ dataVersion: "10" }), fixture({ fixtureId: "fixture-b", dataVersion: "19" })], "replace");
  assert.strictEqual(state(store).records, accepted);
  assert.equal(state(store).view.nextPage, 2);
  for (const records of [[fixture(), fixture()], [{ ...fixture(), dataVersion: "1e2" }], [{ ...fixture(), providerPayload: "private" }]]) {
    receive(store, records);
    assert.equal(state(store).view.error, "invalid-response");
    assert.strictEqual(state(store).records, accepted);
    assert.deepEqual(state(store).view.ids, ["fixture-a", "fixture-b"]);
  }
  const request = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(pageReceived({ request, data: { records: [], page: 2, nextPage: null } }));
  assert.equal(state(store).view.error, "invalid-response");
  assert.equal(state(store).view.lastPage, 1);
});

test("pagination de-duplicates membership; refresh updates entities and failures retain the loaded list", () => {
  const store = makeStore(bootstrap());
  receive(store, [fixture()], "replace", 1, 2);
  receive(store, [fixture({ dataVersion: "10" }), fixture({ fixtureId: "fixture-b" })], "append", 2, 3);
  assert.deepEqual(state(store).view.ids, ["fixture-a", "fixture-b"]);
  assert.equal(state(store).view.lastPage, 2);
  receive(store, [fixture({ fixtureId: "fixture-c" })]);
  assert.deepEqual(state(store).view.ids, ["fixture-a", "fixture-b"]);
  assert.equal(state(store).view.nextPage, 3);
  const request = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(refreshFailed({ request, error: "network" }));
  assert.deepEqual(state(store).view.ids, ["fixture-a", "fixture-b"]);
  assert.equal(state(store).view.lastPage, 2);
  assert.equal(state(store).view.error, "network");
  assert.throws(() => beginFeedRequest(store, { page: 5, mode: "append" }));
  assert.throws(() => beginFeedRequest(store, { page: 2, mode: "refresh" }));
});

test("Back restores pagination and scroll only for its history entry, canonical query, page and lifetime", () => {
  const store = makeStore(bootstrap());
  receive(store, [fixture()], "replace", 1, 2);
  receive(store, [fixture({ fixtureId: "fixture-b" })], "append", 2, null);
  store.dispatch(navigationSaved({ entryId: "back-a", scrollY: 850, now }));
  assert.doesNotThrow(() => JSON.stringify(state(store).history));
  store.dispatch(queryApplied(query("q=another")));
  receive(store, [fixture({ dataVersion: "10" })], "replace");
  store.dispatch(navigationRestored({ entryId: "back-a", query: query("date=2026-10-09"), now: now + 1 }));
  assert.deepEqual(state(store).view.ids, ["fixture-a", "fixture-b"]);
  assert.equal(state(store).view.lastPage, 2);
  assert.equal(state(store).view.scrollY, 850);
  assert.equal(state(store).records["fixture-a"].dataVersion, "10");
  assert.equal(state(store).request, null);
  for (const payload of [
    { entryId: "missing", query: query() }, { entryId: "back-a", query: query("status=live") },
    { entryId: "back-a", query: query("page=2") },
    { entryId: "back-a", query: query(), now: now + restorationRules.maximumAgeMilliseconds + 1 },
    { entryId: "back-a", query: query(), now: now - 1 },
  ]) {
    store.dispatch(navigationRestored({ now, ...payload }));
    assert.equal(state(store).view.phase, "idle");
    assert.deepEqual(state(store).view.ids, []);
  }
  assert.throws(() => store.dispatch(navigationSaved({ entryId: "../../x", scrollY: 0, now })));
  assert.throws(() => store.dispatch(navigationSaved({ entryId: "x", scrollY: Infinity, now })));
  for (let index = 0; index < 25; index++) store.dispatch(navigationSaved({ entryId: `entry-${index}`, scrollY: 0, now: now + index }));
  assert.equal(Object.keys(state(store).history).length, restorationRules.maximumEntries);
});

test("empty loaded results restore as ready; an absent handoff stays unloaded", () => {
  const store = makeStore(bootstrap("", []));
  store.dispatch(navigationSaved({ entryId: "empty", scrollY: 0, now }));
  store.dispatch(navigationRestored({ entryId: "empty", query: query(), now }));
  assert.equal(state(store).view.phase, "ready");
  const unloaded = makeStore({ today, query: query(), data: null });
  assert.equal(state(unloaded).view.phase, "idle");
  assert.equal(state(unloaded).view.firstPage, null);
});

test("EAT calendar events roll relative queries and invalidate requests, while preserving historical selections", () => {
  for (const when of ["today", "tomorrow", "next-7-days"]) {
    const store = makeStore(bootstrap(`when=${when}`));
    const request = beginFeedRequest(store, { page: 1, mode: "refresh" });
    const oldKey = state(store).queryKey;
    store.dispatch(calendarChanged("2026-10-10"));
    assert.notEqual(state(store).queryKey, oldKey);
    assert.equal(state(store).query.dates.kind, when);
    assert.equal(state(store).request, null);
    store.dispatch(pageReceived({ request, data: { records: [fixture({ dataVersion: "99" })], page: 1, nextPage: null } }));
    assert.equal(state(store).records["fixture-a"].dataVersion, "9");
    assert.throws(() => store.dispatch(calendarChanged("2026-10-09")));
    assert.throws(() => store.dispatch(calendarChanged("2026-02-29")));
  }
  for (const input of ["date=2020-02-29", "from=2020-02-29&to=2020-03-06"]) {
    const store = makeStore(bootstrap(input));
    const before = state(store);
    const request = beginFeedRequest(store, { page: 1, mode: "refresh" });
    store.dispatch(calendarChanged("2026-10-10"));
    assert.deepEqual(state(store).query, before.query);
    assert.equal(state(store).queryKey, before.queryKey);
    assert.deepEqual(state(store).request, request);
    assert.deepEqual(state(store).view.ids, before.view.ids);
  }
});

test("handoff rejects unknown fields, incomplete source groups, invalid probabilities and ownerless revisions", () => {
  assert.throws(() => makeStore({ ...bootstrap(), data: { records: [fixture()], page: 2, nextPage: null } }));
  for (const mutate of [
    (value) => { value.cycleId = null; },
    (value) => { value.forecast.markets = value.forecast.markets.slice(0, 1); },
    (value) => { value.forecast.markets[0].market.selectedProbability = 0.99; },
    (value) => { value.forecast.markets[0].market.family = "invented"; },
    (value) => { value.forecast.markets[0].market.probabilities = null; },
    (value) => { value.forecast.markets.push(value.forecast.markets[0]); },
  ]) {
    const value = structuredClone(fixture()); mutate(value);
    assert.throws(() => parseFixtureSnapshot(value));
  }
  assert.throws(() => parseFeedQuery({ q: ["a", "b"] }, { today }));
});

test("calendar rollover resets relative pagination and keeps a historical filter draft intact", () => {
  const store = makeStore(bootstrap("when=next-7-days&page=3"));
  const historicalDraft = query("date=2020-02-29&q=unapplied");
  store.dispatch(draftChanged(historicalDraft));
  store.dispatch(calendarChanged("2026-10-10"));
  assert.equal(state(store).query.page, 1);
  assert.equal(state(store).query.dates.kind, "next-7-days");
  assert.deepEqual(state(store).draft, historicalDraft);
  assert.equal(state(store).view.firstPage, null);
});

test("local storage permits only bounded anonymous view preferences", () => {
  assert.match(preferencesStorageKey, /preferences/);
  assert.deepEqual(readPreferences(serializePreferences({ density: "compact" })), { density: "compact" });
  for (const value of [null, "", "{", "[]", "null", "1", '{"density":"compact"}', '{"version":2,"density":"compact"}',
    '{"version":1,"density":"dark"}', '{"version":1,"density":"compact","forecast":{}}', "x".repeat(129)]) {
    assert.equal(readPreferences(value), null, value);
  }
  const store = makeStore(bootstrap());
  assert.equal(store.getState().preferences.density, "comfortable");
  assert.throws(() => store.dispatch(preferencesChanged({ density: "dark" })));
});

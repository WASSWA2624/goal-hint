import assert from "node:assert/strict";
import test from "node:test";
import { fixtureSnapshotSchema, parseFixtureSnapshot } from "../src/domain/fixture-snapshot.ts";
import { hasFinalScoreStatus, liveClockFromProvider, probabilityEntry, sameCardFixture, selectedCardPrediction, teamInitials } from "../src/domain/match-card.ts";
import { mergeFixtureObservation } from "../src/domain/fixture-reconciliation.ts";
import { marketRules, marketSelections, validateMarketGroup } from "../src/domain/markets.ts";
import { isSafeRemoteImageUrl } from "../src/domain/remote-image.ts";
import { createMessages } from "../src/i18n/messages.ts";
import { makeStore, beginFeedRequest } from "../src/state/store.ts";
import { pageReceived } from "../src/state/feed.ts";
import { bootstrap } from "./helpers/client-state-fixtures.mjs";
import { cardExamples, cardFixture } from "./helpers/match-card-fixtures.mjs";

test("selected family defaults to match result and never inherits another family's outcome or probability", () => {
  const record = cardFixture();
  assert.equal(selectedCardPrediction(record).status, "correct");
  assert.equal(selectedCardPrediction(record).probability.roundedPercent, 54);
  const goals = selectedCardPrediction(record, "total-goals");
  assert.equal(goals.status, "incorrect");
  assert.equal(goals.item.market.selection, "under-2.5");
  assert.equal(goals.probability.roundedPercent, 70);
  assert.equal(selectedCardPrediction(record, "both-teams-to-score").status, "incorrect");
  const missing = cardExamples().find(({ fixture }) => fixture.fixtureId === "card-missing-family").fixture;
  assert.equal(selectedCardPrediction(missing, "total-goals"), null);
  assert.equal(selectedCardPrediction(missing).status, "correct");
  assert.equal(selectedCardPrediction(cardFixture({ forecast: null })), null);
});

test("display never settles live or final scores or invents missing forecasts", () => {
  for (const status of ["live", "finished-regulation", "finished-extra-time", "finished-penalties"]) {
    const record = cardFixture({ status, score: { home: 20, away: 0 } }, "ai", null);
    assert.equal(selectedCardPrediction(record).status, "pending");
  }
  const premature = cardFixture(); premature.status = "live";
  assert.equal(selectedCardPrediction(premature).status, "pending");
  assert.throws(() => parseFixtureSnapshot(premature));
  assert.equal(hasFinalScoreStatus("finished-extra-time"), true);
  for (const status of ["scheduled", "live", "postponed", "awarded", "unknown"]) assert.equal(hasFinalScoreStatus(status), false);
});

test("outcome bindings require the same cycle, revision and selected pick, with a retained void reason", () => {
  for (const [key, value] of [["cycleId", "older-cycle"], ["revisionId", "older-revision"], ["selection", "away-win"]]) {
    const record = cardFixture(); record.forecast.markets[0].outcome[key] = value;
    assert.equal(fixtureSnapshotSchema.safeParse(record).success, false);
    assert.equal(selectedCardPrediction(record).status, "pending");
  }
  const record = cardFixture({}, "ai", "void");
  assert.match(selectedCardPrediction(record).explanation, /Postponed/);
  record.forecast.markets[0].outcome.explanation = null;
  assert.throws(() => parseFixtureSnapshot(record));
});

test("all outcomes, both sources and independent coverage notices have deterministic fixtures", () => {
  const examples = cardExamples();
  const outcomes = new Set(examples.map(({ fixture, selectedFamily }) => selectedCardPrediction(fixture, selectedFamily)?.status ?? "unavailable"));
  assert.deepEqual([...outcomes].sort(), ["correct", "incorrect", "pending", "unavailable", "void"]);
  assert.equal(selectedCardPrediction(examples.find(({ fixture }) => fixture.fixtureId === "card-partial").fixture).item.market.source, "api-football");
  const limited = selectedCardPrediction(examples.find(({ fixture }) => fixture.fixtureId === "card-limited").fixture);
  assert.equal(limited.item.limitedNews, true);
  assert.equal(limited.updateDelayed, false);
  const delayed = selectedCardPrediction(examples.find(({ fixture }) => fixture.fixtureId === "card-delayed").fixture);
  assert.equal(delayed.updateDelayed, true);
  assert.equal(delayed.provisional, true);
  assert.equal(delayed.publishedAt, selectedCardPrediction(cardFixture()).publishedAt);
});

test("probability labels use shared group allocation and boundary keys, with no certainty claim", () => {
  const equal = validateMarketGroup("match-result", { source: "ai", period: marketRules.period,
    probabilities: { "home-win": 1 / 3, draw: 1 / 3, "away-win": 1 / 3 } }).markets[0];
  assert.deepEqual(["home-win", "draw", "away-win"].map((selection) => probabilityEntry(equal, selection).roundedPercent), [34, 33, 33]);
  const boundary = validateMarketGroup("total-goals", { source: "api-football", period: marketRules.period, line: 2.5,
    probabilities: { "over-2.5": 0.001, "under-2.5": 0.999 } }).markets[0];
  const messages = createMessages();
  assert.equal(messages.text(probabilityEntry(boundary, "over-2.5").labelKey), "Less than 1%");
  assert.equal(messages.text(probabilityEntry(boundary).labelKey), "More than 99%");
  assert.throws(() => probabilityEntry(boundary, "draw"));
});

test("decorative initials handle unknown, Unicode and unbroken names within two code points", () => {
  for (const [name, expected] of [[null, "?"], ["  ", "?"], ["⚽", "?"], ["United", "UN"], ["Example Home FC", "EF"],
    ["Côte d’Ivoire", "CI"], ["e\u0301", "É"], ["皇家马德里", "皇家"], ["ß ß", "SS"]]) {
    assert.equal(teamInitials(name), expected);
    assert.ok([...teamInitials(name)].length <= 2);
  }
});

test("shared image URL safety rejects credentials, query tokens, fragments, whitespace and non-HTTPS sources", () => {
  assert.equal(isSafeRemoteImageUrl("https://media.example.test/team.svg"), true);
  for (const value of [null, undefined, "", "/team.svg", "//media.example.test/a.svg", "http://media.example.test/a.svg", "data:image/png;base64,abc",
    "https://user:secret@media.example.test/a.svg", "https://media.example.test/a.svg?key=secret", "https://media.example.test/a.svg#token",
    " https://media.example.test/a.svg", "https://media.example.test/a\nb.svg", "https://media.example.test\\a.svg", `https://media.example.test/${"a".repeat(2048)}`]) {
    assert.equal(isSafeRemoteImageUrl(value), false);
  }
  const record = cardFixture(); record.homeTeam.logoUrl = "https://user:secret@media.example.test/a.svg";
  assert.throws(() => parseFixtureSnapshot(record));
});

test("publication display uses the actual EAT date/time and interpolation treats names as literal text", () => {
  const messages = createMessages("fr");
  const selected = selectedCardPrediction(cardFixture());
  assert.match(messages.reportingInstant(selected.publishedAt), /Oct 9, 2026, 00:18 EAT/);
  assert.equal(messages.text("match.title", { home: "{away}", away: "Example Away" }), "{away} v Example Away");
});

test("new presentation metadata participates in whole-fixture version reconciliation", () => {
  const initial = cardFixture();
  const store = makeStore({ ...bootstrap(), data: { records: [initial], page: 1, nextPage: null } });
  const next = cardFixture({ dataVersion: "10", homeTeam: { ...initial.homeTeam, logoUrl: null } }, "api-football", null);
  next.partialCoverage = true; next.forecast.updateDelayed = true;
  let request = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(pageReceived({ request, data: { records: [next], page: 1, nextPage: null } }));
  assert.deepEqual(store.getState().feed.records[initial.fixtureId], next);
  request = beginFeedRequest(store, { page: 1, mode: "refresh" });
  store.dispatch(pageReceived({ request, data: { records: [initial], page: 1, nextPage: null } }));
  const accepted = store.getState().feed.records[initial.fixtureId];
  assert.equal(accepted.homeTeam.logoUrl, null);
  assert.equal(selectedCardPrediction(accepted).status, "pending");
  assert.equal(selectedCardPrediction(accepted).item.market.source, "api-football");
  assert.equal(accepted.partialCoverage, true);
});

test("memoized cards notice every observation field an equal-version refresh can change", () => {
  const previous = cardFixture({ update: { prediction: "current", result: "current" }, availabilityMessage: null });
  const merge = (change) => { const next = structuredClone(previous); change(next); return mergeFixtureObservation(previous, next); };
  assert.equal(sameCardFixture(previous, merge((next) => { next.syncedAt = (next.syncedAt ?? 0) + 1000; })), true);
  for (const change of [(next) => { next.partialCoverage = !next.partialCoverage; }, (next) => { next.availabilityMessage = "Window closed"; },
    (next) => { next.update.prediction = "updating"; }, (next) => { next.update.result = "delayed"; },
    (next) => { next.forecast.updateDelayed = !next.forecast.updateDelayed; }]) {
    assert.equal(sameCardFixture(previous, merge(change)), false);
  }
  assert.equal(sameCardFixture(previous, { ...previous, dataVersion: "99" }), false);
});

test("live clock maps provider phases, hides paused minutes and requires a live fixture", () => {
  assert.deepEqual(liveClockFromProvider("2H", 67), { phase: "second-half", minute: 67 });
  assert.deepEqual(liveClockFromProvider("1H", 0), { phase: "first-half", minute: 0 });
  assert.deepEqual(liveClockFromProvider("ET", 104), { phase: "extra-time", minute: 104 });
  assert.deepEqual(liveClockFromProvider("HT", 45), { phase: "half-time", minute: null });
  assert.deepEqual(liveClockFromProvider("P", 120), { phase: "penalties", minute: null });
  assert.deepEqual(liveClockFromProvider("SUSP", 70), { phase: "suspended", minute: null });
  assert.deepEqual(liveClockFromProvider(null, 12), { phase: "in-play", minute: 12 });
  assert.deepEqual(liveClockFromProvider("toString", 12), { phase: "in-play", minute: 12 });
  for (const elapsed of [null, -1, 201, 1.5]) assert.equal(liveClockFromProvider("2H", elapsed).minute, null);
  const live = cardFixture({ fixtureId: "card-live", status: "live", score: { home: 1, away: 1 }, liveClock: { phase: "second-half", minute: 58 } }, "ai", null);
  assert.deepEqual(live.liveClock, { phase: "second-half", minute: 58 });
  assert.equal(parseFixtureSnapshot({ ...live, liveClock: undefined }).liveClock, undefined);
  assert.throws(() => parseFixtureSnapshot({ ...live, status: "scheduled", score: null }));
  assert.throws(() => parseFixtureSnapshot({ ...live, liveClock: { phase: "second-half", minute: 58, stoppage: 2 } }));
  assert.throws(() => parseFixtureSnapshot({ ...live, liveClock: { phase: "overtime", minute: 58 } }));
});

test("compact kickoff parts use the EAT reporting zone regardless of the visitor clock", () => {
  const messages = createMessages();
  const kickoff = Date.UTC(2026, 9, 16, 18, 0);
  assert.equal(messages.reportingTime(kickoff), "21:00");
  assert.equal(messages.reportingDay(kickoff), "Fri, Oct 16");
  assert.equal(messages.reportingTime(Date.UTC(2026, 9, 16, 21, 30)), "00:30");
  assert.equal(messages.reportingDay(Date.UTC(2026, 9, 16, 21, 30)), "Sat, Oct 17");
});

test("phone chips have a short market code and pick for every family and selection", () => {
  // The phone card's chip track is budgeted for the widest pair, "O/U 2.5" + "Under" (docs/match-card.md).
  const messages = createMessages();
  for (const [family, selections] of Object.entries(marketSelections)) {
    const code = messages.text(`market.code.${family}`);
    assert.ok(code !== `market.code.${family}` && code.length <= 7, `${family}: ${code}`);
    for (const selection of selections) {
      const pick = messages.text(`market.pick.${selection}`);
      assert.ok(pick !== `market.pick.${selection}` && pick.length <= 5, `${selection}: ${pick}`);
    }
  }
});

test("below 390px the market code hides only the goal line after its last space", () => {
  // The card wraps the part after the last space so 360–389px phones can show "O/U"; the product offers one line.
  const messages = createMessages();
  for (const family of Object.keys(marketSelections)) {
    const code = messages.text(`market.code.${family}`), split = code.lastIndexOf(" ");
    if (family === "total-goals") assert.equal(code.slice(split + 1), String(marketRules.totalGoalsLine));
    else assert.equal(split, -1, code);
  }
});

test("league-line states stay short enough to follow a country code on a 320px card", () => {
  // The line holds "ENG · " (26.6px at 10px) plus the state; "Postp." is the widest at 31.5px (docs/match-card.md).
  const messages = createMessages();
  const keys = ["match.clockShort.first-half", "match.clockShort.second-half", "match.clockShort.extra-time", "match.clockShort.penalties",
    "match.clockShort.interrupted", "match.clockShort.suspended", "match.statusShort.postponed", "match.statusShort.canceled",
    "match.statusShort.abandoned", "match.statusShort.awarded", "match.kickoffShort", "match.clock.half-time", "match.clock.break",
    "match.liveBadge", "match.final.finished-regulation", "match.final.finished-extra-time", "match.final.finished-penalties"];
  for (const key of keys) {
    const text = messages.text(key);
    assert.ok(text !== key && text.length <= 6, `${key}: ${text}`);
  }
  assert.equal(messages.text("match.clock.minute", { minute: "120" }).length, 4);
});

test("every no-pick reason has visitor text for the card's hidden label", () => {
  const messages = createMessages();
  for (const reason of ["market", "outside", "updating", "unselected", "closed", "failed", "awaiting"]) {
    assert.notEqual(messages.text(`match.noPickReason.${reason}`), `match.noPickReason.${reason}`);
  }
});

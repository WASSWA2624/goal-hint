import test from "node:test";
import assert from "node:assert/strict";
import { matchEventPresentation, matchTimelineEntries, matchTimelineRows, newestMatchEvents, substitutionPlayers } from "../src/domain/match-event-presentation.ts";
import { matchEventSamples } from "./helpers/match-event-fixtures.mjs";
import { createMessages } from "../src/i18n/messages.ts";

const event = (overrides = {}) => ({ sequence: 1, elapsed: 12, extra: null, team: "home", type: "goal", detail: "Normal Goal",
  player: "Supplied player", assist: null, comments: null, ...overrides });

test("event counts use the application's plural-message contract", () => {
  const messages = createMessages("en");
  assert.equal(messages.plural("liveMatch.incidentCount", 0), "0 events");
  assert.equal(messages.plural("liveMatch.incidentCount", 1), "1 event");
  assert.equal(messages.plural("liveMatch.incidentCount", 15), "15 events");
});

test("latest-first presentation preserves source chronology, period boundaries, same-minute incidents and unknown times", () => {
  const events = [event({ elapsed: 45, extra: 7 }), event({ sequence: 2, elapsed: 46 }), event({ sequence: 3, elapsed: 90, extra: 2 }),
    event({ sequence: 4, elapsed: 90, extra: 2, team: "away" }), event({ sequence: 5, elapsed: null })];
  const before = structuredClone(events), ordered = newestMatchEvents(events);
  assert.deepEqual(ordered.map(row => row.sequence), [5, 4, 3, 2, 1]);
  assert.equal(ordered[0].elapsed, null); assert.equal(ordered[3], events[1]);
  assert.deepEqual(events, before); assert.notEqual(ordered, events);
  assert.equal(newestMatchEvents(matchEventSamples).length, matchEventSamples.length);
});

test("specific symbols require explicit details and never change the incident's team or invent an outcome", () => {
  for (const [type, detail, kind] of [["goal", "Normal Goal", "goal"], ["goal", "Own Goal", "own-goal"],
    ["goal", "Penalty", "penalty-goal"], ["goal", "Missed Penalty", "missed-penalty"],
    ["card", "Yellow Card", "yellow-card"], ["card", "Red card", "red-card"],
    ["card", "Second Yellow card", "second-yellow"], ["card", "Yellow-Red Card", "second-yellow"]]) {
    const supplied = event({ type, detail });
    assert.deepEqual(matchEventPresentation(supplied), { kind, detail: null, comments: null });
    assert.equal(supplied.team, "home");
  }
  assert.deepEqual(matchEventPresentation(event({ type: "card", detail: "Caution review" })), { kind: "card", detail: "Caution review", comments: null });
  assert.equal(matchEventPresentation(event({ type: "goal", detail: "constructor" })).kind, "goal");
  assert.equal(matchEventPresentation(event({ type: "var", detail: "Goal cancelled", comments: "Goal cancelled" })).detail, "Goal cancelled");
  assert.equal(matchEventPresentation(event({ type: "var", detail: "Penalty confirmed" })).kind, "var");
  assert.equal(matchEventPresentation(event({ type: "substitution", detail: "Substitution 3" })).detail, null);
});

test("substitutions keep incoming and outgoing names distinct, preserving missing participants", () => {
  assert.deepEqual(substitutionPlayers(event({ type: "substitution", player: "Leaving", assist: "Joining" })), { on: "Joining", off: "Leaving" });
  assert.deepEqual(substitutionPlayers(event({ player: null, assist: null })), { on: null, off: null });
});

const context = (overrides = {}) => ({ status: "live", observedStatus: "live", clock: null, ...overrides });
const position = (entries, sequence) => entries.findIndex(entry => entry.type === "event" && entry.event.sequence === sequence);

test("a shared minute retains every incident and each team's latest-first order", () => {
  const events = Array.from({ length: 5 }, (_, index) => event({ sequence: index + 1, elapsed: 74, team: index % 2 ? "away" : "home" }));
  const before = structuredClone(events), rows = matchTimelineRows(events, context());
  assert.equal(rows.length, 2); // one minute plus the contextual half-time divider
  const row = rows[0];
  assert.equal(row.type, "minute"); assert.equal(row.elapsed, 74);
  assert.deepEqual(row.events.map(event => event.sequence), [5, 4, 3, 2, 1]);
  assert.deepEqual(row.events.filter(event => event.team === "home").map(event => event.sequence), [5, 3, 1]);
  assert.deepEqual(row.events.filter(event => event.team === "away").map(event => event.sequence), [4, 2]);
  assert.deepEqual(events, before);
});

test("grouping keeps added minutes, unknown times and period dividers distinct", () => {
  const events = [event({ elapsed: 45, extra: 2 }), event({ sequence: 2, elapsed: 47 }),
    event({ sequence: 3, elapsed: 90, extra: null }), event({ sequence: 4, elapsed: 90, extra: 0, team: "away" }),
    event({ sequence: 5, elapsed: 90, extra: 2 }), event({ sequence: 6, elapsed: 90, extra: 3 }),
    event({ sequence: 7, elapsed: null }), event({ sequence: 8, elapsed: null, team: "away" }),
    event({ sequence: 9, elapsed: 90, extra: 3 })];
  const rows = matchTimelineRows(events, context({ status: "finished-regulation" }));
  assert.deepEqual(rows.map(row => row.type === "period" ? row.period : row.events.map(event => event.sequence)),
    ["full-time", [9], [8], [7], [6], [5], "added-time", [4, 3], [2], "half-time", [1], "added-time"]);
  assert.deepEqual(matchTimelineRows([], context()), []);
});

test("period dividers surround recorded added time without inventing whistle minutes or extra time", () => {
  const entries = matchTimelineEntries(matchEventSamples, context({ status: "finished-regulation", observedStatus: "finished-regulation" }));
  const periods = entries.filter(entry => entry.type === "period");
  assert.deepEqual(periods.map(entry => [entry.period, entry.boundary]), [["full-time", null], ["added-time", 90], ["half-time", null], ["added-time", 45]]);
  assert.equal(entries[0].period, "full-time");
  const half = entries.findIndex(entry => entry.type === "period" && entry.period === "half-time");
  assert.ok(position(entries, 5) < half && half < position(entries, 4));
  assert.deepEqual(entries.filter(entry => entry.type === "event").map(entry => entry.event.sequence), newestMatchEvents(matchEventSamples).map(event => event.sequence));
  assert.ok(periods.every(entry => !entry.afterExtraTime));
  assert.equal(matchTimelineEntries(matchEventSamples, context({ status: "finished-regulation", observedStatus: "finished-extra-time" })).some(entry => entry.period === "extra-time"), false);
});

test("live phases distinguish first-half added time, half-time and a resumed second half", () => {
  const events = [event({ elapsed: 45, extra: 7 })];
  assert.equal(matchTimelineEntries(events, context({ clock: { phase: "first-half", minute: 45 } })).some(entry => entry.period === "half-time"), false);
  for (const phase of ["half-time", "second-half"]) {
    const entries = matchTimelineEntries(events, context({ clock: { phase, minute: null } }));
    assert.equal(entries[0].period, "half-time");
    assert.equal(entries.some(entry => entry.period === "full-time"), false);
  }
  assert.deepEqual(matchTimelineEntries([], context({ status: "finished-regulation" })), []);
});

test("confirmed extra time has its own interval, added time and final boundary", () => {
  const events = [event({ elapsed: 45, extra: 3 }), event({ sequence: 2, elapsed: 90, extra: 7 }),
    event({ sequence: 3, elapsed: 97 }), event({ sequence: 4, elapsed: 105, extra: 1 }),
    event({ sequence: 5, elapsed: 113 }), event({ sequence: 6, elapsed: 120, extra: 2 })];
  const entries = matchTimelineEntries(events, context({ status: "finished-extra-time", observedStatus: "finished-extra-time" }));
  assert.equal(entries[0].period, "full-time"); assert.equal(entries[0].afterExtraTime, true);
  const start = entries.findIndex(entry => entry.period === "extra-time");
  assert.ok(position(entries, 3) < start && start < position(entries, 2));
  const interval = entries.findIndex(entry => entry.period === "extra-time-interval");
  assert.ok(position(entries, 5) < interval && interval < position(entries, 4));
  assert.deepEqual(entries.filter(entry => entry.period === "added-time").map(entry => entry.boundary), [120, 105, 90, 45]);
  const directPenalties = matchTimelineEntries(events.slice(0, 2), context({ status: "finished-penalties", observedStatus: "finished-penalties" }));
  assert.ok(directPenalties.some(entry => entry.period === "penalties"));
  assert.equal(directPenalties.some(entry => entry.period === "extra-time"), false);
  assert.equal(matchTimelineEntries(events, context({ status: "abandoned" })).some(entry => entry.period === "full-time"), false);
});

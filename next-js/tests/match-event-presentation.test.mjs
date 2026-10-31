import test from "node:test";
import assert from "node:assert/strict";
import { matchEventPresentation, newestMatchEvents, substitutionPlayers } from "../src/domain/match-event-presentation.ts";
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

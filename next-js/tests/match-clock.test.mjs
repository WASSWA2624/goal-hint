import assert from "node:assert/strict";
import test from "node:test";
import { liveClockLabel } from "../src/domain/match-clock.ts";
import { createMessages } from "../src/i18n/messages.ts";

const messages = createMessages("en");

test("football clocks retain minute zero, both stoppage periods and extra time", () => {
  for (const [phase, minute, stoppageMinutes, badge] of [
    ["first-half", 0, null, "0′"], ["first-half", 45, 2, "45+2′"],
    ["second-half", 67, null, "67′"], ["second-half", 90, 4, "90+4′"],
    ["extra-time", 104, null, "104′"], ["extra-time", 120, 1, "120+1′"],
  ]) {
    const label = liveClockLabel({ phase, minute, stoppageMinutes }, messages);
    assert.equal(label.visible, badge);
    assert.match(label.spoken, new RegExp(`${minute} minutes played`));
    if (stoppageMinutes) assert.match(label.spoken, new RegExp(`${stoppageMinutes} minutes of stoppage time played`));
  }
});

test("paused phases override stale minutes and missing clocks invent no time", () => {
  for (const [phase, badge] of [["half-time", "HT"], ["break", "Break"], ["penalties", "Penalties"], ["suspended", "Suspended"], ["interrupted", "Interrupted"]]) {
    const label = liveClockLabel({ phase, minute: 90, stoppageMinutes: 4 }, messages);
    assert.equal(label.visible, badge);
    assert.equal(label.minute, null);
    assert.doesNotMatch(label.spoken, /minutes played|minutes added/);
  }
  assert.equal(liveClockLabel(null, messages).visible, "In play");
  assert.equal(liveClockLabel({ phase: "extra-time", minute: null }, messages).visible, "Extra time");
});

import assert from "node:assert/strict";
import test from "node:test";
import { liveClockLabel } from "../src/domain/match-clock.ts";
import { createMessages } from "../src/i18n/messages.ts";

const messages = createMessages("en");

test("football clocks retain minute zero, both stoppage periods and extra time", () => {
  for (const [phase, minute, stoppageMinutes, badge] of [
    ["first-half", 0, null, "00:00"], ["first-half", 45, 2, "47:00"],
    ["second-half", 67, null, "67:00"], ["second-half", 90, 4, "94:00"],
    ["extra-time", 104, null, "104:00"], ["extra-time", 120, 1, "121:00"],
  ]) {
    const label = liveClockLabel({ phase, minute, stoppageMinutes }, messages);
    assert.equal(label.visible, badge);
    assert.match(label.spoken, new RegExp(`${minute} minutes played`));
    if (stoppageMinutes) assert.match(label.spoken, new RegExp(`${stoppageMinutes} minutes of stoppage time played`));
  }
});

test("the browser clock advances through a delayed minute and then holds the estimate", () => {
  const clock = { phase: "first-half", minute: 1, observedAt: 100_000 };
  assert.equal(liveClockLabel(clock, messages, 99_000).visible, "01:00");
  assert.equal(liveClockLabel(clock, messages, 106_900).visible, "01:06");
  assert.equal(liveClockLabel(clock, messages, 159_999).visible, "01:59");
  assert.equal(liveClockLabel(clock, messages, 160_000).visible, "02:00");
  assert.equal(liveClockLabel(clock, messages, 181_000).visible, "02:21");
  assert.equal(liveClockLabel(clock, messages, 600_000).visible, "02:59");
  assert.equal(liveClockLabel({ ...clock, phase: "half-time" }, messages, 181_000).visible, "HT");
});

test("running clocks wait for a stored observation before showing stoppage or the next period", () => {
  for (const [phase, minute, stoppageMinutes, expected] of [
    ["first-half", 44, null, "45:59"], ["first-half", 45, null, "45:59"],
    ["first-half", 45, 2, "47:59"], ["second-half", 90, 4, "94:59"],
    ["extra-time", 105, null, "105:59"], ["extra-time", 106, null, "107:59"],
    ["extra-time", 120, null, "120:59"], ["in-play", 67, null, "68:59"],
  ]) {
    assert.equal(liveClockLabel({ phase, minute, stoppageMinutes, observedAt: 100_000 }, messages, 600_000).visible, expected);
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

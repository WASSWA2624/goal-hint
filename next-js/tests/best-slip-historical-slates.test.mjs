import assert from "node:assert/strict";
import test from "node:test";
import {
  bestSlipHistoricalObservationAt,
  buildBestSlipHistoricalSlates,
  evaluateBestSlipHistoricalStudy,
  gradeBestSlipHistoricalDay,
} from "../src/server/slips/best-slip-historical-slates.ts";
import { parseBestSlipStudyCapture } from "../src/server/slips/best-slip-study-contract.ts";
import { editorialFixtureId, pricedEditorialSelection } from "./helpers/best-slip-publication-fixtures.mjs";

const day = "2026-11-19", at = bestSlipHistoricalObservationAt(day);
const reconstructedAt = Date.parse("2026-11-21T16:00:00Z");
const cutoff = 5 * 60_000, hours = 3_600_000;
const scopeHash = "c".repeat(64);

function offer(index, overrides = {}) {
  const selection = pricedEditorialSelection(index, { odds: "1.30", at, kickoffAt: at + 3 * hours,
    cycleId: editorialFixtureId(900 + index), revisionId: editorialFixtureId(1000 + index), ...overrides });
  return {
    selection: { ...selection, homeTeam: { ...selection.homeTeam, id: editorialFixtureId(100 + index * 2) },
      awayTeam: { ...selection.awayTeam, id: editorialFixtureId(101 + index * 2) } },
    kickoffObservedAt: at - hours, forecastRecordedAt: at - 500, quoteRecordedAt: at - 750,
    cutoffAt: selection.kickoffAt - cutoff,
  };
}

function build(offers, overrides = {}) {
  return buildBestSlipHistoricalSlates({
    day, observedAt: at, examined: new Set(offers.map(({ selection }) => selection.fixtureId)).size,
    partialCoverage: false, searchLimited: false, offers, ...overrides,
  }, { scopeHash, reconstructedAt });
}

test("historical slates preserve exact four-leg prices from one bookmaker and cannot parse as live captures", () => {
  assert.equal(new Date(at).toISOString(), "2026-11-19T03:30:00.000Z");
  const original = [1, 2, 3, 4].map((index) => offer(index));
  const higherQuoteInAnotherBook = offer(1, { odds: "2.30", bookmakerId: 14 });
  const capture = build([...original, higherQuoteInAnotherBook]);
  assert.equal(capture.version, "best-slips-historical-capture-v1");
  assert.equal(capture.observedAt, at);
  assert.equal(capture.reconstructedAt, reconstructedAt);
  assert.equal(capture.eligible, 4);
  assert.equal(capture.slates.length, 1);
  assert.equal(capture.slates[0].band, "1.5-5");
  assert.equal(capture.slates[0].slip.totalOdds, "2.86");
  assert.deepEqual(capture.slates[0].slip.selections, original.map(({ selection }) => selection));
  assert.equal(capture.proofs.length, 4);
  assert.equal(build([...original].reverse().concat(higherQuoteInAnotherBook)).hash, capture.hash);
  assert.throws(() => parseBestSlipStudyCapture(capture));
});

test("missing common-clock proof and incompatible books, teams or exact totals exclude historical slates", () => {
  const original = [1, 2, 3].map((index) => offer(index));
  const last = offer(4);
  for (const invalid of [
    { ...last, kickoffObservedAt: at + 1 },
    { ...last, forecastRecordedAt: at + 1 },
    { ...last, quoteRecordedAt: at + 1 },
    { ...last, cutoffAt: at },
    { ...last, cutoffAt: last.selection.kickoffAt - cutoff + 1 },
    offer(4, { bookmakerId: 14 }),
    offer(4, { odds: "2.30" }),
    offer(4, { kickoffAt: bestSlipHistoricalObservationAt("2026-11-20") + 3 * hours }),
    { ...last, selection: { ...last.selection, homeTeam: original[0].selection.homeTeam } },
  ]) assert.deepEqual(build([...original, invalid]).slates, []);
  assert.throws(() => build([...original, last], { observedAt: at + 1 }), /clock/u);
  assert.deepEqual(build([...original, last, last]).slates, []);
});

test("the historical band admits exact 2.50 and excludes exact 5.00", () => {
  const slate = (prices) => build(prices.map((odds, index) => offer(index + 1, { odds }))).slates;
  assert.equal(slate(["1.25", "1.25", "1.25", "1.28"])[0].slip.totalOdds, "2.50");
  assert.deepEqual(slate(["1.25", "1.25", "1.60", "2.00"]), []);
});

test("historical comparison grades only the exact original cycle and only within the phase clock", () => {
  const capture = build([1, 2, 3, 4].map((index) => offer(index)));
  const results = capture.slates[0].slip.selections.map(({ fixtureId, family, selection, forecast }) => ({
    fixtureId, family, selection, forecast, status: "finished-regulation", completed: true,
    fixtureCompleted: true, regulationVerified: true, regulationHome: 2, regulationAway: 0,
  }));
  const wrongCycle = [ ...results.slice(0, 3), { ...results[3], forecast: {
    ...results[3].forecast, cycleId: editorialFixtureId(7000),
  } } ];
  const grade = (candidate, availableAt) => gradeBestSlipHistoricalDay(capture, {
    availableAt, recordedAt: reconstructedAt, results: candidate,
  });
  assert.equal(grade(wrongCycle, at + 9 * hours).outcomes[0].outcome, "pending");
  assert.equal(grade(results, at + hours).outcomes[0].outcome, "pending");
  assert.equal(grade(results, at + 9 * hours).outcomes[0].outcome, "won");
  const windows = { fitFrom: day, fitUntil: "2026-11-20", holdoutFrom: "2026-11-20", holdoutUntil: "2026-11-21" };
  const evaluate = (captures, receipts) => evaluateBestSlipHistoricalStudy({
    captures, receipts, scopeHash, assessedAt: reconstructedAt, windows,
  });
  const early = grade(results, at + 9 * hours);
  const late = grade(results, bestSlipHistoricalObservationAt("2026-11-20"));
  const report = evaluate([capture], [early, late]);
  assert.equal(report.approvedForPublication, false);
  assert.equal(report.provenance, "retrospective-point-in-time");
  assert.equal(report.status, "insufficient");
  assert.equal(report.comparison.fit.won, 1);
  assert.equal(evaluate([capture], [late]).comparison.fit.missingReceipt, 1);
  assert.throws(() => evaluate([{ ...capture, reconstructedAt: reconstructedAt + 1 }], [early]), /clock/u);
  assert.throws(() => evaluate([capture], [{ ...early, availableAt: at + 1 }]), /clock/u);
});

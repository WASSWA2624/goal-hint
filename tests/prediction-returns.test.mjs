import assert from "node:assert/strict";
import test from "node:test";
import { performanceReturnsSchema } from "../src/domain/performance.ts";
import { summarizePredictionReturns } from "../src/domain/prediction-returns.ts";

const quote = (hundredths) => ({ hundredths });
const sample = (id, outcome, price = quote(500), kickoffAt = Number(id), publishedAt = 0) => ({ id, outcome, quote: price, kickoffAt, publishedAt });
const money = ["stakeUnits", "returnUnits", "profitUnits", "roi", "meanQuotedOdds"];
const valid = (result) => assert.equal(performanceReturnsSchema.safeParse(result).success, true, JSON.stringify(result));

test("individual returns stake one unit per won or lost prediction at exact original hundredths", () => {
  const result = summarizePredictionReturns([sample("1", "won", quote(235)), sample("2", "lost", quote(920)), sample("3", "won", quote(190))], true);
  assert.equal(result.state, "available"); assert.equal(result.reason, null);
  assert.equal(result.settled, 3); assert.equal(result.won, 2); assert.equal(result.lost, 1); assert.equal(result.returnsSampleCount, 3);
  assert.equal(result.stakeUnits, 3); assert.equal(result.returnUnits, 4.25); assert.equal(result.profitUnits, 1.25);
  assert.equal(result.roi, 1.25 / 3); assert.equal(result.meanQuotedOdds, 13.45 / 3);
  valid(result);
});

test("void and pending quotes never enter returns, mean odds or ROI", () => {
  const binary = [sample("1", "won", quote(235)), sample("2", "lost", quote(920))];
  const result = summarizePredictionReturns([...binary, sample("3", "void", quote(98_765)), sample("4", "pending", quote(98_765))], true);
  const expected = summarizePredictionReturns(binary, true);
  for (const field of ["returnsSampleCount", ...money, "settled", "won", "lost"]) assert.equal(result[field], expected[field], field);
  assert.doesNotMatch(JSON.stringify(result), /987\.65|98765/u);
  valid(result);
});

test("missing and unavailable quotes are counted separately and excluded from the return sample", () => {
  const result = summarizePredictionReturns([sample("1", "won", quote(200)), sample("2", "lost", "missing"), sample("3", "won", "unavailable"),
    sample("4", "lost", "unavailable"), sample("5", "lost", quote(300))], true);
  assert.equal(result.settled, 5); assert.equal(result.returnsSampleCount, 2);
  assert.equal(result.missingQuoteCount, 1); assert.equal(result.unavailableQuoteCount, 2);
  assert.equal(result.settled, result.returnsSampleCount + result.missingQuoteCount + result.unavailableQuoteCount);
  assert.equal(result.stakeUnits, 2); assert.equal(result.returnUnits, 2); assert.equal(result.profitUnits, 0); assert.equal(result.roi, 0);
  valid(result);
});

test("display-disabled summaries keep real streaks without any quote counts or money", () => {
  const result = summarizePredictionReturns([sample("1", "lost", quote(200)), sample("2", "lost", "missing"), sample("3", "won", "unavailable"),
    sample("4", "lost", quote(300))], false);
  assert.equal(result.state, "unavailable"); assert.equal(result.reason, "odds-display-disabled");
  assert.equal(result.returnsSampleCount, 0); assert.equal(result.missingQuoteCount, 0); assert.equal(result.unavailableQuoteCount, 0);
  for (const field of money) assert.equal(result[field], null, field);
  assert.equal(result.longestLosingStreak, 2); assert.equal(result.currentLosingStreak, 1); assert.equal(result.settled, 4);
  valid(result);
});

test("no priced settled predictions report unavailable money, never zero", () => {
  for (const samples of [[], [sample("1", "won", "missing"), sample("2", "lost", "unavailable")], [sample("1", "pending"), sample("2", "void")]]) {
    const result = summarizePredictionReturns(samples, true);
    assert.equal(result.state, "unavailable"); assert.equal(result.reason, "no-quoted-settled-predictions");
    for (const field of money) assert.equal(result[field], null, field);
    valid(result);
  }
});

test("streaks follow kickoff, then publication, then id, without mutating the input", () => {
  // Identical kickoffs are ordered by publication time and finally by revision id.
  const samples = [sample("c", "lost", quote(200), 10, 3), sample("a", "won", quote(200), 10, 3), sample("b", "lost", quote(200), 10, 1),
    sample("d", "lost", quote(200), 20, 0), sample("e", "lost", quote(200), 5, 9)];
  const snapshot = structuredClone(samples);
  const result = summarizePredictionReturns(samples, true);
  // Order: e(lost) b(lost) a(won) c(lost) d(lost) -> longest 2, current 2.
  assert.equal(result.longestLosingStreak, 2); assert.equal(result.currentLosingStreak, 2);
  assert.deepEqual(samples, snapshot);
  assert.deepEqual(summarizePredictionReturns([...samples].reverse(), true), result);
  const tied = summarizePredictionReturns([sample("b", "won", quote(200), 1, 1), sample("a", "lost", quote(200), 1, 1)], true);
  assert.equal(tied.currentLosingStreak, 0); assert.equal(tied.longestLosingStreak, 1);
});

test("void and pending interrupt losing streaks and the bounds hold", () => {
  const result = summarizePredictionReturns([sample("1", "lost"), sample("2", "lost"), sample("3", "void"), sample("4", "lost"),
    sample("5", "pending"), sample("6", "lost"), sample("7", "lost"), sample("8", "lost"), sample("9", "pending")], true);
  assert.equal(result.longestLosingStreak, 3); assert.equal(result.currentLosingStreak, 0); assert.equal(result.lost, 6);
  assert.ok(result.currentLosingStreak <= result.longestLosingStreak && result.longestLosingStreak <= result.lost);
  const trailing = summarizePredictionReturns([sample("1", "lost"), sample("2", "won"), sample("3", "lost")], true);
  assert.equal(trailing.currentLosingStreak, 1); assert.equal(trailing.longestLosingStreak, 1);
});

test("invalid cohorts are rejected", () => {
  for (const samples of [
    [sample("1", "won"), sample("1", "lost")], [sample("", "won")], [sample("1", "won", quote(500), Number.NaN)],
    [sample("1", "won", quote(500), 0, Number.MAX_SAFE_INTEGER + 1)], [sample("1", "won", quote(100))], [sample("1", "won", quote(100_001))],
    [sample("1", "won", quote(150.5))], [sample("1", "refunded")], [sample("1", "won", "estimated")], [sample("1", "won", null)],
  ]) assert.throws(() => summarizePredictionReturns(samples, true), RangeError);
});

test("the response schema enforces the returns invariants", () => {
  const base = summarizePredictionReturns([sample("1", "won", quote(235)), sample("2", "lost", quote(920))], true);
  const disabled = summarizePredictionReturns([sample("1", "won")], false);
  for (const invalid of [
    { ...disabled, roi: 0 }, { ...disabled, missingQuoteCount: 1 }, { ...base, settled: 3 }, { ...base, missingQuoteCount: 1 },
    { ...base, reason: "no-quoted-settled-predictions" }, { ...base, roi: null }, { ...base, longestLosingStreak: 2 },
    { ...base, currentLosingStreak: 2, longestLosingStreak: 1 }, { ...base, roi: Number.POSITIVE_INFINITY }, { ...base, extra: true },
  ]) assert.equal(performanceReturnsSchema.safeParse(invalid).success, false, JSON.stringify(invalid));
});

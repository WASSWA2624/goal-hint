import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSlipPerformance } from "../src/domain/slip-performance.ts";

const sample = (id, outcome, totalOdds = "5.00", publishedAt = Number(id)) => ({ id, outcome, totalOdds, publishedAt });

test("slip returns use one unit per binary outcome with exact original decimal quotes", () => {
  const result = summarizeSlipPerformance([sample("1", "won", "2.35"), sample("2", "lost", "9.20"), sample("3", "won", "1.90")]);
  assert.equal(result.total, 3); assert.equal(result.settled, 3); assert.equal(result.won, 2); assert.equal(result.lost, 1);
  assert.equal(result.winRate, 2 / 3); assert.equal(result.returnsSampleCount, 3);
  assert.equal(result.stakeUnits, 3); assert.equal(result.returnUnits, 4.25); assert.equal(result.profitUnits, 1.25);
  assert.equal(result.roi, 1.25 / 3); assert.equal(result.meanQuotedOdds, 13.45 / 3);
});

test("void and pending never assume refunds or reveal their quoted odds through aggregates", () => {
  const binary = [sample("1", "won", "2.35"), sample("2", "lost", "9.20")];
  const result = summarizeSlipPerformance([...binary, sample("3", "void", "999999.99"), sample("4", "pending", "999999.99")]);
  const expected = summarizeSlipPerformance(binary);
  for (const field of ["winRate", "returnsSampleCount", "stakeUnits", "returnUnits", "profitUnits", "roi", "meanQuotedOdds"]) {
    assert.equal(result[field], expected[field], field);
  }
  assert.equal(result.total, 4); assert.equal(result.void, 1); assert.equal(result.pending, 1);
});

test("losses, empty samples and absent usable quotes remain distinct", () => {
  const empty = summarizeSlipPerformance([]);
  assert.equal(empty.winRate, null); assert.equal(empty.roi, null); assert.equal(empty.meanQuotedOdds, null);
  const losing = summarizeSlipPerformance([sample("1", "lost"), sample("2", "lost")]);
  assert.equal(losing.winRate, 0); assert.equal(losing.roi, -1); assert.equal(losing.profitUnits, -2);
  const missing = summarizeSlipPerformance([sample("1", "won", "invalid"), sample("2", "lost", "1.00")]);
  assert.equal(missing.settled, 2); assert.equal(missing.winRate, .5); assert.equal(missing.excludedQuoteCount, 2);
  assert.equal(missing.returnsSampleCount, 0); assert.equal(missing.roi, null);
});

test("publication order determines streaks; pending and void interrupt and input is not mutated", () => {
  const records = [sample("8", "lost"), sample("2", "lost"), sample("3", "lost"), sample("1", "won"),
    sample("4", "void"), sample("5", "lost"), sample("6", "pending"), sample("7", "lost")];
  const original = structuredClone(records), result = summarizeSlipPerformance(records);
  assert.equal(result.longestLosingStreak, 2); assert.equal(result.currentLosingStreak, 2);
  assert.deepEqual(records, original);
  assert.deepEqual(result, summarizeSlipPerformance([...records].reverse()));
});

test("a repeated publication, unbounded clock or unknown outcome cannot inflate the cohort", () => {
  for (const records of [
    [sample("1", "won"), sample("1", "lost")], [sample("1", "won", "2.00", NaN)],
    [sample("1", "won", "2.00", Number.MAX_SAFE_INTEGER + 1)], [sample("1", "incorrect")],
  ]) assert.throws(() => summarizeSlipPerformance(records), RangeError);
});

test("a simultaneous daily publication uses original slip rank before row identity", () => {
  const result = summarizeSlipPerformance([
    { ...sample("a", "lost", "2.00", 0), rank: 3 }, { ...sample("z", "lost", "2.00", 0), rank: 1 },
    { ...sample("b", "won", "2.00", 0), rank: 2 },
  ]);
  assert.equal(result.longestLosingStreak, 1); assert.equal(result.currentLosingStreak, 1);
  assert.throws(() => summarizeSlipPerformance([{ ...sample("1", "won"), rank: 11 }]), RangeError);
});

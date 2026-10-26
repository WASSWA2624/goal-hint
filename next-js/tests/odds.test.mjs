import assert from "node:assert/strict";
import test from "node:test";
import { deMargin, DE_MARGIN_METHOD, formatOddsHundredths, formatOddsRange, oddsDisplayHundredths, oddsRules,
  parseDecimalOdds, parseOddsRange } from "../src/domain/odds.ts";
import { launchOddsGroup, launchOddsMapping, ODDS_MAPPING_VERSION } from "../src/domain/odds-markets.ts";

// Synthetic prices only; no provider payloads or bookmaker data.
const odds = (value) => { const parsed = parseDecimalOdds(value); assert.notEqual(parsed, null, value); return parsed; };
const sum = (values) => values.reduce((total, value) => total + BigInt(value.replace(".", "")), 0n);

test("decimal odds are strict text, canonical without trailing zeros and strictly above 1", () => {
  assert.deepEqual(parseDecimalOdds("1.850"), { text: "1.85", scaled: 18_500n });
  assert.deepEqual(parseDecimalOdds("2.00"), { text: "2", scaled: 20_000n });
  assert.deepEqual(parseDecimalOdds("12"), { text: "12", scaled: 120_000n });
  assert.deepEqual(parseDecimalOdds("1.0001"), { text: "1.0001", scaled: 10_001n });
  assert.deepEqual(parseDecimalOdds("99999.9999"), { text: "99999.9999", scaled: 999_999_999n });
  for (const value of ["1", "1.0", "1.0000", "0.95", "01.50", "1.23456", "1e2", " 1.50", "1,50", "-2.00", "", "100000", 1.85, null]) {
    assert.equal(parseDecimalOdds(value), null, String(value));
  }
});

test("display hundredths round half-up once, and format with exactly two places", () => {
  assert.equal(oddsDisplayHundredths(odds("1.855")), 186);
  assert.equal(oddsDisplayHundredths(odds("1.8549")), 185);
  assert.equal(oddsDisplayHundredths(odds("1.85")), 185);
  assert.equal(oddsDisplayHundredths(odds("2.005")), 201);
  assert.equal(oddsDisplayHundredths(odds("1.004")), 100);
  assert.equal(formatOddsHundredths(185), "1.85");
  assert.equal(formatOddsHundredths(2000), "20.00");
  assert.equal(formatOddsHundredths(100_000), "1000.00");
  assert.equal(formatOddsHundredths(105), "1.05");
});

test("odds ranges accept exactly two places within 1.01 to 1000.00 and reject everything else", () => {
  assert.deepEqual(parseOddsRange("1.50-3.00"), { min: 150, max: 300 });
  assert.deepEqual(parseOddsRange("1.01-1000.00"), { min: 101, max: 100_000 });
  assert.deepEqual(parseOddsRange("2.00-2.00"), { min: 200, max: 200 });
  assert.equal(formatOddsRange({ min: 150, max: 300 }), "1.50-3.00");
  for (const value of ["1.5-3.00", "01.50-3.00", "3.00-1.50", "1.00-2.00", "1.50", "", "1,50-3,00", "1.50-3.00-4.00",
    "1.50-1000.01", "1.50 -3.00", "1.500-3.00", "0.99-2.00"]) {
    assert.equal(parseOddsRange(value), null, value);
  }
  assert.equal(oddsRules.sliderMaximumHundredths, 2_000);
});

test("proportional de-margin is exact for two-way and three-way groups and records the overround", () => {
  const two = deMargin([odds("1.90"), odds("1.90")], 1);
  assert.deepEqual(two.probabilities, ["0.500000000000", "0.500000000000"]);
  assert.equal(two.overround, "1.052631578947");
  const three = deMargin([odds("2.00"), odds("4.00"), odds("4.00")], 1);
  assert.deepEqual(three.probabilities, ["0.500000000000", "0.250000000000", "0.250000000000"]);
  assert.equal(three.overround, "1.000000000000");
  const margin = deMargin([odds("1.85"), odds("3.40"), odds("4.00")], 1);
  assert.ok(sum(margin.probabilities) >= 999_999_999_998n && sum(margin.probabilities) <= 1_000_000_000_002n);
  assert.equal(DE_MARGIN_METHOD, "proportional-v1");
});

test("double chance is normalized within its own group so it sums to two, never borrowed from 1X2", () => {
  const group = deMargin([odds("1.25"), odds("1.60"), odds("1.30")], 2);
  const total = sum(group.probabilities);
  assert.ok(total >= 1_999_999_999_997n && total <= 2_000_000_000_003n);
  assert.ok(group.probabilities.every((value) => value > "0." && value < "1."));
  // Incoherent books that would put one double-chance outcome at or above certainty yield no group.
  assert.equal(deMargin([odds("1.05"), odds("3.00"), odds("3.00")], 2), null);
  assert.equal(deMargin([odds("1.50"), odds("1.50")], 2), null);
});

test("a missing or invalid selection, a single price or an under-round book are handled explicitly", () => {
  assert.equal(deMargin([odds("1.90"), null], 1), null);
  assert.equal(deMargin([odds("1.90")], 1), null);
  assert.equal(deMargin([odds("1.90"), { text: "1", scaled: 10_000n }], 1), null);
  assert.equal(deMargin([odds("1.90"), odds("1.90")], 3), null);
  // An overround below 1 (e.g. a stale or promotional price) is still normalized and recorded.
  const under = deMargin([odds("2.20"), odds("2.20")], 1);
  assert.deepEqual(under.probabilities, ["0.500000000000", "0.500000000000"]);
  assert.equal(under.overround, "0.909090909091");
});

test("launch mapping prices a family only when bet id and name match the row and the stored catalog", () => {
  const [matchResult, doubleChance, totalGoals] = launchOddsMapping;
  const bet = { betId: 1, betName: "Match Winner", values: [{ label: "Home", odd: "1.85" }, { label: "Draw", odd: "3.4" }, { label: "Away", odd: "4" }] };
  const group = launchOddsGroup(matchResult, bet, "Match Winner");
  assert.equal(group.family, "match-result");
  assert.equal(group.mappingVersion, ODDS_MAPPING_VERSION);
  assert.deepEqual(group.selections.map((entry) => [entry.selection, entry.price.text, entry.displayHundredths]),
    [["home-win", "1.85", 185], ["draw", "3.4", 340], ["away-win", "4", 400]]);
  assert.equal(launchOddsGroup(matchResult, bet, "Full Time Result"), null, "catalog name mismatch");
  assert.equal(launchOddsGroup(matchResult, bet, undefined), null, "no stored catalog");
  assert.equal(launchOddsGroup(matchResult, { ...bet, betName: "Winner" }, "Match Winner"), null, "row name mismatch");
  assert.equal(launchOddsGroup(matchResult, { ...bet, betId: 2 }, "Match Winner"), null, "row id mismatch");
  assert.equal(launchOddsGroup(matchResult, { ...bet, values: bet.values.slice(0, 2) }, "Match Winner"), null, "missing selection");
  assert.equal(launchOddsGroup(matchResult, undefined, "Match Winner"), null);
  // Only the exact 2.5 line prices total goals; other lines are never borrowed.
  const goals = { betId: 5, betName: "Goals Over/Under", values: [{ label: "Over 1.5", odd: "1.3" }, { label: "Under 1.5", odd: "3.5" },
    { label: "Over 2.5", odd: "1.95" }, { label: "Under 2.5", odd: "1.85" }] };
  assert.deepEqual(launchOddsGroup(totalGoals, goals, "Goals Over/Under").selections.map((entry) => entry.price.text), ["1.95", "1.85"]);
  assert.equal(launchOddsGroup(totalGoals, { ...goals, values: goals.values.slice(0, 3) }, "Goals Over/Under"), null);
  const chance = { betId: 12, betName: "Double Chance", values: [{ label: "Home/Draw", odd: "1.25" }, { label: "Home/Away", odd: "1.30" },
    { label: "Draw/Away", odd: "1.60" }] };
  assert.deepEqual(launchOddsGroup(doubleChance, chance, "Double Chance").selections.map((entry) => entry.selection),
    ["home-or-draw", "away-or-draw", "home-or-away"]);
});

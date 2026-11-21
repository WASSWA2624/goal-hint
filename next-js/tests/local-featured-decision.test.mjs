import assert from "node:assert/strict";
import test from "node:test";
import { binaryFeaturedSettlement, decideLocalFeaturedPick, localFeaturedDecisionSchema, positiveFeaturedReturn }
  from "../src/domain/local-featured-decision.ts";
import { parseDecimalOdds } from "../src/domain/odds.ts";
import { preMatchReferenceOddsFreshMs } from "../src/domain/reference-odds.ts";

const fixtureId = "d5d2da7e-e5b8-48ea-ba68-fe3579b43e1c";
const decisionAt = Date.UTC(2026, 10, 21, 10), kickoffAt = decisionAt + 60_000;
const clocks = { observedAt: decisionAt - 100, checkedAt: decisionAt, providerUpdatedAt: decisionAt - 500,
  snapshotId: "a".repeat(64), receiptId: "b".repeat(64) };
const book = (bookmakerId, ...offers) => ({ bookmakerId, bookmakerName: `Book ${bookmakerId}`, offers });
const offer = (betId, betName, values, observation = clocks) =>
  ({ betId, betName, values: Object.entries(values).map(([label, odd]) => ({ label, odd })), ...observation });
const totals = (values, observation) => offer(5, "Goals Over/Under", values, observation);
const chance = (values, observation) => offer(12, "Double Chance", values, observation);
const outcome = (marketKey, selection, probability) =>
  ({ marketKey, selection, settlementProbabilities: binaryFeaturedSettlement(probability) });
const total = (period, side, line, probability) => outcome(`goal:${period}:totals:${side}:${line}:binary`, "under", probability);
const decide = (outcomes, bookmakers, options = {}) => decideLocalFeaturedPick({
  fixtureId, kickoffAt, decisionAt, quotesPermitted: true, outcomes,
  quotes: { fixtureId, kickoffAt, checkedAt: decisionAt, bookmakers }, ...options,
});

test("unpriced Under 5.5 does not displace a priced outcome, including a lower-probability double chance outcome", () => {
  const result = decide([
    total("full-time", "total", 5.5, 0.98),
    outcome("double-chance", "home-or-draw", 0.94),
    outcome("double-chance", "home-or-away", 0.91),
  ], [book(1, totals({ "Under 4.5": "1.26" })), book(7, chance({ "Home/Away": "1.2101" }))]);
  assert.equal(result.status, "priced");
  assert.equal(result.selection, "home-or-away");
  assert.equal(result.threshold, 0.90);
  assert.equal(result.expectedNetReturn, "0.101191");
  assert.deepEqual(result.quote, { bookmakerId: 7, bookmakerName: "Book 7", betId: 12, betName: "Double Chance",
    providerSelection: "Home/Away", decimal: "1.2101", ...clocks });
  assert.equal(localFeaturedDecisionSchema.safeParse(result).success, true);
});

test("selects the highest exact eligible quote across all bookmakers and covers team totals on the correct side and period", () => {
  const outcomes = [total("full-time", "home", 2.5, 0.97), total("half-time", "total", 2.5, 0.96)];
  const preferred = book(1, offer(16, "Total - Home", { "Under 2.5": "1.4001" }));
  const other = book(20, offer(16, "Total - Home", { "Under 2.5": "1.4002", "Under 3.5": "9.00" }));
  const mismatches = book(3, offer(17, "Total - Away", { "Under 2.5": "20" }),
    offer(5, "Goals Over/Under", { "Under 2.5": "20" }), offer(6, "Goals Over/Under", { "Under 2.5": "20" }));
  const firstHalf = book(12, offer(6, "Goals Over/Under First Half", { "Under 2.5": "1.3" }));
  assert.equal(decide(outcomes, [preferred, mismatches, firstHalf, other]).quote?.bookmakerId, 20);
  assert.equal(decide(outcomes, [mismatches, firstHalf]).quote?.bookmakerId, 12);
  assert.equal(decide([total("full-time", "away", 2.5, 0.96)], [mismatches]).quote?.betId, 17);
  assert.equal(decide(outcomes, [mismatches]).reason, "no-comparable-quote");
});

test("rejects stale, suspended, unpermitted, post-cutoff, in-play and different-occurrence observations", () => {
  const outcomes = [total("full-time", "total", 4.5, 0.95)];
  const create = (observation) => totals({ "Under 4.5": "2.5" }, observation);
  const valid = book(1, totals({ "Under 4.5": "1.1" }));
  const suspended = { ...create(clocks), values: [{ label: "Under 4.5", odd: "2.5", suspended: true }] };
  const unpermitted = { ...create(clocks), values: [{ label: "Under 4.5", odd: "2.5", permitted: false }] };
  assert.equal(decide(outcomes, [valid, book(2, create({ ...clocks, checkedAt: decisionAt + 1 })),
    book(3, create({ ...clocks, observedAt: decisionAt + 1 })), book(4, create({ ...clocks, providerUpdatedAt: decisionAt + 1 })),
    book(5, create({ ...clocks, observedAt: decisionAt - preMatchReferenceOddsFreshMs - 1 })),
    book(6, create({ ...clocks, providerUpdatedAt: decisionAt - preMatchReferenceOddsFreshMs - 1 })),
    book(7, suspended), book(8, unpermitted)]).quote?.bookmakerId, 1);
  // A provider clock predating kickoff cannot retroactively make a late local capture available.
  const historical = book(9, { ...create(clocks), values: [{ label: "Under 4.5", odd: "3",
    observation: { ...clocks, observedAt: kickoffAt + 100, checkedAt: kickoffAt + 100 } }] });
  assert.equal(decide(outcomes, [], { quotes: { fixtureId, kickoffAt, checkedAt: decisionAt,
    provenance: "historical-pre-match", bookmakers: [historical] } }).reason, "no-comparable-quote");
  for (const alteration of [{ fixtureId: "other" }, { kickoffAt: kickoffAt + 1 }, { provenance: "in-play" }, { checkedAt: kickoffAt }]) {
    assert.equal(decide(outcomes, [], { quotes: { fixtureId, kickoffAt, checkedAt: decisionAt,
      bookmakers: [valid], ...alteration } }).reason, "no-verified-odds");
  }
});

test("includes each probability floor and 1.10, stops on the first populated rung and never rounds into eligibility", () => {
  for (const floor of [0.95, 0.90, 0.85, 0.80, 0.75]) {
    assert.equal(decide([total("full-time", "total", 4.5, floor)], [book(1, totals({ "Under 4.5": "2" }))]).threshold, floor);
  }
  const outcomes = [total("full-time", "total", 4.5, 0.95), total("full-time", "total", 3.5, 0.94999999999999)];
  assert.equal(decide(outcomes, [book(1, totals({ "Under 4.5": "1.10", "Under 3.5": "2" }))]).quote?.decimal, "1.1");
  assert.equal(decide(outcomes, [book(1, totals({ "Under 4.5": "1.0999", "Under 3.5": "2" }))]).threshold, 0.90);
  assert.equal(decide([total("full-time", "total", 4.5, 0.74999999999999)], [book(1, totals({ "Under 4.5": "2" }))]).status, "abstained");
  assert.equal(decide([total("full-time", "total", 4.5, 0.8)], [book(1, totals({ "Under 4.5": "1.25" }))]).status, "abstained");
});

test("keeps exact expected return through pushes and half payouts and abstains with missing mass or unverified terms", () => {
  const price = parseDecimalOdds("1.10");
  const pushes = { win: 0.8, loss: 0.08, push: 0.12, "half-win": 0, "half-loss": 0 };
  const halves = { win: 0.8, loss: 0.04, push: 0.06, "half-win": 0.06, "half-loss": 0.04 };
  assert.equal(positiveFeaturedReturn(pushes, price, "asian"), null);
  assert.equal(positiveFeaturedReturn(halves, price, "asian"), "0.023");
  assert.equal(positiveFeaturedReturn(halves, price, "binary"), null);
  assert.equal(positiveFeaturedReturn(halves, price, "asian", 1e-7), null);
  assert.equal(positiveFeaturedReturn({ ...halves, push: 0.02 }, price, "asian"), null);
  assert.equal(positiveFeaturedReturn(binaryFeaturedSettlement(0.8000000000000002), parseDecimalOdds("1.25"), "binary"),
    "0.00000000000000025");
  assert.equal(decide([{ marketKey: "goal:full-time:totals:total:4.25:asian", selection: "under", settlementProbabilities: halves }],
    [book(1, totals({ "Under 4.25": "1.1" }))]).reason, "no-comparable-quote");
});

test("orders exact ties by probability then stable outcome key and bookmaker, and exposes distinct abstention reasons", () => {
  const markets = [outcome("double-chance", "home-or-draw", 0.92), outcome("double-chance", "home-or-away", 0.92),
    total("full-time", "total", 4.5, 0.91)];
  const books = [book(4, chance({ "Home/Draw": "1.22", "Home/Away": "1.22" })),
    book(1, chance({ "Home/Away": "1.22" }), totals({ "Under 4.5": "1.22" }))];
  assert.equal(decide(markets, books).selection, "home-or-away");
  assert.equal(decide(markets, books).quote?.bookmakerId, 1);
  assert.deepEqual(decide(markets, books), decide([...markets].reverse(), [...books].reverse()));
  assert.equal(decide(markets, books, { quotesPermitted: false }).reason, "odds-not-permitted");
  assert.equal(decide([], books).reason, "no-local-forecast");
  assert.equal(decide(markets, [], { quotes: null }).reason, "no-verified-odds");
});

test("canonical replay and legacy feed keys resolve the same tie", () => {
  const goalTotal = total("full-time", "total", 4.5, 0.95);
  const books = [book(1, totals({ "Under 4.5": "1.25" }), offer(1, "Match Winner", { Home: "1.25" }))];
  assert.equal(decide([goalTotal, outcome("match-result", "home-win", 0.95)], books).selection, "home-win");
  assert.equal(decide([goalTotal, outcome("goal:full-time:result", "home", 0.95)], books).selection, "home");
});

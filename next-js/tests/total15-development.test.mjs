import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { total15MarketKey } from "../src/domain/extended-markets.ts";
import { goalTotalsMarket, liveGoalMarketDefinitions } from "../src/domain/goal-market-definitions.ts";
import { mergeLiveDetail } from "../src/domain/live-refresh.ts";
import { matchDetailResponseSchema } from "../src/domain/match-detail.ts";
import { settleMarketSelection } from "../src/domain/market-settlement.ts";
import { SCORE_DISTRIBUTION_VERSION } from "../src/domain/score-distribution.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { goalProbabilities } from "../src/server/intelligence/local-goals-model.ts";
import { exactTotal15Odds } from "../src/server/odds/odds-mysql-store.ts";
import { mapInPlayOdds } from "../src/server/odds/in-play-odds-mapping.ts";
import { preparePublishedExtendedPicks } from "../src/server/predictions/extended-market-picks.ts";
import { publicGoalMarketExtension } from "../src/server/predictions/extended-market-read.ts";
import { goalMarketExtensionFromRow, prepareGoalMarketExtension, projectGoalMarketSettlements } from "../src/server/predictions/goal-market-store.ts";
import { liveDetail } from "./helpers/live-refresh-fixtures.mjs";

const at = Date.parse("2026-11-11T14:00:00Z");
const verified = (home, away, status = "finished-extra-time") => ({
  status, cycleEligibility: { eligible: true }, halfTimeScore: null,
  regulationScore: { verified: true, period: "regulation-including-stoppage-time", home, away },
});

test("the local regulation total is analytically complete and preserves sealed provenance through public read and settlement", () => {
  const input = { localPoisson: { home: 1.6, away: 1 }, definitions: liveGoalMarketDefinitions };
  const prepared = prepareGoalMarketExtension(input);
  const market = prepared.markets[0].derivation.market;
  assert.equal(market.definition.key, total15MarketKey);
  assert.equal(market.source, "local-poisson");
  assert.equal(market.selection, "over");
  assert.ok(Math.abs(market.selectedProbability - (1 - Math.exp(-2.6) * 3.6)) < 1e-12);
  assert.throws(() => prepareGoalMarketExtension({ ...input, definitions: [goalTotalsMarket(2.5)] }));
  assert.throws(() => prepareGoalMarketExtension({ ...input, localPoisson: { home: 7, away: 1 } }));
  const body = { ...prepared, contentHash: evidenceFingerprint(prepared), revisionId: randomUUID(), fixtureId: randomUUID(),
    cycleId: randomUUID(), recordedAt: at };
  const extension = goalMarketExtensionFromRow({ ...body, body, validIntegrity: 1, recordedAt: new Date(at) });
  const [shown] = publicGoalMarketExtension(extension);
  const [published] = preparePublishedExtendedPicks(extension, null);
  assert.equal(shown.sourceLabel, "Local Engine");
  assert.equal(shown.selectionLabel, "Over 1.5");
  assert.equal(published.selectedProbability, shown.selectedProbability);
  const cycle = { id: body.cycleId, fixtureId: body.fixtureId, lockedSetId: body.revisionId, state: "closed", voidReason: null };
  const settle = (context) => projectGoalMarketSettlements(extension, cycle, context, "a".repeat(64), true, new Map())[0].base;
  assert.equal(settle(verified(1, 0)).status, "incorrect");
  assert.equal(settle(verified(1, 1)).status, "correct");
  assert.equal(settle(verified(1, 1, "live")).status, "pending");
  assert.equal(settle(verified(1, 1)).source, "local-poisson");
});

test("complete AI score distributions support Over 1.5 and unknown mass remains unavailable", () => {
  const states = [
    { home: 0, away: 0, halfHome: null, halfAway: null, probability: 0.2 },
    { home: 1, away: 1, halfHome: null, halfAway: null, probability: 0.8 },
  ];
  const scoreDistribution = { version: SCORE_DISTRIBUTION_VERSION, states, unrepresentedProbability: 0 };
  const complete = prepareGoalMarketExtension({ scoreDistribution, definitions: liveGoalMarketDefinitions }).markets[0].derivation;
  assert.equal(complete.market.source, "ai-score-distribution");
  assert.equal(complete.market.selectedProbability, 0.8);
  const incomplete = { ...scoreDistribution, states: [states[0]], unrepresentedProbability: 0.8 };
  assert.equal(prepareGoalMarketExtension({ scoreDistribution: incomplete, definitions: liveGoalMarketDefinitions })
    .markets[0].derivation.reason, "unrepresented-score-mass");
});

test("live detail keeps the forecast sealed and drops withdrawn 1.5 odds on the same fixture version", () => {
  const detail = liveDetail();
  const fixtureId = detail.fixture.fixtureId;
  const { cycleId, revisionId, publishedAt } = detail.snapshot;
  const prepared = prepareGoalMarketExtension({ localPoisson: { home: 1.6, away: 1 }, definitions: liveGoalMarketDefinitions });
  const extendedMarkets = { version: 1, fixtureId, cycleId, revisionId, publishedAt, mode: "current",
    markets: publicGoalMarketExtension({ ...prepared, fixtureId, cycleId, revisionId, recordedAt: publishedAt }) };
  const extendedOdds = exactTotal15Odds([{ label: "Over 1.5", odd: "1.3" }, { label: "Under 1.5", odd: "3.4" }], detail.asOf);
  const shown = matchDetailResponseSchema.parse({ ...detail, extendedMarkets, extendedOdds });
  assert.equal(shown.extendedOdds.selections[0].price, "1.3");
  const withdrawn = matchDetailResponseSchema.parse({ ...shown, asOf: shown.asOf + 1, extendedOdds: null });
  const refreshed = mergeLiveDetail(shown, withdrawn);
  assert.strictEqual(refreshed.snapshot, shown.snapshot);
  assert.deepEqual(refreshed.extendedMarkets, shown.extendedMarkets);
  assert.equal(refreshed.extendedOdds, null);
  assert.equal(matchDetailResponseSchema.safeParse({ ...shown, extendedMarkets: { ...extendedMarkets, revisionId: randomUUID() } }).success, false);
  assert.equal(matchDetailResponseSchema.safeParse({ ...shown, extendedMarkets: null }).success, false);
});

test("Double Chance derives from one result model and settles against verified regulation only", () => {
  const probabilities = goalProbabilities(1.6, 1.0);
  const result = probabilities["match-result"], dc = probabilities["double-chance"];
  assert.equal(dc["home-or-draw"], result["home-win"] + result.draw);
  assert.equal(dc["away-or-draw"], result["away-win"] + result.draw);
  assert.equal(dc["home-or-away"], result["home-win"] + result["away-win"]);
  assert.equal(settleMarketSelection("double-chance", "home-or-draw", verified(0, 0)).status, "correct");
  assert.equal(settleMarketSelection("double-chance", "away-or-draw", verified(1, 0)).status, "incorrect");
  assert.equal(settleMarketSelection("double-chance", "home-or-away", verified(1, 0, "live")).status, "pending");
});

test("exact 1.5 bookmaker prices stay separate from 2.5 and require a complete unique pair", () => {
  const over = { label: "Over 1.5", odd: "1.7340" }, under = { label: "Under 1.5", odd: "2.37" };
  assert.deepEqual(exactTotal15Odds([{ label: "Over 2.5", odd: "2.85" }, under, over], at), {
    marketKey: total15MarketKey, kind: "pre-match", checkedAt: at,
    selections: [{ selection: "over", price: "1.734" }, { selection: "under", price: "2.37" }],
  });
  assert.equal(exactTotal15Odds([under], at), null);
  assert.equal(exactTotal15Odds([under, over, over], at), null);
  assert.equal(exactTotal15Odds([under, { ...over, odd: "1.0099" }], at), null);

  const market = { id: 36, name: "Over/Under Line", values: [
    { label: "Over", handicap: "2.5", odd: "2.85", main: true, suspended: false },
    { label: "Over", handicap: "1.5", odd: "1.734", main: true, suspended: false },
    { label: "Under", handicap: "1.5", odd: "2.37", main: true, suspended: false },
  ] };
  const fixture = { finished: false, stopped: false, blocked: false, bets: [market] };
  const catalog = { 36: "Over/Under Line" };
  const current = mapInPlayOdds(fixture, catalog);
  assert.equal(current.state, "available");
  assert.deepEqual(current.markets, []);
  assert.deepEqual(current.total15Prices, [{ selection: "over", price: "1.734" }, { selection: "under", price: "2.37" }]);
  assert.equal(mapInPlayOdds(fixture, {}).state, "unavailable");
  assert.equal(mapInPlayOdds({ ...fixture, blocked: true }, catalog).total15Prices, undefined);
  const suspended = { ...fixture, bets: [{ ...market, values: market.values.map((value) =>
    value.label === "Over" && value.handicap === "1.5" ? { ...value, suspended: true } : value) }] };
  assert.equal(mapInPlayOdds(suspended, catalog).total15Prices, undefined);
});

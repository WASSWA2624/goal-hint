import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { total15MarketKey } from "../src/domain/extended-markets.ts";
import { parseFeedQuery, resolveFeedDates } from "../src/domain/feed-query.ts";
import { goalTotalsMarket, liveGoalMarketDefinitions } from "../src/domain/goal-market-definitions.ts";
import { mergeLiveDetail } from "../src/domain/live-refresh.ts";
import { matchDetailResponseSchema } from "../src/domain/match-detail.ts";
import { settleMarketSelection } from "../src/domain/market-settlement.ts";
import { SCORE_DISTRIBUTION_VERSION } from "../src/domain/score-distribution.ts";
import { parseSlipCriteria, serializeSlipCriteria } from "../src/domain/slip-builder.ts";
import { slipSelectionCard } from "../src/domain/slip-card.ts";
import { snapshotCardPrediction } from "../src/domain/match-card.ts";
import { slipMatchWatchSchema } from "../src/domain/slip-match-refresh.ts";
import { slipResultView, slipSnapshotSchema } from "../src/domain/slip-snapshot.ts";
import { settleSlipSelection } from "../src/domain/slip-settlement.ts";
import { evidenceFingerprint } from "../src/server/evidence/evidence-input.ts";
import { goalProbabilities } from "../src/server/intelligence/local-goals-model.ts";
import { exactTotal15Odds } from "../src/server/odds/odds-mysql-store.ts";
import { mapInPlayOdds } from "../src/server/odds/in-play-odds-mapping.ts";
import { preparePublishedExtendedPicks } from "../src/server/predictions/extended-market-picks.ts";
import { publicGoalMarketExtension } from "../src/server/predictions/extended-market-read.ts";
import { goalMarketExtensionFromRow, prepareGoalMarketExtension, projectGoalMarketSettlements } from "../src/server/predictions/goal-market-store.ts";
import { slipPricesFromBookmakers } from "../src/server/slips/price-read.ts";
import { slipRevisionMatches } from "../src/server/slips/slip-forecast.ts";
import { projectSlipTotal15Forecast } from "../src/server/slips/slip-goal-forecast.ts";
import { createSlipBuildService } from "../src/server/slips/slip-service.ts";
import { liveDetail, liveRecord, now, today } from "./helpers/live-refresh-fixtures.mjs";

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

test("Builder uses only the exact priced 1.5 outcome from a sealed forecast and preserves it through slip history", async () => {
  const fixture = liveRecord({ kickoffAt: now + 3_600_000 });
  const record = { ...fixture, forecast: { ...fixture.forecast, provisional: false, updateDelayed: false } };
  const reference = { cycleId: record.cycleId, revisionId: record.forecast.revisionId, publishedAt: record.forecast.publishedAt };
  const prepared = prepareGoalMarketExtension({ localPoisson: { home: 1.8, away: 1.2 }, definitions: liveGoalMarketDefinitions });
  const sealed = { ...prepared, cycleId: reference.cycleId, revisionId: reference.revisionId, fixtureId: record.fixtureId,
    contentHash: evidenceFingerprint(prepared), recordedAt: reference.publishedAt };
  const extension = goalMarketExtensionFromRow({ ...sealed, body: sealed, validIntegrity: 1, recordedAt: new Date(sealed.recordedAt) });
  const projected = projectSlipTotal15Forecast(extension, record.fixtureId, record.kickoffAt, reference, now);
  assert.ok(projected);
  assert.equal(projectSlipTotal15Forecast(extension, record.fixtureId, record.kickoffAt, { ...reference, revisionId: randomUUID() }, now), null);
  const book = (bookmakerId, odd) => ({ bookmakerId, bookmakerName: `Bookmaker ${bookmakerId}`, offers: [
    { betId: 5, betName: "Goals Over/Under", values: [{ label: "Over 1.5", odd }, { label: "Over 2.5", odd: "7.50" }], providerUpdatedAt: now - 500 },
    { betId: 6, betName: "Goals Over/Under First Half", values: [{ label: "Over 1.5", odd: "9.50" }], providerUpdatedAt: now - 500 },
  ] });
  const current = { fixtureId: record.fixtureId, kickoffAt: record.kickoffAt, checkedAt: now - 500,
    primaryBookmakerId: 8, bookmakers: [book(8, "1.21"), book(9, "1.2501")] };
  assert.deepEqual(slipPricesFromBookmakers(record, current, ["total-goals"]), []);
  const selectionPrices = { [record.fixtureId]: slipPricesFromBookmakers(record, current, ["total-goals"], projected) };
  assert.equal(selectionPrices[record.fixtureId].length, 2);
  const criteria = parseSlipCriteria({ build: "1", markets: "total-goals", "picks.total-goals": "over-1.5",
    totalMin: "1.01", totalMax: "", teamsMax: "1", probMin: "0" }, today);
  assert.equal(serializeSlipCriteria(criteria).get("picks.total-goals"), "over-1.5");
  assert.equal(parseSlipCriteria({ markets: "total-goals", "picks.total-goals": ["over-1.5", "under-1.5", "over-2.5", "under-2.5"] },
    today).outcomes["total-goals"].length, 4);
  const build = (total15Forecast = projected) => createSlipBuildService({ consume: async () => {}, providerOdds: true, clock: { now: () => now },
    readCohort: async (parameters, context) => {
      assert.equal(context.total15, "only");
      const range = resolveFeedDates(parseFeedQuery(parameters, { today }), today);
      return { records: [record], selectionPrices, total15Forecasts: { [record.fixtureId]: total15Forecast },
        asOf: now, today, range: { from: range.startDate, to: range.endDate, ...range.window }, partialCoverage: false, searchLimited: false };
    } }).query(criteria);
  const result = await build();
  assert.equal(result.state, "generated");
  assert.equal((await build({ ...projected, probabilities: { "over-1.5": 0.74999, "under-1.5": 0.25001 } })).state, "no-qualifying");
  assert.equal((await build({ ...projected, probabilities: { "over-1.5": 0.75, "under-1.5": 0.25 } })).state, "generated");
  const [slip] = result.data.slips, [leg] = slip.selections;
  assert.equal(leg.selection, "over-1.5");
  assert.equal(leg.odds, "1.2501");
  assert.equal(leg.bookmaker.id, 9);
  assert.deepEqual(slipSnapshotSchema.parse(slip), slip);
  assert.equal(snapshotCardPrediction(slipSelectionCard(leg).snapshotPick).item.market.selection, "over-1.5");
  const watch = slipMatchWatchSchema.parse({ fixtureId: leg.fixtureId, kickoffAt: leg.kickoffAt, homeTeam: { id: leg.homeTeam.id },
    awayTeam: { id: leg.awayTeam.id }, family: leg.family, selection: leg.selection, forecast: leg.forecast, probability: leg.probability });
  const original = { ...reference, id: reference.revisionId, fixtureId: leg.fixtureId };
  assert.equal(slipRevisionMatches(watch, original, extension, now), true);
  assert.equal(slipRevisionMatches({ ...watch, probability: 0.99 }, original, extension, now), false);
  const completed = { fixtureId: leg.fixtureId, family: leg.family, selection: leg.selection, forecast: leg.forecast, completed: true,
    status: "finished-extra-time", regulationVerified: true, regulationHome: 1, regulationAway: 1 };
  assert.equal(slipResultView("sealed", "", slip, [completed]).outcome, "won");
  assert.equal(slipResultView("sealed", "", slip, [{ ...completed, regulationAway: 0 }]).outcome, "lost");
  assert.equal(slipResultView("sealed", "", slip, [{ ...completed, regulationVerified: false }]).outcome, "pending");
  assert.equal(slipResultView("sealed", "", slip, [{ ...completed, status: "canceled" }]).outcome, "void");
  assert.equal(settleSlipSelection("total-goals", "under-1.5", verified(1, 0)).status, "correct");
  assert.equal(settleSlipSelection("total-goals", "under-1.5", verified(1, 1)).status, "incorrect");
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

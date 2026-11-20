import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate, validateReportingDateRange } from "../src/domain/calendar.ts";
import { bestCardFamily } from "../src/domain/feed-presentation.ts";
import { parseFeedQuery } from "../src/domain/feed-query.ts";
import { featuredFamily } from "../src/domain/match-details.ts";
import { bestPublishedFamily, rankFixtureOutcomes } from "../src/domain/market-ranking.ts";
import { feedSql } from "../src/server/matches/feed-read.ts";

const families = ["match-result", "total-goals"];
const pick = (family, selection, selectedProbability) => ({ market: { family, selection, selectedProbability } });
const price = (family, selection, value) => ({ family, selection, price: value });
const tied = [pick("match-result", "home-win", 0.7), pick("total-goals", "over-2.5", 0.7)];
const prices = [price("match-result", "home-win", "1.90"), price("total-goals", "over-2.5", "2.10")];

test("upcoming featured selection takes the strongest supported outcome and uses only its exact goal period and line", () => {
  const launch = [{ market: { family: "match-result", source: "ai", selection: "home-win", selectedProbability: 0.65,
    probabilities: { "home-win": 0.65, draw: 0.2, "away-win": 0.15 } } }];
  const goal = (period, probability) => ({ key: `goal:${period}:totals:total:4.5:binary`, label: "Goals 4.5", code: "O/U 4.5",
    source: "local-poisson", selections: [{ key: "over", label: "Over 4.5", probability }, { key: "under", label: "Under 4.5", probability: 1 - probability }] });
  const goals = [goal("full-time", 0.15), goal("half-time", 0.01)];
  const offers = { fixtureId: "fixture", kind: "pre-match", checkedAt: 10, books: [{ bookmakerId: 8,
    markets: [{ betId: 1, name: "Match Winner", selections: [{ label: "Draw", line: null, price: "4" }] },
    { betId: 5, name: "Goals Over/Under", selections: [{ label: "Under 4.5", line: null, price: "1.2" }] }] }] };
  const priced = rankFixtureOutcomes(launch, [goals[0]], offers);
  assert.deepEqual([priced.key, priced.odds], [goals[0].key, "1.2"]);
  assert.deepEqual([rankFixtureOutcomes(launch, [], offers).selection, rankFixtureOutcomes(launch, [], offers).odds], ["home-win", null]);
  const unpriced = rankFixtureOutcomes(launch, goals, offers);
  assert.equal(unpriced.key, goals[1].key);
  assert.equal(unpriced.odds, null);
});

test("rank unrounded probability ahead of price availability and amount", () => {
  const items = [pick("match-result", "home-win", 0.7000001), tied[1]];
  assert.equal(bestPublishedFamily(items, [price("match-result", "home-win", "1.20"), price("total-goals", "over-2.5", "9.99")], families), "match-result");
  assert.equal(bestPublishedFamily(items, [price("total-goals", "over-2.5", "9.99")], families), "match-result");
  assert.equal(bestPublishedFamily(items, [], families), "match-result");
});

test("upcoming tied outcomes within the same family can use an exact fresh price without changing the stored pick", () => {
  const market = { family: "match-result", source: "ai", selection: "home-win", selectedProbability: 0.45,
    probabilities: { "home-win": 0.45, draw: 0.10, "away-win": 0.45 } };
  const offers = { fixtureId: "fixture", kind: "pre-match", checkedAt: 10, books: [{ bookmakerId: 8,
    markets: [{ betId: 1, name: "Match Winner", selections: [{ label: "Home", line: null, price: "2" },
      { label: "Away", line: null, price: "3" }, { label: "Draw", line: null, price: "6" }] }] }] };
  assert.equal(rankFixtureOutcomes([{ market }], [], offers).selection, "away-win");
  assert.equal(market.selection, "home-win");
});

test("the Any default selects the highest-probability available family and keeps its own price", () => {
  const query = parseFeedQuery({}, { today: parseReportingDate("2026-10-14") });
  const items = [...tied, pick("double-chance", "home-or-draw", 0.82), pick("both-teams-to-score", "yes", 0.71)];
  const prices = [price("match-result", "home-win", "9.99"), price("double-chance", "home-or-draw", "1.30")];
  const family = bestCardFamily({ forecast: { markets: items }, prices }, query.markets);
  assert.equal(family, "double-chance");
  assert.equal(prices.find((entry) => entry.family === family)?.price, "1.30");
  assert.equal(bestCardFamily({ forecast: { markets: items.filter((entry) => entry.market.family !== family) }, prices }, query.markets), "both-teams-to-score");
  const sql = feedSql(query, validateReportingDateRange("2026-10-14", "2026-10-14", 31), [39], true);
  assert.match(sql.joins.sql, /ORDER BY b.selectedProbability DESC,\s+bp.displayHundredths DESC/u);
  assert.equal(sql.pickAvailable.sql, "m.available=TRUE", "an explicit recommendation abstention can still have a published forecast");
  assert.match(sql.joins.sql, /op.marketKey=m.family\s+AND op.selection=CASE WHEN/u);
  assert.doesNotMatch(sql.where.sql, /op.displayHundredths BETWEEN/u);
  assert.doesNotMatch(sql.countJoins.sql, /ROW_NUMBER|FixtureOddsPrice|selectedProbability DESC/u,
    'availability counts do not rank every match or fetch prices');
  assert.equal(sql.pageJoins, sql.cohortJoins, 'ordinary kickoff pagination skips market work when no market constraint applies');
});

test("only exact probability ties use the highest available price for the published family and selection", () => {
  assert.equal(bestPublishedFamily(tied, prices, families), "total-goals");
  assert.equal(bestPublishedFamily(tied, [prices[1]], families), "total-goals", "an available price beats no price on a tie");
  assert.equal(bestPublishedFamily(tied, [prices[0], price("total-goals", "under-2.5", "9.99")], families), "match-result", "another selection's odds do not qualify");
  assert.equal(bestPublishedFamily(tied, [price("both-teams-to-score", "yes", "9.99")], families), "match-result", "another family's odds do not qualify");
  assert.equal(bestPublishedFamily(tied, [prices[0], price("total-goals", "over-2.5", "2.100")], families), "match-result", "invalid hand-built prices are ignored");
});

test("confidence breaks exact probability ties before odds, followed by a stable key", () => {
  const assessed = [{ ...tied[0], confidence: "supported" }, { ...tied[1], confidence: "limited" }];
  assert.equal(bestPublishedFamily(assessed, [prices[1]], families), "match-result");
  assert.equal(bestPublishedFamily([{ ...assessed[0], confidence: "calibrated" },
    { ...assessed[1], market: { ...assessed[1].market, selectedProbability: 0.7000001 } }], prices, families), "total-goals");
  const same = [...tied, pick("double-chance", "home-or-draw", 0.7)];
  assert.equal(bestPublishedFamily(same.reverse(), [], [...families, "double-chance"]), "double-chance");
});

test("public forecast rows require a published market without applying the recommendation decision", () => {
  const today = parseReportingDate("2026-10-14"), range = validateReportingDateRange(today, today, 1);
  const query = parseFeedQuery({ sort: "live-first" }, { today });
  const published = feedSql(query, range, [39], true, null, false, true);
  assert.match(published.where.sql, /AND m\.available=TRUE$/u);
  assert.equal(published.pickAvailable.sql, "m.available=TRUE");
  assert.doesNotMatch(published.joins.sql, /feedRecommendation/u);
  assert.match(published.order.sql, /^CASE f.status WHEN 'live' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END/u);
  assert.equal(published.pageJoins, published.countJoins);

  const picksOnly = feedSql({ ...query, picks: "only" }, range, [39], true, null, false, true);
  assert.match(picksOnly.where.sql, /m\.available=TRUE/u);
  assert.doesNotMatch(picksOnly.joins.sql, /feedRecommendation/u);
});

test("missing or equal prices retain deterministic policy order and selected-family eligibility", () => {
  assert.equal(bestPublishedFamily([...tied].reverse(), [], [...families].reverse()), "match-result");
  assert.equal(bestPublishedFamily(tied, [prices[0], price("total-goals", "over-2.5", "1.90")], families), "match-result");
  assert.equal(bestPublishedFamily(tied, prices, ["match-result"]), "match-result");
  assert.equal(bestPublishedFamily(tied, prices, ["both-teams-to-score"]), null);
  assert.equal(bestPublishedFamily(undefined, prices, families), null);
  assert.equal(bestCardFamily({ forecast: { markets: tied }, prices }, families), "total-goals");
});

test("details rank the displayed snapshot selection, including fresh exact odds for a historical pick", () => {
  const data = { fixture: { prices }, snapshot: { markets: tied } };
  assert.equal(featuredFamily(data), "total-goals", "the applicable card and detail featured pick agree");
  data.snapshot.markets = [tied[0], pick("total-goals", "under-2.5", 0.7)];
  assert.equal(featuredFamily(data), "match-result", "a current over price cannot fill a historical under pick");
  data.odds = [{ family: "total-goals", selections: [{ selection: "under-2.5", price: "2.50" }] }];
  assert.equal(featuredFamily(data), "total-goals");
  assert.equal(featuredFamily({ ...data, snapshot: null }), null);
});

test("feed SQL ranks the candidate's exact fresh price only when provider odds are public", () => {
  const today = parseReportingDate("2026-10-12"), range = validateReportingDateRange(today, today, 31);
  const query = parseFeedQuery(new URLSearchParams("market=match-result,total-goals&prob=60-100&odds=1.50-3.00&sort=probability"), { today, providerOdds: true });
  const enabled = feedSql(query, range, [39], true);
  assert.match(enabled.joins.sql, /LEFT JOIN FixtureOddsPrice bp ON bp.fixtureId=f.id\s+AND bp.marketKey=b.family AND bp.selection=b.selection AND bp.stale=FALSE/u);
  assert.match(enabled.joins.sql, /ROW_NUMBER\(\) OVER \(PARTITION BY f.id ORDER BY b.selectedProbability DESC,\s+bp.displayHundredths DESC, b.family ASC, b.selection ASC/u);
  assert.match(enabled.joins.sql, /op.marketKey=m.family\s+AND op.selection=CASE WHEN/u);
  assert.match(enabled.where.sql, /ELSE m.selectedProbability END>=\?/u);
  assert.match(enabled.where.sql, /ELSE m.selectedProbability END<=\?/u);
  assert.match(enabled.where.sql, /op.displayHundredths BETWEEN \? AND \?/u);
  assert.doesNotMatch(enabled.where.sql, /'\$\.decimal'/u);
  assert.match(enabled.order.sql, /ELSE m.selectedProbability END IS NULL ASC,/u);
  assert.match(enabled.order.sql, /ELSE m.selectedProbability END DESC/u);
  assert.match(enabled.joins.sql, /LEFT JOIN PredictionSet rp ON rp.id=/u);
  assert.match(enabled.where.sql, /rp\.feedRecommendation,[\s\S]*'\$\.probability'/u);
  assert.doesNotMatch(enabled.joins.sql + enabled.where.sql + enabled.order.sql, /candidateJson/u);
  const disabled = feedSql(query, range, [39], false);
  assert.doesNotMatch(disabled.joins.sql, /FixtureOdds|\bbp\.|\bop\./u);
  assert.doesNotMatch(disabled.where.sql, /\bop\./u);
  assert.match(disabled.joins.sql, /ORDER BY\s+b.selectedProbability DESC,\s+b.family ASC, b.selection ASC/u);
  const equalDecimal = feedSql({ ...query, probability: { min: 58.2, max: 58.2 } }, range, [39], true);
  assert.equal(equalDecimal.where.values.filter((value) => value === 0.582).length, 2, "equal decimal bounds compare against the same exact fraction");
});

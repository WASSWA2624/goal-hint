import assert from "node:assert/strict";
import test from "node:test";
import { getPublicationDeadline, parseReportingDate, validateReportingDateRange } from "../src/domain/calendar.ts";
import { bestCardFamily } from "../src/domain/feed-presentation.ts";
import { parseFeedQuery } from "../src/domain/feed-query.ts";
import { currentFeaturedOutcome, featuredFamily } from "../src/domain/match-details.ts";
import { bestPublishedFamily, rankFixtureOutcomes } from "../src/domain/market-ranking.ts";
import { preMatchReferenceOddsFreshMs } from "../src/domain/reference-odds.ts";
import { feedSql } from "../src/server/matches/feed-read.ts";
import { upcomingFeaturedPick } from "../src/server/matches/upcoming-featured-pick.ts";

const families = ["match-result", "total-goals"];
const pick = (family, selection, selectedProbability) => ({ market: { family, selection, selectedProbability } });
const price = (family, selection, value) => ({ family, selection, price: value });
const tied = [pick("match-result", "home-win", 0.7), pick("total-goals", "over-2.5", 0.7)];
const prices = [price("match-result", "home-win", "1.90"), price("total-goals", "over-2.5", "2.10")];

test("upcoming featured selection ranks priced outcomes and uses only the exact goal period and line", () => {
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
  assert.equal(rankFixtureOutcomes(launch, [], offers), null);
  assert.equal(rankFixtureOutcomes(launch, goals, offers).key, goals[0].key);
  const [over, under] = goals[0].selections;
  const alternate = rankFixtureOutcomes(launch, [{ ...goals[0], selections: [
    { ...over, probability: 0.75 }, { ...under, probability: 0.25 },
  ] }], offers);
  assert.deepEqual([alternate.selection, alternate.probability], ["under", 0.25]);
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
  assert.match(sql.joins.sql, /ORDER BY b.selectedProbability DESC, CASE b.source WHEN 'local-engine' THEN 1 ELSE 0 END DESC,\s+bp.displayHundredths DESC/u);
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

test("qualified local extended picks win equal-probability ties only when the exact selection is priced", () => {
  const fallback = { market: { family: "match-result", source: "api-football", selection: "home-win", selectedProbability: 0.7,
    probabilities: { "home-win": 0.7, draw: 0.2, "away-win": 0.1 } } };
  const local = { key: "goal:full-time:totals:total:4.5:binary", label: "Total goals 4.5", code: "O/U 4.5", source: "local-poisson",
    selections: [{ key: "under", label: "Under 4.5", probability: 0.7 }, { key: "over", label: "Over 4.5", probability: 0.3 }] };
  const prices = { fixtureId: "fixture", kind: "pre-match", checkedAt: 10, books: [{ bookmakerId: 8, markets: [
    { betId: 1, name: "Match Winner", selections: [{ label: "Home", line: null, price: "1.9" }] },
  ] }] };
  const result = rankFixtureOutcomes([fallback], [local], prices);
  assert.deepEqual([result.key, result.odds, result.probability, result.source], ["match-result", "1.9", 0.7, "api-football"]);
  prices.books[0].markets.push({ betId: 5, name: "Goals Over/Under", selections: [{ label: "Under 4.5", line: null, price: "1.3" }] });
  const pricedLocal = rankFixtureOutcomes([fallback], [local], prices);
  assert.deepEqual([pricedLocal.key, pricedLocal.odds, pricedLocal.source], [local.key, "1.3", "local-engine"]);
});

test("the current fallback prices only the exact timely occurrence and closes at the normal forecast deadline", () => {
  const now = Date.parse("2026-11-26T08:00:00Z"), kickoffAt = now + 3_600_000;
  const fixtureId = "9bec2a11-ea91-44a5-b272-de378001cb54";
  const forecast = { publishedAt: now - 1, markets: [{ market: { family: "match-result", source: "api-football", selection: "home-win",
    selectedProbability: 0.70, probabilities: { "home-win": 0.7, draw: 0.2, "away-win": 0.1 } } }] };
  const fixture = { fixtureId, kickoffAt, status: "scheduled", forecast };
  const quote = { fixtureId, kickoffAt, checkedAt: now, primaryBookmakerId: 1, bookmakers: [{ bookmakerId: 1, bookmakerName: "Test bookmaker",
    offers: [{ betId: 1, betName: "Match Winner", providerUpdatedAt: null, observedAt: now - 4, checkedAt: now,
      values: [{ label: "Home", odd: "1.80" }, { label: "Draw", odd: "9.50" }] }] }] };
  const read = (record = fixture, odds = quote, at = now, permitted = true) => upcomingFeaturedPick(record, undefined, odds, at, permitted);
  assert.deepEqual([read().selection, read().odds], ["home-win", "1.8"]);
  for (const drift of [{ fixtureId: "24181605-bcab-4d3d-9a98-a39538bea2d7" }, { kickoffAt: kickoffAt + 1 },
    { checkedAt: now + 1 }, { checkedAt: now - preMatchReferenceOddsFreshMs - 1 },
    { provenance: "historical-pre-match" }]) assert.equal(read(fixture, { ...quote, ...drift }), null);
  const projection = { kind: "pre-match", checkedAt: now - preMatchReferenceOddsFreshMs - 1,
    prices: { state: "available", markets: [{ family: "match-result", selections: [{ selection: "home-win", price: "1.90" }] }] } };
  assert.equal(read({ ...fixture, marketOdds: projection }, null), null);
  assert.equal(read({ ...fixture, marketOdds: { ...projection, checkedAt: now } }, null).odds, "1.90");
  assert.equal(read(fixture, quote, now, false), null);
  assert.equal(read(fixture, quote, getPublicationDeadline(kickoffAt)), null);
  assert.equal(read({ ...fixture, forecast: { ...forecast, publishedAt: now + 1 } }), null);
});

test("an unpriced stored recommendation leaves the best priced market eligible in Matches and Match Details", () => {
  const now = Date.parse("2026-11-26T08:00:00Z"), kickoffAt = now + 3_600_000;
  const result = { family: "match-result", source: "ai", selection: "home-win", selectedProbability: 0.80,
    probabilities: { "home-win": 0.80, draw: 0.12, "away-win": 0.08 } };
  const total = { family: "total-goals", source: "ai", selection: "under-2.5", selectedProbability: 0.65,
    probabilities: { "under-2.5": 0.65, "over-2.5": 0.35 } };
  const forecast = { markets: [{ market: result }, { market: total }], publishedAt: now - 1,
    recommendation: { selected: { family: result.family, source: result.source, selection: result.selection,
      probability: result.selectedProbability, confidence: "calibrated" } } };
  const fixture = { fixtureId: "fixture", kickoffAt, status: "scheduled", forecast, marketOdds: { kind: "pre-match", checkedAt: now,
    prices: { state: "available", markets: [{ family: total.family, selections: [{ selection: total.selection, price: "1.75" }] }] } } };
  const pick = upcomingFeaturedPick(fixture, undefined, null, now, true);
  assert.deepEqual([pick.key, pick.selection, pick.odds], [total.family, total.selection, "1.75"]);
  const detail = { fixture, asOf: now, selection: "applicable", snapshot: { ...forecast, applicability: "current" } };
  assert.deepEqual(currentFeaturedOutcome(detail), pick);
  assert.deepEqual(currentFeaturedOutcome({ ...detail, fixture: { ...fixture, featuredPrediction: pick } }), pick);
  const noPrice = { ...detail, fixture: { ...fixture, marketOdds: null } };
  assert.equal(currentFeaturedOutcome(noPrice), null);
  assert.equal(featuredFamily(noPrice), null);
  assert.equal(featuredFamily({ ...detail, selection: "revision" }), result.family);
});

test("an incomplete privately modeled score distribution cannot choose a featured market", () => {
  const price = "1.20", probability = .98, market = { key: "goal:full-time:totals:total:5.5:binary", label: "Total goals 5.5",
    code: "O/U 5.5", source: "local-poisson", unrepresentedProbability: 1e-14,
    selections: [{ key: "under", label: "Under 5.5", probability }] };
  assert.equal(rankFixtureOutcomes([], [market], null), null);
  const offers = { fixtureId: "fixture", kind: "pre-match", checkedAt: 10, books: [{ bookmakerId: 8,
    markets: [{ betId: 5, name: "Goals Over/Under", selections: [{ label: "Under 5.5", line: null, price }] }] }] };
  assert.equal(rankFixtureOutcomes([], [{ ...market, unrepresentedProbability: 0 }], offers).probability, probability);
});

test("public forecast rows require a published market without applying the recommendation decision", () => {
  const today = parseReportingDate("2026-10-14"), range = validateReportingDateRange(today, today, 1);
  const query = parseFeedQuery({ sort: "live-first" }, { today });
  const published = feedSql(query, range, [39], true, null, false, true);
  assert.ok(published.where.sql.endsWith(`AND ${published.displayAvailable.sql}`));
  assert.equal(published.pickAvailable.sql, "m.available=TRUE");
  assert.match(published.displayAvailable.sql, /^CASE WHEN .+ THEN feedPick\.marketKey IS NOT NULL ELSE m\.available=TRUE END$/su);
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
  assert.match(enabled.joins.sql, /ROW_NUMBER\(\) OVER \(PARTITION BY f.id ORDER BY b.selectedProbability DESC, CASE b.source WHEN 'local-engine' THEN 1 ELSE 0 END DESC,\s+bp.displayHundredths DESC, b.family ASC, b.selection ASC/u);
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
  assert.match(disabled.joins.sql, /ORDER BY\s+b.selectedProbability DESC, CASE b.source WHEN 'local-engine' THEN 1 ELSE 0 END DESC,\s+b.family ASC, b.selection ASC/u);
  const equalDecimal = feedSql({ ...query, probability: { min: 58.2, max: 58.2 } }, range, [39], true);
  assert.equal(equalDecimal.where.values.filter((value) => value === 0.582).length, 2, "equal decimal bounds compare against the same exact fraction");
});

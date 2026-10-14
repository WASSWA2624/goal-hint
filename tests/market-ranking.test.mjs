import assert from "node:assert/strict";
import test from "node:test";
import { parseReportingDate, validateReportingDateRange } from "../src/domain/calendar.ts";
import { bestCardFamily } from "../src/domain/feed-presentation.ts";
import { parseFeedQuery } from "../src/domain/feed-query.ts";
import { featuredFamily } from "../src/domain/match-details.ts";
import { bestPublishedFamily } from "../src/domain/market-ranking.ts";
import { feedSql } from "../src/server/matches/feed-read.ts";

const families = ["match-result", "total-goals"];
const pick = (family, selection, selectedProbability) => ({ market: { family, selection, selectedProbability } });
const price = (family, selection, value) => ({ family, selection, price: value });
const tied = [pick("match-result", "home-win", 0.7), pick("total-goals", "over-2.5", 0.7)];
const prices = [price("match-result", "home-win", "1.90"), price("total-goals", "over-2.5", "2.10")];

test("a higher unrounded forecast probability always beats better odds, even when displayed percentages tie", () => {
  const items = [pick("match-result", "home-win", 0.7000001), tied[1]];
  assert.equal(bestPublishedFamily(items, [price("match-result", "home-win", "1.20"), price("total-goals", "over-2.5", "9.99")], families), "match-result");
  assert.equal(bestPublishedFamily(items, [price("total-goals", "over-2.5", "9.99")], families), "match-result", "a missing price never discards a more probable forecast");
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
  assert.match(sql.joins.sql, /ORDER BY b.selectedProbability DESC, bp.displayHundredths DESC/u);
  assert.match(sql.joins.sql, /op.marketKey=m.family\s+AND op.selection=m.selection/u);
  assert.doesNotMatch(sql.where.sql, /op.displayHundredths BETWEEN/u);
});

test("only exact probability ties use the highest available price for the published family and selection", () => {
  assert.equal(bestPublishedFamily(tied, prices, families), "total-goals");
  assert.equal(bestPublishedFamily(tied, [prices[1]], families), "total-goals", "an available price beats no price on a tie");
  assert.equal(bestPublishedFamily(tied, [prices[0], price("total-goals", "under-2.5", "9.99")], families), "match-result", "another selection's odds do not qualify");
  assert.equal(bestPublishedFamily(tied, [price("both-teams-to-score", "yes", "9.99")], families), "match-result", "another family's odds do not qualify");
  assert.equal(bestPublishedFamily(tied, [prices[0], price("total-goals", "over-2.5", "2.100")], families), "match-result", "invalid hand-built prices are ignored");
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
  assert.match(enabled.joins.sql, /ORDER BY b.selectedProbability DESC, bp.displayHundredths DESC, FIELD\(b.family,/u);
  assert.match(enabled.joins.sql, /op.marketKey=m.family\s+AND op.selection=m.selection AND op.stale=FALSE/u);
  assert.match(enabled.where.sql, /m.selectedProbability>=\?/u);
  assert.match(enabled.where.sql, /m.selectedProbability<=\?/u);
  assert.match(enabled.where.sql, /op.displayHundredths BETWEEN \? AND \?/u);
  assert.match(enabled.order.sql, /m.selectedProbability IS NULL ASC, m.selectedProbability DESC/u);
  const disabled = feedSql(query, range, [39], false);
  assert.doesNotMatch(disabled.joins.sql, /FixtureOdds|\bbp\.|\bop\./u);
  assert.doesNotMatch(disabled.where.sql, /\bop\./u);
  assert.match(disabled.joins.sql, /ORDER BY b.selectedProbability DESC,\s+FIELD\(b.family,/u);
  const equalDecimal = feedSql({ ...query, probability: { min: 58.2, max: 58.2 } }, range, [39], true);
  assert.equal(equalDecimal.where.values.filter((value) => value === 0.582).length, 2, "equal decimal bounds compare against the same exact fraction");
});

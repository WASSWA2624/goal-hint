import assert from "node:assert/strict";
import test from "node:test";
import { buildDemoSlipSnapshots, demoSlipQuote, demoSlipRules } from "../src/server/demo/slips-seed.ts";
import { getPublicationDeadline, getReportingDate, utcInstantFromEpochMilliseconds } from "../src/domain/calendar.ts";
import { settleMarketSelection } from "../src/domain/market-settlement.ts";
import { demoFixturesForDate, demoFixtureOdds, demoFixtureProbabilities } from "../src/server/demo/api-football.ts";
import { normalizeFixture } from "../src/server/football/api-football-normalize.ts";
import { demoId } from "../src/server/demo/forecast.ts";

const now = Date.parse("2026-10-28T09:00:00+03:00");
function candidate(index, date = "2026-10-28", outcome = "pending") {
  return { outcome, selection: { fixtureId: demoId("fixture", index), kickoffAt: Date.parse(`${date}T12:00:00+03:00`) + index * 1_000,
    homeTeam: { id: demoId("team", index * 2), name: `Home ${index}` }, awayTeam: { id: demoId("team", index * 2 + 1), name: `Away ${index}` },
    competition: { id: demoId("competition", 1), name: "Demo league", country: "Uganda", logoUrl: null, countryFlagUrl: null },
    family: "match-result", selection: "home-win", probability: 0.65 + index % 5 * 0.01, odds: "1.50", oddsBasis: "bookmaker",
    forecast: { cycleId: demoId("cycle", index), revisionId: demoId("revision", index), publishedAt: Date.parse(`${date}T00:00:00+03:00`) - 43_200_000 + 3_000 } } };
}

test("editorial odds bounds use exact products rather than rounded displayed totals", () => {
  const quote = (odds) => demoSlipQuote(odds.map((odd) => ({ odds: odd })));
  assert.deepEqual(quote(["1.30", "1.30", "1.33", "2.00"]), { totalOdds: "4.50", belowMinimum: true, aboveMaximum: false });
  assert.deepEqual(quote(["1.01", "1.09", "2.00", "2.50"]), { totalOdds: "5.50", belowMinimum: false, aboveMaximum: true });
  assert.deepEqual(quote(["1.20", "1.25", "1.50", "2.00"]), { totalOdds: "4.50", belowMinimum: false, aboveMaximum: false });
  assert.deepEqual(quote(["1.10", "1.25", "1.60", "2.50"]), { totalOdds: "5.50", belowMinimum: false, aboveMaximum: false });
});

test("today receives every available disjoint opening slip with original prices, probability and forecast chronology", () => {
  const candidates = Array.from({ length: 80 }, (_, index) => candidate(index)), original = JSON.stringify(candidates);
  const dayStart = Date.parse("2026-10-28T00:00:00+03:00");
  const invalid = candidate(1000); invalid.selection.kickoffAt = dayStart + 29 * 60_000;
  const low = candidate(1001); low.selection.probability = 0.6499;
  const result = buildDemoSlipSnapshots("2026-10-28", [...candidates, invalid, low], now), ids = new Set();
  assert.equal(result.slips.length, 20);
  for (const slip of result.slips) {
    assert.ok(slip.selections.length >= 4 && slip.selections.length <= 8); assert.equal(slip.totalOdds, "5.06");
    for (const selection of slip.selections) {
      assert.ok(!ids.has(selection.fixtureId)); ids.add(selection.fixtureId);
      assert.ok(selection.probability >= 0.65); assert.equal(selection.odds, "1.50"); assert.equal(selection.oddsBasis, "bookmaker");
      assert.ok(selection.forecast.publishedAt <= result.publicationAt);
      assert.ok(result.publicationAt < getPublicationDeadline(selection.kickoffAt));
      assert.ok(selection.kickoffAt >= dayStart + 30 * 60_000);
    }
  }
  assert.equal(JSON.stringify(candidates), original);
  assert.equal(getReportingDate(utcInstantFromEpochMilliseconds(result.publicationAt)), "2026-10-28");
  assert.ok(result.publicationAt <= now);
  assert.equal(result.publicationAt, dayStart);
});

test("first startup late in the day retains the original editorial cohort without needing unstarted matches", () => {
  const candidates = Array.from({ length: 80 }, (_, index) => candidate(index));
  const opening = buildDemoSlipSnapshots("2026-10-28", candidates, now);
  const settled = candidates.map((entry, index) => ({ ...entry, outcome: index % 5 ? "correct" : "incorrect" }));
  const original = JSON.stringify(settled), late = Date.parse("2026-10-28T23:59:59+03:00");
  assert.ok(settled.every((entry) => entry.selection.kickoffAt < late));
  const restarted = buildDemoSlipSnapshots("2026-10-28", settled, late);
  assert.deepEqual(restarted, opening);
  assert.equal(JSON.stringify(settled), original, "settlement observations remain unchanged");
});

test("daily editorial publications exclude forecasts not yet known at their original publication clock", () => {
  const candidates = Array.from({ length: 80 }, (_, index) => candidate(index));
  for (const entry of candidates.slice(39)) entry.selection.forecast.publishedAt = Date.parse("2026-10-28T01:00:00+03:00");
  const result = buildDemoSlipSnapshots("2026-10-28", candidates, now);
  assert.equal(result.slips.length, 9);
  assert.ok(result.slips.every(slip => slip.selections.every(selection => selection.forecast.publishedAt < Date.parse("2026-10-28T00:00:00+03:00"))));
});

test("historical snapshots include real won and lost examples and exclude unpublishable midnight fixtures", () => {
  const date = "2026-10-27", candidates = Array.from({ length: 100 }, (_, index) => candidate(index, date, index % 5 === 0 ? "incorrect" : "correct"));
  const midnight = candidate(1000, date, "correct"); midnight.selection.kickoffAt = Date.parse(`${date}T00:05:00+03:00`);
  const result = buildDemoSlipSnapshots(date, [...candidates, midnight], now), outcomes = new Map(candidates.map((entry) => [entry.selection.fixtureId, entry.outcome]));
  assert.equal(result.slips.length, 25);
  assert.ok(result.slips[0].selections.every((selection) => outcomes.get(selection.fixtureId) === "correct"));
  assert.ok(result.slips[1].selections.some((selection) => outcomes.get(selection.fixtureId) === "incorrect"));
  assert.ok(result.slips.every((slip) => slip.selections.every((selection) => selection.fixtureId !== midnight.selection.fixtureId)));
  assert.ok(result.slips.every((slip) => slip.selections.every((selection) => selection.forecast.publishedAt <= result.publicationAt &&
    result.publicationAt < getPublicationDeadline(selection.kickoffAt))));
});

test("sparse days publish only complete qualifying slips and duplicate fixtures cannot inflate the set", () => {
  assert.equal(buildDemoSlipSnapshots("2026-10-28", Array.from({ length: 39 }, (_, index) => candidate(index)), now).slips.length, 9);
  const duplicates = Array.from({ length: 80 }, (_, index) => candidate(index % 20));
  const result = buildDemoSlipSnapshots("2026-10-28", duplicates, now);
  assert.equal(result.slips.length, 5);
  const ids = result.slips.flatMap(slip => slip.selections.map(selection => selection.fixtureId));
  assert.equal(new Set(ids).size, ids.length);
  assert.throws(() => buildDemoSlipSnapshots("2026-10-28", Array.from({ length: 3 }, (_, index) => candidate(index)), now), /No complete qualifying/u);
});

test("demo generation shares the one hundred slip capacity and does not require filling it", () => {
  assert.equal(demoSlipRules.count, 100);
  const result = buildDemoSlipSnapshots("2026-10-28", Array.from({ length: 480 }, (_, index) => candidate(index)), now);
  assert.equal(result.slips.length, 100);
  const ids = result.slips.flatMap(slip => slip.selections.map(selection => selection.fixtureId));
  assert.equal(new Set(ids).size, 400);
});

function actualCandidates(date) {
  const labels = { "home-win": "Home", draw: "Draw", "away-win": "Away", "home-or-draw": "Home/Draw", "home-or-away": "Home/Away", "away-or-draw": "Draw/Away",
    "over-2.5": "Over 2.5", "under-2.5": "Under 2.5", yes: "Yes", no: "No" };
  const bets = { "match-result": 1, "double-chance": 12, "total-goals": 5, "both-teams-to-score": 8 };
  return demoFixturesForDate(date, now).flatMap((fixture) => {
    const normalized = normalizeFixture(fixture, { retrievedAt: utcInstantFromEpochMilliseconds(now), endpoint: "/fixtures", verifyRegulationScore: () => true });
    assert.equal(normalized.valid, true);
    if (date === "2026-10-28" && normalized.data.status !== "scheduled") return [];
    const probability = demoFixtureProbabilities(fixture.fixture.id), over = probability.over(2.5);
    const groups = { "match-result": { "home-win": probability.home, draw: probability.draw, "away-win": probability.away },
      "double-chance": { "home-or-draw": probability.home + probability.draw, "home-or-away": probability.home + probability.away, "away-or-draw": probability.away + probability.draw },
      "total-goals": { "over-2.5": over, "under-2.5": 1 - over }, "both-teams-to-score": { yes: probability.btts, no: 1 - probability.btts } };
    const odds = demoFixtureOdds(fixture.fixture.id, now, 8);
    return Object.entries(groups).map(([family, entries]) => {
      const [choice, selectedProbability] = Object.entries(entries).sort((a, b) => b[1] - a[1])[0];
      const quote = odds.bookmakers[0].bets.find((bet) => bet.id === bets[family]).values.find((value) => value.value === labels[choice]).odd;
      const selection = { fixtureId: demoId("fixture", fixture.fixture.id), kickoffAt: fixture.fixture.timestamp * 1000,
        homeTeam: { id: demoId("team", fixture.teams.home.id), name: fixture.teams.home.name },
        awayTeam: { id: demoId("team", fixture.teams.away.id), name: fixture.teams.away.name },
        competition: { id: demoId("competition", fixture.league.id), name: fixture.league.name, country: fixture.league.country, logoUrl: null, countryFlagUrl: null },
        family, selection: choice, probability: selectedProbability, odds: quote, oddsBasis: "bookmaker",
        forecast: { cycleId: demoId("cycle", fixture.fixture.id), revisionId: demoId("revision", fixture.fixture.id),
          publishedAt: Date.parse(`${date}T00:00:00+03:00`) - 43_200_000 + 3_000 } };
      const outcome = settleMarketSelection(family, choice, { status: normalized.data.status, cycleEligibility: { eligible: true },
        regulationScore: normalized.data.regulationScore ? { verified: true, period: "regulation-including-stoppage-time",
          home: normalized.data.regulationScore.home, away: normalized.data.regulationScore.away } : null }).status;
      return { selection, outcome };
    });
  });
}

test("real raw demo prices and forecast probabilities supply more than ten current and diverse historical slips", () => {
  for (const date of ["2026-10-28", "2026-10-27", "2026-10-26"]) {
    const candidates = actualCandidates(date), result = buildDemoSlipSnapshots(date, candidates, now);
    assert.ok(result.slips.length > 10 && result.slips.length <= demoSlipRules.count, date);
    assert.ok(result.slips.every((slip) => !demoSlipQuote(slip.selections).belowMinimum && !demoSlipQuote(slip.selections).aboveMaximum));
    if (date !== "2026-10-28") {
      const outcomes = new Map(candidates.map((candidate) => [`${candidate.selection.fixtureId}:${candidate.selection.family}`, candidate.outcome]));
      assert.ok(result.slips[0].selections.every((selection) => outcomes.get(`${selection.fixtureId}:${selection.family}`) === "correct"));
      assert.ok(result.slips[1].selections.some((selection) => outcomes.get(`${selection.fixtureId}:${selection.family}`) === "incorrect"));
    }
  }
});

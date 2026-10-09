import { parseFixtureSnapshot } from "../../src/domain/fixture-snapshot.ts";
import { marketRules, validateMarketSnapshot } from "../../src/domain/markets.ts";
import { fixture, now } from "./client-state-fixtures.mjs";

export function cardFixture(overrides = {}, source = "ai", outcome = "correct") {
  const base = fixture();
  const accepted = validateMarketSnapshot({
    "match-result": { source, period: marketRules.period, probabilities: { "home-win": 0.54, draw: 0.28, "away-win": 0.18 } },
    "total-goals": { source, period: marketRules.period, line: 2.5, probabilities: { "over-2.5": 0.3, "under-2.5": 0.7 } },
    "both-teams-to-score": { source, period: marketRules.period, probabilities: { yes: 0.45, no: 0.55 } },
  });
  const markets = Object.values(accepted.markets).filter((entry) => entry.available).map(({ market }) => ({
    market, reasons: ["Synthetic fixture explanation only"], uncertainty: null,
    ...(outcome === null ? {} : { outcome: { cycleId: base.cycleId, revisionId: base.forecast.revisionId,
      selection: market.selection, status: outcome === "correct" && ["total-goals", "both-teams-to-score"].includes(market.family)
        ? "incorrect" : outcome, explanation: outcome === "void" ? "Postponed before play; this prediction cycle is void." : null } }),
  }));
  return parseFixtureSnapshot({ ...base, fixtureId: "card-correct", status: "finished-regulation", score: { home: 2, away: 1 },
    homeTeam: { ...base.homeTeam, name: "Example Home FC", logoUrl: "https://static.match-card.test/home.svg" },
    awayTeam: { ...base.awayTeam, name: "Example Away FC", logoUrl: "https://static.match-card.test/away.svg" },
    forecast: { ...base.forecast, publishedAt: now - 12 * 60 * 60 * 1000 + 18 * 60 * 1000, markets }, ...overrides });
}

export function cardExamples() {
  const delayed = cardFixture({ fixtureId: "card-delayed", status: "scheduled", score: null }, "ai", null);
  delayed.forecast.updateDelayed = true;
  const limited = cardFixture({ fixtureId: "card-limited", status: "scheduled", score: null }, "ai", null);
  limited.forecast.markets.forEach((item) => { item.limitedNews = true; });
  const missing = cardFixture({ fixtureId: "card-missing-family" });
  missing.forecast.markets = missing.forecast.markets.filter((item) => ["match-result", "double-chance"].includes(item.market.family));
  const broken = cardFixture({ fixtureId: "card-broken", homeTeam: { id: "broken-home", name: "Missing Logo Home", logoUrl: "https://static.match-card.test/broken-home.svg" },
    awayTeam: { id: "broken-away", name: "Missing Logo Away", logoUrl: "https://static.match-card.test/throttled-away.svg" } });
  return [
    { label: "Example: correct match result, incorrect total goals and BTTS", fixture: cardFixture() },
    { label: "Example: incorrect API-Football fallback", fixture: cardFixture({ fixtureId: "card-incorrect", score: { home: 0, away: 1 } }, "api-football", "incorrect") },
    { label: "Example: live score, pending prediction", fixture: cardFixture({ fixtureId: "card-pending", status: "live", score: { home: 2, away: 0 } }, "ai", null) },
    { label: "Example: void cycle", fixture: cardFixture({ fixtureId: "card-void", status: "postponed", score: null }, "ai", "void") },
    { label: "Example: unavailable forecast, known final score", fixture: cardFixture({ fixtureId: "card-unavailable", forecast: null }) },
    { label: "Example: delayed prediction retains publication time", fixture: delayed },
    { label: "Example: limited news", fixture: limited },
    { label: "Example: partial fixture coverage and fallback", fixture: cardFixture({ fixtureId: "card-partial", partialCoverage: true }, "api-football") },
    { label: "Example: selected family unavailable, another family correct", fixture: missing, selectedFamily: "total-goals" },
    { label: "Example: unknown values and missing logos", fixture: cardFixture({ fixtureId: "card-unknown", homeTeam: { id: "unknown-home", name: null },
      awayTeam: { id: "unknown-away", name: null }, competition: { id: "unknown-league", name: null, country: null },
      kickoffAt: null, forecast: null, score: null, status: "unknown" }) },
    { label: "Example: long names", fixture: cardFixture({ fixtureId: "card-long", homeTeam: { id: "long-home", name: "Example International Football Club With A Very Long Name " + "UnbrokenHomeIdentifier".repeat(9) },
      awayTeam: { id: "long-away", name: "Example Association Sporting Club With A Very Long Name " + "UnbrokenAwayIdentifier".repeat(9) },
      competition: { id: "long-league", name: "Example International Competition " + "LongCompetitionIdentifier".repeat(7), country: null } }) },
    { label: "Example: broken and throttled remote logos", fixture: broken },
  ];
}

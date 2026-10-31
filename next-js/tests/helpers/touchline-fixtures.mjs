// Native component acceptance only. Design sample records never enter production imports.
import { scenarios as accessScenarios, now } from "./paywall-fixtures.mjs";
import { fixtureForReview } from "../../design/match-details-desktop/sample.mjs";
import { validateMarketSnapshot, marketRules } from "../../src/domain/markets.ts";
import { storedMatchInsightsSchema } from "../../src/domain/match-insights.ts";
import { storedMatchDetailResponseSchema } from "../../src/domain/match-detail.ts";

const sample = fixtureForReview(new URLSearchParams({ viewer: "subscriber" }));
const accepted = validateMarketSnapshot(Object.fromEntries(Object.entries({
  "match-result": { "home-win": .46, draw: .27, "away-win": .27 },
  "total-goals": { "over-2.5": .68, "under-2.5": .32 }, "both-teams-to-score": { yes: .74, no: .26 },
}).map(([family, probabilities]) => [family, { source: "ai", period: marketRules.period, probabilities, ...(family === "total-goals" ? { line: 2.5 } : {}) }])));
const teams = { home: { id: "ars", name: "Arsenal", logoUrl: null }, away: { id: "liv", name: "Liverpool", logoUrl: null } };
const grids = { home: ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2", "3:3", "4:1", "4:2", "4:3"],
  away: ["1:1", "2:1", "2:2", "2:3", "2:4", "3:1", "3:2", "4:1", "4:2", "4:3", "5:1"] };
const team = value => value.id === "ars" ? teams.home : teams.away;
const player = (value, side, role, index) => ({ id: index + (side === "home" ? 1 : 101), team: side, name: value.name,
  number: value.number, position: value.position.startsWith("Goal") ? "G" : value.position.includes("back") ? "D" : value.position.includes("fielder") ? "M" : "F",
  grid: role === "starting" ? grids[side][index] : null, role });
const result = (value, index) => ({ fixtureId: `meeting-${index}`, slug: "arsenal-liverpool", kickoffAt: Date.parse(value.date),
  competition: { id: value.competition.replaceAll(" ", "-"), name: value.competition, logoUrl: null },
  home: team(value.home), away: team(value.away), homeGoals: value.homeScore, awayGoals: value.awayScore, status: "finished-regulation" });

export const touchlineScenarios = Object.fromEntries(Object.entries(accessScenarios).map(([name, source]) => {
  const value = structuredClone(source);
  for (const detail of [value.detail, value.prior]) {
    detail.fixture.homeTeam = teams.home; detail.fixture.awayTeam = teams.away;
    detail.fixture.competition = { id: "premier-league", name: "Premier League", country: "England", logoUrl: null };
    if (detail.snapshot) {
      const template = detail.snapshot.markets[0];
      detail.snapshot.markets = Object.values(accepted.markets).map(entry => ({ ...template, market: entry.market,
        alternatives: Object.entries(entry.market.probabilities).filter(([selection]) => selection !== entry.market.selection).map(([selection, probability]) => ({ selection, probability })) }));
      detail.snapshot.unavailableMarkets = [];
      detail.snapshot.analysis.reasons = [{ text: "The verified recent sample shows consistent chance creation by both teams.", sourceUrls: [] },
        { text: "Both formations give the wide players room to advance when possession turns over.", sourceUrls: [] }];
      detail.snapshot.analysis.uncertainty = { text: "Selection changes and a cautious opening could affect the match pattern.", sourceUrls: [] };
    }
    if (detail.fixture.forecast) detail.fixture.forecast.markets = detail.snapshot.markets.map(({ market, reasons, uncertainty }) => ({ market, reasons, uncertainty }));
    detail.fixture.prices = [];
    if (detail.fixture.forecast) detail.fixture.unavailableMarkets = [];
  }
  const sections = value.insights.sections;
  value.insights.home = teams.home; value.insights.away = teams.away;
  sections.h2h.meetings = sample.meetings.map(result);
  for (const [index, side] of ["home", "away"].entries()) {
    const squad = sample.squads[index];
    sections.lineups[side] = { team: side, formation: squad.formation, status: "confirmed", updatedAt: side === "home" ? now : null, retrievedAt: now,
      starters: squad.starters.map((entry, i) => player(entry, side, "starting", i)), substitutes: squad.substitutes.map((entry, i) => player(entry, side, "substitute", i + 20)) };
    sections.form[side] = sample.form[index].records.map((row, i) => ({ fixtureId: `${side}-recent-${i}`, slug: "recent-result", kickoffAt: now - (i + 1) * 7 * 86400000,
      competition: { id: "premier-league", name: "Premier League", logoUrl: null },
      home: row.venue === "H" ? teams[side] : { id: `opponent-${i}`, name: row.opponent, logoUrl: null },
      away: row.venue === "H" ? { id: `opponent-${i}`, name: row.opponent, logoUrl: null } : teams[side],
      homeGoals: row.venue === "H" ? row.scored : row.conceded, awayGoals: row.venue === "H" ? row.conceded : row.scored, status: "finished-regulation" }));
  }
  sections.players.players = Object.values(sections.lineups).flatMap(squad => [...squad.starters, ...squad.substitutes]);
  sections.context.venue = { name: "Emirates Stadium", city: "London", retrievedAt: now };
  sections.context.standings = { home: { rank: 2, points: 23, played: 10, group: "Premier League" }, away: { rank: 3, points: 21, played: 10, group: "Premier League" }, retrievedAt: now };
  sections.referee = { state: "available", name: "Chris Morgan", retrievedAt: now };
  sections.news.items = [{ id: "training", kind: "report", publisher: "Synthetic club report", title: "Both squads complete their final training session", details: [], url: null, publishedAt: now, retrievedAt: now }];
  value.insights = storedMatchInsightsSchema.parse(value.insights);
  value.detail = storedMatchDetailResponseSchema.parse(value.detail); value.prior = storedMatchDetailResponseSchema.parse(value.prior);
  value.feed.records = [value.detail.fixture];
  return [name, value];
}));

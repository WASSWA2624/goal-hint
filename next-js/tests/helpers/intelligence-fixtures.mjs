import { createHash } from "node:crypto";
import { marketRules } from "../../src/domain/markets.ts";

// Every record in this helper is synthetic; none is evidence of prediction quality.
export const INTELLIGENCE_NOW = Date.UTC(2026, 0, 1), INTELLIGENCE_DAY = 86_400_000;
export const intelligenceHash = (value) => createHash("sha256").update(value).digest("hex");
export function intelligenceFixture(overrides = {}) {
  return { fixtureId: "synthetic-target", competitionId: "synthetic-league", homeTeamId: "team-0", awayTeamId: "team-1",
    kickoffAt: INTELLIGENCE_NOW + INTELLIGENCE_DAY, forecastAt: INTELLIGENCE_NOW, ...overrides };
}
export function intelligenceHistory(count = 160) {
  return Array.from({ length: count }, (_, i) => ({ fixtureId: `synthetic-history-${i}`, cycleId: `synthetic-cycle-${i}`,
    competitionId: "synthetic-league", homeTeamId: `team-${i % 8}`, awayTeamId: `team-${(3 * i + 1) % 8}`,
    kickoffAt: INTELLIGENCE_NOW - (count - i + 2) * INTELLIGENCE_DAY,
    availableAt: INTELLIGENCE_NOW - (count - i + 2) * INTELLIGENCE_DAY + 2 * 3_600_000,
    homeGoals: 1 + i % 3, awayGoals: i % 2, period: marketRules.period,
    observationHash: intelligenceHash(`synthetic-result-${i}`), evidenceRef: `synthetic-result-${i}` }));
}
export function intelligenceResult(fixture, overrides = {}) {
  return { fixtureId: fixture.fixtureId, cycleId: `cycle-${fixture.fixtureId}`, competitionId: fixture.competitionId,
    homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, kickoffAt: fixture.kickoffAt,
    availableAt: fixture.kickoffAt + 2 * 3_600_000, homeGoals: 2, awayGoals: 1, period: marketRules.period,
    observationHash: intelligenceHash(`synthetic-result-${fixture.fixtureId}`), evidenceRef: `synthetic-result-${fixture.fixtureId}`, ...overrides };
}

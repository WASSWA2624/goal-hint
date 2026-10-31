import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { SlipCriteria, BuiltSlip } from "@/domain/slip-builder";
import type { SlipBuildPageResult } from "@/domain/slip-page";
import type { SlipMatchWatch } from "@/domain/slip-match-refresh";

export const day = () => getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
const id = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
export function fixtureSlip(index = 0): BuiltSlip {
  const publishedAt = Date.parse("2026-10-31T08:00:00Z");
  return { id: `phone-polling-${index}`, totalOdds: "6.25", oddsBasis: "bookmaker", averageProbability: 0.82,
    selections: [0, 1].map(position => ({ fixtureId: id(index * 2 + position + 1), kickoffAt: publishedAt + 7_200_000,
      homeTeam: { id: id(100 + index * 4 + position * 2), name: position ? "Inter Milan" : "Arsenal" },
      awayTeam: { id: id(101 + index * 4 + position * 2), name: position ? "Napoli" : "Chelsea" },
      competition: { id: `poll-league-${position}`, name: position ? "Serie A" : "Premier League", country: position ? "Italy" : "England" },
      family: "match-result" as const, selection: "home-win" as const, probability: 0.82, odds: "2.50", oddsBasis: "bookmaker" as const,
      forecast: { cycleId: id(200 + index * 2 + position), revisionId: id(300 + index * 2 + position), publishedAt },
    })) };
}
export function fixtureBuild(criteria: SlipCriteria): SlipBuildPageResult {
  const slips = Array.from({ length: Math.min(criteria.slips, 3) }, (_, index) => fixtureSlip(index));
  return { state: "generated", data: { slips, qualifyingMatches: 6, excludedMissingOdds: 0, excludedMissingForecast: 0, searchLimited: false },
    asOf: Date.now(), examined: 6, searchLimited: false, partialCoverage: false, retryAfterSeconds: null };
}
export function viewer(cookie: string | null) {
  const eligible = !cookie?.includes("fixture-polling-viewer=guest");
  return { tier: eligible ? "full" as const : "free" as const, signedIn: eligible, mode: "test" as const };
}
export function observed(selections: readonly SlipMatchWatch[], cookie: string | null) {
  const phase = /fixture-polling-phase=([^;]+)/u.exec(cookie ?? "")?.[1] ?? "scheduled";
  return { asOf: Date.now(), states: selections.map(watch => ({ fixtureId: watch.fixtureId, family: watch.family, selection: watch.selection,
    ...(watch.forecast ? { forecast: watch.forecast } : {}),
    status: phase === "final" ? "finished-regulation" as const : phase === "live" ? "live" as const : "scheduled" as const,
    score: phase === "scheduled" ? null : { home: 1, away: phase === "final" ? 2 : 0 },
    liveClock: phase === "live" ? { phase: "first-half" as const, minute: 30 } : null,
    outcome: phase === "final" ? "incorrect" as const : "pending" as const,
  })) };
}

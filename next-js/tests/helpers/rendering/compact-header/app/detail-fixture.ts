import { matchDetailResponseSchema } from "@/domain/match-detail";
import { publicPolicy } from "@/domain/public-policy";

/** Minimal valid no-forecast projection; all teams and competition are synthetic. */
export const detailFixture = matchDetailResponseSchema.parse({
  fixture: {
    fixtureId: "11111111-1111-4111-8111-111111111111", dataVersion: "1",
    homeTeam: { id: "header-home", name: "Synthetic Home" }, awayTeam: { id: "header-away", name: "Synthetic Away" },
    competition: { id: "header-league", name: "Synthetic League", country: "Uganda" },
    kickoffAt: Date.UTC(2026, 9, 28, 18), syncedAt: Date.UTC(2026, 9, 28, 12),
    status: "scheduled", score: null, cycleId: "header-cycle", forecast: null,
    cycle: { state: "open", mode: "current", ordinal: 1, lockedAt: null, voidReason: null },
    unavailableMarkets: publicPolicy.markets.map((family) => ({ family, reason: "not-published" })),
    update: { prediction: "unavailable", result: "untracked" }, availabilityMessage: null, scorePeriod: null, prices: [],
  },
  asOf: Date.UTC(2026, 9, 28, 12), run: null,
  route: { fixtureId: "11111111-1111-4111-8111-111111111111", slug: "synthetic-home-away", path: "/detail" },
  currentRevisionId: null, selection: "applicable", selectedCycle: null, snapshot: null,
  history: { limit: 1, revisions: { anchor: 0, entries: [], next: null }, cycles: { anchor: 0, entries: [], next: null } },
  access: { tier: "full", signedIn: false },
});

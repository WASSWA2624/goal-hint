// Synthetic visual acceptance data only. Never import these incidents into production.
import { liveMatchSnapshotSchema } from "../../src/domain/live-match.ts";

export const matchEventSamples = [
  { elapsed: 14, team: "home", type: "goal", detail: "Normal Goal", player: "Samuel Okoro", assist: "Oliver James" },
  { elapsed: 26, team: "away", type: "card", detail: "Yellow Card", player: "David Nwosu", comments: "Foul" },
  { elapsed: 38, team: "away", type: "goal", detail: "Normal Goal", player: "Enzo Romano", assist: "Luis Duarte" },
  { elapsed: 45, extra: 2, team: "home", type: "card", detail: "Yellow Card", player: "Ethan Clarke", comments: "Unsporting behaviour" },
  { elapsed: 57, team: "away", type: "var", detail: "Goal cancelled", player: "Jamie Reid", comments: "Offside" },
  { elapsed: 61, team: "home", type: "goal", detail: "Penalty", player: "Lucas Moreau" },
  { elapsed: 68, team: "away", type: "goal", detail: "Missed Penalty", player: "Enzo Romano", comments: "Saved by the goalkeeper" },
  { elapsed: 74, team: "home", type: "substitution", detail: "Substitution 1", player: "Samuel Okoro", assist: "Nico Rossi" },
  { elapsed: 74, team: "away", type: "substitution", detail: "Substitution 1", player: "Enzo Romano", assist: "Aaron Cole" },
  { elapsed: 81, team: "away", type: "card", detail: "Red Card", player: "David Nwosu", comments: "Serious foul play" },
  { elapsed: 86, team: "home", type: "card", detail: "Second Yellow card", player: "Ethan Clarke", comments: "Foul" },
  { elapsed: 88, team: "home", type: "goal", detail: "Own Goal", player: "Isaac Mensah", comments: "Deflection" },
  { elapsed: 90, extra: 3, team: "home", type: "substitution", detail: "Substitution 2", player: "Gabriel Costa", assist: "Jude Ellis" },
  { elapsed: 90, extra: 5, team: "away", type: "card", detail: "Yellow Card", player: "Luis Duarte", comments: "Time wasting" },
  { elapsed: 90, extra: 7, team: "home", type: "var", detail: "Goal cancelled", player: "Jude Ellis", comments: "Offside" },
].map((event, index) => ({ sequence: index + 1, extra: null, assist: null, comments: null, ...event }));

export function sampleMatchObservations(detail) {
  const live = detail.fixture.status === "live";
  const items = live ? [...matchEventSamples.slice(0, 9), { sequence: 10, elapsed: null, extra: null, team: "home", type: "card",
    detail: "Caution review", player: null, assist: null, comments: null }] : matchEventSamples;
  return liveMatchSnapshotSchema.parse({ version: 1, fixtureId: detail.fixture.fixtureId, cycleId: detail.fixture.cycleId,
    kickoffAt: detail.fixture.kickoffAt, status: detail.fixture.status, collectedAt: detail.asOf, staleAfterMs: 300_000,
    statistics: { state: "unavailable", reason: "not-collected", retrievedAt: null, providerUpdatedAt: null, items: [] },
    events: { state: live ? "partial" : "available", reason: live ? "incomplete-response" : null,
      retrievedAt: detail.asOf - 10_000, providerUpdatedAt: null, items } });
}

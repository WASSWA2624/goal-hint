import type { SlipMatchWatch } from "@/domain/slip-match-refresh";
import type { SlipMatchState } from "@/domain/slip-match-state";

export type AutoPhase = "scheduled" | "live" | "halftime" | "finished";
export type AutoMode = "ok" | "unavailable" | "forbidden";
type FixtureControl = {
  phase: AutoPhase; mode: AutoMode; delayMs: number; requests: number; reads: number;
  inFlight: number; maxInFlight: number; batches: number[];
};

/** Shared only by this isolated test application's route handlers. */
const host = globalThis as typeof globalThis & { __desktopSlipAutoFixture?: FixtureControl };
export function autoControl(): FixtureControl {
  return host.__desktopSlipAutoFixture ??= { phase: "scheduled", mode: "ok", delayMs: 0,
    requests: 0, reads: 0, inFlight: 0, maxInFlight: 0, batches: [] };
}

export function autoObservations(selections: readonly SlipMatchWatch[], phase: AutoPhase): readonly SlipMatchState[] {
  return selections.map<SlipMatchState>((selection) => ({ fixtureId: selection.fixtureId, family: selection.family, selection: selection.selection,
    ...(selection.forecast ? { forecast: selection.forecast } : {}),
    status: phase === "scheduled" ? "scheduled" : phase === "finished" ? "finished-regulation" : "live",
    score: phase === "scheduled" ? null : phase === "live" ? { home: 1, away: 0 }
      : phase === "halftime" ? { home: 1, away: 1 } : { home: 2, away: 1 },
    liveClock: phase === "live" ? { phase: "first-half", minute: 30 }
      : phase === "halftime" ? { phase: "half-time", minute: null } : null,
    outcome: phase === "finished" ? "correct" : "pending" }));
}

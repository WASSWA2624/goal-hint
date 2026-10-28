import type { SavedSlipView } from "@/domain/saved-slips";
import { mobileSlipPreview } from "../mobile-slip-review/preview-data";

export const mobileHeaderScenarios = [
  { id: "pending", label: "Pending slip" },
  { id: "won", label: "Won slip" },
  { id: "lost", label: "Lost slip" },
  { id: "void", label: "Void slip" },
  { id: "eight", label: "8 selections" },
  { id: "large-values", label: "Slip 100 · large odds" },
  { id: "long-names", label: "Long team names" },
] as const;

export type MobileHeaderScenario = typeof mobileHeaderScenarios[number]["id"];

/** Review records only. Aggregate outcomes agree with the supplied individual results. */
export function mobileHeaderPreview(scenario: MobileHeaderScenario = "pending") {
  const sample = mobileSlipPreview(scenario === "eight" || scenario === "large-values" ? "eight"
    : scenario === "long-names" ? "long-names" : "standard");
  const slip = scenario === "large-values" ? {
    ...sample.slip,
    selections: sample.slip.selections.map((selection) => ({ ...selection, odds: "4.20" })),
    totalOdds: (4.2 ** sample.slip.selections.length).toFixed(2),
  } : sample.slip;
  const outcome: SavedSlipView["outcome"] = scenario === "won" || scenario === "lost" || scenario === "void" ? scenario : "pending";
  const results: SavedSlipView["results"] | undefined = outcome === "pending" ? undefined
    : slip.selections.map((selection, index) => ({
      fixtureId: selection.fixtureId,
      ...(index === 1 && outcome === "void" ? { home: null, away: null, outcome: "void" as const }
        : index === 1 && outcome === "lost" ? { home: 0, away: 0, outcome: "incorrect" as const }
          : { home: index === 2 ? 1 : 2, away: 1, outcome: "correct" as const }),
    }));
  return { slip, outcome, index: scenario === "large-values" ? 99 : 0, ...(results ? { results } : {}) };
}

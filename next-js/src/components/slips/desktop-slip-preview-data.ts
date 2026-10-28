import type { CompactSlipScenario } from "./compact-slip-preview-data";
import { compactSlipPreview } from "./compact-slip-preview-data";

const crests = ["azure", "red", "green", "ink"] as const;

/** Copies only review records; generic local crests do not change the mobile samples or live data. */
export function desktopSlipPreview(scenario: CompactSlipScenario) {
  const sample = compactSlipPreview(scenario);
  return { ...sample, slip: { ...sample.slip, selections: sample.slip.selections.map((selection, index) => ({
    ...selection,
    homeTeam: { ...selection.homeTeam, logoUrl: `/design/slip-desktop/${crests[index % crests.length]}.svg` },
    awayTeam: { ...selection.awayTeam, logoUrl: `/design/slip-desktop/${crests[(index + 1) % crests.length]}.svg` },
    competition: { ...selection.competition, logoUrl: "/design/slip-desktop/league.svg" },
  })) } };
}

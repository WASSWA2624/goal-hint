import { compactSlipPreview, type CompactSlipScenario } from "../compact-slip-preview-data";

const crests = ["azure", "red", "green", "ink"] as const;

/** Illustrative records and generic bundled crests; no live providers or private selections. */
export function mobileSlipPreview(scenario: CompactSlipScenario = "standard") {
  const sample = compactSlipPreview(scenario);
  return { ...sample, slip: { ...sample.slip, selections: sample.slip.selections.map((selection, index) => ({
    ...selection,
    homeTeam: { ...selection.homeTeam, logoUrl: `/design/slip-desktop/${crests[index % crests.length]}.svg` },
    awayTeam: { ...selection.awayTeam, logoUrl: `/design/slip-desktop/${crests[(index + 1) % crests.length]}.svg` },
    competition: { ...selection.competition, logoUrl: "/design/slip-desktop/league.svg" },
  })) } };
}

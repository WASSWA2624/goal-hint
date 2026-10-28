/** Every one-line candidate shares the approved header; only match-row presentation differs. */
export const desktopSlipDesigns = [
  { id: "balanced-ledger", name: "Balanced ledger", description: "A continuous match line with balanced space for every field." },
  { id: "inline-columns", name: "Inline columns", description: "Aligned cells and fine dividers make the same facts easy to compare." },
  { id: "fixture-priority", name: "Fixture priority", description: "More room for the two team names, with a quiet fixture divider." },
  { id: "market-panel", name: "Market panel", description: "A compact market panel highlights the prediction beside the fixture." },
  { id: "odds-anchor", name: "Odds anchor", description: "A restrained price block anchors the odds without stretching the row." },
  { id: "probability-anchor", name: "Probability anchor", description: "A narrow accent rail makes each match probability easy to scan." },
  { id: "country-rail", name: "Country rail", description: "More space for country and league information before the teams." },
  { id: "alternating-lines", name: "Alternating lines", description: "Alternating flat backgrounds help follow longer slips at a compact height." },
  { id: "subtle-dividers", name: "Subtle dividers", description: "Quiet separators group competition, fixture and prediction information." },
  { id: "minimal-line", name: "Minimal line", description: "The tightest spacing and light numerical emphasis keep the line unobtrusive." },
] as const;

export type DesktopSlipVariant = typeof desktopSlipDesigns[number]["id"];

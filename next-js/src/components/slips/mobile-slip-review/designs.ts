/** Every candidate keeps the same mobile information order; only presentation varies. */
export const mobileSlipDesigns = [
  { id: "clean-ledger", name: "Clean ledger", description: "Three quiet lines with a balanced fixture and compact inline figures." },
  { id: "fixture-rule", name: "Fixture rule", description: "A fine rule under the teams gives the match a distinct middle line." },
  { id: "accent-edge", name: "Accent edge", description: "A narrow blue edge marks each match without adding vertical space." },
  { id: "market-band", name: "Market band", description: "A tinted bottom strip groups the market, pick, odds and probability." },
  { id: "four-cells", name: "Four cells", description: "Four equal cells place small labels above their values for easy comparison." },
  { id: "odds-focus", name: "Odds focus", description: "An outlined odds cell gives the price a clear anchor on the bottom line." },
  { id: "probability-focus", name: "Probability focus", description: "A blue probability cell makes each match forecast easy to find." },
  { id: "ticket-lines", name: "Ticket lines", description: "Dashed separators and tabular figures give the slip a compact ticket style." },
  { id: "alternating-rows", name: "Alternating rows", description: "Alternating match backgrounds help the eye follow longer slips." },
  { id: "minimal-type", name: "Minimal type", description: "A left-aligned fixture and restrained typography keep the rows especially light." },
] as const;

export type MobileSlipVariant = typeof mobileSlipDesigns[number]["id"];

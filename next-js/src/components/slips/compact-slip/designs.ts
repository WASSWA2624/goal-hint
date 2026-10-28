/** Stable identifiers keep comparison links and a future shared display preference independent of labels. */
export const compactSlipDesigns = [
  { id: "inline-ledger", name: "Inline ledger", description: "A quiet two-line summary with fixture and prediction information on aligned rows." },
  { id: "split-rail", name: "Split rail", description: "Slip identity stays on the left; odds, average and match predictions occupy a separate right rail." },
  { id: "odds-anchor", name: "Odds anchor", description: "A prominent odds column anchors both the slip total and each individual selection." },
  { id: "ticket-strip", name: "Ticket strip", description: "Numbered fixture strips and inline facts give the slip the rhythm of a compact ticket." },
  { id: "compact-grid", name: "Compact grid", description: "Three clearly divided summary cells and a small prediction grid make values easy to compare." },
  { id: "pick-first", name: "Pick first", description: "The selected outcome leads each match, followed by teams and supporting facts." },
  { id: "fixture-ledger", name: "Fixture ledger", description: "Stacked home and away names sit beside aligned odds and probability columns." },
  { id: "probability-rail", name: "Probability rail", description: "Average match probability leads the summary; individual probabilities align down the match rail." },
  { id: "timeline", name: "Kickoff timeline", description: "Kickoff times form a left-hand timeline while fixture and prediction details flow beside it." },
  { id: "paired-lines", name: "Paired lines", description: "Fixture and price share the first line; competition, prediction and probability form the following lines." },
] as const;

export type CompactSlipVariant = typeof compactSlipDesigns[number]["id"] | "clean-ledger";

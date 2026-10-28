/** Desktop candidates keep stable IDs while sharing the original slip disclosure and snapshot fields. */
export const desktopSlipDesigns = [
  { id: "balanced-ledger", name: "Balanced ledger", description: "A light header with evenly spaced facts and a wide fixture column." },
  { id: "metric-columns", name: "Metric columns", description: "Aligned metric cells make the same values easy to scan across a list of slips." },
  { id: "odds-dock", name: "Odds dock", description: "A distinct total-odds block and a stronger price column give the numbers a clear anchor." },
  { id: "prediction-focus", name: "Prediction focus", description: "A compact market panel separates the selected outcome from the fixture and price." },
  { id: "probability-focus", name: "Probability focus", description: "The average and individual probabilities share a clear visual emphasis." },
  { id: "ticket-gutter", name: "Ticket gutter", description: "A slim numbered gutter connects each selection to the slip while facts stay inline." },
  { id: "banded-register", name: "Banded register", description: "Alternating flat rows and a quiet metadata line keep longer slips easy to follow." },
  { id: "club-centre", name: "Club centre", description: "A centred fixture column and evenly divided metrics give each row a balanced rhythm." },
  { id: "rail-divider", name: "Rail divider", description: "Thin vertical rules separate fixture, prediction and numeric columns without extra boxes." },
  { id: "minimal-line", name: "Minimal line", description: "Fine horizontal rules and tighter spacing create the smallest visual footprint." },
] as const;

export type DesktopSlipVariant = typeof desktopSlipDesigns[number]["id"];

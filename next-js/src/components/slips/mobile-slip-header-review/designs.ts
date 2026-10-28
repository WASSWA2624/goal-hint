/** Stable review identifiers; no candidate changes the selected production header. */
export const mobileSlipHeaderDesigns = [
  { id: "plain-ledger", name: "Plain ledger", description: "Short inline labels and balanced spacing keep the five facts on one line." },
  { id: "vertical-rules", name: "Vertical rules", description: "Fine separators give the odds, average, picks and status distinct columns." },
  { id: "icon-labels", name: "Icon labels", description: "Small symbols replace longer labels while the figures and status stay explicit." },
  { id: "outlined-facts", name: "Outlined facts", description: "Square outlined metric cells distinguish each figure without adding another row." },
  { id: "number-tab", name: "Number tab", description: "A solid slip-number tab anchors the header, followed by quiet inline figures." },
  { id: "outcome-endcap", name: "Outcome endcap", description: "A flat status block at the right makes Won, Lost and Pending easy to scan." },
  { id: "aligned-tracks", name: "Aligned tracks", description: "Right-aligned numeric tracks give the odds and average a consistent rhythm." },
  { id: "probability-line", name: "Probability line", description: "A thin underline marks the average probability while preserving the single baseline." },
  { id: "ticket-dividers", name: "Ticket dividers", description: "Dashed rules and tabular type give the header the feel of a compact ticket." },
  { id: "minimal-notation", name: "Minimal notation", description: "Slip number, multiplier, average, pick count and abbreviated status use minimal notation." },
] as const;

export type MobileSlipHeaderVariant = typeof mobileSlipHeaderDesigns[number]["id"];

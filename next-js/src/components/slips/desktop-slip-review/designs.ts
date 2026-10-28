/** Desktop-only status concepts share the approved header, field order and fixed team anchors. */
export const desktopSlipDesigns = [
  { id: "aligned-ledger", name: "Aligned ledger", description: "Quiet dividers, a clock above the score, and a simple status label." },
  { id: "score-box", name: "Score box", description: "A small square score panel keeps the result prominent between aligned crests." },
  { id: "inline-clock", name: "Inline clock", description: "Elapsed time sits beside a fixed score anchor, leaving the match line open." },
  { id: "status-rail", name: "Status rail", description: "A narrow outcome-coloured rail marks the equal-width final status cells." },
  { id: "split-status", name: "Split status", description: "Match state and selection outcome occupy two clear, equal status slots." },
  { id: "quiet-bands", name: "Quiet bands", description: "Alternating flat rows help follow long slips without adding vertical space." },
  { id: "live-highlight", name: "Live highlight", description: "Live scores and clocks receive a restrained accent; completed results stay calm." },
  { id: "match-bracket", name: "Match bracket", description: "Fine brackets frame the fixed score column between the two aligned team crests." },
  { id: "outcome-block", name: "Outcome block", description: "A compact, flat colour block makes pending, won and lost selections easy to scan." },
  { id: "fine-grid", name: "Fine grid", description: "Light column rules give every match the same precise, compact reading rhythm." },
] as const;

export type DesktopSlipVariant = typeof desktopSlipDesigns[number]["id"];

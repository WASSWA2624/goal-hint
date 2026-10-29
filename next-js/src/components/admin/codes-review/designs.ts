/** Every study keeps the same shared Codes workspace and validated form. */
export const codeDesigns = [
  { id: "01", variant: "balanced", name: "Balanced", description: "A calm two-column form with account and access details in balance." },
  { id: "02", variant: "ledger", name: "Form ledger", description: "Aligned sections and fine rules make each access decision easy to scan." },
  { id: "03", variant: "framed", name: "Framed sections", description: "White section panels distinguish the account, duration and required reason." },
  { id: "04", variant: "guided", name: "Guided grant", description: "Three numbered steps lead from the subscriber to the reason for access." },
  { id: "05", variant: "side-notes", name: "Side notes", description: "A clear main column pairs account details with a quieter reason column." },
  { id: "06", variant: "compact", name: "Compact desk", description: "A denser working form leaves more records and controls visible at once." },
  { id: "07", variant: "spacious", name: "Open canvas", description: "Generous separation gives each field room within the familiar workspace." },
  { id: "08", variant: "accent", name: "Accent rail", description: "A restrained brand-colored rail connects the form and selected record." },
  { id: "09", variant: "horizontal", name: "Horizontal rhythm", description: "Full-width account details sit above a clear row for access terms." },
  { id: "10", variant: "quiet", name: "Quiet sheet", description: "One centered document-like sheet with minimal visual furniture." },
] as const;

export type CodeDesign = (typeof codeDesigns)[number];

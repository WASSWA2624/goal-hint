/** Stable review identifiers; no candidate changes the selected production header. */
export const mobileSlipHeaderDesigns = [
  { id: "fine-rules", name: "Fine rules", description: "32px · Fine, full-height dividers and compact inline labels." },
  { id: "continuous-rules", name: "Continuous rules", description: "30px · Continuous separators in a shorter, tightly spaced strip." },
  { id: "inset-rules", name: "Inset rules", description: "32px · Short inset separators keep the fixed columns light." },
  { id: "strong-rules", name: "Strong rules", description: "32px · Darker one-pixel rules make the column boundaries clearer." },
  { id: "status-cell", name: "Status cell", description: "32px · A tinted status cell keeps exactly the same width for every outcome." },
  { id: "metric-cells", name: "Metric cells", description: "32px · Quiet metric fills separate the figures while retaining aligned rules." },
  { id: "centered-columns", name: "Centered columns", description: "32px · Centered labels and figures inside the same fixed tracks." },
  { id: "right-aligned", name: "Right-aligned figures", description: "30px · Numeric groups align to the right of their fixed columns." },
  { id: "minimal-rules", name: "Minimal rules", description: "28px · The shortest header, with restrained type and quiet separators." },
  { id: "bold-identity", name: "Bold slip number", description: "34px · A stronger slip number leads the same aligned columns." },
] as const;

export type MobileSlipHeaderVariant = typeof mobileSlipHeaderDesigns[number]["id"];

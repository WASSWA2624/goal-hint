import type { AccentName } from "@/styles/theme";

/** Presentation recipes, shared by the gallery and the reusable desktop header skin. */
export const designs = [
  { id: "blue-signal", name: "Blue Signal", accent: "blue", treatment: "rail", surface: "neutral", description: "Crisp white slips, a blue identity rail and quiet numeric emphasis." },
  { id: "emerald-ledger", name: "Emerald Ledger", accent: "emerald", treatment: "wash", surface: "neutral", description: "Soft emerald headers with strong labels and calm, consistent separators." },
  { id: "indigo-rule", name: "Indigo Rule", accent: "violet", treatment: "rule", surface: "neutral", description: "An editorial lower rule, restrained violet values and neutral surfaces." },
  { id: "amber-paper", name: "Amber Paper", accent: "amber", treatment: "rail", surface: "warm", description: "Warm paper tones, an amber edge and dark, readable numbers." },
  { id: "graphite", name: "Graphite", accent: "blue", treatment: "mono", surface: "neutral", description: "Minimal neutral headers; result colors carry the semantic emphasis." },
  { id: "teal-stripes", name: "Teal Stripes", accent: "teal", treatment: "stripe", surface: "neutral", description: "Alternating quiet surfaces help the eye follow a long list of slips." },
  { id: "violet-outline", name: "Violet Outline", accent: "violet", treatment: "outline", surface: "neutral", description: "Fine violet boundaries and a soft identity highlight, without extra height." },
  { id: "navy-focus", name: "Navy Focus", accent: "blue", treatment: "rail", surface: "navy", description: "Deep navy collapsed headers with bright facts and separate result badges." },
  { id: "copper-rule", name: "Copper Rule", accent: "orange", treatment: "rule", surface: "warm", description: "A warm copper rule and paper surfaces give the page a considered rhythm." },
  { id: "midnight-teal", name: "Midnight Teal", accent: "teal", treatment: "wash", surface: "midnight", description: "Dark teal headers, luminous values and clear, high contrast labels." },
] as const satisfies readonly { id: string; name: string; accent: AccentName; treatment: string; surface: string; description: string }[];

export type DesktopSlipDesign = typeof designs[number];

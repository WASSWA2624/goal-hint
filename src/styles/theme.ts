import brandTokens from "../../assets/brand/brand-tokens.json";
import type { MarketFamily } from "../domain/markets";

export type OutcomeTone = "correct" | "incorrect" | "pending" | "void" | "unavailable";

type OutcomeColors = Readonly<{
  text: string;
  background: string;
  border: string;
}>;

/** Solid fills carry white text at 4.5:1 or better; soft fills pair with `text`. */
type AccentColors = Readonly<{
  solid: string;
  soft: string;
  text: string;
}>;

/** Semantic fields can support another theme without changing component contracts. */
export interface GoalHintTheme {
  readonly color: {
    readonly text: string;
    readonly mutedText: string;
    readonly page: string;
    readonly surface: string;
    readonly surfaceMuted: string;
    readonly border: string;
    readonly controlBorder: string;
    readonly brand: string;
    readonly brandHover: string;
    readonly onBrand: string;
    readonly focus: string;
    readonly disabledText: string;
    readonly disabledSurface: string;
    readonly outcome: Readonly<Record<OutcomeTone, OutcomeColors>>;
    readonly market: Readonly<Record<MarketFamily, AccentColors>>;
    readonly live: AccentColors;
    readonly cardHeader: string;
    readonly rowHover: string;
  };
  readonly typography: {
    readonly family: string;
    readonly size: {
      readonly body: string;
      readonly small: string;
      readonly h1: string;
      readonly h2: string;
      readonly h3: string;
    };
    readonly weight: {
      readonly body: number;
      readonly medium: number;
      readonly bold: number;
    };
    readonly lineHeight: {
      readonly body: number;
      readonly heading: number;
    };
  };
  readonly space: {
    readonly xs: string;
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
    readonly "2xl": string;
  };
  readonly breakpoint: {
    readonly sm: string;
    readonly md: string;
    readonly lg: string;
  };
  readonly border: {
    readonly width: string;
    readonly radius: string;
    readonly cardRadius: string;
    readonly pillRadius: string;
    readonly focusWidth: string;
    readonly focusOffset: string;
  };
  readonly layout: {
    readonly maxWidth: string;
    readonly gutter: string;
  };
  readonly control: {
    readonly minHeight: string;
  };
  readonly shadow: {
    readonly card: string;
    readonly cardHover: string;
  };
}

export const lightTheme: GoalHintTheme = {
  color: {
    text: brandTokens.colors.navy,
    mutedText: brandTokens.colors.muted,
    page: brandTokens.colors.paper,
    surface: brandTokens.colors.white,
    surfaceMuted: "#EAF0F2",
    // Brand dividers are decorative; controls need a stronger accessible boundary.
    border: brandTokens.colors.border,
    controlBorder: "#7C8A95",
    brand: brandTokens.colors.teal,
    brandHover: "#00645F",
    onBrand: brandTokens.colors.white,
    focus: brandTokens.colors.navy,
    disabledText: brandTokens.colors.muted,
    disabledSurface: "#EAF0F2",
    // Outcome meanings stay separate from the teal brand accent.
    outcome: {
      correct: { text: "#175A2F", background: "#EDF7EF", border: "#175A2F" },
      incorrect: { text: "#9C2328", background: "#FFF0F1", border: "#9C2328" },
      pending: { text: "#515C6B", background: "#F0F3F6", border: "#515C6B" },
      void: { text: "#515C6B", background: "#F0F3F6", border: "#515C6B" },
      unavailable: { text: "#515C6B", background: "#F0F3F6", border: "#515C6B" },
    },
    // Each market family keeps one hue on every card, row and filter state.
    market: {
      "match-result": { solid: "#15803D", soft: "#EAF6EE", text: "#14532D" },
      "double-chance": { solid: "#6D28D9", soft: "#F1EBFD", text: "#4C1D95" },
      "total-goals": { solid: "#1D4ED8", soft: "#EAF0FD", text: "#1E3A8A" },
      "both-teams-to-score": { solid: "#C2410C", soft: "#FFF1E8", text: "#9A3412" },
    },
    live: { solid: "#C81E1E", soft: "#FDECEC", text: "#9B1C1C" },
    cardHeader: "#F6F8FA",
    rowHover: "#F3F7F8",
  },
  typography: {
    family: "var(--font-manrope), Arial, sans-serif",
    size: { body: "1rem", small: "0.875rem", h1: "2rem", h2: "1.5rem", h3: "1.125rem" },
    weight: {
      body: brandTokens.typography.bodyWeight,
      medium: 600,
      bold: brandTokens.typography.headingWeight,
    },
    lineHeight: { body: 1.6, heading: 1.25 },
  },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px", "2xl": "48px" },
  breakpoint: { sm: "30rem", md: "48rem", lg: "64rem" },
  border: {
    width: "1px",
    radius: brandTokens.shape.componentRadius,
    cardRadius: "16px",
    pillRadius: "999px",
    focusWidth: "3px",
    focusOffset: "3px",
  },
  layout: { maxWidth: "72rem", gutter: "16px" },
  control: { minHeight: "2.75rem" },
  shadow: {
    card: "0 1px 2px rgb(11 31 51 / 6%), 0 6px 20px rgb(11 31 51 / 6%)",
    cardHover: "0 2px 4px rgb(11 31 51 / 8%), 0 10px 28px rgb(11 31 51 / 10%)",
  },
};

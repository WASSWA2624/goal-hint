import brandTokens from "../../assets/brand/brand-tokens.json";
import type { MarketFamily } from "../domain/markets";

export type OutcomeTone = "correct" | "incorrect" | "pending" | "void" | "unavailable";

type OutcomeColors = Readonly<{
  text: string;
  background: string;
  border: string;
}>;

/** Solid fills carry white text at 4.5:1 or better; soft fills pair with `text`. */
export type AccentColors = Readonly<{
  solid: string;
  soft: string;
  text: string;
  /** Large-text fills (bold 18.66px+): both stops keep white text at 3:1 or better. */
  gradient: string;
}>;
export type AccentName = "teal" | "blue" | "violet" | "orange" | "pink" | "amber" | "emerald" | "red";

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
    /** Selected chips and segments on light surfaces; pairs with `brand` text. */
    readonly brandSoft: string;
    readonly onBrand: string;
    readonly focus: string;
    readonly disabledText: string;
    readonly disabledSurface: string;
    readonly outcome: Readonly<Record<OutcomeTone, OutcomeColors>>;
    readonly market: Readonly<Record<MarketFamily, AccentColors>>;
    readonly live: AccentColors;
    /** Decorative and selection hues; every soft/text pair passes 4.5:1. */
    readonly accent: Readonly<Record<AccentName, AccentColors>>;
    readonly cardHeader: string;
    readonly rowHover: string;
  };
  readonly gradient: {
    /** Primary actions and current selections; white text passes 4.5:1 at both stops. */
    readonly action: string;
    readonly tableHeader: string;
    /** Thin decorative edge on feature panels. */
    readonly edge: string;
    readonly page: string;
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
    readonly xl: string;
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
    readonly wideMaxWidth: string;
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
    brandSoft: "#E2F3F1",
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
      "match-result": { solid: "#15803D", soft: "#E3F6E9", text: "#14532D", gradient: "linear-gradient(135deg, #15803D 0%, #0D9488 100%)" },
      "double-chance": { solid: "#7C3AED", soft: "#EFE7FF", text: "#5B21B6", gradient: "linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)" },
      "total-goals": { solid: "#2563EB", soft: "#E3ECFF", text: "#1E40AF", gradient: "linear-gradient(135deg, #2563EB 0%, #0891B2 100%)" },
      "both-teams-to-score": { solid: "#C2410C", soft: "#FFEDD5", text: "#9A3412", gradient: "linear-gradient(135deg, #EA580C 0%, #DB2777 100%)" },
    },
    live: { solid: "#DC2626", soft: "#FEE2E2", text: "#991B1B", gradient: "linear-gradient(135deg, #DC2626 0%, #DB2777 100%)" },
    accent: {
      teal: { solid: "#0F766E", soft: "#D5F5EF", text: "#115E59", gradient: "linear-gradient(135deg, #0F766E 0%, #0891B2 100%)" },
      blue: { solid: "#2563EB", soft: "#E0EAFF", text: "#1E40AF", gradient: "linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)" },
      violet: { solid: "#7C3AED", soft: "#EDE4FF", text: "#5B21B6", gradient: "linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)" },
      orange: { solid: "#C2410C", soft: "#FFE8D6", text: "#9A3412", gradient: "linear-gradient(135deg, #EA580C 0%, #D97706 100%)" },
      pink: { solid: "#BE185D", soft: "#FCE4F1", text: "#9D174D", gradient: "linear-gradient(135deg, #DB2777 0%, #9333EA 100%)" },
      amber: { solid: "#B45309", soft: "#FEF0C7", text: "#92400E", gradient: "linear-gradient(135deg, #D97706 0%, #EA580C 100%)" },
      emerald: { solid: "#047857", soft: "#D1FAE5", text: "#065F46", gradient: "linear-gradient(135deg, #059669 0%, #0D9488 100%)" },
      red: { solid: "#DC2626", soft: "#FEE2E2", text: "#991B1B", gradient: "linear-gradient(135deg, #DC2626 0%, #DB2777 100%)" },
    },
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
  breakpoint: { sm: "30rem", md: "48rem", lg: "64rem", xl: "80rem" },
  border: {
    width: "1px",
    radius: brandTokens.shape.componentRadius,
    cardRadius: "4px",
    pillRadius: "999px",
    focusWidth: "3px",
    focusOffset: "3px",
  },
  layout: { maxWidth: "72rem", wideMaxWidth: "100rem", gutter: "16px" },
  control: { minHeight: "2.75rem" },
  gradient: {
    action: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    tableHeader: "linear-gradient(90deg, #0B1F33 0%, #172F63 55%, #0F5E6E 100%)",
    edge: "linear-gradient(90deg, #0F766E 0%, #2563EB 30%, #7C3AED 55%, #DB2777 78%, #F59E0B 100%)",
    page: "radial-gradient(70rem 26rem at 0% -6rem, #DDF3FF 0%, rgb(221 243 255 / 0%) 70%), radial-gradient(60rem 24rem at 100% -4rem, #F1E7FF 0%, rgb(241 231 255 / 0%) 70%), #F4F7FA",
  },
  shadow: {
    card: "0 1px 2px rgb(11 31 51 / 6%), 0 6px 20px rgb(11 31 51 / 6%)",
    cardHover: "0 2px 4px rgb(11 31 51 / 8%), 0 10px 28px rgb(11 31 51 / 10%)",
  },
};

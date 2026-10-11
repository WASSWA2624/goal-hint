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
/**
 * Market family hues, stricter than AccentColors so every field can carry small text (12px labels and pills).
 * tests/market-colors.test.mjs checks each pairing at 4.5:1.
 */
export type MarketColors = Readonly<{
  /** White text keeps 4.5:1 or better. */
  solid: string;
  /** Clean tint behind `text`; the pick box washes it into white. */
  soft: string;
  /** Keeps 4.5:1 or better on `soft` and on white. */
  text: string;
  /** Small-text fills: white text keeps 4.5:1 or better at both stops, so 12px pick pills may sit on it. */
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
    readonly market: Readonly<Record<MarketFamily, MarketColors>>;
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
  /**
   * The branded top bar: the desktop shell header and every phone top bar (shell, feed, match details)
   * share one deep navy-to-teal fill behind the inverse logo. Light text passes 4.5:1 on every stop,
   * including on the translucent control fills; `accent` (inverse teal) passes 3:1 for indicators and focus.
   */
  readonly header: {
    readonly background: string;
    /** Primary text and icons on the bar. */
    readonly text: string;
    /** Resting navigation links: 6.7:1 or better on every stop. */
    readonly mutedText: string;
    /** Search placeholder: 4.5:1 on the field fill at rest and when focused. */
    readonly placeholder: string;
    /** Current-page indicator, focus ring and open-state fills on the bar. */
    readonly accent: string;
    /** Text and icons on an `accent` fill. */
    readonly onAccent: string;
    /** Round icon buttons; `controlHover` keeps white icons at 4.5:1. */
    readonly controlFill: string;
    readonly controlHover: string;
    /** The search pill; `fieldFillActive` on hover and focus. */
    readonly fieldFill: string;
    readonly fieldFillActive: string;
    readonly controlBorder: string;
    /** Light section-icon tints on the bar: 3:1 or better on every stop. */
    readonly tone: Readonly<Record<AccentName, string>>;
    /** Phone top bars: feed brand bar, content-page header and match-details bar. */
    readonly phoneHeight: string;
    readonly shadow: string;
  };
  readonly typography: {
    readonly family: string;
    /** Desktop (lg and up) sizes. */
    readonly size: {
      readonly body: string;
      readonly small: string;
      readonly h1: string;
      readonly h2: string;
      readonly h3: string;
    };
    /** Compact phone-first scale; base styles use it and widen at `breakpoint.md`/`lg`. */
    readonly scale: {
      /** 10px: badges, chips and counters; the floor for meaningful text. */
      readonly micro: string;
      /** 11px: captions, meta lines and field labels in dense rows. */
      readonly caption: string;
      /** 12px: secondary text, hints and muted notes. */
      readonly secondary: string;
      /** 13px: phone body, control labels and team names. */
      readonly body: string;
      /** 14px: emphasized card titles. */
      readonly emphasis: string;
      /** 16px: section headings. */
      readonly section: string;
      /** 18px: page titles. */
      readonly title: string;
      /** 20px: hero figures such as the detail score. */
      readonly hero: string;
    };
    readonly weight: {
      readonly body: number;
      readonly medium: number;
      readonly bold: number;
      readonly heavy: number;
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
    /** Desktop (lg and up) control height. */
    readonly minHeight: string;
    /** Phone and tablet control height; still above the 24px WCAG 2.5.8 target. */
    readonly compactHeight: string;
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
    // Each market family keeps one hue on every card, row and filter state: match result emerald, double chance
    // violet, total goals blue, both teams to score orange. Clean tints sit at one lightness (OKLCH L ≈ 0.95). See
    // MarketColors: `text` keeps 4.5:1 on `soft` and on white, and white keeps 4.5:1 on `solid` and on BOTH gradient
    // stops, so market gradients may sit behind small text. Match result is the lightest, most vivid emerald that
    // still holds white text (#00824A: OKLCH L 0.533, C 0.131; white 4.89:1, 4.61:1 under the tile press tint), and its
    // gradient turns toward fresh green (#07802F, C 0.152; white 5.08:1) instead of fading into the brand teal.
    market: {
      "match-result": { solid: "#00824A", soft: "#DBF9E7", text: "#00603B", gradient: "linear-gradient(135deg, #00824A 0%, #07802F 100%)" },
      "double-chance": { solid: "#7C3AED", soft: "#EFE9FF", text: "#5B21B6", gradient: "linear-gradient(135deg, #7C3AED 0%, #A21CAF 100%)" },
      "total-goals": { solid: "#2563EB", soft: "#E3EDFF", text: "#1E40AF", gradient: "linear-gradient(135deg, #2563EB 0%, #0369A1 100%)" },
      "both-teams-to-score": { solid: "#C2410C", soft: "#FFEADB", text: "#9A3412", gradient: "linear-gradient(135deg, #C2410C 0%, #BE185D 100%)" },
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
    scale: {
      micro: "0.625rem",
      caption: "0.6875rem",
      secondary: "0.75rem",
      body: "0.8125rem",
      emphasis: "0.875rem",
      section: "1rem",
      title: "1.125rem",
      hero: "1.25rem",
    },
    weight: {
      body: brandTokens.typography.bodyWeight,
      medium: 600,
      bold: brandTokens.typography.headingWeight,
      heavy: 800,
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
  control: { minHeight: "2.75rem", compactHeight: "2.25rem" },
  gradient: {
    action: "linear-gradient(135deg, #0F766E 0%, #2563EB 100%)",
    tableHeader: "linear-gradient(90deg, #0B1F33 0%, #172F63 55%, #0F5E6E 100%)",
    edge: "linear-gradient(90deg, #0F766E 0%, #2563EB 30%, #7C3AED 55%, #DB2777 78%, #F59E0B 100%)",
    page: "radial-gradient(70rem 26rem at 0% -6rem, #DDF3FF 0%, rgb(221 243 255 / 0%) 70%), radial-gradient(60rem 24rem at 100% -4rem, #F1E7FF 0%, rgb(241 231 255 / 0%) 70%), #F4F7FA",
  },
  // Worst case is the teal stop: white 9.15:1, links 6.72:1, placeholder 4.55:1 on the focused field,
  // white icons 5.08:1 on controlHover, accent 5.03:1; navy on accent 9.18:1.
  header: {
    background: `linear-gradient(90deg, ${brandTokens.colors.navy} 0%, #12294F 55%, #0C4F5E 100%)`,
    text: brandTokens.colors.white,
    mutedText: "rgb(255 255 255 / 82%)",
    placeholder: "rgb(255 255 255 / 78%)",
    accent: brandTokens.colors.tealOnDark,
    onAccent: brandTokens.colors.navy,
    controlFill: "rgb(255 255 255 / 14%)",
    controlHover: "rgb(255 255 255 / 22%)",
    fieldFill: "rgb(255 255 255 / 10%)",
    fieldFillActive: "rgb(255 255 255 / 14%)",
    controlBorder: "rgb(255 255 255 / 22%)",
    tone: {
      teal: "#5EEAD4", blue: "#93C5FD", violet: "#C4B5FD", orange: "#FDBA74",
      pink: "#F9A8D4", amber: "#FCD34D", emerald: "#6EE7B7", red: "#FCA5A5",
    },
    phoneHeight: "3.25rem",
    shadow: "0 4px 18px rgb(11 31 51 / 16%)",
  },
  shadow: {
    card: "0 1px 2px rgb(11 31 51 / 6%), 0 6px 20px rgb(11 31 51 / 6%)",
    cardHover: "0 2px 4px rgb(11 31 51 / 8%), 0 10px 28px rgb(11 31 51 / 10%)",
  },
};

/**
 * Static media queries for styled rules. Plain strings keep a rule static, so styled-components
 * does not re-flatten it per render the way a `${({ theme }) => …}` breakpoint lookup does.
 */
export const media = {
  /** Phones and tablets: the compact tile layouts below the desktop table. */
  belowDesktop: "@media (max-width: 63.99rem)",
  tablet: `@media (min-width: ${lightTheme.breakpoint.md})`,
  desktop: `@media (min-width: ${lightTheme.breakpoint.lg})`,
  wide: `@media (min-width: ${lightTheme.breakpoint.xl})`,
  /** Hover feedback only where a pointer can hover, so taps do not leave a stuck state. */
  hover: "@media (hover: hover)",
} as const;

import brandTokens from "../../assets/brand/brand-tokens.json";
import type { MarketFamily } from "../domain/markets";

export type OutcomeTone = "correct" | "incorrect" | "pending" | "void" | "unavailable";
export type VerdictTone = "upcoming" | "pending" | "correct" | "incorrect" | "void";

type OutcomeColors = Readonly<{
  text: string;
  background: string;
  border: string;
}>;

/** Solid fills pair with `onBrand`; soft fills pair with `text`. */
export type AccentColors = Readonly<{
  solid: string;
  soft: string;
  text: string;
  /** A solid fill or a decorative gradient, depending on the theme. */
  gradient: string;
}>;
/**
 * Market family hues, stricter than AccentColors so every field can carry small text (12px labels and pills).
 * tests/market-colors.test.mjs checks each pairing at 4.5:1.
 */
export type MarketColors = Readonly<{
  /** Pairs with the theme's `onBrand` text. */
  solid: string;
  /** A quiet tint behind `text`. */
  soft: string;
  /** Keeps 4.5:1 or better on `soft` and on the theme's surface. */
  text: string;
  /** Light theme retains its desktop market gradients; dark theme uses flat fills. */
  gradient: string;
}>;
export type AccentName = "teal" | "blue" | "violet" | "orange" | "pink" | "amber" | "emerald" | "red";

/** Semantic fields can support another theme without changing component contracts. */
export interface GoalHintTheme {
  readonly mode: "light" | "dark";
  readonly color: {
    readonly text: string;
    readonly mutedText: string;
    readonly page: string;
    readonly surface: string;
    readonly surfaceMuted: string;
    /** Neutral overlay behind dialogs and sheets in either theme. */
    readonly scrim: string;
    /** Quiet outlines and dividers for non-interactive surfaces. */
    readonly border: string;
    /** Contrasting boundaries for editable fields and native form controls. */
    readonly controlBorder: string;
    /** Quiet button outlines; labeled actions do not need an input-strength frame. */
    readonly buttonBorder: string;
    readonly brand: string;
    /** Text links also remain readable on the darker page background. */
    readonly link: string;
    readonly brandHover: string;
    /** Selected chips and segments on light surfaces; pairs with `brand` text. */
    readonly brandSoft: string;
    readonly onBrand: string;
    /** White text on the royal-blue primary action fill in either mode. */
    readonly onAction: string;
    readonly focus: string;
    readonly disabledText: string;
    readonly disabledSurface: string;
    readonly outcome: Readonly<Record<OutcomeTone, OutcomeColors>>;
    /** Result tags retain their meaning with readable, theme-specific fills and text. */
    readonly verdict: Readonly<Record<VerdictTone, Readonly<{ fill: string; text: string; border: string }>>>;
    /** Prominent summary cards, separate from the quieter inline result badges. */
    readonly performanceOutcome: Readonly<Record<"correct" | "incorrect" | "pending", Readonly<{ background: string; text: string }>>>;
    readonly market: Readonly<Record<MarketFamily, MarketColors>>;
    readonly live: AccentColors;
    /** Decorative and selection hues; every soft/text pair passes 4.5:1. */
    readonly accent: Readonly<Record<AccentName, AccentColors>>;
    readonly cardHeader: string;
    readonly rowHover: string;
  };
  readonly gradient: {
    /** Flat primary action fills paired with `onBrand`. */
    readonly action: string;
    readonly actionHover: string;
    readonly tableHeader: string;
    readonly page: string;
  };
  /** Shared, theme-adaptive colors for desktop and phone headers and navigation. */
  readonly header: {
    readonly background: string;
    readonly gradient: string;
    readonly navigationBackground: string;
    /** Primary text and icons on the bar. */
    readonly text: string;
    /** Resting navigation links stay readable on the bar. */
    readonly mutedText: string;
    /** Search placeholder: 4.5:1 on the field fill at rest and when focused. */
    readonly placeholder: string;
    /** Current-page indicator, focus ring and open-state fills on the bar. */
    readonly accent: string;
    /** Text and icons on an `accent` fill. */
    readonly onAccent: string;
    /** Square icon buttons; both fills keep header text readable. */
    readonly controlFill: string;
    readonly controlHover: string;
    /** The search pill; `fieldFillActive` on hover and focus. */
    readonly fieldFill: string;
    readonly fieldFillActive: string;
    /** Quiet separators on the branded bar, separate from control and focus outlines. */
    readonly border: string;
    readonly controlBorder: string;
    /** Section-icon colors on the bar: 3:1 or better on every stop. */
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
  };
  readonly breakpoint: {
    readonly md: string;
    readonly lg: string;
    readonly xl: string;
  };
  readonly border: {
    readonly width: string;
    readonly radius: string;
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
    readonly cardHover: string;
    readonly popover: string;
  };
  readonly phoneCardFrame: Readonly<{ border: string; radius: string; shadow: string }>;
}

export const lightTheme: GoalHintTheme = {
  mode: "light",
  color: {
    text: "#071747",
    mutedText: "#486B9F",
    page: "#FFFFFF",
    surface: brandTokens.colors.white,
    surfaceMuted: "#F2F5F8",
    scrim: "rgb(0 8 20 / 65%)",
    // Neutral section dividers stay quiet; controls retain a contrasting boundary.
    border: "#D7DFE7",
    controlBorder: "#7D8997",
    buttonBorder: "#7D8997",
    brand: "#0066F5",
    link: "#005BD6",
    brandHover: "#0054CC",
    brandSoft: "#E1F0FF",
    onBrand: brandTokens.colors.white,
    onAction: brandTokens.colors.white,
    focus: "#0066F5",
    disabledText: "#486B9F",
    disabledSurface: "#F2F5F8",
    // Outcome meanings stay separate from the blue brand accent.
    outcome: {
      correct: { text: "#007754", background: "#E5F4EC", border: "#007754" },
      incorrect: { text: "#9C2328", background: "#FFF0F1", border: "#9C2328" },
      pending: { text: "#8B5700", background: "#FFF3D6", border: "#8B5700" },
      void: { text: "#515C6B", background: "#F0F3F6", border: "#515C6B" },
      unavailable: { text: "#515C6B", background: "#F0F3F6", border: "#515C6B" },
    },
    // Status accents remain distinct from the neutral page surfaces.
    verdict: {
      upcoming: { fill: "#FEF3C7", text: "#78350F", border: "#F59E0B" },
      pending: { fill: "#FBBF24", text: "#451A03", border: "#FBBF24" },
      correct: { fill: "#22C55E", text: "#052E16", border: "#22C55E" },
      incorrect: { fill: "#F87171", text: "#450A0A", border: "#F87171" },
      void: { fill: "#CBD5E1", text: "#0F172A", border: "#CBD5E1" },
    },
    performanceOutcome: {
      correct: { background: "#22C55E", text: "#052E16" },
      incorrect: { background: "#F87171", text: "#450A0A" },
      pending: { background: "#FBBF24", text: "#451A03" },
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
      teal: { solid: "#0066F5", soft: "#E1F0FF", text: "#0054CC", gradient: "linear-gradient(135deg, #0066F5 0%, #0054CC 100%)" },
      blue: { solid: "#2563EB", soft: "#E0EAFF", text: "#1E40AF", gradient: "linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)" },
      violet: { solid: "#7C3AED", soft: "#EDE4FF", text: "#5B21B6", gradient: "linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)" },
      orange: { solid: "#C2410C", soft: "#FFE8D6", text: "#9A3412", gradient: "linear-gradient(135deg, #EA580C 0%, #D97706 100%)" },
      pink: { solid: "#BE185D", soft: "#FCE4F1", text: "#9D174D", gradient: "linear-gradient(135deg, #DB2777 0%, #9333EA 100%)" },
      amber: { solid: "#B45309", soft: "#FEF0C7", text: "#92400E", gradient: "linear-gradient(135deg, #D97706 0%, #EA580C 100%)" },
      emerald: { solid: "#047857", soft: "#D1FAE5", text: "#065F46", gradient: "linear-gradient(135deg, #059669 0%, #0D9488 100%)" },
      red: { solid: "#DC2626", soft: "#FEE2E2", text: "#991B1B", gradient: "linear-gradient(135deg, #DC2626 0%, #DB2777 100%)" },
    },
    cardHeader: "#F2F5F8",
    rowHover: "#F2F5F8",
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
    },
    weight: {
      body: brandTokens.typography.bodyWeight,
      medium: 600,
      bold: brandTokens.typography.headingWeight,
      heavy: 800,
    },
    lineHeight: { body: 1.6, heading: 1.25 },
  },
  space: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
  breakpoint: { md: "48rem", lg: "64rem", xl: "80rem" },
  border: {
    width: "1px",
    radius: brandTokens.shape.componentRadius,
    pillRadius: "999px",
    focusWidth: "3px",
    focusOffset: "3px",
  },
  layout: { maxWidth: "72rem", wideMaxWidth: "100rem", gutter: "16px" },
  control: { minHeight: "2.75rem", compactHeight: "2.25rem" },
  gradient: {
    action: "#0066F5",
    actionHover: "#0054CC",
    tableHeader: "#F2F5F8",
    page: "#FFFFFF",
  },
  header: {
    background: "#FFFFFF",
    gradient: "#FFFFFF",
    navigationBackground: "#FFFFFF",
    text: "#071747",
    mutedText: "#486B9F",
    placeholder: "#486B9F",
    accent: "#005BD6",
    onAccent: "#FFFFFF",
    controlFill: "#F2F5F8",
    controlHover: "#E1F0FF",
    fieldFill: "#F2F5F8",
    fieldFillActive: "#E1F0FF",
    border: "#D7DFE7",
    controlBorder: "#7D8997",
    tone: {
      teal: "#0054CC", blue: "#1E40AF", violet: "#5B21B6", orange: "#9A3412",
      pink: "#9D174D", amber: "#92400E", emerald: "#065F46", red: "#991B1B",
    },
    phoneHeight: "3.25rem",
    shadow: "none",
  },
  shadow: {
    cardHover: "none",
    popover: "0 8px 24px rgb(7 23 71 / 16%)",
  },
  phoneCardFrame: { border: "#7D8997", radius: "0", shadow: "none" },
};

/** The same semantic contract keeps every native control and detail panel readable in dark mode. */
export const darkTheme: GoalHintTheme = {
  ...lightTheme,
  mode: "dark",
  color: {
    ...lightTheme.color,
    text: "#F4F7FF",
    mutedText: "#A8CBEF",
    page: "#03111F",
    surface: "#081B2C",
    surfaceMuted: "#0D253B",
    border: "#142A3D",
    controlBorder: "#58728C",
    buttonBorder: "#263D50",
    brand: "#00B9F2",
    link: "#00B9F2",
    brandHover: "#79DCFF",
    brandSoft: "#073052",
    onBrand: "#03111F",
    focus: "#00B9F2",
    disabledText: "#A8CBEF",
    disabledSurface: "#0D253B",
    outcome: {
      correct: { text: "#70DEA4", background: "#1C342B", border: "#70DEA4" },
      incorrect: { text: "#FF9C9C", background: "#3B252C", border: "#FF9C9C" },
      pending: { text: "#F6C453", background: "#322A1E", border: "#F6C453" },
      void: { text: "#B1BEC8", background: "#28343D", border: "#B1BEC8" },
      unavailable: { text: "#B1BEC8", background: "#28343D", border: "#B1BEC8" },
    },
    verdict: {
      upcoming: { fill: "#322A1E", text: "#F6C453", border: "#5B492A" },
      pending: { fill: "#322A1E", text: "#F6C453", border: "#5B492A" },
      correct: { fill: "#1C342B", text: "#70DEA4", border: "#2B5340" },
      incorrect: { fill: "#3B252C", text: "#FF9C9C", border: "#643843" },
      void: { fill: "#28343D", text: "#B1BEC8", border: "#3D4E5C" },
    },
    performanceOutcome: {
      correct: { background: "#22C55E", text: "#031A0C" },
      incorrect: { background: "#FF6B7A", text: "#180408" },
      pending: { background: "#FBBF24", text: "#2A1900" },
    },
    market: {
      "match-result": { solid: "#70DEA4", soft: "#1C342B", text: "#70DEA4", gradient: "#70DEA4" },
      "double-chance": { solid: "#C6AEFF", soft: "#322B45", text: "#C6AEFF", gradient: "#C6AEFF" },
      "total-goals": { solid: "#9EC5FF", soft: "#233449", text: "#9EC5FF", gradient: "#9EC5FF" },
      "both-teams-to-score": { solid: "#FFBA8F", soft: "#3D2D25", text: "#FFBA8F", gradient: "#FFBA8F" },
    },
    live: { solid: "#FF9C9C", soft: "#3B252C", text: "#FF9C9C", gradient: "#FF9C9C" },
    accent: {
      teal: { solid: "#00B9F2", soft: "#073052", text: "#00B9F2", gradient: "#00B9F2" },
      blue: { solid: "#9EC5FF", soft: "#233449", text: "#9EC5FF", gradient: "#9EC5FF" },
      violet: { solid: "#C6AEFF", soft: "#322B45", text: "#C6AEFF", gradient: "#C6AEFF" },
      orange: { solid: "#FFBA8F", soft: "#3D2D25", text: "#FFBA8F", gradient: "#FFBA8F" },
      pink: { solid: "#F8AED2", soft: "#3B2938", text: "#F8AED2", gradient: "#F8AED2" },
      amber: { solid: "#F6C453", soft: "#322A1E", text: "#F6C453", gradient: "#F6C453" },
      emerald: { solid: "#70DEA4", soft: "#1C342B", text: "#70DEA4", gradient: "#70DEA4" },
      red: { solid: "#FF9C9C", soft: "#3B252C", text: "#FF9C9C", gradient: "#FF9C9C" },
    },
    cardHeader: "#0B2238",
    rowHover: "#10304A",
  },
  gradient: {
    action: "#0066F5",
    actionHover: "#0054CC",
    tableHeader: "#0B2238",
    page: "#03111F",
  },
  header: {
    ...lightTheme.header,
    background: "#081B2C",
    gradient: "#081B2C",
    navigationBackground: "#081B2C",
    text: "#F4F7FF",
    mutedText: "#D8E9FF",
    placeholder: "#A8CBEF",
    accent: "#00B9F2",
    onAccent: "#03111F",
    controlFill: "#06264A",
    controlHover: "#10385D",
    fieldFill: "#06264A",
    fieldFillActive: "#10385D",
    border: "#142A3D",
    controlBorder: "#294159",
    tone: {
      teal: "#7DDFFF", blue: "#93C5FD", violet: "#C4B5FD", orange: "#FDBA74",
      pink: "#F9A8D4", amber: "#FCD34D", emerald: "#6EE7B7", red: "#FCA5A5",
    },
  },
  shadow: { cardHover: "none", popover: "0 8px 24px rgb(0 0 0 / 48%)" },
  phoneCardFrame: { border: "#172D40", radius: "0", shadow: "none" },
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

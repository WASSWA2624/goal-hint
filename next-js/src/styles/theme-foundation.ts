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
  /** Flat market fills keep the same family identity across both themes. */
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
    /** White text on primary action fills in either mode. */
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
    readonly selection: Readonly<{ background: string; text: string }>;
  };
  readonly gradient: {
    /** Flat primary action fills paired with `onAction`. */
    readonly action: string;
    readonly actionHover: string;
    readonly tableHeader: string;
    readonly page: string;
  };
  /** Shared, theme-adaptive colors for desktop and phone headers and navigation. */
  readonly header: {
    readonly brandVariant: "primary" | "inverse";
    readonly desktopHeight: string;
    readonly desktopBackground: string;
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
    /** Compact icon buttons; both fills keep header text readable. */
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
    readonly headingFamily: string;
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
  /** Shared corner scale: compact items, controls, surfaces and overlays. */
  readonly radius: Readonly<typeof brandTokens.shape.radius>;
  readonly border: {
    readonly width: string;
    readonly accentWidth: string;
    readonly focusWidth: string;
    readonly focusOffset: string;
  };
  readonly layout: {
    readonly maxWidth: string;
    readonly wideMaxWidth: string;
    readonly gutter: string;
    readonly readingMaxWidth: string;
  };
  readonly frame: Readonly<{ desktopCardRadius: string }>;
  readonly motion: Readonly<{
    fast: string; feedback: string; disclosure: string; surface: string; easing: string;
    reducedDuration: string;
  }>;
  readonly interaction: Readonly<{
    pressedFilter: string; headerHoverBrightness: number; filterHoverBrightness: number; toolHoverBrightness: number;
  }>;
  /** `auto` preserves native scrollbars; review directions can supply thumb and track colors. */
  readonly scrollbarColor: string;
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

/** Semantic foundation; approved presets choose the active application appearance. */
export const foundationLightTheme: GoalHintTheme = {
  mode: "light",
  color: {
    text: "#15243B",
    mutedText: "#53647C",
    page: "#F0F3F8",
    surface: brandTokens.colors.white,
    surfaceMuted: "#E8EDF5",
    scrim: "rgb(0 8 20 / 65%)",
    // Neutral section dividers stay quiet; controls retain a contrasting boundary.
    border: "#D9E1ED",
    controlBorder: "#718099",
    buttonBorder: "#718099",
    brand: "#2457C5",
    link: "#2457C5",
    brandHover: "#19449F",
    brandSoft: "#E3ECFF",
    onBrand: brandTokens.colors.white,
    onAction: brandTokens.colors.white,
    focus: "#2457C5",
    disabledText: "#53647C",
    disabledSurface: "#E8EDF5",
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
      correct: { background: "#E5F4EC", text: "#007754" },
      incorrect: { background: "#FFF0F1", text: "#9C2328" },
      pending: { background: "#FFF3D6", text: "#8B5700" },
    },
    // Preserve each market's hue with flat solids and soft fills blended 65% with 35% white.
    // Small labels retain 4.5:1 contrast on the tint and on white; icons remain readable on solids.
    market: {
      "match-result": { solid: "#00824A", soft: "#E8FBEF", text: "#00603B", gradient: "#00824A" },
      "double-chance": { solid: "#7C3AED", soft: "#F5F1FF", text: "#5B21B6", gradient: "#7C3AED" },
      "total-goals": { solid: "#2563EB", soft: "#EDF3FF", text: "#1E40AF", gradient: "#2563EB" },
      "both-teams-to-score": { solid: "#C2410C", soft: "#FFF1E8", text: "#9A3412", gradient: "#C2410C" },
    },
    live: { solid: "#DC2626", soft: "#FEE2E2", text: "#991B1B", gradient: "linear-gradient(135deg, #DC2626 0%, #DB2777 100%)" },
    accent: {
      teal: { solid: "#2457C5", soft: "#E3ECFF", text: "#2457C5", gradient: "#2457C5" },
      blue: { solid: "#2563EB", soft: "#E0EAFF", text: "#1E40AF", gradient: "linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)" },
      violet: { solid: "#7C3AED", soft: "#EDE4FF", text: "#5B21B6", gradient: "linear-gradient(135deg, #7C3AED 0%, #C026D3 100%)" },
      orange: { solid: "#C2410C", soft: "#FFE8D6", text: "#9A3412", gradient: "linear-gradient(135deg, #EA580C 0%, #D97706 100%)" },
      pink: { solid: "#BE185D", soft: "#FCE4F1", text: "#9D174D", gradient: "linear-gradient(135deg, #DB2777 0%, #9333EA 100%)" },
      amber: { solid: "#B45309", soft: "#FEF0C7", text: "#92400E", gradient: "linear-gradient(135deg, #D97706 0%, #EA580C 100%)" },
      emerald: { solid: "#047857", soft: "#D1FAE5", text: "#065F46", gradient: "linear-gradient(135deg, #059669 0%, #0D9488 100%)" },
      red: { solid: "#DC2626", soft: "#FEE2E2", text: "#991B1B", gradient: "linear-gradient(135deg, #DC2626 0%, #DB2777 100%)" },
    },
    cardHeader: "#E8EDF5",
    rowHover: "#F0F4FC",
    selection: { background: "#2457C5", text: "#FFFFFF" },
  },
  typography: {
    family: "var(--font-manrope), Arial, sans-serif",
    headingFamily: "inherit",
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
  radius: brandTokens.shape.radius,
  border: {
    width: "1px",
    accentWidth: "3px",
    focusWidth: "3px",
    focusOffset: "3px",
  },
  layout: { maxWidth: "72rem", wideMaxWidth: "100rem", gutter: "16px", readingMaxWidth: "65ch" },
  frame: { desktopCardRadius: brandTokens.shape.radius.none },
  motion: { fast: "120ms", feedback: "140ms", disclosure: "150ms", surface: "160ms", easing: "ease", reducedDuration: "0.01ms" },
  interaction: { pressedFilter: "none", headerHoverBrightness: 1.1, filterHoverBrightness: 0.95, toolHoverBrightness: 0.96 },
  scrollbarColor: "auto",
  control: { minHeight: "2.75rem", compactHeight: "2.25rem" },
  gradient: {
    action: "#2457C5",
    actionHover: "#19449F",
    tableHeader: "#E8EDF5",
    page: "#F0F3F8",
  },
  header: {
    brandVariant: "primary",
    desktopHeight: "3rem",
    desktopBackground: "#E8EDF5",
    background: "#FFFFFF",
    gradient: "#FFFFFF",
    navigationBackground: "#FFFFFF",
    text: "#15243B",
    mutedText: "#53647C",
    placeholder: "#53647C",
    accent: "#2457C5",
    onAccent: "#FFFFFF",
    controlFill: "#E8EDF5",
    controlHover: "#E3ECFF",
    fieldFill: "#E8EDF5",
    fieldFillActive: "#E3ECFF",
    border: "#D9E1ED",
    controlBorder: "#718099",
    tone: {
      teal: "#0054CC", blue: "#1E40AF", violet: "#5B21B6", orange: "#9A3412",
      pink: "#9D174D", amber: "#92400E", emerald: "#065F46", red: "#991B1B",
    },
    phoneHeight: "3rem",
    shadow: "none",
  },
  shadow: {
    cardHover: "none",
    popover: "0 8px 24px rgb(7 23 71 / 16%)",
  },
  phoneCardFrame: { border: "#D9E1ED", radius: brandTokens.shape.radius.surface, shadow: "none" },
};

/** The same semantic contract keeps every native control and detail panel readable in dark mode. */
export const foundationDarkTheme: GoalHintTheme = {
  ...foundationLightTheme,
  mode: "dark",
  color: {
    ...foundationLightTheme.color,
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
    selection: { background: "#00B9F2", text: "#03111F" },
  },
  gradient: {
    action: "#0066F5",
    actionHover: "#0054CC",
    tableHeader: "#0B2238",
    page: "#03111F",
  },
  header: {
    ...foundationLightTheme.header,
    brandVariant: "inverse",
    desktopBackground: "#0D253B",
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
  phoneCardFrame: { border: "#172D40", radius: brandTokens.shape.radius.surface, shadow: "none" },
};

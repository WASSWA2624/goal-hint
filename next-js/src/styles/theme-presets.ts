import { foundationDarkTheme as darkTheme, foundationLightTheme as lightTheme, type GoalHintTheme } from "./theme-foundation.ts";

type ThemePalette = Readonly<{
  page: string; surface: string; muted: string; text: string; secondary: string;
  border: string; control: string; accent: string; hover: string; soft: string;
  header: string; headerText: string; headerMuted: string; headerAccent: string;
}>;
export type ThemeDirection = Readonly<{
  id: string; name: string; description: string; mode: "light" | "dark";
  font: string; fontLabel: string; headingFont?: string; shape: "crisp" | "subtle";
  palette: ThemePalette;
}>;

export const themeFonts = {
  manrope: 'var(--font-manrope), "Segoe UI", Arial, sans-serif',
  humanist: '"Segoe UI", "Trebuchet MS", Arial, sans-serif',
  editorial: 'Calibri, "Segoe UI", Arial, sans-serif',
  technical: 'Bahnschrift, "Segoe UI", Arial, sans-serif',
} as const;
const { manrope, editorial } = themeFonts;

/** Approved definitions are shared by the live app and the review gallery. */
export const porcelainBlueDirection: ThemeDirection = { id: "porcelain-blue", name: "Porcelain Blue", description: "Airy porcelain, assured blue, and quietly precise details.", mode: "light", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#F0F3F9", surface: "#FFFFFF", muted: "#F1F4FA", text: "#182640", secondary: "#53627A", border: "#DCE3EF", control: "#77859C", accent: "#2457C5", hover: "#19449F", soft: "#E8EFFF", header: "#FFFFFF", headerText: "#182640", headerMuted: "#53627A", headerAccent: "#2457C5" } };
export const cobaltNightDirection: ThemeDirection = { id: "cobalt-night", name: "Cobalt Night", description: "Midnight navy, layered blue surfaces, and electric cobalt actions.", mode: "dark", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#0B1220", surface: "#131E30", muted: "#19263B", text: "#ECF2FF", secondary: "#A9B9D3", border: "#2C3B53", control: "#657995", accent: "#3268D9", hover: "#2858BD", soft: "#21385A", header: "#101929", headerText: "#ECF2FF", headerMuted: "#A9B9D3", headerAccent: "#9DC0FF" } };

export function createTheme(direction: ThemeDirection): GoalHintTheme {
  const base = direction.mode === "dark" ? darkTheme : lightTheme, p = direction.palette;
  const link = direction.mode === "dark" ? p.headerAccent : p.accent;
  const headerDark = p.header !== p.surface;
  const decorativeBorder = `color-mix(in srgb, ${p.border} 55%, ${p.surface})`;
  return {
    ...base,
    color: { ...base.color, page: p.page, surface: p.surface, surfaceMuted: p.muted, text: p.text,
      mutedText: p.secondary, border: decorativeBorder, controlBorder: p.control, buttonBorder: decorativeBorder,
      brand: link, brandHover: direction.mode === "dark" ? p.text : p.hover, brandSoft: p.soft,
      link, focus: link, disabledText: p.secondary, disabledSurface: p.muted,
      cardHeader: p.muted, rowHover: p.soft,
      selection: { background: p.soft, text: p.text },
      accent: { ...base.color.accent, teal: { solid: link, soft: p.soft, text: link, gradient: link } },
      performanceOutcome: Object.fromEntries((["correct", "incorrect", "pending"] as const).map(tone => [tone,
        { background: base.color.outcome[tone].background, text: base.color.outcome[tone].text }])) as GoalHintTheme["color"]["performanceOutcome"],
    },
    header: { ...base.header, background: p.header, gradient: p.header, navigationBackground: p.header,
      brandVariant: headerDark ? "inverse" : "primary",
      desktopBackground: p.header,
      text: p.headerText, mutedText: p.headerMuted, placeholder: p.headerMuted, accent: p.headerAccent,
      onAccent: headerDark ? p.header : "#FFFFFF", border: headerDark ? p.header : decorativeBorder,
      controlFill: p.header, fieldFill: p.header, controlHover: headerDark ? "rgb(255 255 255 / 10%)" : p.soft,
      fieldFillActive: p.header, controlBorder: headerDark ? p.headerMuted : p.control,
      tone: Object.fromEntries(Object.keys(base.header.tone).map(key => [key, p.headerAccent])) as GoalHintTheme["header"]["tone"],
    },
    typography: { ...base.typography, family: direction.font, headingFamily: direction.headingFont ?? "inherit",
      size: { ...base.typography.size, body: direction.font === editorial ? "1rem" : "0.9375rem",
        h1: direction.headingFont ? "1.875rem" : "1.625rem", h2: "1.125rem" },
      weight: { ...base.typography.weight, body: 400, medium: 500, bold: 650, heavy: 750 },
    },
    radius: direction.shape === "crisp" ? { ...base.radius, control: base.radius.small,
      surface: base.radius.control, overlay: base.radius.surface }
      : { ...base.radius, surface: base.radius.overlay },
    border: { ...base.border, width: "1px", accentWidth: "1px", focusWidth: "2px" },
    frame: { ...base.frame, desktopCardRadius: direction.shape === "crisp" ? base.radius.control : base.radius.overlay },
    space: { ...base.space, md: "14px", lg: "20px", xl: "24px" },
    gradient: { action: p.accent, actionHover: p.hover, tableHeader: p.muted, page: p.page },
    shadow: { ...base.shadow, cardHover: direction.shape === "crisp" ? "none" : `0 3px 12px ${p.text}0A` },
    motion: { ...base.motion,
      fast: direction.shape === "crisp" ? "100ms" : "140ms", feedback: direction.shape === "crisp" ? "120ms" : "160ms",
      disclosure: direction.shape === "crisp" ? "120ms" : "160ms", surface: direction.shape === "crisp" ? "120ms" : "160ms" },
    interaction: { ...base.interaction, pressedFilter: "brightness(0.94)" },
    scrollbarColor: `${p.control} ${p.page}`,
    phoneCardFrame: { ...base.phoneCardFrame, border: decorativeBorder },
  };
}

export const porcelainBlueTheme = createTheme(porcelainBlueDirection);
export const cobaltNightTheme = createTheme(cobaltNightDirection);

import { foundationDarkTheme as darkTheme, foundationLightTheme as lightTheme, type GoalHintTheme } from "./theme-foundation.ts";

type ThemePalette = Readonly<{
  page: string; surface: string; muted: string; text: string; secondary: string;
  border: string; control: string; accent: string; hover: string; soft: string;
  header: string; headerText: string; headerMuted: string; headerAccent: string;
  cardBorder?: string; cardInset?: string; cardHeader?: string;
  mobileSlipHeader?: string; slipSelection?: string;
  fieldHover?: string;
  input?: string;
  chrome?: string;
  section?: string;
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

/** Derive complete control fills from each palette without screen-specific colors. */
const blend = (surface: string, ink: string, amount: number) => "#" + [1, 3, 5].map(offset =>
  Math.round(Number.parseInt(surface.slice(offset, offset + 2), 16) * (1 - amount)
    + Number.parseInt(ink.slice(offset, offset + 2), 16) * amount).toString(16).padStart(2, "0")).join("");

/** Inverse artwork belongs on dark bars, including branded light-mode directions. */
const isDarkSurface = (color: string) => [1, 3, 5].map(offset => {
  const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0) < 0.18;

const porcelainChrome = "#EDF1F7";

/** Approved definitions are shared by the live app and the review gallery. */
export const porcelainBlueDirection: ThemeDirection = {
  id: "porcelain-blue", name: "Porcelain Blue", description: "Airy porcelain, assured blue, and quietly precise details.",
  mode: "light", font: manrope, fontLabel: "Manrope", shape: "subtle",
  palette: {
    page: "#FFFFFF", surface: "#FFFFFF", muted: "#FFFFFF", text: "#182640", secondary: "#53627A",
    border: "#DCE3EF", control: "#77859C", fieldHover: "#D2D8E2", input: "#FFFFFF",
    accent: "#2457C5", hover: "#19449F", soft: "#E8EFFF",
    header: porcelainChrome, headerText: "#182640", headerMuted: "#53627A", headerAccent: "#2457C5",
    chrome: porcelainChrome, section: "#F5F7FC",
    cardBorder: "#D3DDEA", cardInset: "#FFFFFF", cardHeader: porcelainChrome,
    mobileSlipHeader: porcelainChrome, slipSelection: "#FFFFFF",
  },
};
export const cobaltNightDirection: ThemeDirection = { id: "cobalt-night", name: "Cobalt Night", description: "Midnight navy, layered blue surfaces, and electric cobalt actions.", mode: "dark", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#0B1220", surface: "#131E30", muted: "#19263B", text: "#ECF2FF", secondary: "#A9B9D3", border: "#2C3B53", control: "#657995", accent: "#3268D9", hover: "#2858BD", soft: "#21385A", header: "#101929", headerText: "#ECF2FF", headerMuted: "#A9B9D3", headerAccent: "#9DC0FF", cardBorder: "#34465F", cardInset: "#19263B", cardHeader: "#1B2C45" } };

export function createTheme(direction: ThemeDirection): GoalHintTheme {
  const base = direction.mode === "dark" ? darkTheme : lightTheme, p = direction.palette;
  const link = direction.mode === "dark" ? p.headerAccent : p.accent;
  const headerDark = isDarkSurface(p.header);
  const chrome = p.chrome ?? p.cardHeader ?? p.muted;
  const section = p.section ?? p.muted;
  const decorativeBorder = `color-mix(in srgb, ${p.border} 55%, ${p.surface})`;
  const field = blend(p.surface, p.control, 0.22), fieldHover = p.fieldHover ?? blend(p.surface, p.control, 0.26);
  const input = direction.mode === "light" ? "#FFFFFF" : p.input;
  return {
    ...base,
    brandVariant: direction.mode === "dark" ? "inverse" : "primary",
    color: { ...base.color, page: p.page, surface: p.surface, surfaceMuted: p.muted, text: p.text,
      field, fieldHover,
      mutedText: blend(p.secondary, p.text, 0.2), border: decorativeBorder, controlBorder: p.control, buttonBorder: decorativeBorder,
      brand: link, brandHover: direction.mode === "dark" ? p.text : p.hover, brandSoft: p.soft,
      link, focus: link, disabledText: p.secondary, disabledSurface: p.muted,
      cardHeader: chrome, section, rowHover: p.soft,
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
    footer: { background: chrome, text: p.text, mutedText: blend(p.secondary, p.text, 0.2), link, hoverBackground: p.soft },
    dialog: { headerBackground: chrome, footerBackground: chrome },
    typography: { ...base.typography, family: direction.font, headingFamily: direction.headingFont ?? "inherit",
      size: { ...base.typography.size, body: direction.font === editorial ? "1rem" : "0.9375rem",
        h1: direction.headingFont ? "1.875rem" : "1.625rem", h2: "1.125rem" },
      weight: { ...base.typography.weight, body: 400, medium: 500, bold: 650, heavy: 750 },
    },
    radius: direction.shape === "crisp" ? { ...base.radius, control: base.radius.small,
      surface: base.radius.control, overlay: base.radius.surface }
      : { ...base.radius, surface: base.radius.overlay },
    border: { ...base.border, width: "0px", accentWidth: "0px", focusWidth: "2px" },
    frame: { ...base.frame, desktopCardRadius: direction.shape === "crisp" ? base.radius.control : base.radius.overlay },
    textField: { background: input ?? field, hoverBackground: input ?? fieldHover,
      invalidBackground: input ?? base.color.outcome.incorrect.background, disabledBackground: input ?? p.muted, borderWidth: input ? "1px" : "0px",
      borderColor: blend(input ?? field, p.control, 0.24), focusBorderColor: blend(input ?? field, link, 0.42) },
    select: { background: input ?? `var(--select-surface, ${field})`, hoverBackground: input ?? `var(--select-hover-surface, ${fieldHover})`,
      expandedBackground: input ?? p.soft, invalidBackground: input ?? base.color.outcome.incorrect.background, disabledBackground: input ?? p.muted },
    action: { quietBackground: input ? field : p.muted, quietHoverBackground: input ? fieldHover : p.soft, headerBackground: input ? field : p.soft },
    fieldAdornment: { background: input ?? p.soft, hoverBackground: input ?? p.muted },
    space: { ...base.space, md: "14px", lg: "20px", xl: "24px" },
    gradient: { action: p.accent, actionHover: p.hover, tableHeader: chrome, page: p.page },
    shadow: { ...base.shadow, cardHover: direction.shape === "crisp" ? "none" : `0 3px 12px ${p.text}0A` },
    motion: { ...base.motion,
      fast: direction.shape === "crisp" ? "100ms" : "140ms", feedback: direction.shape === "crisp" ? "120ms" : "160ms",
      disclosure: direction.shape === "crisp" ? "120ms" : "160ms", surface: direction.shape === "crisp" ? "120ms" : "160ms" },
    interaction: { ...base.interaction, pressedFilter: "brightness(0.94)" },
    scrollbarColor: `${p.control} ${p.page}`,
    phoneCardFrame: { ...base.phoneCardFrame, border: p.cardBorder ?? decorativeBorder,
      separator: direction.mode === "light" ? p.cardBorder ?? decorativeBorder : p.cardInset ?? p.muted,
      inset: p.cardInset ?? p.muted, header: p.cardHeader ?? chrome,
      mobileHeader: p.mobileSlipHeader ?? p.cardHeader ?? chrome, selection: p.slipSelection ?? p.surface },
  };
}

export const porcelainBlueTheme = createTheme(porcelainBlueDirection);
export const cobaltNightTheme = createTheme(cobaltNightDirection);

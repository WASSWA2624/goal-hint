import { darkTheme, lightTheme, type GoalHintTheme } from "@/styles/theme";

type Palette = Readonly<{
  page: string; surface: string; muted: string; text: string; secondary: string;
  border: string; control: string; accent: string; hover: string; soft: string;
  header: string; headerText: string; headerMuted: string; headerAccent: string;
}>;
export type DesktopTheme = Readonly<{
  id: string; name: string; description: string; mode: "light" | "dark";
  font: string; fontLabel: string; headingFont?: string; shape: "crisp" | "subtle";
  palette: Palette; theme: GoalHintTheme;
}>;
type Direction = Omit<DesktopTheme, "theme">;

const manrope = 'var(--font-manrope), "Segoe UI", Arial, sans-serif';
const humanist = '"Segoe UI", "Trebuchet MS", Arial, sans-serif';
const editorial = 'Calibri, "Segoe UI", Arial, sans-serif';
const technical = 'Bahnschrift, "Segoe UI", Arial, sans-serif';

const directions: readonly Direction[] = [
  { id: "porcelain-blue", name: "Porcelain Blue", description: "Airy porcelain, assured blue, and quietly precise details.", mode: "light", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#F0F3F9", surface: "#FFFFFF", muted: "#F1F4FA", text: "#182640", secondary: "#53627A", border: "#DCE3EF", control: "#77859C", accent: "#2457C5", hover: "#19449F", soft: "#E8EFFF", header: "#FFFFFF", headerText: "#182640", headerMuted: "#53627A", headerAccent: "#2457C5" } },
  { id: "evergreen", name: "Evergreen", description: "Botanical greens with soft mineral surfaces. Calm and grounded.", mode: "light", font: humanist, fontLabel: "Segoe UI · humanist", shape: "subtle",
    palette: { page: "#EEF3EF", surface: "#FEFFFD", muted: "#EFF4F0", text: "#1E342B", secondary: "#52695D", border: "#D4E1D7", control: "#748A7B", accent: "#236548", hover: "#174B34", soft: "#E2F0E6", header: "#183C2D", headerText: "#F7FFF9", headerMuted: "#D0E3D5", headerAccent: "#B6E7C7" } },
  { id: "ink-and-paper", name: "Ink & Paper", description: "Warm paper, decisive ink, and an editorial heading style.", mode: "light", font: editorial, fontLabel: "Calibri · Georgia headings", headingFont: 'Georgia, "Times New Roman", serif', shape: "crisp",
    palette: { page: "#F2F0E9", surface: "#FFFEFA", muted: "#F1EFE7", text: "#292C32", secondary: "#64635C", border: "#DCD8CC", control: "#87847A", accent: "#344C75", hover: "#233753", soft: "#E8EDF5", header: "#FFFEFA", headerText: "#292C32", headerMuted: "#64635C", headerAccent: "#344C75" } },
  { id: "copper-sand", name: "Copper Sand", description: "Sandstone warmth, copper accents, and understated depth.", mode: "light", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#F6F0E9", surface: "#FFFDFA", muted: "#F5EEE6", text: "#382B24", secondary: "#746052", border: "#E5D8CA", control: "#9A8070", accent: "#974621", hover: "#783517", soft: "#F8E9DC", header: "#382B24", headerText: "#FFFBF5", headerMuted: "#E9D6C4", headerAccent: "#F4C5A0" } },
  { id: "arctic-teal", name: "Arctic Teal", description: "Clear ice-blue surfaces with a crisp, ocean-teal signature.", mode: "light", font: humanist, fontLabel: "Segoe UI · humanist", shape: "crisp",
    palette: { page: "#EDF5F7", surface: "#FFFFFF", muted: "#EAF3F5", text: "#18333C", secondary: "#4D6871", border: "#CFE1E6", control: "#708D96", accent: "#096878", hover: "#074E5A", soft: "#DEF1F3", header: "#FFFFFF", headerText: "#18333C", headerMuted: "#4D6871", headerAccent: "#096878" } },
  { id: "plum-studio", name: "Plum Studio", description: "A soft lilac canvas, deep plum, and confident typography.", mode: "light", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#F3F0F7", surface: "#FFFEFF", muted: "#F1ECF5", text: "#33243F", secondary: "#71617D", border: "#E0D6E8", control: "#93819F", accent: "#75418F", hover: "#5D2E76", soft: "#F0E5F6", header: "#FFFEFF", headerText: "#33243F", headerMuted: "#71617D", headerAccent: "#75418F" } },
  { id: "slate-precision", name: "Slate Precision", description: "Neutral silver, graphite structure, and a focused technical voice.", mode: "light", font: technical, fontLabel: "Bahnschrift · technical", shape: "crisp",
    palette: { page: "#EFF1F3", surface: "#FFFFFF", muted: "#ECEFF2", text: "#252F3B", secondary: "#5B6775", border: "#D4DAE1", control: "#7F8B99", accent: "#3E546E", hover: "#293D55", soft: "#E5EBF2", header: "#263342", headerText: "#F7F9FC", headerMuted: "#D0DAE5", headerAccent: "#B7D5F9" } },
  { id: "cobalt-night", name: "Cobalt Night", description: "Midnight navy, layered blue surfaces, and electric cobalt actions.", mode: "dark", font: manrope, fontLabel: "Manrope", shape: "subtle",
    palette: { page: "#0B1220", surface: "#131E30", muted: "#19263B", text: "#ECF2FF", secondary: "#A9B9D3", border: "#2C3B53", control: "#657995", accent: "#3268D9", hover: "#2858BD", soft: "#21385A", header: "#101929", headerText: "#ECF2FF", headerMuted: "#A9B9D3", headerAccent: "#9DC0FF" } },
  { id: "forest-night", name: "Forest Night", description: "Deep pine, luminous mint details, and a comfortable dark canvas.", mode: "dark", font: humanist, fontLabel: "Segoe UI · humanist", shape: "subtle",
    palette: { page: "#0D1715", surface: "#162420", muted: "#1D3029", text: "#EBF5EF", secondary: "#AAC2B5", border: "#304A3E", control: "#668C77", accent: "#287457", hover: "#205E46", soft: "#234C3B", header: "#11201A", headerText: "#EBF5EF", headerMuted: "#AAC2B5", headerAccent: "#93D7B5" } },
  { id: "graphite-gold", name: "Graphite Gold", description: "Charcoal surfaces with warm brass. Restrained and distinctive.", mode: "dark", font: editorial, fontLabel: "Calibri · humanist", shape: "crisp",
    palette: { page: "#161616", surface: "#222220", muted: "#2B2B27", text: "#F4F1E9", secondary: "#C1BAAA", border: "#454238", control: "#8D846E", accent: "#80601F", hover: "#6A4E17", soft: "#463B24", header: "#1C1C1A", headerText: "#F4F1E9", headerMuted: "#C1BAAA", headerAccent: "#E0C17A" } },
];

function createTheme(direction: Direction): GoalHintTheme {
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

export const desktopThemes: readonly DesktopTheme[] = directions.map(direction => ({ ...direction, theme: createTheme(direction) }));
export const previewScreens = [
  ["best-slips", "Best Slips"], ["matches", "Matches"], ["slip-builder", "Slip Builder"],
  ["results", "Results"], ["help", "Help"], ["privacy", "Privacy"], ["terms", "Terms"],
  ["contacts", "Contacts"], ["invites", "Invites"], ["dashboard", "Member Dashboard"],
  ["admin", "Admin Dashboard"], ["analytics", "Analytics"],
] as const;
export type PreviewScreen = typeof previewScreens[number][0];
export function findDesktopTheme(id: string) { return desktopThemes.find(theme => theme.id === id); }
export function isPreviewScreen(value: string): value is PreviewScreen { return previewScreens.some(([id]) => id === value); }
export function previewHref(theme: string, screen: string = "best-slips", query = "") {
  return `/themes/${theme}${screen === "best-slips" ? "" : `/${screen}`}${query ? `?${query}` : ""}`;
}

/** Keep real app navigation inside the review, retaining filter query strings. */
export function appPreviewScreen(path: string, parameters: URLSearchParams): PreviewScreen | null {
  if (path === "/en" || path === "/") return "best-slips";
  if (path === "/en/matches") return "matches";
  if (path === "/en/slips") return "slip-builder";
  if (path === "/en/performance") return "results";
  if (path === "/en/account") return parameters.get("section") === "referrals" ? "invites" : "dashboard";
  if (path === "/admin") return "admin";
  if (path === "/analytics") return "analytics";
  const page = path.split("/").at(-1);
  if (page === "contact") return "contacts";
  return page && isPreviewScreen(page) ? page : null;
}

const OPACITY_STEPS = [
  18, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 85
] as const;
const VIEWPORT_STEPS = [
  9.5, 12, 14, 16, 18, 18.875, 19, 20, 21, 21.875, 22, 22.4375, 22.5, 23.6875, 24, 25, 26.875, 27, 28,
  30, 32, 34, 36, 40, 42, 44, 47.5, 50, 63.99, 64, 68.75, 72, 73, 74.9375, 74.99, 79.99, 89.99
] as const;
const RELATIVE_STEPS = [
  0.08, 0.1, 0.125, 0.15, 0.2, 1.1, 1.25
] as const;
const MEASURE_STEPS = [
  1
] as const;
const SIZE_STEPS = [
  0.0025, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.125, 3.25, 3.375, 3.5, 3.75, 4,
  4.225, 4.4, 4.5, 4.75, 5, 5.25, 5.5, 5.75, 6, 6.25, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5,
  12, 12.5, 12.6, 13, 13.5, 14, 14.5, 15, 15.5, 16, 16.8, 17, 17.8, 18, 18.5, 18.6, 19, 19.2, 20, 20.4,
  21, 22, 23, 24, 25, 26, 27.5, 28, 29, 30, 31, 32, 33.75, 34, 36, 37.5, 40, 42.5, 43, 44, 45, 46, 48,
  52, 54, 56, 58, 60, 64, 68, 70, 71.25, 72, 75, 76, 80, 82.5, 88, 90, 92, 96, 104, 107.5, 110, 112, 116,
  120, 136, 140, 144, 152, 160, 168, 170, 172.5, 180, 192, 200, 208, 210, 212.5, 216, 224, 248, 250, 256,
  260, 285, 304, 312, 330, 352, 360, 400
] as const;
const SPACING_STEPS = [
  0.25, 0.5, 0.75, 1, 1.125, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 2.875, 3, 3.25, 3.5, 3.75, 4, 4.5, 5,
  5.5, 6, 6.5, 6.75, 7, 7.5, 8, 9, 9.5, 10, 12, 12.5, 13, 14, 15, 16, 23, 25, 28, 60
] as const;
/** Primitive scales shared by every theme. One spacing step is four CSS pixels. */
const scale = <Step extends number>(steps: readonly Step[], unit: string, multiplier = 1): Readonly<Record<Step, string>> =>
  Object.freeze(Object.fromEntries(steps.map(step => [step, `${step * multiplier}${unit}`]))) as Readonly<Record<Step, string>>;

const numericRoles = <Name extends string>(roles: Record<Name, number>): Readonly<Record<Name, number>> => Object.freeze(roles);

// Fine steps accommodate compact tables, icons and embedded field actions without local dimensions.
export const geometryTokens = {
  spacing: scale(SPACING_STEPS, "px", 4),
  size: scale(SIZE_STEPS, "rem", 0.25),
  measure: scale(MEASURE_STEPS, "ch"),
  relativeSize: scale(RELATIVE_STEPS, "em"),
  viewport: scale(VIEWPORT_STEPS, "rem"),
  opacity: Object.freeze(Object.fromEntries(OPACITY_STEPS.map(step => [step, step / 100]))) as Readonly<Record<number, number>>,
  layer: numericRoles({ base: 0, content: 1, raised: 2, control: 3, selected: 4, floating: 5,
    sticky: 10, stickyControl: 11, toolbar: 15, navigation: 20, menu: 25, popover: 30,
    popoverControl: 31, picker: 35, sheet: 40, tooltip: 50, overlayUnderlay: 59, overlay: 60,
    notification: 100, modal: 1000 }),
} as const;

export const typeScale = {
  micro: "0.625rem", caption: "0.6875rem", secondary: "0.75rem", body: "0.8125rem",
  emphasis: "0.875rem", reading: "0.9375rem", section: "1rem", subheading: "1.0625rem",
  title: "1.125rem", lead: "1.1875rem", heading: "1.25rem", page: "1.375rem",
  headline: "1.5rem", feature: "1.625rem", displaySmall: "1.75rem", display: "1.875rem",
  displayLarge: "2rem", hero: "2.5rem", relative: "0.75em",
} as const;

export const lineHeights = {
  solid: 1, dense: 1.05, tight: 1.1, snug: 1.15, control: 1.2, heading: 1.25,
  label: 1.3, caption: 1.35, compact: 1.4, reading: 1.45, normal: 1.5,
  relaxed: 1.55, body: 1.6, long: 1.65, prose: 1.7, spacious: 1.75, loose: 1.8, double: 2,
} as const;

export const tracking = {
  tightest: "-0.04em", tighter: "-0.03em", tight: "-0.02em", snug: "-0.015em", compact: "-0.01em",
  normal: "0", subtle: "0.01em", relaxed: "0.02em", wide: "0.03em", wider: "0.04em",
  label: "0.05em", caption: "0.06em", uppercase: "0.08em", heading: "0.1em", display: "0.12em",
} as const;

export const durationScale = {
  instant: "0.01ms", quick: "100ms", fast: "120ms", feedback: "140ms", disclosure: "150ms",
  surface: "160ms", deliberate: "180ms", spin: "0.8s", shimmer: "1.1s", loading: "1.4s",
  pulse: "2s", slow: "4s", ambient: "9s",
} as const;

/** Flattened uploads and portable exports need an opaque paper surface in either appearance. */
export const mediaTokens = { paper: "#FFFFFF", fallbackFamily: "Arial, sans-serif" } as const;

/** Pixel geometry used by browser measurements and persisted workspace preferences. */
export const uiGeometry: Readonly<{
  sidebar: Readonly<Record<"default" | "min" | "max" | "collapsed" | "handle" | "contentMin", number>>;
  countryMenu: Readonly<Record<"edge" | "gap" | "minWidth" | "minHeight" | "preferredSpace" | "maxHeight", number>>;
  tooltip: Readonly<Record<"edge" | "gap" | "clearance", number>>;
}> = {
  sidebar: { default: 232, min: 192, max: 320, collapsed: 56, handle: 6, contentMin: 720 },
  countryMenu: { edge: 8, gap: 6, minWidth: 300, minHeight: 80, preferredSpace: 280, maxHeight: 360 },
  tooltip: { edge: 8, gap: 6, clearance: 14 },
};

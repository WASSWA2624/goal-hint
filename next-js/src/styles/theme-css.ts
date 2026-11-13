import type { GoalHintTheme } from "./theme-foundation";

const stepName = (step: string) => step.replaceAll(".", "_");
const isColor = (value: unknown): value is string => typeof value === "string" && /^(?:#|(?:rgb|rgba|hsl|hsla|oklch|color|color-mix|linear-gradient|radial-gradient)\(|var\([^)]*,\s*#|transparent$|currentColor$)/u.test(value);
const colorVariable = (path: readonly string[]) => `--gh-theme-${path.map(stepName).join("-")}`;

function mapColors(value: unknown, path: readonly string[], color: (value: string, path: readonly string[]) => string): unknown {
  if (isColor(value)) return color(value, path);
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .map(([key, child]) => [key, mapColors(child, [...path, key], color)]));
  return value;
}

/** Keep geometry, breakpoints and conditional roles intact; only semantic colors become inherited references. */
export function cssColorTheme(theme: GoalHintTheme): GoalHintTheme {
  return mapColors(theme, [], (_value, path) => `var(${colorVariable(path)})`) as GoalHintTheme;
}

export function themeColorVariables(theme: GoalHintTheme): string[] {
  const colors: string[] = [];
  mapColors(theme, [], (value, path) => { colors.push(`${colorVariable(path)}: ${value};`); return value; });
  return colors;
}

/** Publish primitive scales once. CSS variables also theme native styles, SVGs and keyframes. */
export function themeCssVariables(theme: GoalHintTheme): string {
  const groups = {
    spacing: theme.spacing, size: theme.size, measure: theme.measure, relativeSize: theme.relativeSize,
    opacity: theme.opacity, layer: theme.layer, font: theme.typography.scale, weight: theme.typography.weight,
    leading: theme.typography.lineHeight, tracking: theme.typography.tracking,
    duration: { ...theme.motion.duration, fast: theme.motion.fast, feedback: theme.motion.feedback,
      disclosure: theme.motion.disclosure, surface: theme.motion.surface, instant: theme.motion.reducedDuration },
    illustration: theme.illustration,
    chrome: { content: theme.color.surface, header: theme.header.background, footer: theme.footer.background,
      dialogHeader: theme.dialog.headerBackground, dialogFooter: theme.dialog.footerBackground,
      section: theme.color.section, slipHeader: theme.phoneCardFrame.header, mobileSlipHeader: theme.phoneCardFrame.mobileHeader },
    layout: { gutter: theme.layout.gutter, sectionPadding: theme.layout.sectionPadding, slipGap: theme.layout.slipGap, formMaxWidth: theme.layout.formMaxWidth },
    headerControl: { blockInset: theme.header.controlBlockInset },
    stroke: { thin: theme.border.thin, strong: theme.border.strong, focus: theme.border.focus, accent: theme.border.accent },
  };
  return Object.entries(groups).flatMap(([group, tokens]) => Object.entries(tokens)
    .map(([step, value]) => `--gh-${group}-${stepName(step)}: ${value};`))
    .concat(themeColorVariables(theme), `--gh-loading-header-brand-image: url("/brand/goal-hint-header-${theme.header.brandVariant}.svg");`,
      `--gh-easing: ${theme.motion.easing};`, `--gh-easing-in-out: ${theme.motion.easingInOut};`,
      `--gh-easing-out: ${theme.motion.easingOut};`, `--gh-easing-linear: ${theme.motion.easingLinear};`).join("\n");
}

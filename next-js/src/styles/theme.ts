import type { GoalHintTheme } from "./theme-foundation.ts";
import { porcelainBlueTheme, cobaltNightTheme } from "./theme-presets.ts";

export type { GoalHintTheme, AccentColors, AccentName, MarketColors, OutcomeTone, VerdictTone } from "./theme-foundation.ts";

/** The user-approved application themes; all providers and native chrome read these exports. */
export const lightTheme: GoalHintTheme = porcelainBlueTheme;
export const darkTheme: GoalHintTheme = cobaltNightTheme;

/** A complete theme is required at a streamed or standalone style boundary. */
export function isGoalHintTheme(value: unknown): value is GoalHintTheme {
  function matches(candidate: unknown, template: unknown): boolean {
    if (template === null || typeof template !== "object") return typeof candidate === typeof template;
    if (candidate === null || typeof candidate !== "object") return false;
    return Object.entries(template).every(([key, sample]) => matches((candidate as Record<string, unknown>)[key], sample));
  }
  return value !== null && typeof value === "object" && "mode" in value
    && (value.mode === "light" || value.mode === "dark") && matches(value, lightTheme);
}

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

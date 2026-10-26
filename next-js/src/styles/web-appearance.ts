import type { GoalHintTheme } from "./theme.ts";

/** Public, bounded native chrome metadata; the shared web theme remains authoritative. */
export function webAppearance(theme: GoalHintTheme) {
  return {
    version: 1 as const,
    scheme: theme.mode,
    background: theme.color.page,
    surface: theme.color.surface,
    foreground: theme.color.text,
    accent: theme.color.brand,
    chrome: theme.header.background,
  };
}

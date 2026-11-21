import type { PredictionResult } from "@/domain/performance-summary";
import type { GoalHintTheme } from "./theme-foundation";

const resultTones = { won: "correct", lost: "incorrect", pending: "pending", void: "void" } as const;

/** Keep the summary and the surfaces that display its results on the same palette. */
export function performanceResultColors(theme: GoalHintTheme, result: PredictionResult | "all") {
  if (result === "all" || result === "cancelled") {
    const { text, soft } = theme.color.accent[result === "all" ? "blue" : "orange"];
    return { text, background: soft };
  }
  return theme.color.outcome[resultTones[result]];
}

import type { Messages } from "@/i18n/messages";

/** Keep original probability precision without rounding a near-certain forecast to a guarantee. */
export function formatSlipProbability(value: number, messages: Messages): string {
  if (value > 0 && Math.round(value * 1000) === 0) return messages.text("probability.compact.less-than-one");
  if (value < 1 && Math.round(value * 1000) === 1000) return messages.text("probability.compact.more-than-ninety-nine");
  return messages.number(value, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

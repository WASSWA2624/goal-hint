import type { MarketFamily, MarketSelection } from "@/domain/markets";
import { predictionLabel } from "@/domain/prediction-label";
import type { createMessages } from "@/i18n/messages";

type Messages = ReturnType<typeof createMessages>;

/** The same compact outcome used by cards, slips and revision history. */
export function pickLabel(messages: Messages, selection: MarketSelection): string {
  return predictionLabel(messages, selection);
}
/** Full market name on every viewport. */
export function marketName(messages: Messages, family: MarketFamily): string {
  return messages.text(`details.market.${family}`);
}
export function percent(messages: Messages, probability: number | null): string {
  return probability === null ? "—" : `${messages.number(Math.round(probability * 100))}%`;
}

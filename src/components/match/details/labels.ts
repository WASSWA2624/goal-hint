import type { MarketFamily, MarketSelection } from "@/domain/markets";
import type { createMessages } from "@/i18n/messages";

type Messages = ReturnType<typeof createMessages>;

/** Selection with the actual team names, e.g. "Arsenal win" or "Liverpool or draw". */
export function pickLabel(messages: Messages, selection: MarketSelection, home: string, away: string): string {
  return messages.text(`details.pick.${selection}`, { home, away });
}
/** Full market name; short codes such as 1X2 and BTTS come from market.code. */
export function marketName(messages: Messages, family: MarketFamily): string {
  return messages.text(`details.market.${family}`);
}
export function percent(messages: Messages, probability: number | null): string {
  return probability === null ? "—" : `${messages.number(Math.round(probability * 100))}%`;
}

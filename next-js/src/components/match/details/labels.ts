import type { MarketFamily, MarketSelection } from "@/domain/markets";
import { predictionLabel } from "@/domain/prediction-label";
import type { createMessages } from "@/i18n/messages";

type Messages = ReturnType<typeof createMessages>;
const playerRoles = { G: "goalkeeper", GK: "goalkeeper", D: "defender", DF: "defender",
  M: "midfielder", MF: "midfielder", F: "forward", FW: "forward" } as const;

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

/** Expand supplied provider codes without inventing a more specific tactical role. */
export function playerPositionLabel(messages: Messages, position: string | null): string {
  const code = position?.trim().toUpperCase();
  const role = code && Object.hasOwn(playerRoles, code) ? playerRoles[code as keyof typeof playerRoles] : null;
  return role ? messages.text(`touchline.position.${role}`) : position || messages.text("details.notAvailable");
}

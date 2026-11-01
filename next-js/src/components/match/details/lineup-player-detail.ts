import type { InsightSections } from "@/domain/match-insights";
import { knownCountryCode } from "@/domain/country-code";
import { positionGroup } from "@/domain/match-details";
import { playerPositionLabel } from "./labels";
import type { Messages } from "./details-ui";

export const lineupDisplayFields = ["number", "position", "nationality", "age", "rating"] as const;
export type LineupDisplay = (typeof lineupDisplayFields)[number];
type Player = InsightSections["players"]["players"][number];
const labels = { number: "details.number", position: "details.position", nationality: "touchline.nationality", age: "touchline.age", rating: "touchline.rating" } as const;
export const lineupDetailLabel = (messages: Messages, field: LineupDisplay) => messages.text(labels[field]);
export const lineupDisplayFromTab = (tab: string | null): LineupDisplay => lineupDisplayFields.find(field => tab === `lineup-${field}`) ?? "number";

/** Only supplied fixture/player values are displayed. A missing value never becomes an inferred rating. */
export function lineupDetailValue(messages: Messages, player: Player | null, field: LineupDisplay, compact = false): string | null {
  if (!player) return null;
  if (field === "position") {
    if (!player.position) return null;
    const group = positionGroup(player.position);
    return compact ? group ? { G: "GK", D: "DEF", M: "MID", F: "FWD" }[group] : player.position : playerPositionLabel(messages, player.position);
  }
  if (field === "nationality") return compact ? knownCountryCode(player.nationality) || null : player.nationality || null;
  const value = player[field];
  return value == null ? null : messages.number(value, field === "rating" ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : undefined);
}

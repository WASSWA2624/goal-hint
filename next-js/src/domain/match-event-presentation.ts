import type { LiveMatchEvent } from "./live-match.ts";

export type MatchEventKind = LiveMatchEvent["type"] | "own-goal" | "penalty-goal" | "missed-penalty" | "yellow-card" | "red-card" | "second-yellow";
const normalize = (value: string | null) => value?.trim().toLowerCase().replace(/[\s_-]+/gu, " ") ?? "";
const goalKinds: Readonly<Record<string, MatchEventKind>> = {
  "normal goal": "goal", "own goal": "own-goal", penalty: "penalty-goal", "missed penalty": "missed-penalty",
};
const cardKinds: Readonly<Record<string, MatchEventKind>> = {
  "yellow card": "yellow-card", "red card": "red-card", "second yellow card": "second-yellow",
  "second yellow": "second-yellow", "yellow red card": "second-yellow",
};

/** The provider's sequence preserves period/stoppage-time order, including incidents without a minute. */
export function newestMatchEvents(items: readonly LiveMatchEvent[]): LiveMatchEvent[] {
  return [...items].sort((a, b) => b.sequence - a.sequence);
}

/** Only explicit supported details select a specific symbol; unknown details remain visible. */
export function matchEventPresentation(event: LiveMatchEvent) {
  const detail = normalize(event.detail);
  const kinds = event.type === "goal" ? goalKinds : event.type === "card" ? cardKinds : null;
  const specific = kinds && Object.hasOwn(kinds, detail) ? kinds[detail] : undefined;
  return {
    kind: specific ?? event.type,
    detail: specific || event.type === "substitution" && /^substitution(?: \d+)?$/u.test(detail) ? null : event.detail,
    comments: normalize(event.comments) === detail ? null : event.comments,
  };
}

/** API-Football subst records identify the departing player in player and the replacement in assist. */
export function substitutionPlayers(event: Pick<LiveMatchEvent, "player" | "assist">) {
  return { on: event.assist, off: event.player };
}

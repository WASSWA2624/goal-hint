import type { LiveMatchEvent } from "./live-match.ts";
import type { LiveClock } from "./match-card.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "./market-settlement.ts";

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

export type MatchTimelineContext = Readonly<{ status: SettlementStatus; observedStatus: SettlementStatus; clock: Pick<LiveClock, "phase" | "minute"> | null }>;
export type MatchPeriodMarker = "half-time" | "extra-time" | "extra-time-interval" | "added-time" | "full-time" | "penalties";
export type MatchTimelineEntry = { type: "event"; event: LiveMatchEvent } | {
  type: "period"; key: string; period: MatchPeriodMarker; boundary: number | null; afterExtraTime: boolean;
};
export type MatchTimelineRow = Exclude<MatchTimelineEntry, { type: "event" }> | {
  type: "minute"; key: number; elapsed: number | null; extra: number | null; events: LiveMatchEvent[];
};

/** Share a clock only for consecutive, known full minutes, never across a period divider. */
export function matchTimelineRows(items: readonly LiveMatchEvent[], context: MatchTimelineContext): MatchTimelineRow[] {
  const rows: MatchTimelineRow[] = [];
  for (const entry of matchTimelineEntries(items, context)) {
    if (entry.type === "period") { rows.push(entry); continue; }
    const event = entry.event, previous = rows.at(-1);
    if (previous?.type === "minute" && event.elapsed !== null && previous.elapsed === event.elapsed && (previous.extra ?? 0) === (event.extra ?? 0)) {
      previous.events.push(event);
    } else {
      rows.push({ type: "minute", key: event.sequence, elapsed: event.elapsed, extra: event.extra, events: [event] });
    }
  }
  return rows;
}

/** Contextual period dividers, not fabricated whistle events or announced stoppage durations. */
export function matchTimelineEntries(items: readonly LiveMatchEvent[], context: MatchTimelineContext): MatchTimelineEntry[] {
  const chronological = newestMatchEvents(items).reverse();
  if (!chronological.length) return [];
  const clock = context.status === "live" ? context.clock : null;
  const penalties = context.status === "finished-penalties" || clock?.phase === "penalties";
  const hasExtraMinutes = chronological.some(event => event.elapsed !== null && event.elapsed > 90 && event.elapsed <= 120);
  const extraTime = context.status === "finished-extra-time" || context.status !== "finished-regulation"
    && (context.observedStatus === "finished-extra-time" || clock?.phase === "extra-time" || clock?.phase === "break" || penalties && hasExtraMinutes);
  const result: MatchTimelineEntry[] = [], added = new Set<number>();
  const periodMarkers = ["half-time", "extra-time", "extra-time-interval"] as const;
  let period = 0;
  const marker = (name: MatchPeriodMarker, boundary: number | null = null) => result.push({ type: "period", key: `${name}-${boundary ?? "boundary"}`,
    period: name, boundary, afterExtraTime: extraTime });
  const advance = (next: number) => {
    while (period < next) { marker(periodMarkers[period]!); period++; }
  };
  for (const event of chronological) {
    if (event.elapsed !== null) {
      advance(extraTime && event.elapsed > 105 ? 3 : extraTime && event.elapsed > 90 ? 2 : event.elapsed > 45 ? 1 : 0);
      if (event.extra !== null && event.extra > 0 && [45, 90, ...(extraTime ? [105, 120] : [])].includes(event.elapsed) && !added.has(event.elapsed)) {
        marker("added-time", event.elapsed); added.add(event.elapsed);
      }
    }
    result.push({ type: "event", event });
  }
  const finished = isPlayedFinalStatus(context.status);
  const target = extraTime && (finished || clock?.phase === "break" || penalties || (clock?.minute ?? 0) > 105) ? 3
    : extraTime ? 2 : finished || clock?.phase === "half-time" || clock?.phase === "second-half" || penalties ? 1 : 0;
  advance(target);
  if (penalties) marker("penalties");
  if (finished) marker("full-time");
  return result.reverse();
}

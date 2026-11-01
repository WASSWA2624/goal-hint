"use client";

import styled from "styled-components";
import type { LiveMatchEvent } from "@/domain/live-match";
import { matchEventPresentation, matchTimelineEntries, substitutionPlayers, type MatchTimelineContext, type MatchTimelineEntry } from "@/domain/match-event-presentation";
import type { Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { TeamLogo } from "./team-logo";
import { MatchEventSymbol } from "./match-event-symbol";
import { MatchPeriodSymbol } from "./match-period-symbol";
import { Icon } from "@/components/ui/icons";

const Timeline = styled.div`
  --event-time-width: 4.5rem;
  inline-size: 100%; max-inline-size: 1440px; margin-inline: auto; min-inline-size: 0;
  [data-team="home"] { grid-column: 1; }
  [data-team="away"] { grid-column: 3; }
  ${media.belowDesktop} { --event-time-width: 3.5rem; }
`;
const Teams = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) var(--event-time-width) minmax(0, 1fr); gap: 8px;
  align-items: center; padding-block: 4px 8px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  > svg { grid-column: 2; grid-row: 1; justify-self: center; inline-size: 16px; block-size: 16px; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Team = styled.div`
  display: flex; align-items: center; gap: 8px; min-inline-size: 0;
  --gh-logo-size: 24px; --gh-logo-font: 10px;
  &[data-team="home"] { flex-direction: row-reverse; text-align: end; }
  > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 3px 6px; min-inline-size: 0; }
  &[data-team="home"] > div { justify-content: end; }
  strong { font-size: .875rem; line-height: 1.4; overflow-wrap: anywhere; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  ${media.belowDesktop} { gap: 5px; --gh-logo-size: 24px; strong { font-size: .75rem; } }
`;
const List = styled.ol`
  position: relative; list-style: none; padding: 4px 0; margin: 0;
  &::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: 1px; background: ${({ theme }) => theme.color.border}; }
`;
const Row = styled.li`
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) var(--event-time-width) minmax(0, 1fr);
  column-gap: 8px; align-items: center; min-inline-size: 0; padding-block: 1px;
`;
const Minute = styled.span`
  grid-column: 2; grid-row: 1; justify-self: center; z-index: 1;
  padding: 4px 5px; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  font-size: .8125rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.3;
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  ${media.belowDesktop} { padding-inline: 2px; font-size: .6875rem; > span { font-size: .625rem; } }
`;
const Incident = styled.div`
  display: flex; align-items: center; gap: 7px; min-inline-size: 0; grid-row: 1; padding: 6px 8px;
  border-inline: 2px solid transparent;
  &[data-team="home"] { flex-direction: row-reverse; text-align: end; }
  > [data-symbol] { display: flex; flex: none; color: ${({ theme }) => theme.color.accent.violet.text}; }
  > [data-symbol] > svg { inline-size: 24px; block-size: 24px; }
  > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; min-inline-size: 0; overflow-wrap: anywhere; }
  &[data-team="home"] > div { justify-content: end; }
  [data-event-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; font-weight: 600; line-height: 1.3; }
  strong { font-size: .8125rem; font-weight: 700; line-height: 1.4; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; line-height: 1.4; }
  [data-player-on], [data-player-off] { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 3px 5px; }
  &[data-team="home"] [data-player-on], &[data-team="home"] [data-player-off] { justify-content: end; }
  [data-player-on] > small { color: ${({ theme }) => theme.color.accent.emerald.text}; font-weight: 700; }
  [data-player-off] > small { color: ${({ theme }) => theme.color.accent.red.text}; font-weight: 700; }
  [data-player-off] > span { color: ${({ theme }) => theme.color.mutedText}; font-size: .8125rem; }
  [data-arrow="on"] { stroke: ${({ theme }) => theme.color.accent.emerald.solid}; }
  [data-arrow="off"] { stroke: ${({ theme }) => theme.color.accent.red.solid}; }
  &[data-kind="goal"], &[data-kind="penalty-goal"] {
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent.emerald.soft} 38%, ${({ theme }) => theme.color.surface});
    [data-event-label] { color: ${({ theme }) => theme.color.accent.emerald.text}; }
  }
  &[data-kind="own-goal"] > [data-symbol] { color: ${({ theme }) => theme.color.accent.orange.solid}; }
  &[data-kind="red-card"], &[data-kind="second-yellow"] { background: color-mix(in srgb, ${({ theme }) => theme.color.accent.red.soft} 40%, ${({ theme }) => theme.color.surface}); }
  ${media.belowDesktop} {
    padding: 6px 2px; gap: 5px; border: 0;
    > [data-symbol] > svg { inline-size: 21px; block-size: 21px; }
    strong { font-size: .75rem; } small { font-size: .6875rem; }
    [data-event-label] { font-size: .625rem; } [data-player-off] > span { font-size: .6875rem; }
  }
`;
const Period = styled.li`
  position: relative; display: flex; align-items: center; gap: 12px; padding-block: 6px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem;
  &::before, &::after { content: ""; flex: 1; block-size: 1px; background: ${({ theme }) => theme.color.border}; }
  > span { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; background: ${({ theme }) => theme.color.surface}; }
  svg { inline-size: 15px; block-size: 15px; }
  b { color: ${({ theme }) => theme.color.text}; font-weight: 700; }
  small { font-size: inherit; }
`;

function PeriodRow({ entry, m }: { entry: Extract<MatchTimelineEntry, { type: "period" }>; m: Messages }) {
  const label = m.text(`liveMatch.period.${entry.period}`);
  return <Period role="presentation" data-event-period={entry.period} data-period-boundary={entry.boundary ?? undefined}>
    <span role="separator" aria-label={label} title={m.text("liveMatch.periodContext")}>
      <MatchPeriodSymbol period={entry.period} /><b>{label}</b>
      {entry.boundary !== null && <small>{m.number(entry.boundary)}′+</small>}
      {entry.period === "extra-time" && <small>{m.text("liveMatch.regulationComplete")}</small>}
      {entry.period === "full-time" && entry.afterExtraTime && <small>{m.text("liveMatch.afterExtraTime")}</small>}
    </span>
  </Period>;
}

function EventRow({ event, home, away, m }: { event: LiveMatchEvent; home: string; away: string; m: Messages }) {
  const { kind, detail, comments } = matchEventPresentation(event), players = substitutionPlayers(event);
  const namedKind = ["own-goal", "penalty-goal", "missed-penalty", "second-yellow"].includes(kind);
  const minute = event.elapsed === null ? m.text("liveMatch.minuteUnknown")
    : `${m.number(event.elapsed)}${event.extra ? `+${m.number(event.extra)}` : ""}′`;
  return <Row data-match-event={event.sequence} data-event-team={event.team} data-event-kind={kind}>
    <Minute data-event-minute title={minute} aria-label={minute}>
      {event.elapsed === null ? "—" : <>{m.number(event.elapsed)}{event.extra !== null && event.extra > 0 && <span>+{m.number(event.extra)}</span>}′</>}
    </Minute>
    <Incident data-team={event.team} data-kind={kind} role="group" aria-label={event.team === "home" ? home : away}>
      <span data-symbol role="img" aria-hidden={namedKind || undefined} aria-label={m.text(`liveMatch.incident.${kind}`)} title={m.text(`liveMatch.incident.${kind}`)}><MatchEventSymbol kind={kind} /></span><div>
        {namedKind && <span data-event-label>{m.text(`liveMatch.incident.${kind}`)}</span>}
        {event.type === "substitution" ? <>
          <span data-player-on><small>{m.text("liveMatch.playerOn")}</small><strong>{players.on ?? m.text("liveMatch.playerUnknown")}</strong></span>
          <span data-player-off><small>{m.text("liveMatch.playerOff")}</small><span>{players.off ?? m.text("liveMatch.playerUnknown")}</span></span>
        </> : <>
          {(event.player || event.type !== "var") && <strong>{event.player ?? m.text("liveMatch.playerUnknown")}</strong>}
          {event.assist && <small>{m.text(event.type === "goal" ? "liveMatch.assist" : "liveMatch.relatedPlayer", { player: event.assist })}</small>}
        </>}
        {detail && <small data-event-detail>{detail}</small>}{comments && <small>{comments}</small>}
      </div>
    </Incident>
  </Row>;
}

/** Compact incidents retain source order; contextual period dividers have no invented whistle timestamp. */
export function MatchEventTimeline({ events, home, away, homeLogoUrl, awayLogoUrl, context, m }: {
  events: readonly LiveMatchEvent[]; home: string; away: string; homeLogoUrl?: string | null; awayLogoUrl?: string | null; m: Messages;
  context: MatchTimelineContext;
}) {
  return <Timeline data-match-event-timeline>
    <Teams>
      <Team data-team="home"><TeamLogo name={home} url={homeLogoUrl ?? undefined} eager={false} size={24} /><div><strong>{home}</strong><small>{m.text("liveMatch.home")}</small></div></Team>
      <Icon><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></Icon>
      <Team data-team="away"><TeamLogo name={away} url={awayLogoUrl ?? undefined} eager={false} size={24} /><div><strong>{away}</strong><small>{m.text("liveMatch.away")}</small></div></Team>
    </Teams>
    <List aria-label={m.text("liveMatch.timelineLabel")}>
      {matchTimelineEntries(events, context).map(entry => entry.type === "event"
        ? <EventRow key={entry.event.sequence} event={entry.event} home={home} away={away} m={m} />
        : <PeriodRow key={entry.key} entry={entry} m={m} />)}
    </List>
  </Timeline>;
}

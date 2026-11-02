"use client";

import styled from "styled-components";
import type { LiveMatchEvent } from "@/domain/live-match";
import { matchEventPresentation, matchTimelineRows, substitutionPlayers, type MatchTimelineContext, type MatchTimelineEntry, type MatchTimelineRow } from "@/domain/match-event-presentation";
import type { Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { TeamLogo } from "./team-logo";
import { MatchEventSymbol } from "./match-event-symbol";
import { MatchPeriodSymbol } from "./match-period-symbol";
import { Icon } from "@/components/ui/icons";

const Timeline = styled.div`
  --event-time-width: var(--gh-size-18);
  inline-size: 100%; max-inline-size: var(--gh-size-360); margin-inline: auto; min-inline-size: 0;
  [data-team="home"] { grid-column: 1; }
  [data-team="away"] { grid-column: 3; }
  ${media.belowDesktop} { --event-time-width: var(--gh-size-14); }
`;
const Teams = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) var(--event-time-width) minmax(0, 1fr); gap: var(--gh-spacing-2);
  align-items: center; padding-block: var(--gh-spacing-1) var(--gh-spacing-2); border-block-end: 0;
  > svg { grid-column: 2; grid-row: 1; justify-self: center; inline-size: var(--gh-size-4); block-size: var(--gh-size-4); color: ${({ theme }) => theme.color.mutedText}; }
`;
const Team = styled.div`
  display: flex; align-items: center; gap: var(--gh-spacing-2); min-inline-size: 0;
  --gh-logo-size: var(--gh-size-6); --gh-logo-font: var(--gh-size-2_5);
  &[data-team="home"] { flex-direction: row-reverse; text-align: end; }
  > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--gh-spacing-0_75) var(--gh-spacing-1_5); min-inline-size: 0; }
  &[data-team="home"] > div { justify-content: end; }
  strong { font-size: var(--gh-font-emphasis); line-height: var(--gh-leading-compact); overflow-wrap: anywhere; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); }
  ${media.belowDesktop} { gap: var(--gh-spacing-1_25); --gh-logo-size: var(--gh-size-6); strong { font-size: var(--gh-font-secondary); } }
`;
const List = styled.ol`
  position: relative; list-style: none; padding: var(--gh-spacing-1) 0; margin: 0;
  &::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: var(--gh-size-0_25); background: ${({ theme }) => theme.color.border}; }
`;
const Row = styled.li`
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) var(--event-time-width) minmax(0, 1fr);
  column-gap: var(--gh-spacing-2); align-items: center; min-inline-size: 0; padding-block: var(--gh-spacing-0_25);
`;
const TeamEvents = styled.div`
  display: flex; flex-direction: column; gap: var(--gh-spacing-0_5); grid-row: 1; align-self: start; min-inline-size: 0;
`;
const Minute = styled.span`
  grid-column: 2; grid-row: 1; justify-self: center; z-index: var(--gh-layer-content);
  padding: var(--gh-spacing-1) var(--gh-spacing-1_25); color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  font-size: var(--gh-font-body); font-weight: var(--gh-weight-heavy); font-variant-numeric: tabular-nums; white-space: nowrap; line-height: var(--gh-leading-label);
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); }
  ${media.belowDesktop} { padding-inline: var(--gh-spacing-0_5); font-size: var(--gh-font-caption); > span { font-size: var(--gh-font-micro); } }
`;
const Incident = styled.div`
  display: flex; align-items: center; gap: var(--gh-spacing-1_75); min-inline-size: 0; grid-row: 1; padding: var(--gh-spacing-1_5) var(--gh-spacing-2);
  border-inline: 0;
  &[data-team="home"] { flex-direction: row-reverse; text-align: end; }
  > [data-symbol] { display: flex; flex: none; color: ${({ theme }) => theme.color.accent.violet.text}; }
  > [data-symbol] > svg { inline-size: var(--gh-size-6); block-size: var(--gh-size-6); }
  > div { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--gh-spacing-1) var(--gh-spacing-2); min-inline-size: 0; overflow-wrap: anywhere; }
  &[data-team="home"] > div { justify-content: end; }
  [data-event-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption); font-weight: var(--gh-weight-semibold); line-height: var(--gh-leading-label); }
  strong { font-size: var(--gh-font-body); font-weight: var(--gh-weight-bold); line-height: var(--gh-leading-compact); }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-compact); }
  [data-player-on], [data-player-off] { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: var(--gh-spacing-0_75) var(--gh-spacing-1_25); }
  &[data-team="home"] [data-player-on], &[data-team="home"] [data-player-off] { justify-content: end; }
  [data-player-on] > small { color: ${({ theme }) => theme.color.accent.emerald.text}; font-weight: var(--gh-weight-bold); }
  [data-player-off] > small { color: ${({ theme }) => theme.color.accent.red.text}; font-weight: var(--gh-weight-bold); }
  [data-player-off] > span { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-body); }
  [data-arrow="on"] { stroke: ${({ theme }) => theme.color.accent.emerald.solid}; }
  [data-arrow="off"] { stroke: ${({ theme }) => theme.color.accent.red.solid}; }
  &[data-kind="goal"], &[data-kind="penalty-goal"] {
    background: color-mix(in srgb, ${({ theme }) => theme.color.accent.emerald.soft} 38%, ${({ theme }) => theme.color.surface});
    [data-event-label] { color: ${({ theme }) => theme.color.accent.emerald.text}; }
  }
  &[data-kind="own-goal"] > [data-symbol] { color: ${({ theme }) => theme.color.accent.orange.solid}; }
  &[data-kind="red-card"], &[data-kind="second-yellow"] { background: color-mix(in srgb, ${({ theme }) => theme.color.accent.red.soft} 40%, ${({ theme }) => theme.color.surface}); }
  ${media.belowDesktop} {
    padding: var(--gh-spacing-1_5) var(--gh-spacing-0_5); gap: var(--gh-spacing-1_25); border: 0;
    > [data-symbol] > svg { inline-size: var(--gh-size-5_25); block-size: var(--gh-size-5_25); }
    strong { font-size: var(--gh-font-secondary); } small { font-size: var(--gh-font-caption); }
    [data-event-label] { font-size: var(--gh-font-micro); } [data-player-off] > span { font-size: var(--gh-font-caption); }
  }
`;
const Period = styled.li`
  position: relative; display: flex; align-items: center; gap: var(--gh-spacing-3); padding-block: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-caption);
  &::before, &::after { content: ""; flex: 1; block-size: var(--gh-size-0_25); background: ${({ theme }) => theme.color.border}; }
  > span { position: relative; z-index: var(--gh-layer-content); display: inline-flex; align-items: center; gap: var(--gh-spacing-1_5); padding: var(--gh-spacing-0_75) var(--gh-spacing-2); background: ${({ theme }) => theme.color.surface}; }
  svg { inline-size: var(--gh-size-3_75); block-size: var(--gh-size-3_75); }
  b { color: ${({ theme }) => theme.color.text}; font-weight: var(--gh-weight-bold); }
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

function EventIncident({ event, home, away, m }: { event: LiveMatchEvent; home: string; away: string; m: Messages }) {
  const { kind, detail, comments } = matchEventPresentation(event), players = substitutionPlayers(event);
  const namedKind = ["own-goal", "penalty-goal", "missed-penalty", "second-yellow"].includes(kind);
  return <Incident data-match-event={event.sequence} data-event-team={event.team} data-event-kind={kind}
      data-team={event.team} data-kind={kind} role="group" aria-label={event.team === "home" ? home : away}>
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
    </Incident>;
}

function MinuteRow({ row, home, away, m }: { row: Extract<MatchTimelineRow, { type: "minute" }>; home: string; away: string; m: Messages }) {
  const minute = row.elapsed === null ? m.text("liveMatch.minuteUnknown")
    : `${m.number(row.elapsed)}${row.extra ? `+${m.number(row.extra)}` : ""}′`;
  return <Row data-event-row={row.key} aria-label={minute}>
    <Minute data-event-minute title={minute} aria-label={minute}>
      {row.elapsed === null ? "—" : <>{m.number(row.elapsed)}{row.extra !== null && row.extra > 0 && <span>+{m.number(row.extra)}</span>}′</>}
    </Minute>
    {(["home", "away"] as const).map(team => <TeamEvents key={team} data-team={team}>
      {row.events.filter(event => event.team === team).map(event => <EventIncident key={event.sequence} event={event} home={home} away={away} m={m} />)}
    </TeamEvents>)}
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
      {matchTimelineRows(events, context).map(entry => entry.type === "minute"
        ? <MinuteRow key={entry.key} row={entry} home={home} away={away} m={m} />
        : <PeriodRow key={entry.key} entry={entry} m={m} />)}
    </List>
  </Timeline>;
}

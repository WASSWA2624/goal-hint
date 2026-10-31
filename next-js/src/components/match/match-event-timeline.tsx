"use client";

import styled from "styled-components";
import type { LiveMatchEvent } from "@/domain/live-match";
import { matchEventPresentation, newestMatchEvents, substitutionPlayers } from "@/domain/match-event-presentation";
import type { Messages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { TeamLogo } from "./team-logo";
import { MatchEventSymbol } from "./match-event-symbol";

const Timeline = styled.div`
  --event-time-width: 5.5rem;
  inline-size: 100%; max-inline-size: 1040px; margin-inline: auto; min-inline-size: 0;
  [data-team="home"] { grid-column: 1; }
  [data-team="away"] { grid-column: 3; }
  ${media.belowDesktop} { --event-time-width: 3.5rem; }
`;
const Teams = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) var(--event-time-width) minmax(0, 1fr); gap: 8px;
  align-items: center; padding-block: 10px 16px; border-block-end: 1px solid ${({ theme }) => theme.color.border};
  > small { grid-column: 2; grid-row: 1; text-align: center; color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; line-height: 1.4; }
`;
const Team = styled.div`
  display: flex; align-items: center; gap: 8px; min-inline-size: 0;
  --gh-logo-size: 28px; --gh-logo-font: 11px;
  &[data-team="home"] { flex-direction: row-reverse; text-align: end; }
  > div { display: grid; gap: 2px; min-inline-size: 0; }
  strong { font-size: .875rem; line-height: 1.4; overflow-wrap: anywhere; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  ${media.belowDesktop} { gap: 5px; --gh-logo-size: 24px; strong { font-size: .75rem; } }
`;
const List = styled.ol`
  position: relative; list-style: none; padding: 8px 0; margin: 0;
  &::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 50%; inline-size: 1px; background: ${({ theme }) => theme.color.border}; }
`;
const Row = styled.li`
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr) var(--event-time-width) minmax(0, 1fr);
  column-gap: 8px; align-items: start; min-inline-size: 0; padding-block: 3px;
`;
const Minute = styled.span`
  grid-column: 2; grid-row: 1; justify-self: center; z-index: 1; margin-block-start: 13px;
  padding: 4px 5px; color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.surface};
  font-size: .8125rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.3;
  > span { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; }
  ${media.belowDesktop} { padding-inline: 2px; font-size: .6875rem; > span { font-size: .625rem; } }
`;
const Incident = styled.div`
  display: flex; align-items: start; gap: 10px; min-inline-size: 0; grid-row: 1; padding: 10px 12px;
  border-inline: 2px solid transparent;
  &[data-team="home"] { flex-direction: row-reverse; text-align: end; }
  > svg { flex: none; inline-size: 30px; block-size: 30px; margin-block-start: 1px; color: ${({ theme }) => theme.color.accent.violet.text}; }
  > div { display: grid; gap: 3px; min-inline-size: 0; overflow-wrap: anywhere; }
  [data-event-label] { color: ${({ theme }) => theme.color.mutedText}; font-size: .6875rem; font-weight: 600; line-height: 1.3; }
  strong { font-size: .875rem; font-weight: 700; line-height: 1.4; }
  small { color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem; line-height: 1.4; }
  [data-player-on], [data-player-off] { display: flex; align-items: baseline; flex-wrap: wrap; gap: 3px 6px; }
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
  &[data-kind="own-goal"] > svg { color: ${({ theme }) => theme.color.accent.orange.solid}; }
  &[data-kind="red-card"], &[data-kind="second-yellow"] { background: color-mix(in srgb, ${({ theme }) => theme.color.accent.red.soft} 40%, ${({ theme }) => theme.color.surface}); }
  ${media.belowDesktop} {
    padding: 8px 2px; gap: 5px; border: 0;
    > svg { inline-size: 23px; block-size: 23px; }
    strong { font-size: .75rem; } small { font-size: .6875rem; }
    [data-event-label] { font-size: .625rem; } [data-player-off] > span { font-size: .6875rem; }
  }
`;

function EventRow({ event, home, away, m }: { event: LiveMatchEvent; home: string; away: string; m: Messages }) {
  const { kind, detail, comments } = matchEventPresentation(event), players = substitutionPlayers(event);
  const minute = event.elapsed === null ? m.text("liveMatch.minuteUnknown")
    : `${m.number(event.elapsed)}${event.extra ? `+${m.number(event.extra)}` : ""}′`;
  return <Row data-match-event={event.sequence} data-event-team={event.team} data-event-kind={kind}>
    <Minute data-event-minute title={minute} aria-label={minute}>
      {event.elapsed === null ? "—" : <>{m.number(event.elapsed)}{event.extra !== null && event.extra > 0 && <span>+{m.number(event.extra)}</span>}′</>}
    </Minute>
    <Incident data-team={event.team} data-kind={kind} role="group" aria-label={event.team === "home" ? home : away}>
      <MatchEventSymbol kind={kind} /><div>
        <span data-event-label>{m.text(`liveMatch.incident.${kind}`)}</span>
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

/** A shared two-sided timeline; source sequence is reversed without reconstructing scores or periods. */
export function MatchEventTimeline({ events, home, away, homeLogoUrl, awayLogoUrl, m }: {
  events: readonly LiveMatchEvent[]; home: string; away: string; homeLogoUrl?: string | null; awayLogoUrl?: string | null; m: Messages;
}) {
  return <Timeline data-match-event-timeline>
    <Teams>
      <Team data-team="home"><TeamLogo name={home} url={homeLogoUrl ?? undefined} eager={false} size={28} /><div><strong>{home}</strong><small>{m.text("liveMatch.home")}</small></div></Team>
      <small>{m.text("liveMatch.latestFirst")}</small>
      <Team data-team="away"><TeamLogo name={away} url={awayLogoUrl ?? undefined} eager={false} size={28} /><div><strong>{away}</strong><small>{m.text("liveMatch.away")}</small></div></Team>
    </Teams>
    <List aria-label={m.text("liveMatch.timelineLabel")}>
      {newestMatchEvents(events).map(event => <EventRow key={event.sequence} event={event} home={home} away={away} m={m} />)}
    </List>
  </Timeline>;
}

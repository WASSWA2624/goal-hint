"use client";

import styled from "styled-components";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { LiveMatchSnapshot, LiveMatchStatistics, LiveMatchEvents, LiveMatchEvent } from "@/domain/live-match";
import { isPlayedFinalStatus, type SettlementStatus } from "@/domain/market-settlement";
import type { Messages } from "@/i18n/messages";
import { useMessages } from "@/i18n/use-messages";
import { MutedText, SectionHeading, Stack, Surface } from "@/components/ui/layout";

const Frame = styled(Surface)`
  border-radius: ${({ theme }) => theme.radius.surface};
  overflow-wrap: anywhere;
`;
const Stats = styled.table`
  inline-size: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
  th, td { padding: 8px 4px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
  th { text-align: start; }
  td, thead th:not(:first-child) { text-align: end; }
  th:first-child { inline-size: 44%; }
  caption { text-align: start; font-weight: 600; padding-block-end: 8px; }
`;
const Events = styled.ol`
  list-style: none;
  padding: 0;
  margin-block: 8px 0;
  > li { display: grid; grid-template-columns: minmax(3rem, auto) minmax(0, 1fr); gap: 8px;
    padding-block: 8px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; }
`;
const instant = (at: number, m: Messages) => m.reportingInstant(utcInstantFromEpochMilliseconds(at));

function SourceStatus({ source, kind, stale, m }: { source: LiveMatchStatistics | LiveMatchEvents; kind: string; stale: boolean; m: Messages }) {
  const reason = source.state === "partial" ? "liveMatch.partial" : source.state !== "unavailable" ? null
    : source.reason === "coverage-unavailable" ? "liveMatch.noCoverage"
    : source.reason === "coverage-unknown" ? "liveMatch.coverageUnknown"
    : source.reason === "not-collected" ? "liveMatch.waiting" : "liveMatch.unavailable";
  return <>
    {reason && <MutedText>{m.text(reason, { kind })}</MutedText>}
    {stale && source.retrievedAt !== null && <MutedText role="status">{m.text("liveMatch.stale")}</MutedText>}
    {source.retrievedAt !== null && <MutedText><time dateTime={new Date(source.retrievedAt).toISOString()}>
      {m.text("liveMatch.retrieved", { time: instant(source.retrievedAt, m) })}</time></MutedText>}
    <MutedText>{source.providerUpdatedAt === null ? m.text("liveMatch.updateUnknown")
      : <time dateTime={new Date(source.providerUpdatedAt).toISOString()}>{m.text("liveMatch.updated", { time: instant(source.providerUpdatedAt, m) })}</time>}</MutedText>
  </>;
}
function Event({ event, home, away, m }: { event: LiveMatchEvent; home: string; away: string; m: Messages }) {
  const minute = event.elapsed === null ? m.text("liveMatch.minuteUnknown")
    : `${m.number(event.elapsed)}${event.extra ? `+${m.number(event.extra)}` : ""}′`;
  return <li><span>{minute}</span><div>
    <strong>{m.text(`liveMatch.event.${event.type}`)} · {event.team === "home" ? home : away}</strong>
    {event.detail && <small>{event.detail}</small>}{event.player && <span>{event.player}</span>}
    {event.assist && <small>{m.text(event.type === "goal" ? "liveMatch.assist" : "liveMatch.relatedPlayer", { player: event.assist })}</small>}
    {event.comments && <small>{event.comments}</small>}
  </div></li>;
}

/** Public match observations use their own clocks and never replace a pre-match forecast. */
export function LiveMatchPanel({ snapshot, asOf, home, away, locale, historical = false, fixtureStatus, section = "all" }: {
  snapshot: LiveMatchSnapshot | null; asOf: number; home: string; away: string; locale?: string; historical?: boolean; fixtureStatus?: SettlementStatus; section?: "all" | "statistics" | "events";
}) {
  const m = useMessages(locale);
  const status = fixtureStatus ?? snapshot?.status;
  const recorded = (value: SettlementStatus | undefined) => value !== undefined && value !== "live" && value !== "scheduled" && value !== "unknown";
  const retained = historical || recorded(status) || recorded(snapshot?.status);
  const stale = (source: LiveMatchStatistics | LiveMatchEvents) => !retained && source.retrievedAt !== null
    && asOf - source.retrievedAt > snapshot!.staleAfterMs;
  return <Frame aria-labelledby="match-observations-title" data-live-match><Stack $gap="sm">
    <SectionHeading id="match-observations-title">{m.text(section === "all" ? "liveMatch.title" : section === "events" ? "liveMatch.events" : "liveMatch.statistics")}</SectionHeading>
    <MutedText>{m.text("liveMatch.separate")}</MutedText>
    {!snapshot ? <MutedText>{m.text("liveMatch.notCollected")}</MutedText> : <>
      <strong>{m.text(historical ? "liveMatch.retained" : status === "live" && snapshot.status === "live" ? "liveMatch.live"
        : status !== undefined && isPlayedFinalStatus(status) && isPlayedFinalStatus(snapshot.status) ? "liveMatch.final" : "liveMatch.retained")}</strong>
      {section !== "events" && <section aria-labelledby={section === "all" ? "match-statistics-title" : "match-observations-title"}><Stack $gap="sm">
        {section === "all" && <h3 id="match-statistics-title">{m.text("liveMatch.statistics")}</h3>}
        <SourceStatus source={snapshot.statistics} kind={m.text("liveMatch.statistics")} stale={stale(snapshot.statistics)} m={m} />
        {snapshot.statistics.items.length > 0 && <Stats>
          <thead><tr><th scope="col">{m.text("liveMatch.statistic")}</th><th scope="col">{home}</th><th scope="col">{away}</th></tr></thead>
          <tbody>{snapshot.statistics.items.map((row) => <tr key={row.metric} data-match-statistic={row.metric}>
            <th scope="row">{m.text(`liveMatch.metric.${row.metric}`)}</th>
            {[row.home, row.away].map((value, index) => <td key={index}>{value === null ? "—" : row.unit === "percent"
              ? m.number(value / 100, { style: "percent", maximumFractionDigits: 1 }) : m.number(value)}</td>)}
          </tr>)}</tbody>
        </Stats>}
      </Stack></section>}
      {section !== "statistics" && <section aria-labelledby={section === "all" ? "match-events-title" : "match-observations-title"}><Stack $gap="sm">
        {section === "all" && <h3 id="match-events-title">{m.text("liveMatch.events")}</h3>}
        <SourceStatus source={snapshot.events} kind={m.text("liveMatch.events")} stale={stale(snapshot.events)} m={m} />
        {snapshot.events.state === "available" && snapshot.events.items.length === 0 && <MutedText>{m.text("liveMatch.noEvents")}</MutedText>}
        {snapshot.events.items.length > 0 && <details open={section === "events" || undefined}><summary>{m.text("liveMatch.eventCount", { count: m.number(snapshot.events.items.length) })}</summary>
          <Events>{snapshot.events.items.map((event) => <Event key={event.sequence} event={event} home={home} away={away} m={m} />)}</Events>
        </details>}
      </Stack></section>}
    </>}
    <MutedText>{m.text("liveMatch.provider")}</MutedText>
  </Stack></Frame>;
}

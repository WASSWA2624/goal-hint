"use client";

import { filledTableRows } from "@/components/ui/filled-surfaces";
import styled from "styled-components";
import { utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { LiveMatchSnapshot, LiveMatchStatistics, LiveMatchEvents } from "@/domain/live-match";
import { isPlayedFinalStatus, type SettlementStatus } from "@/domain/market-settlement";
import type { Messages } from "@/i18n/messages";
import type { FixtureSnapshot } from "@/domain/fixture-snapshot";
import type { MatchTimelineContext } from "@/domain/match-event-presentation";
import { useMessages } from "@/i18n/use-messages";
import { MutedText, SectionHeading, Stack, Surface } from "@/components/ui/layout";
import { HistoryIcon } from "./details/details-icons";
import { MatchEventTimeline } from "./match-event-timeline";
import { MatchEventSymbol } from "./match-event-symbol";
import { Icon } from "@/components/ui/icons";

const Frame = styled(Surface)<{ $embedded: boolean }>`
  border-radius: ${({ theme }) => theme.radius.surface};
  overflow-wrap: anywhere;
  ${({ $embedded, theme }) => $embedded ? `&& { padding: 0; border: 0; border-radius: ${theme.radius.none}; }` : ""}
`;
const Stats = styled.table`
  ${filledTableRows}
  inline-size: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;
  th, td { padding: 8px 4px; border-block-end: 0; }
  th { text-align: start; }
  td, thead th:not(:first-child) { text-align: end; }
  th:first-child { inline-size: 44%; }
  caption { text-align: start; font-weight: 600; padding-block-end: 8px; }
`;
const EventToolbar = styled.div`
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; min-block-size: 32px;
  color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem;
  h2 { display: inline-flex; align-items: center; gap: 7px; margin: 0; color: ${({ theme }) => theme.color.text}; font-size: 1rem; line-height: 1.4; }
  h2 > svg { inline-size: 18px; block-size: 18px; color: ${({ theme }) => theme.color.brand}; }
  [data-legend], [data-meta], [data-sort] { display: inline-flex; align-items: center; gap: 10px; }
  [data-legend] > span { display: inline-flex; }
  [data-legend] svg { inline-size: 19px; block-size: 19px; }
  [data-legend] [data-arrow="on"] { stroke: ${({ theme }) => theme.color.accent.emerald.solid}; }
  [data-legend] [data-arrow="off"] { stroke: ${({ theme }) => theme.color.accent.red.solid}; }
  [data-meta] { margin-inline-start: auto; flex-wrap: wrap; }
  [data-sort] { gap: 4px; font-size: .6875rem; }
  [data-sort] svg { inline-size: 13px; block-size: 13px; }
  [data-current-live] { display: inline-flex; align-items: center; gap: 6px; color: ${({ theme }) => theme.color.live.text}; }
  [data-current-live]::before { content: ""; inline-size: 6px; block-size: 6px; border-radius: ${({ theme }) => theme.radius.circle}; background: currentColor; }
`;
const EventSource = styled.details`
  margin-block-start: 12px; border-block-start: 0;
  color: ${({ theme }) => theme.color.mutedText}; font-size: .75rem;
  > summary { padding-block: 12px; cursor: pointer; }
  > div { display: grid; gap: 6px; padding-block-end: 8px; }
`;
const EventsEmpty = styled.div`
  display: flex; gap: 12px; align-items: center; padding: 20px;
  background: ${({ theme }) => theme.color.surfaceMuted};
  > svg { flex: none; inline-size: 30px; block-size: 30px; color: ${({ theme }) => theme.color.mutedText}; }
`;
const instant = (at: number, m: Messages) => m.reportingInstant(utcInstantFromEpochMilliseconds(at));

type SourceProps = { source: LiveMatchStatistics | LiveMatchEvents; kind: string; stale: boolean; m: Messages };
function SourceNotice({ source, kind, stale, m }: SourceProps) {
  const reason = source.state === "partial" ? "liveMatch.partial" : source.state !== "unavailable" ? null
    : source.reason === "coverage-unavailable" ? "liveMatch.noCoverage"
    : source.reason === "coverage-unknown" ? "liveMatch.coverageUnknown"
    : source.reason === "not-collected" ? "liveMatch.waiting" : "liveMatch.unavailable";
  return <>
    {reason && <MutedText>{m.text(reason, { kind })}</MutedText>}
    {stale && source.retrievedAt !== null && <MutedText role="status">{m.text("liveMatch.stale")}</MutedText>}
  </>;
}
function SourceClocks({ source, m }: Pick<SourceProps, "source" | "m">) {
  return <>{source.retrievedAt !== null && <MutedText><time dateTime={new Date(source.retrievedAt).toISOString()}>
      {m.text("liveMatch.retrieved", { time: instant(source.retrievedAt, m) })}</time></MutedText>}
    <MutedText>{source.providerUpdatedAt === null ? m.text("liveMatch.updateUnknown")
      : <time dateTime={new Date(source.providerUpdatedAt).toISOString()}>{m.text("liveMatch.updated", { time: instant(source.providerUpdatedAt, m) })}</time>}</MutedText>
  </>;
}
function SourceStatus(props: SourceProps) {
  return <><SourceNotice {...props} /><SourceClocks source={props.source} m={props.m} /></>;
}

/** Public match observations use their own clocks and never replace a pre-match forecast. */
export function LiveMatchPanel({ snapshot, asOf, home, away, homeLogoUrl = null, awayLogoUrl = null, liveClock = null, locale, historical = false, fixtureStatus, section = "all", embedded = false }: {
  snapshot: LiveMatchSnapshot | null; asOf: number; home: string; away: string; locale?: string; historical?: boolean; fixtureStatus?: SettlementStatus; section?: "all" | "statistics" | "events";
  homeLogoUrl?: string | null; awayLogoUrl?: string | null; embedded?: boolean;
  liveClock?: FixtureSnapshot["liveClock"];
}) {
  const m = useMessages(locale);
  const status = fixtureStatus ?? snapshot?.status;
  const recorded = (value: SettlementStatus | undefined) => value !== undefined && value !== "live" && value !== "scheduled" && value !== "unknown";
  const retained = historical || recorded(status) || recorded(snapshot?.status);
  const stale = (source: LiveMatchStatistics | LiveMatchEvents) => !retained && source.retrievedAt !== null
    && asOf - source.retrievedAt > snapshot!.staleAfterMs;
  const isLive = !historical && status === "live" && snapshot?.status === "live";
  const finalData = status !== undefined && isPlayedFinalStatus(status) && snapshot !== null && isPlayedFinalStatus(snapshot.status);
  const stateLabel = m.text(historical ? "liveMatch.retained" : isLive ? "liveMatch.live"
    : finalData ? "liveMatch.final" : "liveMatch.retained");
  const context: MatchTimelineContext = { status: historical ? snapshot?.status ?? "unknown" : status ?? "unknown",
    observedStatus: snapshot?.status ?? "unknown", clock: historical ? null : liveClock };
  const hasEvents = Boolean(snapshot?.events.items.length);
  if (section === "events") return <Frame as={embedded ? "div" : "section"} $embedded={embedded} aria-labelledby={embedded ? undefined : "match-events-title"} data-live-match>
    <Stack $gap="sm">
      <EventToolbar data-event-toolbar>
        {!embedded && <h2 id="match-events-title"><HistoryIcon />{m.text("liveMatch.eventHeading")}</h2>}
        {hasEvents && <div data-legend>{([['goal', 'goal'], ['yellow-card', 'card'], ['substitution', 'substitution'], ['var', 'var']] as const).map(([kind, type]) =>
          <span key={kind} role="img" aria-label={m.text(`liveMatch.event.${type}`)} title={m.text(`liveMatch.event.${type}`)}><MatchEventSymbol kind={kind} /></span>)}</div>}
        <div data-meta>
          {isLive && <strong data-current-live>{m.text("match.status.live")}</strong>}
          {snapshot && !isLive && (historical || !finalData) && <span title={stateLabel}>{m.text("liveMatch.recordedShort")}</span>}
          {snapshot && (hasEvents || snapshot.events.state === "available") && <span>{m.plural("liveMatch.incidentCount", snapshot.events.items.length)}</span>}
          {hasEvents && <span data-sort><Icon><path d="M12 20V4m-5 5 5-5 5 5" /></Icon>{m.text("liveMatch.latestFirst")}</span>}
        </div>
      </EventToolbar>
      {!snapshot ? <EventsEmpty><HistoryIcon /><MutedText>{m.text("liveMatch.eventsNotCollected")}</MutedText></EventsEmpty> : <>
        <SourceNotice source={snapshot.events} kind={m.text("liveMatch.events")} stale={stale(snapshot.events)} m={m} />
        {snapshot.events.state === "available" && snapshot.events.items.length === 0 && <EventsEmpty><HistoryIcon /><MutedText>{m.text("liveMatch.noEvents")}</MutedText></EventsEmpty>}
        {snapshot.events.items.length > 0 && <MatchEventTimeline events={snapshot.events.items} home={home} away={away} homeLogoUrl={homeLogoUrl} awayLogoUrl={awayLogoUrl} context={context} m={m} />}
        <EventSource data-event-source><summary>{m.text("liveMatch.eventSource")}</summary><div>
          <strong>{stateLabel}</strong><SourceClocks source={snapshot.events} m={m} /><MutedText>{m.text("liveMatch.provider")}</MutedText>
          <MutedText>{m.text("liveMatch.periodContext")}</MutedText><MutedText>{m.text("liveMatch.separate")}</MutedText>
        </div></EventSource>
      </>}
    </Stack>
  </Frame>;
  return <Frame $embedded={embedded} aria-label={embedded ? m.text("liveMatch.statistics") : undefined} aria-labelledby={embedded ? undefined : "match-observations-title"} data-live-match><Stack $gap="sm">
    {!embedded && <SectionHeading id="match-observations-title">{m.text(section === "all" ? "liveMatch.title" : "liveMatch.statistics")}</SectionHeading>}
    <MutedText>{m.text("liveMatch.separate")}</MutedText>
    {!snapshot ? <MutedText>{m.text("liveMatch.notCollected")}</MutedText> : <>
      <strong>{stateLabel}</strong>
      <section aria-label={embedded ? m.text("liveMatch.statistics") : undefined} aria-labelledby={embedded ? undefined : section === "all" ? "match-statistics-title" : "match-observations-title"}><Stack $gap="sm">
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
      </Stack></section>
      {section !== "statistics" && <section aria-labelledby="match-events-title"><Stack $gap="sm">
        {section === "all" && <h3 id="match-events-title">{m.text("liveMatch.events")}</h3>}
        <SourceStatus source={snapshot.events} kind={m.text("liveMatch.events")} stale={stale(snapshot.events)} m={m} />
        {snapshot.events.state === "available" && snapshot.events.items.length === 0 && <MutedText>{m.text("liveMatch.noEvents")}</MutedText>}
        {snapshot.events.items.length > 0 && <details><summary>{m.text("liveMatch.eventCount", { count: m.number(snapshot.events.items.length) })}</summary>
          <MatchEventTimeline events={snapshot.events.items} home={home} away={away} homeLogoUrl={homeLogoUrl} awayLogoUrl={awayLogoUrl} context={context} m={m} />
        </details>}
      </Stack></section>}
    </>}
    <MutedText>{m.text("liveMatch.provider")}</MutedText>
  </Stack></Frame>;
}

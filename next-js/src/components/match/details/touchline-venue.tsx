"use client";

import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { ContextIcon } from "./details-icons";
import { Crest, Facts, Note, SectionState, useStableDetails } from "./details-ui";
import { TouchlineEmpty } from "./touchline-ui";
import { useInsightSection } from "./use-match-view";
import { FootballPitch } from "../football-pitch";
import { pitchCanvas } from "@/domain/football-pitch";

const Table = styled.table`
  inline-size: 100%; border-collapse: collapse; font-size: .875rem; font-variant-numeric: tabular-nums;
  th, td { padding: 15px 12px; border-block-end: 1px solid ${({ theme }) => theme.color.border}; text-align: start; }
  thead { color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted}; font-size: .75rem; }
  tbody th > span { display: inline-flex; align-items: center; gap: 8px; }
  td:last-child { font-weight: 800; }
`;
const Ground = styled.div`
  padding: 24px; border: 1px solid ${({ theme }) => theme.color.border};
  > svg { display: block; inline-size: min(100%, 360px); aspect-ratio: ${pitchCanvas.length} / ${pitchCanvas.width}; block-size: auto; margin: 0 auto 20px;
    color: ${({ theme }) => theme.color.accent.emerald.solid}; background: ${({ theme }) => theme.color.accent.emerald.soft}; }
  [data-stripe] { fill: ${({ theme }) => theme.color.accent.emerald.soft}; }
  h3 { margin: 0 0 18px; font-size: 1.25rem; }
`;
function useContextFacts() {
  const { fixtureId, preview } = useStableDetails();
  const state = useInsightSection(fixtureId, "context", true, preview);
  return { ...state, value: state.data ?? preview?.sections.context ?? null };
}
export function TouchlineStandings() {
  const { messages, data, home, away } = useStableDetails(), context = useContextFacts();
  const standings = context.value?.standings;
  const rows = (["home", "away"] as const).flatMap(side => standings?.[side] ? [{ side, ...standings[side] }] : []).sort((a, b) => a.rank - b.rank);
  return <><SectionState loading={context.loading} error={context.error} onRetry={context.retry} />
    {rows.length ? <><div style={{ overflowX: "auto" }}><Table aria-label={messages.text("details.standings")}><thead><tr>
      <th>{messages.text("touchline.rank")}</th><th>{messages.text("details.team")}</th><th>{messages.text("touchline.group")}</th><th>{messages.text("touchline.played")}</th><th>{messages.text("touchline.points")}</th>
    </tr></thead><tbody>{rows.map(row => <tr key={row.side}><td>{messages.number(row.rank)}</td><th scope="row"><span><Crest name={data.fixture[`${row.side}Team`].name} url={data.fixture[`${row.side}Team`].logoUrl} />{row.side === "home" ? home : away}</span></th>
      <td>{row.group}</td><td>{messages.number(row.played)}</td><td>{messages.number(row.points)}</td></tr>)}</tbody></Table></div>
      <Note>{messages.text("touchline.standingsPartial")}</Note></>
      : <TouchlineEmpty><ContextIcon aria-hidden="true" /><p>{messages.text("touchline.standingsMissing")}</p></TouchlineEmpty>}
  </>;
}
export function TouchlineVenue() {
  const { messages } = useStableDetails(), context = useContextFacts(), venue = context.value?.venue;
  return <><SectionState loading={context.loading} error={context.error} onRetry={context.retry} /><Ground>
    <FootballPitch role="img" aria-label={messages.text("touchline.pitch")} /><h3>{venue?.name ?? messages.text("details.venue")}</h3><Facts>
      <dt>{messages.text("touchline.location")}</dt><dd>{venue?.city ?? messages.text("details.notAvailable")}</dd>
      <dt>{messages.text("touchline.pitch")}</dt><dd>{messages.text("details.notProvided")}</dd>
      <dt>{messages.text("touchline.surface")}</dt><dd>{messages.text("details.notProvided")}</dd>
      <dt>{messages.text("details.weather")}</dt><dd>{messages.text("details.notAvailable")}</dd>
      {venue && <><dt>{messages.text("detail.retrieved")}</dt><dd><time dateTime={toUtcIsoString(utcInstantFromEpochMilliseconds(venue.retrievedAt))}>{messages.reportingInstant(utcInstantFromEpochMilliseconds(venue.retrievedAt))}</time></dd></>}
    </Facts></Ground></>;
}

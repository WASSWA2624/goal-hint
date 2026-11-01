"use client";

import styled from "styled-components";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { Facts, SectionState, useStableDetails } from "./details-ui";
import { useInsightSection } from "./use-match-view";
import { FootballPitch } from "../football-pitch";
import { pitchCanvas } from "@/domain/football-pitch";

export { TouchlineStandings } from "./competition-panel";
const Ground = styled.div`
  padding: 24px; border: 0;
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

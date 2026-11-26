"use client";

import { useSearchParams } from "next/navigation";
import styled from "styled-components";
import { TextLink } from "@/components/ui/controls";
import { openDetailTab } from "@/domain/match-detail-tabs";
import { parseMatchDetailsView, serializeMatchView } from "@/domain/match-view";
import { media } from "@/styles/theme";
import { useStableDetails } from "./details-ui";
import { useMatchDesktopViewport } from "./use-match-view";

const PhoneSummaryLink = styled(TextLink)`${media.desktop} { display: none; }`;
const DesktopSummaryLink = styled(TextLink)`${media.belowDesktop} { display: none; }`;

export function MatchSummaryLink() {
  const { data, messages, go } = useStableDetails();
  const desktop = useMatchDesktopViewport(), parameters = useSearchParams();
  const label = messages.text("history.backToSummary");
  const query = serializeMatchView(openDetailTab(parseMatchDetailsView(parameters), "details"), parameters);
  return <>
    {desktop !== true && <PhoneSummaryLink href="#current-match-summary" prefetch={false}>{label}</PhoneSummaryLink>}
    {desktop !== false && <DesktopSummaryLink href={`${data.route.path}?${query}#current-match-summary`} prefetch={false}
      onNavigate={event => {
        event.preventDefault();
        go(openDetailTab(parseMatchDetailsView(new URLSearchParams(window.location.search)), "details"));
      }}>{label}</DesktopSummaryLink>}
  </>;
}

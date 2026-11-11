"use client";

import { UnlockPanel } from "@/components/members/prediction-unlock";

import { memo } from "react";
import styled from "styled-components";
import { PredictionOdds, PredictionOutcome } from "@/components/match/prediction-presentation";
import { predictionDescription } from "@/domain/prediction-label";
import { noPickReason } from "@/domain/feed-presentation";
import { fullDetailSnapshot } from "@/domain/detail-snapshot";
import { hasPublishedForecastWithoutPick } from "@/domain/recommendation-view";
import { detailRecordNotices } from "@/domain/detail-presentation";
import { featuredFamily, liveStanding, marketRow, selectedDetailPrice } from "@/domain/match-details";
import { toUtcIsoString } from "@/domain/calendar";
import { openDetailTab } from "@/domain/match-detail-tabs";
import type { MarketFamily } from "@/domain/markets";
import { media } from "@/styles/theme";
import { contentGutter, desktopContentPadding } from "@/components/ui/layout";
import { DetailOutcome } from "./match-banner";
import { Note, Standing, desktop, focusRing, size, useStableDetails } from "./details-ui";
import { marketName, percent } from "./labels";

/** Between the scoreboard and market rows, following the same page rails at every width. */
const Box = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--gh-spacing-1_5);
  min-inline-size: 0;
  margin-inline: calc(-1 * ${contentGutter});
  padding: var(--gh-spacing-2_5) ${({ theme }) => theme.layout.gutter};
  background: ${({ theme }) => theme.color.surface};
  ${desktop} {
    gap: var(--gh-spacing-2_75);
    margin-inline: 0;
    padding: var(--gh-spacing-3_5) var(--gh-spacing-4_5) var(--gh-spacing-4);
    border: 0;
    border-radius: ${({ theme }) => theme.radius.none};
  }
  ${desktopContentPadding(true)}
`;
const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--gh-spacing-2);
  > h2 { margin: 0; color: ${({ theme }) => theme.color.link}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: var(--gh-tracking-uppercase); text-transform: uppercase; }
`;
const Pick = styled.button<{ $family: MarketFamily }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  padding: 0;
  min-block-size: var(--form-control-height);
  color: ${({ theme }) => theme.color.text};
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  > span[data-pick] { display: grid; gap: var(--gh-spacing-0_5); min-inline-size: 0; }
  > span[data-pick] > strong { font-size: var(--gh-font-page); font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-snug); overflow-wrap: anywhere; ${desktop} { font-size: var(--gh-font-headline); } }
  > span[data-pick] > small { color: ${({ theme, $family }) => theme.color.market[$family].text}; font-size: ${size("secondary")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-chance] { display: grid; justify-items: end; }
  > span[data-chance] > b { font-size: var(--gh-font-displayLarge); font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: var(--gh-leading-solid); font-variant-numeric: tabular-nums; ${desktop} { font-size: var(--gh-font-hero); } }
  > span[data-chance] > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; }
  ${media.hover} { &:hover > span[data-pick] > strong { color: ${({ theme }) => theme.color.link}; } }
`;
const Publication = styled(Note)`
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--gh-spacing-1);
  font-size: ${size("caption")};
  line-height: var(--gh-leading-reading);
  > time { white-space: nowrap; }
`;

/** Keep attribution and stale-result warnings beside the pick on every viewport and in the initial HTML. */
function PredictionRecord() {
  const { data, messages } = useStableDetails();
  const notices = detailRecordNotices(data).filter(key => key !== "history.status.current");
  const publishedAt = data.snapshot?.publishedAt;
  return notices.length > 0 || publishedAt !== undefined ? <Publication data-prediction-record>
    {notices.length > 0 && <span>{notices.map(key => messages.text(key)).join(" · ")}</span>}
    {publishedAt !== undefined && <>{notices.length > 0 && <span aria-hidden="true">·</span>}<time dateTime={toUtcIsoString(publishedAt)}>
      {messages.text("details.publishedAt", { time: messages.reportingInstant(publishedAt) })}
    </time></>}
  </Publication> : null;
}

/**
 * Compact mobile pick, probability and publication record. Other market probabilities and the reasoning
 * belong to their own drawers. Tapping the pick opens that market's full details.
 */
export const Verdict = memo(function Verdict() {
  const { data, messages, update, locale } = useStableDetails();
  const fixture = data.fixture, snapshot = data.snapshot;
  // Locked only over a published forecast; without one, every viewer reads the same no-prediction reason.
  if ("gated" in data.history && snapshot) {
    return <Box><UnlockPanel locale={locale} signedIn={data.access.signedIn} returnTo={data.route.path} /></Box>;
  }
  const featured = featuredFamily(data), row = featured ? marketRow(data, featured) : null;
  const forecastAvailable = hasPublishedForecastWithoutPick(fullDetailSnapshot(data));
  if (!featured || !row?.item) return <Box aria-labelledby="verdict-title" data-featured-pick="none">
    <Eyebrow><h2 id="verdict-title">{messages.text("details.verdict")}</h2></Eyebrow>
    <strong>{messages.text(forecastAvailable ? "match.forecastAvailable" : "details.noPick")}</strong>
    <Note>{messages.text(forecastAvailable ? "match.noRecommendedPick" : `match.noPickReason.${noPickReason(fixture)}`)}</Note>
    <PredictionRecord />
  </Box>;
  const item = row.item, price = selectedDetailPrice(data, featured), standing = liveStanding(data, featured);
  const pick = predictionDescription(messages, item.market.selection), chance = percent(messages, item.market.selectedProbability);
  const settled = snapshot?.applicability === "historical" ? null : row.outcome?.status ?? (snapshot?.applicability === "void" ? "void" : null);
  return <Box aria-labelledby="verdict-title" data-verdict={featured} data-featured-pick={featured}>
    <Eyebrow><h2 id="verdict-title">{messages.text("details.verdict")}</h2>
      {standing ? <Standing standing={standing} /> : settled && settled !== "pending" ? <DetailOutcome status={settled} /> : null}</Eyebrow>
    <Pick type="button" $family={featured} onClick={() => update((current) => ({ ...openDetailTab(current, "markets"), market: featured }))}
      aria-label={[messages.text("details.featuredOpen", { market: marketName(messages, featured), pick, probability: chance }),
        price ? `${messages.text("details.odds")}: ${price}` : null].filter(Boolean).join(". ")}>
      <span data-pick><strong><PredictionOutcome messages={messages} selection={item.market.selection} /></strong><small>{marketName(messages, featured)}<PredictionOdds odds={price} /></small></span>
      <span data-chance><b>{chance}</b><small>{messages.text("details.probability")}</small></span>
    </Pick>
    <PredictionRecord />
  </Box>;
});

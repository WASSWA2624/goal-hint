"use client";

import { UnlockPanel } from "@/components/members/prediction-unlock";

import { memo } from "react";
import styled from "styled-components";
import { PredictionOdds, PredictionOutcome } from "@/components/match/prediction-presentation";
import { predictionDescription } from "@/domain/prediction-label";
import { bookmakerOddsSource, detailRecordNotices } from "@/domain/detail-presentation";
import { isFeaturedPickSuppressed } from "@/domain/fixture-snapshot";
import { displayMarketOddsPrice } from "@/domain/in-play-odds";
import { currentFeaturedOutcome, featuredFamily, liveStanding, marketRow, selectedDetailPrice } from "@/domain/match-details";
import { FeaturedPickStatus, FeaturedPriceValue, featuredPickStatusText, featuredPriceValueText } from "../forecast-labels";
import { toUtcIsoString } from "@/domain/calendar";
import { openDetailTab } from "@/domain/match-detail-tabs";
import type { MarketFamily, MarketSource } from "@/domain/markets";
import { media } from "@/styles/theme";
import { contentGutter, desktopContentPadding } from "@/components/ui/layout";
import { DetailOutcome } from "./match-banner";
import { Standing, desktop, focusRing, size, useStableDetails } from "./details-ui";
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
const Publication = styled.p`
  display: flex;
  flex-wrap: wrap;
  gap: 0 var(--gh-spacing-1);
  margin: 0;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: ${size("caption")};
  line-height: var(--gh-leading-reading);
  > time { white-space: nowrap; }
`;

/** Keep attribution and stale-result warnings beside the pick on every viewport and in the initial HTML. */
function PredictionRecord({ source }: { source?: MarketSource | undefined }) {
  const { data, messages } = useStableDetails();
  const notices = detailRecordNotices(data, source).filter(key => key !== "history.status.current");
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
  const snapshot = data.snapshot;
  // A published forecast can require access independently of the public fixture details.
  if ("gated" in data.history && snapshot) {
    return <Box><UnlockPanel locale={locale} signedIn={data.access.signedIn} returnTo={data.route.path} /></Box>;
  }
  const selected = currentFeaturedOutcome(data);
  const featured = selected?.family ?? featuredFamily(data), row = featured && !selected ? marketRow(data, featured) : null;
  if (!featured || !selected && !row?.item) return <Box aria-labelledby="verdict-title" data-featured-pick="none">
    <Eyebrow><h2 id="verdict-title">{messages.text(data.fixture.retrospectiveSuppression ? "touchline.retrospective" : "details.verdict")}</h2></Eyebrow>
    <strong>{messages.text(data.selection === "applicable" && isFeaturedPickSuppressed(data.fixture) ? "match.noQualifyingPick" : "details.noPick")}</strong>
  </Box>;
  const item = row?.item, price = selected ? selected.odds && displayMarketOddsPrice(selected.odds) : selectedDetailPrice(data, featured);
  const standing = selected ? null : liveStanding(data, featured);
  const pick = selected?.selectionLabel ?? predictionDescription(messages, item!.market.selection);
  const chance = percent(messages, selected?.probability ?? item!.market.selectedProbability);
  const market = selected?.label ?? marketName(messages, featured);
  const exactQuote = selected?.featuredQuote;
  const attribution = exactQuote ? bookmakerOddsSource(exactQuote, messages) : undefined;
  const valueDescription = featuredPriceValueText(selected, price, messages);
  const tierDescription = featuredPickStatusText(selected, messages);
  const settled = snapshot?.applicability === "historical" ? null : selected?.settlementStatus ?? row?.outcome?.status ?? (snapshot?.applicability === "void" ? "void" : null);
  const oddsLabel = messages.text("details.odds");
  return <Box aria-labelledby="verdict-title" data-verdict={featured} data-featured-pick={featured}>
    <Eyebrow><h2 id="verdict-title">{messages.text("details.verdict")}</h2>
      {standing ? <Standing standing={standing} /> : settled && settled !== "pending" && settled !== "unavailable" ? <DetailOutcome status={settled} /> : null}</Eyebrow>
    <Pick type="button" $family={featured} onClick={() => update((current) => ({ ...openDetailTab(current, "markets"),
      ...(selected?.code ? { marketCategory: "goals" } : { market: featured }) }))}
      aria-label={[messages.text("details.featuredOpen", { market, pick, probability: chance }),
        price ? `${oddsLabel}: ${price}` : null, attribution, tierDescription, valueDescription].filter(Boolean).join(". ")}>
      <span data-pick><strong>{selected ? pick : <PredictionOutcome messages={messages} selection={item!.market.selection} />}</strong><small>{market}
        <span><PredictionOdds odds={price} title={attribution} />{selected?.tier === "forecast-only" && "—"}
          <FeaturedPriceValue description={valueDescription} messages={messages} /></span></small>
        <FeaturedPickStatus pick={selected} description={tierDescription} /></span>
      <span data-chance><b>{chance}</b><small>{messages.text("details.probability")}</small></span>
    </Pick>
    <PredictionRecord source={selected?.source} />
  </Box>;
});

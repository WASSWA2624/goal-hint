"use client";

import { UnlockPanel } from "@/components/members/prediction-unlock";
import { memo } from "react";
import styled from "styled-components";
import { ChevronRightIcon } from "@/components/ui/icons";
import { currentFeaturedOutcome, detailMarketValue, featuredFamily, liveStanding, marketRow, selectedDetailPrice } from "@/domain/match-details";
import { displayMarketOddsPrice } from "@/domain/in-play-odds";
import { forecastExpectedReturn } from "@/domain/forecast-value";
import { hasMatchPredictionAccess, openDetailTab } from "@/domain/match-detail-tabs";
import { detailRecordNotices } from "@/domain/detail-presentation";
import { ForecastValueLabel } from "../forecast-labels";
import { PredictionOutcome } from "../prediction-presentation";
import { DetailOutcome } from "./match-banner";
import { ResultIcon } from "./details-icons";
import { Standing, useStableDetails } from "./details-ui";
import { marketName, percent } from "./labels";
import { Verdict } from "./verdict";
import { TouchlineLinkButton, TouchlineSurface } from "./touchline-ui";

const Frame = styled(TouchlineSurface)`
  position: relative;
  &[data-match-access] > div { position: static; flex: 1; }
  display: flex; gap: var(--gh-spacing-5); align-items: center; justify-content: space-between;
  padding: var(--gh-spacing-4) ${({ theme }) => theme.layout.gutter}; border-inline-start: 0;
  scroll-margin-block-start: calc(var(--app-header-height, var(--gh-size-12)) + var(--gh-spacing-6));
  background: linear-gradient(90deg, ${({ theme }) => theme.color.brandSoft}, ${({ theme }) => theme.color.surface} 72%);
  @media (max-width: ${({ theme }) => theme.viewport[74.9375]}) { flex-wrap: wrap; gap: var(--gh-spacing-4_5); }
`;
const Lead = styled.div`
  display: flex; gap: var(--gh-spacing-3); align-items: center; min-inline-size: 0; flex: 1;
  > svg { flex: none; inline-size: var(--gh-size-9); block-size: var(--gh-size-9); padding: var(--gh-spacing-1_75); color: ${({ theme }) => theme.color.brand}; background: ${({ theme }) => theme.color.surface}; }
  h2 { margin: 0 0 var(--gh-spacing-1_25); font-size: var(--gh-font-caption); letter-spacing: var(--gh-tracking-heading); text-transform: uppercase; color: ${({ theme }) => theme.color.brand}; }
  strong { display: block; font-size: var(--gh-font-title); line-height: var(--gh-leading-compact); }
  strong > span { color: ${({ theme }) => theme.color.link}; }
  p { margin: var(--gh-spacing-1) 0 0; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); line-height: var(--gh-leading-normal); }
`;
const Numbers = styled.div`
  display: flex; gap: var(--gh-spacing-7); align-items: center; flex: none; font-variant-numeric: tabular-nums;
  > div { display: grid; gap: var(--gh-spacing-0_75); }
  > div + div { border-inline-start: 0; padding-inline-start: var(--gh-spacing-6); }
  b { font-size: var(--gh-font-displaySmall); line-height: var(--gh-leading-label); }
  small { font-size: var(--gh-font-caption); color: ${({ theme }) => theme.color.mutedText}; }
  i { display: block; block-size: var(--gh-size-1); background: ${({ theme }) => theme.color.brand}; margin-block-start: var(--gh-spacing-1); }
`;
const Actions = styled.div`display: grid; justify-items: end; gap: var(--gh-spacing-1_5); font-size: var(--gh-font-secondary);`;
export const TouchlineFeatured = memo(function TouchlineFeatured() {
  const { data, messages, locale, update } = useStableDetails();
  if (!hasMatchPredictionAccess(data)) return <>
    {!data.snapshot && <Verdict />}
    <Frame as="section" id="match-prediction" data-match-access>
      <UnlockPanel locale={locale} signedIn={data.access.signedIn} returnTo={data.route.path} />
    </Frame>
  </>;
  const featured = currentFeaturedOutcome(data);
  const family = featured?.family ?? featuredFamily(data), row = family && !featured ? marketRow(data, family) : null;
  if (!family || !featured && !row?.item) return <Verdict />;
  const chance = featured?.probability ?? row!.item!.market.selectedProbability;
  const price = featured ? featured.odds && displayMarketOddsPrice(featured.odds) : selectedDetailPrice(data, family);
  const standing = featured ? null : liveStanding(data, family), outcome = data.snapshot?.applicability === "historical" ? null
    : row?.outcome?.status ?? (data.snapshot?.applicability === "void" ? "void" : null);
  const notices = detailRecordNotices(data).map(key => messages.text(key));
  return <Frame as="section" id="match-prediction" aria-labelledby="touchline-prediction-title" data-featured-pick={family} data-verdict={family}>
    <Lead><ResultIcon aria-hidden="true" /><div><h2 id="touchline-prediction-title">{messages.text("touchline.featured")}</h2>
      <strong>{featured?.label ?? marketName(messages, family)} · <span>{featured?.selectionLabel
        ?? <PredictionOutcome messages={messages} selection={row!.item!.market.selection} />}</span></strong>
      <p data-prediction-record>{[data.snapshot ? messages.text("details.publishedAt", { time: messages.reportingInstant(data.snapshot.publishedAt) }) : messages.text("touchline.featuredHint"), ...notices].join(" · ")}</p></div></Lead>
    <Numbers><div><b>{percent(messages, chance)}</b><small>{messages.text("details.estimatedProbability")}</small><i style={{ inlineSize: `${chance * 100}%` }} /></div>
      {price !== null && <div><b>{price}</b><small>{messages.text("details.odds")}</small>
        <ForecastValueLabel expectedReturn={featured ? forecastExpectedReturn(chance, featured.odds) : detailMarketValue(data, family)} messages={messages} /></div>}</Numbers>
    <Actions>{standing ? <Standing standing={standing} /> : outcome && outcome !== "pending" ? <DetailOutcome status={outcome} /> : null}
      <TouchlineLinkButton type="button" onClick={() => update(current => openDetailTab(current, "analysis"))}>
        {messages.text("touchline.why")}<ChevronRightIcon aria-hidden="true" /></TouchlineLinkButton></Actions>
  </Frame>;
});

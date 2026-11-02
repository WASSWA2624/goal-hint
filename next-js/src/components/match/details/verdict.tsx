"use client";

import { SubscriberPanel } from "@/components/members/subscriber-panel";

import { memo } from "react";
import styled from "styled-components";
import { PredictionOdds, PredictionOutcome } from "@/components/match/prediction-presentation";
import { predictionDescription } from "@/domain/prediction-label";
import { noPickReason } from "@/domain/feed-presentation";
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
  gap: 6px;
  min-inline-size: 0;
  margin-inline: calc(-1 * ${contentGutter});
  padding: 10px ${({ theme }) => theme.layout.gutter};
  background: ${({ theme }) => theme.color.surface};
  ${desktop} {
    gap: 11px;
    margin-inline: 0;
    padding: 14px 18px 16px;
    border: 0;
    border-radius: ${({ theme }) => theme.radius.none};
  }
  ${desktopContentPadding(true)}
`;
const Eyebrow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  > h2 { margin: 0; color: ${({ theme }) => theme.color.link}; font-size: ${size("caption")}; font-weight: ${({ theme }) => theme.typography.weight.heavy}; letter-spacing: 0.07em; text-transform: uppercase; }
`;
const Pick = styled.button<{ $family: MarketFamily }>`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 0;
  min-block-size: 44px;
  color: ${({ theme }) => theme.color.text};
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  > span[data-pick] { display: grid; gap: 2px; min-inline-size: 0; }
  > span[data-pick] > strong { font-size: 1.375rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1.15; overflow-wrap: anywhere; ${desktop} { font-size: 1.5rem; } }
  > span[data-pick] > small { color: ${({ theme, $family }) => theme.color.market[$family].text}; font-size: ${size("secondary")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > span[data-chance] { display: grid; justify-items: end; }
  > span[data-chance] > b { font-size: 2rem; font-weight: ${({ theme }) => theme.typography.weight.heavy}; line-height: 1; font-variant-numeric: tabular-nums; ${desktop} { font-size: 2.5rem; } }
  > span[data-chance] > small { color: ${({ theme }) => theme.color.mutedText}; font-size: ${size("caption")}; }
  ${media.hover} { &:hover > span[data-pick] > strong { color: ${({ theme }) => theme.color.link}; } }
`;
const Publication = styled(Note)`
  display: flex;
  flex-wrap: wrap;
  gap: 0 4px;
  font-size: ${size("caption")};
  line-height: 1.45;
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
  const { data, messages, update, locale, offer } = useStableDetails();
  const fixture = data.fixture, snapshot = data.snapshot;
  // Locked only over a published forecast; without one, every viewer reads the same no-prediction reason.
  if ("gated" in data.history && snapshot) {
    const chances = "gated" in snapshot ? snapshot.probabilities : [];
    const chance = chances.length ? Math.max(...chances.map((entry) => entry.probability)) : null;
    return <Box><Eyebrow><h2>{messages.text("details.probability")}</h2><strong data-public-probability>{percent(messages, chance)}</strong></Eyebrow>
      <SubscriberPanel locale={locale} signedIn={data.access.signedIn} offer={offer ?? null} returnTo={data.route.path} /></Box>;
  }
  const featured = featuredFamily(data), row = featured ? marketRow(data, featured) : null;
  if (!featured || !row?.item) return <Box aria-labelledby="verdict-title" data-featured-pick="none">
    <Eyebrow><h2 id="verdict-title">{messages.text("details.verdict")}</h2></Eyebrow>
    <strong>{messages.text("details.noPick")}</strong>
    <Note>{messages.text(`match.noPickReason.${noPickReason(fixture)}`)}</Note>
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

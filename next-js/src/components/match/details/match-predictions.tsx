"use client";

import { memo } from "react";
import styled from "styled-components";
import { UnlockPanel } from "@/components/members/prediction-unlock";
import { ChevronRightIcon, SubscriberIcon } from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/layout";
import { bookmakerOddsSource, detailRecordNotices } from "@/domain/detail-presentation";
import { fullDetailSnapshot } from "@/domain/detail-snapshot";
import { isFeaturedPickSuppressed } from "@/domain/fixture-snapshot";
import { legacyFamilyByGoalKey } from "@/domain/legacy-goal-market-identities";
import { openDetailTab } from "@/domain/match-detail-tabs";
import { matchPredictionSummary, matchSummaryStanding, type MatchSummaryPick, type PredictionPriceKind } from "@/domain/match-predictions";
import { isMarketFamily } from "@/domain/markets";
import { predictionText } from "@/domain/prediction-label";
import type { TextKey } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { FeaturedPickStatus, FeaturedPriceValue, featuredPickStatusText, featuredPriceValueText } from "../forecast-labels";
import { OutcomeBadge } from "../prediction-presentation";
import { focusRing, Note, useStableDetails } from "./details-ui";
import { marketName, percent } from "./labels";
import { DetailOutcome } from "./match-banner";
import { TouchlineLinkButton, TouchlineSurface } from "./touchline-ui";

const Summary = styled(TouchlineSurface)`
  display: grid;
  gap: var(--gh-spacing-3);
  padding: var(--gh-spacing-4) ${({ theme }) => theme.layout.gutter};
  > h2 { margin: 0; font-size: var(--gh-font-page); }
`;
const Featured = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--gh-spacing-2) var(--gh-spacing-4);
  min-inline-size: 0;
  padding: var(--gh-spacing-3_5);
  background: ${({ theme }) => theme.color.brandSoft};
  border-inline-start: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.brand};
  > div { min-inline-size: 0; }
  h3 { margin: 0; font-size: var(--gh-font-page); line-height: var(--gh-leading-compact); }
`;
const FeatureLabel = styled.div`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-1_5);
  color: ${({ theme }) => theme.color.link};
  font-size: var(--gh-font-secondary);
  font-weight: var(--gh-weight-bold);
  > svg { flex: none; }
`;
const PickName = styled.button`
  display: block;
  inline-size: fit-content;
  max-inline-size: 100%;
  min-block-size: var(--form-control-height);
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  font: inherit;
  text-align: start;
  cursor: pointer;
  ${focusRing}
  ${media.hover} { &:hover { color: ${({ theme }) => theme.color.link}; } }
`;
const SupportingText = styled.small`
  display: block;
  color: ${({ theme }) => theme.color.mutedText};
  font-size: var(--gh-font-secondary);
  font-weight: var(--gh-weight-body);
  line-height: var(--gh-leading-normal);
`;
const Values = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--gh-spacing-2) var(--gh-spacing-5);
  > dl { display: flex; margin: 0; gap: var(--gh-spacing-3) var(--gh-spacing-5); flex-wrap: wrap; }
  > dl > div { display: flex; flex-direction: column-reverse; }
  dt { color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  dd { margin: 0; font-size: var(--gh-font-page); font-weight: var(--gh-weight-bold); font-variant-numeric: tabular-nums; }
`;
const Table = styled.table`
  inline-size: 100%;
  border-collapse: collapse;
  font-size: var(--gh-font-body);
  font-variant-numeric: tabular-nums;
  :is(th, td) { text-align: start; padding-inline: var(--gh-spacing-2); }
  thead > tr { color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.cardHeader}; }
  thead th { padding-block: var(--gh-spacing-2); font-size: var(--gh-font-secondary); }
  tbody > tr + tr { border-block-start: var(--gh-stroke-thin) solid ${({ theme }) => theme.color.border}; }
  tbody th { padding-block: var(--gh-spacing-0_5); overflow-wrap: anywhere; }
  tbody td { white-space: nowrap; }
`;

const oddsLabels: Readonly<Record<PredictionPriceKind, TextKey>> = {
  "pre-match": "touchline.preMatchOdds", "in-play": "prediction.summary.inPlayOdds",
  closing: "touchline.closingOdds", "historical-pre-match": "touchline.recoveredOdds",
};

function PickLabel({ pick, featured = false }: { pick: MatchSummaryPick; featured?: boolean }) {
  const { data, home, away, messages, update } = useStableDetails();
  const market = pick.label ?? marketName(messages, pick.family);
  const team = pick.key === "match-result" && (pick.selection === "home-win" ? home : pick.selection === "away-win" ? away : null);
  const selection = team ? messages.text("prediction.summary.teamToWin", { team })
    : pick.selectionLabel ?? predictionText(messages, pick.selection);
  const label = featured ? "details.featuredOpen" : "details.tileOpen";
  const replay = data.selection === "applicable" ? data.fixture.retrospective : null;
  const baseFamily = isMarketFamily(pick.key) ? pick.key : legacyFamilyByGoalKey.get(pick.key);
  const marketOf = !replay && fullDetailSnapshot(data)?.markets.some(({ market }) => market.family === baseFamily) ? baseFamily ?? null : null;
  const target = replay && !data.retrospectiveMarkets?.length ? replay.sourceRevisionId ? "history" : "analysis" : "markets";
  return <PickName type="button" onClick={() => update(current => target === "markets" ? ({ ...openDetailTab(current, target),
    market: marketOf, marketCategory: marketOf ? "popular" : "goals", marketSearch: marketOf ? "" : market.slice(0, 80),
  }) : openDetailTab(current, target))} aria-label={messages.text(label, { market, pick: selection, probability: percent(messages, pick.probability) })}>
    <span>{selection}</span><SupportingText>{market}</SupportingText>
  </PickName>;
}

function SummaryStatus({ pick }: { pick: MatchSummaryPick }) {
  const { data, messages } = useStableDetails();
  const standing = matchSummaryStanding(data, pick);
  if (!standing) return <DetailOutcome status={pick.status} />;
  const winning = standing === "on-track";
  const text = messages.text(winning ? "prediction.summary.winning" : "prediction.summary.losing");
  return <OutcomeBadge data-standing={standing} $outcome={winning ? "correct" : "incorrect"}
    title={messages.text("details.standingLabel", { standing: text })}>{text}</OutcomeBadge>;
}

export const MatchPredictions = memo(function MatchPredictions() {
  const { data, messages, locale, update } = useStableDetails();
  const predictions = matchPredictionSummary(data);
  const featured = predictions?.featured;
  const replay = predictions?.replay;
  const quote = featured?.forecast?.featuredQuote ?? featured?.historicalOdds;
  const record = replay ? [messages.text("touchline.retrospectiveGenerated", { time: messages.reportingInstant(replay.generatedAt) }),
    messages.text("touchline.retrospectiveCutoff", { time: messages.reportingInstant(replay.evidenceCutoffAt) })] : [
    data.snapshot && messages.text("details.publishedAt", { time: messages.reportingInstant(data.snapshot.publishedAt) }),
    ...detailRecordNotices(data, featured?.forecast?.source).map(key => messages.text(key)),
  ].filter(Boolean);
  const whyTab = replay?.sourceRevisionId ? "history" : "analysis";
  const empty = <Note data-featured-pick="none">{messages.text(data.selection === "applicable" && isFeaturedPickSuppressed(data.fixture)
    ? "match.noQualifyingPick" : "details.noPick")}</Note>;
  return <Summary as="section" id="match-prediction" aria-labelledby="match-predictions-title" data-match-access={predictions ? undefined : ""}>
    <SectionHeading id="match-predictions-title">{messages.text("prediction.summary.title")}</SectionHeading>
    {!predictions ? <>
      {!data.snapshot && empty}
      <UnlockPanel locale={locale} signedIn={data.access.signedIn} returnTo={data.route.path} />
    </> : <>
      {featured ? <>
        <Featured data-featured-pick={featured.key} data-verdict={featured.family}>
          <div>
            <FeatureLabel><SubscriberIcon />{messages.text(replay ? "touchline.retrospective" : "touchline.featured")}</FeatureLabel>
            <h3><PickLabel pick={featured} featured /></h3>
            <FeaturedPickStatus pick={featured.forecast} description={featuredPickStatusText(featured.forecast, messages)} />
          </div>
          <Values>
            <dl>
              <div><dt>{messages.text("details.probability")}</dt><dd>{percent(messages, featured.probability)}</dd></div>
              {featured.odds && <div>
                <dt>{messages.text(featured.priceKind ? oddsLabels[featured.priceKind] : "feed.filters.oddsLabel")}</dt>
                <dd title={quote ? bookmakerOddsSource(quote, messages) : undefined}>
                  {featured.odds}<FeaturedPriceValue description={featuredPriceValueText(featured.forecast, featured.odds, messages)} messages={messages} />
                </dd>
              </div>}
            </dl>
            <SummaryStatus pick={featured} />
          </Values>
        </Featured>
        {record.length > 0 && <Note data-prediction-record>{record.join(" · ")}</Note>}
        {featured.historicalOdds && <Note data-historical-odds-source>{bookmakerOddsSource(featured.historicalOdds, messages)}</Note>}
      </> : empty}
      {predictions.other.length > 0 && <Table aria-label={messages.text("prediction.summary.other")}>
        <thead><tr>
          <th scope="col">{messages.text("details.prediction")}</th>
          <th scope="col">{messages.text("details.probability")}</th>
          <th scope="col">{messages.text("feed.filters.oddsLabel")}</th>
          <th scope="col">{messages.text("match.outcome")}</th>
        </tr></thead>
        <tbody>{predictions.other.map(pick => <tr key={pick.key} data-summary-pick={pick.key}>
          <th scope="row"><PickLabel pick={pick} /></th>
          <td>{percent(messages, pick.probability)}</td>
          <td title={pick.historicalOdds ? bookmakerOddsSource(pick.historicalOdds, messages)
            : pick.priceKind ? messages.text(oddsLabels[pick.priceKind]) : undefined}>{pick.odds ?? "—"}</td>
          <td><SummaryStatus pick={pick} /></td>
        </tr>)}</tbody>
      </Table>}
      {featured && <div><TouchlineLinkButton type="button" onClick={() => update(current => openDetailTab(current, whyTab))}>
        {messages.text(replay?.sourceRevisionId ? "touchline.originalPublication" : "touchline.why")}<ChevronRightIcon />
      </TouchlineLinkButton></div>}
    </>}
  </Summary>;
});

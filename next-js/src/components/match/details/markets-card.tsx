"use client";

import { SearchBar } from "@/components/ui/search-bar";

import { memo, useDeferredValue, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { PredictionOdds, PredictionOutcome, ProbabilityBar } from "@/components/match/prediction-presentation";
import { ForecastSourceLabel, ForecastValueLabel } from "@/components/match/forecast-labels";
import { predictionDescription } from "@/domain/prediction-label";
import { detailAnalysis } from "@/domain/detail-presentation";
import { fullDetailSnapshot } from "@/domain/detail-snapshot";
import { SubscriberNotice } from "@/components/members/subscriber-notice";
import { currentFeaturedOutcome, detailMarketValue, exclusiveFamily, featuredFamily, liveStanding, marketCategoryMembers, marketOutcomes, marketRow, selectedDetailPrice, visibleMarkets } from "@/domain/match-details";
import { forecastExpectedReturn } from "@/domain/forecast-value";
import type { PublicExtendedMarket } from "@/domain/extended-markets";
import { bookmakerGoalPrice } from "@/domain/bookmaker-odds";
import { displayMarketOddsPrice } from "@/domain/in-play-odds";
import { openDetailTab } from "@/domain/match-detail-tabs";
import { marketCategories, parseMatchView, type MarketCategory } from "@/domain/match-view";
import type { MarketFamily } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { toUtcIsoString, type UtcInstant } from "@/domain/calendar";
import { media } from "@/styles/theme";
import { MarketsIcon, ExternalIcon } from "./details-icons";
import { DetailOutcome, familyAccent, familyIcon } from "./match-banner";
import {
  Card, CardHeader, SubscriberRow, ChoiceGroup, Crumbs, Facts, IconBadge, LinkButton, Note, Panel, PanelHeading, RowButton, RowList, Standing,
  desktop, focusRing, size, useDetails, useRevealOnOpen, useStableDetails,
} from "./details-ui";
import { useEmbeddedSection, useReturnFocus } from "./section-card";
import { marketName, percent } from "./labels";

const Search = styled(SearchBar)`min-inline-size: min(100%, var(--gh-size-48));`;
/** Narrow cards drop the probability bar and keep the percentage; wide cards show both. */
const columns = "minmax(0, 1.4fr) minmax(0, 1.1fr) var(--gh-size-16) var(--gh-size-3)";
const wideColumns = "minmax(0, 1.35fr) minmax(0, 1.2fr) minmax(0, 1.1fr) var(--gh-size-3_5)";
const Head = styled.div`
  display: none;
  @container details-card (min-width: ${({ theme }) => theme.viewport[20]}) {
    display: grid;
    grid-template-columns: ${columns};
  }
  @container details-card (min-width: ${({ theme }) => theme.viewport[27]}) { grid-template-columns: ${wideColumns}; }
  @container details-card (min-width: ${({ theme }) => theme.viewport[20]}) {
    column-gap: var(--gh-spacing-2);
    padding: var(--gh-spacing-1) var(--gh-spacing-1);
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.cardHeader};
    font-size: ${size("caption")};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
  ${media.belowDesktop} { display: none; }
`;
/** One table row per market from 320px; the narrowest phones use two lines. Below desktop a row reads like
 * the verdict: market name, pick with its live standing, and the chance. */
const MarketRow = styled(RowButton)<{ $family: MarketFamily }>`
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.1fr) var(--gh-size-16) var(--gh-size-3);
  align-items: center; gap: var(--gh-spacing-2); min-block-size: var(--gh-size-11);
  > span[data-name] { display: flex; align-items: center; gap: var(--gh-spacing-1_5); min-inline-size: 0; }
  > span[data-name] > span:first-child { flex: none; inline-size: var(--gh-size-5); block-size: var(--gh-size-5); font-size: var(--gh-font-body); }
  > span[data-name] > span:last-child { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-pick] { display: flex; align-items: center; gap: var(--gh-spacing-1_25); min-inline-size: 0; font-weight: var(--gh-weight-bold); }
  > span[data-pick] > span:first-child { display: inline-flex; align-items: center; gap: var(--gh-spacing-1); min-inline-size: 0; white-space: nowrap; }
  > span[data-pick] > span:first-child > span:first-child { overflow: hidden; text-overflow: ellipsis; }
  > span[data-pick] [data-selected-odds] { flex: none; }
  > span[data-bar] { font-variant-numeric: tabular-nums; text-align: end; }
  > svg { color: ${({ theme }) => theme.color.mutedText}; }
  &[aria-expanded="true"] > svg { transform: rotate(90deg); }
  ${media.belowDesktop} {
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) auto var(--gh-size-2_5);
    gap: var(--gh-spacing-1_5); padding: var(--gh-spacing-1_75) 0; font-size: var(--gh-font-secondary);
    > span[data-name] { font-size: var(--gh-font-caption); gap: var(--gh-spacing-1); }
    > span[data-name] > span:first-child { inline-size: var(--gh-size-4); block-size: var(--gh-size-4); font-size: var(--gh-font-caption); }
    > span[data-bar] > b { font-size: var(--gh-font-emphasis); }
    > span[data-pick] > :is([data-standing], [data-outcome]) { font-size: var(--gh-font-micro); }
    [data-selected-odds] { font-size: var(--gh-font-micro); }
  }
`;
const Tools = styled.div`
  display: grid;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  ${media.belowDesktop} { display: none; }
`;
const Outcomes = styled.ul`
  display: grid;
  gap: var(--gh-spacing-1_5);
  margin: 0;
  padding: 0;
  list-style: none;
  > li { display: grid; grid-template-columns: minmax(var(--gh-size-28), 0.9fr) minmax(0, 1.4fr) var(--gh-size-12); align-items: center; gap: var(--gh-spacing-2); font-size: ${size("secondary")}; line-height: var(--gh-leading-label); ${desktop} { font-size: ${size("body")}; line-height: inherit; } }
  > li[data-selected] > span:first-child { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > li > b { text-align: end; font-variant-numeric: tabular-nums; }
`;
const Reasons = styled.ol`
  display: grid;
  gap: var(--gh-spacing-1_5);
  margin: 0;
  padding-inline-start: var(--gh-size-4_4);
  font-size: ${size("secondary")};
  line-height: var(--gh-leading-reading);
  ${desktop} { font-size: ${size("body")}; }
  a { color: ${({ theme }) => theme.color.accent.blue.solid}; ${focusRing} }
`;
const SubHeading = styled.h5`
  margin: var(--gh-spacing-1) 0 0;
  font-size: ${size("secondary")};
  text-transform: uppercase;
  letter-spacing: var(--gh-tracking-wider);
  color: ${({ theme }) => theme.color.mutedText};
`;
const Body = styled.div`
  display: grid;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
`;
const Footer = styled.div`
  display: grid;
  gap: var(--gh-spacing-0_5);
  padding-block-start: var(--gh-spacing-1_5);
  border-block-start: 0;
`;
const GoalLine = styled.details`
  > summary { list-style: none; cursor: pointer; }
  > summary::-webkit-details-marker { display: none; }
  &[open] > summary > svg { transform: rotate(90deg); }
`;

function GoalMarketRow({ market }: { market: PublicExtendedMarket }) {
  const { data, messages } = useStableDetails();
  const odds = data.extendedOdds?.marketKey === market.key ? data.extendedOdds : null;
  const preMatch = data.bookmakerOdds?.kind === "pre-match" ? data.bookmakerOdds : null;
  const offer = (selection: string) => odds?.selections.find((item) => item.selection === selection)?.price
    ?? bookmakerGoalPrice(preMatch, market.key, selection);
  const price = offer(market.selection);
  const source = market.source === "local-poisson" ? "local-engine" : "ai";
  const Icon = familyIcon["total-goals"];
  return <li data-extended-market={market.key} data-extended-result={market.result.status}><GoalLine>
    <MarketRow as="summary" $family="total-goals">
      <span data-name><IconBadge $accent={familyAccent["total-goals"]}><Icon /></IconBadge><span>{market.label}</span></span>
      <span data-pick><span><span>{market.selectionLabel}</span>{price && <PredictionOdds odds={displayMarketOddsPrice(price)} />}</span></span>
      <span data-bar><b>{percent(messages, market.selectedProbability)}</b></span>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
    </MarketRow>
    <Panel>
      <ForecastSourceLabel source={source} messages={messages} />
      <Outcomes aria-label={messages.text("details.allOutcomes")}>
        {market.selections.map((selection) => {
          const quoted = offer(selection.key);
          return <li key={selection.key} data-selected={selection.key === market.selection || undefined}>
            <span>{selection.label}</span>
            <span>{quoted && <PredictionOdds odds={displayMarketOddsPrice(quoted)} />}
              {(odds?.kind === "pre-match" || preMatch) && <ForecastValueLabel expectedReturn={forecastExpectedReturn(selection.probability, quoted)} messages={messages} />}</span>
            <b>{percent(messages, selection.probability)}</b>
          </li>;
        })}
      </Outcomes>
    </Panel>
  </GoalLine></li>;
}

function Time({ at }: { at: UtcInstant | null }) {
  const { messages } = useStableDetails();
  return at === null ? <>{messages.text("detail.unknownTime")}</> : <time dateTime={toUtcIsoString(at)}>{messages.reportingInstant(at)}</time>;
}

/** The revision's generated reasons and key uncertainty, each with its permitted sources linked. */
export function Explanation() {
  const { data, messages } = useStableDetails();
  const snapshot = fullDetailSnapshot(data);
  const analysis = snapshot ? detailAnalysis(snapshot.analysis) : null;
  if ("gated" in data.history && data.snapshot) return <SubscriberNotice kind="markets" signedIn={data.access.signedIn} returnTo={data.route.path} />;
  const cite = (urls: readonly string[]) => [...new Set(urls)].flatMap((url) => {
    const source = analysis?.sources.find((entry) => entry.url === url);
    return source ? [<a key={url} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"> {source.publisher}<ExternalIcon /></a>] : [];
  });
  return analysis?.state === "available" ? <>
    <Note>{messages.text("details.explanationGenerated")}</Note>
    <Reasons>
      {analysis.reasons.map((entry, index) => <li key={index}>{entry.text}{cite(entry.sourceUrls)}</li>)}
      {analysis.uncertainty && <li><b>{messages.text("detail.uncertainty")}:</b> {analysis.uncertainty.text}{cite(analysis.uncertainty.sourceUrls)}</li>}
    </Reasons>
  </> : <Note>{messages.text(analysis ? "detail.analysisWithheld" : "detail.analysisUnavailable")}</Note>;
}

/** All outcomes, source, timing, settlement and explanation for one market of the applicable revision. */
function MarketPanel({ family, inline = false }: { family: MarketFamily; inline?: boolean }) {
  const embedded = useEmbeddedSection();
  const { data, messages, update } = useStableDetails();
  const snapshot = fullDetailSnapshot(data);
  const { item, outcome, reason } = marketRow(data, family);
  const price = selectedDetailPrice(data, family);
  const live = data.fixture.status === "live";
  const heading = useRevealOnOpen<HTMLHeadingElement>(!inline, family, "card");
  const close = () => update((current) => ({ ...current, market: null }));
  return <Panel data-market-panel={family} data-inline-market={inline || undefined}
    role={inline ? "region" : undefined} aria-labelledby={inline ? `market-row-${family}` : undefined}>
    {!inline && <><Crumbs items={[{ label: messages.text("details.title"), onSelect: () => update((current) => ({ ...current, market: null, section: null, item: null })) },
      { label: messages.text("details.markets"), onSelect: close }, { label: marketName(messages, family) }]} />
    <PanelHeading ref={heading} tabIndex={-1}>{marketName(messages, family)}</PanelHeading></>}
    {item && snapshot ? <>
      <Facts>
        <dt>{messages.text("details.prediction")}</dt><dd><strong><PredictionOutcome messages={messages} selection={item.market.selection} />
          {!live && <PredictionOdds odds={price} />}</strong>
          {!live && <ForecastValueLabel expectedReturn={detailMarketValue(data, family)} messages={messages} />}</dd>
        {live && price && <><dt>{messages.text("details.odds")}</dt><dd><b>{price}</b></dd></>}
        <dt>{messages.text("details.estimatedProbability")}</dt><dd><b>{percent(messages, item.market.selectedProbability)}</b></dd>
      </Facts>
      <SubHeading>{messages.text("details.allOutcomes")}</SubHeading>
      <Outcomes aria-label={messages.text("details.allOutcomes")}>
        {marketOutcomes(item.market.probabilities as Readonly<Record<string, number>>, family).map(({ selection, probability }) =>
          <li key={selection} data-selected={selection === item.market.selection || undefined}>
            <span><PredictionOutcome messages={messages} selection={selection} />{selection === item.market.selection && <> · {messages.text("details.predicted")}</>}</span>
            <ProbabilityBar $family={family} aria-hidden="true"><span style={{ inlineSize: `${(probability ?? 0) * 100}%` }} /></ProbabilityBar>
            <b>{percent(messages, probability)}</b>
          </li>)}
      </Outcomes>
      <Note>{messages.text(exclusiveFamily(family) ? "details.exclusiveOutcomes" : "detail.overlappingProbabilities")}</Note>
      <SubHeading>{messages.text("details.sourceAndTiming")}</SubHeading>
      <Facts>
        <dt>{messages.text("details.source")}</dt><dd><span title={messages.text(`market.source.${item.source.kind}`)}
          aria-label={messages.text(`market.source.${item.source.kind}`)}>{messages.text(`market.source.short.${item.source.kind}`)}</span>
          {item.source.provisional && <> · {messages.text("match.provisional")}</>}</dd>
        {item.source.fallbackReason && <><dt>{messages.text("details.fallback")}</dt><dd>{messages.text(`detail.fallback.${item.source.fallbackReason}`)}</dd></>}
        <dt>{messages.text("match.published")}</dt><dd><Time at={snapshot.publishedAt} /></dd>
        <dt>{messages.text("detail.evidenceCutoff")}</dt><dd><Time at={snapshot.evidenceCutoffAt} /></dd>
        <dt>{messages.text("detail.retrieved")}</dt><dd><Time at={item.timestamps.retrievedAt} /></dd>
        <dt>{messages.text("detail.providerUpdated")}</dt><dd><Time at={item.timestamps.providerUpdatedAt} /></dd>
        <dt>{messages.text("details.bookmakerSource")}</dt><dd>{messages.text("details.notAvailable")}</dd>
        {snapshot.applicability !== "historical" && <><dt>{messages.text("match.outcome")}</dt><dd><DetailOutcome status={outcome?.status ?? "pending"} /></dd></>}
      </Facts>
      {embedded ? <LinkButton type="button" onClick={() => update(current => openDetailTab(current, "analysis"))}>{messages.text("touchline.why")}</LinkButton>
        : <><SubHeading>{messages.text("details.explanation")}</SubHeading><Explanation /></>}
      <Note>{messages.text("detail.probabilityDisclosure")}</Note>
    </> : <>
      <Note>{messages.text(`detail.unavailable.${reason}`)}</Note>
    </>}
    {!inline && <LinkButton type="button" onClick={close}>‹ {messages.text("details.backToMarkets")}</LinkButton>}
  </Panel>;
}

/** The search text as the URL will hold it (`mq` is normalized when read back). */
const storedSearch = (text: string) => parseMatchView(new URLSearchParams({ mq: text })).marketSearch;
const searchDelayMs = 300;

/**
 * Typing stays local and filters through a deferred value; the URL catches up after a pause, so a
 * keystroke never runs a router transition. Back/Forward (a URL value this input did not write)
 * replaces the typed text. Next restores a replaced URL in a transition, so renders between the
 * write and its echo still see the old URL; the echo itself never resets the input.
 */
function useMarketSearch(value: string) {
  const { update } = useStableDetails();
  // `seen`: the URL value last rendered; `written`: this input's write whose echo has not rendered yet.
  const [search, setSearch] = useState(value), [seen, setSeen] = useState(value), [written, setWritten] = useState<string | null>(null);
  if (value !== seen) { setSeen(value); setWritten(null); if (value !== written) setSearch(value); }
  useEffect(() => {
    if (storedSearch(search) === value) return;
    const timer = window.setTimeout(() => {
      setWritten(storedSearch(search));
      update((current) => ({ ...current, marketSearch: search }), "replace");
    }, searchDelayMs);
    return () => window.clearTimeout(timer);
  }, [search, update, value]);
  return [search, setSearch] as const;
}

/** All Markets & Odds: open initially, with categories, search and a nested panel per market. */
export const MarketsCard = memo(function MarketsCard({ embedded = false }: { embedded?: boolean }) {
  const { data, messages, view, update } = useDetails();
  const list = useRef<HTMLUListElement>(null);
  useReturnFocus(list, view.market);
  const [search, setSearch] = useMarketSearch(view.marketSearch), query = useDeferredValue(search);
  const snapshot = fullDetailSnapshot(data);
  // As on the verdict, only a published forecast is locked.
  if ("gated" in data.history && data.snapshot) return <SubscriberRow><SubscriberNotice kind="markets" signedIn={data.access.signedIn} returnTo={data.route.path} /></SubscriberRow>;
  const current = embedded ? currentFeaturedOutcome(data) : null;
  const featured = embedded ? current ? current.key === current.family ? current.family : null : featuredFamily(data) : null;
  const goalMarkets = data.extendedMarkets?.markets.filter(({ key, source }) => source !== "market-implied" &&
    key !== "goal:full-time:totals:total:2.5:binary") ?? [];
  const published = (snapshot?.markets.filter(entry => entry.market.family !== featured).length ?? 0) + goalMarkets.length;
  const label = (family: MarketFamily) => marketName(messages, family);
  const publishedFamilies = new Set(snapshot?.markets.map(({ market }) => market.family));
  const shown = visibleMarkets(view.marketCategory, query, label).filter(family => family !== featured && publishedFamilies.has(family));
  const needle = query.normalize("NFC").trim().toLocaleLowerCase();
  const shownGoals = goalMarkets.filter((market) => needle
    ? [market.label, ...market.selections.map(({ label }) => label)].some((label) => label.toLocaleLowerCase().includes(needle))
    : view.marketCategory === "goals" || view.marketCategory === "popular" && market.key === "goal:full-time:totals:total:1.5:binary");
  const categoryLabel = (category: MarketCategory) => messages.text(`details.category.${category}`);
  return <Card data-section="markets" data-open={view.marketsOpen || undefined} aria-label={embedded ? messages.text("details.allMarkets") : undefined} aria-labelledby={embedded ? undefined : "section-markets-title"}
    style={embedded ? { padding: 0, border: 0 } : undefined}>
    {!embedded && <CardHeader icon={<MarketsIcon />} title={messages.text("details.allMarkets")} open={view.marketsOpen} controls="section-markets"
      meta={messages.text("details.publishedCount", { count: messages.number(published), total: messages.number(publicPolicy.markets.length + goalMarkets.length) })}
      onToggle={() => update((current) => ({ ...current, marketsOpen: !current.marketsOpen, market: current.marketsOpen ? null : current.market }))}
      headingId="section-markets-title" />}
    <div id="section-markets" hidden={!view.marketsOpen} style={{ minInlineSize: 0 }}>
      {view.marketsOpen && (!embedded && view.market ? <MarketPanel family={view.market} /> : <Body>
        <Tools>
          <Search label={messages.text("details.searchMarkets")} value={search} maxLength={80} placeholder={messages.text("details.searchMarkets")}
            onChange={(event) => setSearch(event.target.value)} />
          {!query && <ChoiceGroup label={messages.text("details.categories")} value={view.marketCategory}
            options={marketCategories.map((category) => ({ value: category, label: categoryLabel(category) }))}
            onChange={(category) => update((current) => ({ ...current, marketCategory: category }), "replace")} />}
        </Tools>
        <div>
          <Head aria-hidden="true"><span>{messages.text("details.market")}</span><span>{messages.text("details.prediction")}</span>
            <span>{messages.text("details.probability")}</span><span /></Head>
          {shown.length > 0 || shownGoals.length > 0 ? <RowList ref={list}>
            {shown.map((family) => {
              const { item, outcome } = marketRow(data, family), Icon = familyIcon[family];
              const settled = data.snapshot?.applicability !== "historical" && outcome && outcome.status !== "pending" ? outcome.status : null;
              const pick = item ? predictionDescription(messages, item.market.selection) : messages.text("details.notAvailable");
              const price = selectedDetailPrice(data, family), standing = liveStanding(data, family);
              const oddsLabel = messages.text("details.odds");
              return <li key={family}>
                <MarketRow type="button" $family={family} data-detail-market={family} data-item-key={family} id={`market-row-${family}`} aria-expanded={embedded ? view.market === family : undefined}
                  aria-controls={embedded ? `market-details-${family}` : undefined}
                  onClick={() => update(current => ({ ...current, market: current.market === family ? null : family }), "replace")}
                  aria-label={[messages.text("details.tileOpen", { market: marketName(messages, family), pick, probability: percent(messages, item?.market.selectedProbability ?? null) }),
                    price ? `${oddsLabel}: ${price}` : null,
                    standing ? messages.text("details.standingLabel", { standing: messages.text(`details.standing.${standing}`) }) : null].filter(Boolean).join(". ")}>
                  <span data-name><IconBadge $accent={familyAccent[family]}><Icon /></IconBadge><span title={marketName(messages, family)}>{marketName(messages, family)}</span></span>

                  <span data-pick><span>{item ? <PredictionOutcome messages={messages} selection={item.market.selection} /> : pick}
                    {price && <span title={oddsLabel}><PredictionOdds odds={price} /></span>}</span>{standing ? <Standing standing={standing} compact /> : settled && <DetailOutcome status={settled} />}</span>
                  <span data-bar>{item ? <b>{percent(messages, item.market.selectedProbability)}</b>
                    : <b>—</b>}</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
                </MarketRow>
                {embedded && <div id={`market-details-${family}`} hidden={view.market !== family}>
                  {view.market === family && <MarketPanel family={family} inline />}
                </div>}
              </li>;
            })}
            {shownGoals.map((market) => <GoalMarketRow key={market.key} market={market} />)}
          </RowList> : embedded && query && (data.bookmakerOdds || data.inPlayOdds?.prices.providerMarkets) ? null
            : <Note>{query ? messages.text("details.noMarketMatch", { query })
              : messages.text("details.noCategoryMarkets", { category: categoryLabel(view.marketCategory) })}</Note>}
        </div>
        {!query && marketCategoryMembers[view.marketCategory].length === 0 && <Note>{messages.text("details.supportedMarkets")}</Note>}
        <Footer>
          <Note>{messages.text("details.settlesFullTime")}</Note>
          <Note>{messages.text("details.probabilityNotOdds")}</Note>
        </Footer>
      </Body>)}
    </div>
  </Card>;
});

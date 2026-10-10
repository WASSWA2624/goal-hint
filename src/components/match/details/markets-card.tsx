"use client";

import { memo, useDeferredValue, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { SearchIcon } from "@/components/ui/icons";
import { OutcomeBadge } from "@/components/match/outcome-badge";
import { detailAnalysis } from "@/domain/detail-presentation";
import { exclusiveFamily, featuredFamily, marketCategoryMembers, marketOutcomes, marketRow, visibleMarkets } from "@/domain/match-details";
import { marketCategories, parseMatchView, type MarketCategory } from "@/domain/match-view";
import type { MarketFamily } from "@/domain/markets";
import { publicPolicy } from "@/domain/public-policy";
import { toUtcIsoString, type UtcInstant } from "@/domain/calendar";
import { MarketsIcon, ExternalIcon } from "./details-icons";
import { familyAccent, familyIcon } from "./match-banner";
import {
  Bar, Card, CardHeader, ChoiceGroup, Crumbs, Facts, IconBadge, LinkButton, Note, Panel, PanelHeading, Pill, RowButton, RowList,
  desktop, focusRing, size, useDetails, useRevealOnOpen, useStableDetails,
} from "./details-ui";
import { useReturnFocus } from "./section-card";
import { marketName, percent, pickLabel } from "./labels";

const Search = styled.label`
  display: flex;
  align-items: center;
  gap: 6px;
  min-inline-size: 0;
  min-block-size: 1.875rem;
  padding-inline: 8px;
  color: ${({ theme }) => theme.color.mutedText};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: 4px;
  &:focus-within { border-color: ${({ theme }) => theme.color.accent.blue.solid}; }
  > input { flex: 1; min-inline-size: 0; color: ${({ theme }) => theme.color.text}; background: none; border: 0; font: inherit; font-size: ${size("secondary")}; outline: none; }
`;
/** Narrow cards drop the probability bar and keep the percentage; wide cards show both. */
const columns = "minmax(0, 1.4fr) minmax(0, 1fr) 4rem 2.25rem 0.75rem";
const wideColumns = "minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1.1fr) 2.5rem 0.875rem";
const Head = styled.div`
  display: none;
  @container details-card (min-width: 20rem) {
    display: grid;
    grid-template-columns: ${columns};
  }
  @container details-card (min-width: 27rem) { grid-template-columns: ${wideColumns}; }
  @container details-card (min-width: 20rem) {
    column-gap: 8px;
    padding: 4px 4px;
    color: ${({ theme }) => theme.color.mutedText};
    background: ${({ theme }) => theme.color.cardHeader};
    font-size: ${size("caption")};
    font-weight: ${({ theme }) => theme.typography.weight.bold};
  }
`;
/** One table row per market from 320px; the narrowest phones use two lines. */
const MarketRow = styled(RowButton)`
  grid-template-columns: minmax(0, 1fr) auto 0.875rem;
  grid-template-areas: "name pick chevron" "bar odds chevron";
  column-gap: 8px;
  @container details-card (min-width: 20rem) {
    grid-template-columns: ${columns};
    grid-template-areas: "name pick bar odds chevron";
  }
  @container details-card (min-width: 27rem) { grid-template-columns: ${wideColumns}; }
  > span[data-bar] > span { display: none; }
  @container details-card (max-width: 19.99rem) { > span[data-bar] > span { display: block; } }
  @container details-card (min-width: 27rem) { > span[data-bar] > span { display: block; } }
  > span[data-name] { grid-area: name; display: flex; align-items: center; gap: 6px; min-inline-size: 0; font-weight: ${({ theme }) => theme.typography.weight.medium}; }
  > span[data-name] > span:last-child { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  > span[data-name] > span:first-child { inline-size: 1.375rem; block-size: 1.375rem; font-size: ${size("body")}; }
  > span[data-pick] { grid-area: pick; }
  > span[data-bar] { grid-area: bar; display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
  > span[data-bar] > b { min-inline-size: 2.25rem; }
  > span[data-odds] { grid-area: odds; justify-self: end; padding: 1px 6px; color: ${({ theme }) => theme.color.mutedText}; background: ${({ theme }) => theme.color.surfaceMuted}; border-radius: 4px; }
  > svg { grid-area: chevron; color: ${({ theme }) => theme.color.mutedText}; }
`;
const Outcomes = styled.ul`
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
  > li { display: grid; grid-template-columns: minmax(7rem, 0.9fr) minmax(0, 1.4fr) 3rem; align-items: center; gap: 8px; font-size: ${size("secondary")}; line-height: 1.3; ${desktop} { font-size: ${size("body")}; line-height: inherit; } }
  > li[data-selected] > span:first-child { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  > li > b { text-align: end; font-variant-numeric: tabular-nums; }
`;
const Reasons = styled.ol`
  display: grid;
  gap: 6px;
  margin: 0;
  padding-inline-start: 1.1rem;
  font-size: ${size("secondary")};
  line-height: 1.45;
  ${desktop} { font-size: ${size("body")}; }
  a { color: ${({ theme }) => theme.color.accent.blue.solid}; ${focusRing} }
`;
const SubHeading = styled.h5`
  margin: 4px 0 0;
  font-size: ${size("secondary")};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: ${({ theme }) => theme.color.mutedText};
`;
/** On wide desktops the card stretches beside three rows; the notes then sit at its foot. */
const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-inline-size: 0;
  block-size: 100%;
`;
const Footer = styled.div`
  display: grid;
  gap: 2px;
  margin-block-start: auto;
  padding-block-start: 6px;
  border-block-start: ${({ theme }) => theme.border.width} dashed ${({ theme }) => theme.color.border};
`;

function Time({ at }: { at: UtcInstant | null }) {
  const { messages } = useStableDetails();
  return at === null ? <>{messages.text("detail.unknownTime")}</> : <time dateTime={toUtcIsoString(at)}>{messages.reportingInstant(at)}</time>;
}

/** All outcomes, source, timing, settlement and explanation for one market of the applicable revision. */
function MarketPanel({ family }: { family: MarketFamily }) {
  const { data, messages, home, away, update } = useStableDetails();
  const { item, outcome, reason } = marketRow(data, family);
  const heading = useRevealOnOpen<HTMLHeadingElement>(true, family, "card");
  const analysis = data.snapshot ? detailAnalysis(data.snapshot.analysis) : null;
  const close = () => update((current) => ({ ...current, market: null }));
  const cite = (urls: readonly string[]) => [...new Set(urls)].flatMap((url) => {
    const source = analysis?.sources.find((entry) => entry.url === url);
    return source ? [<a key={url} href={url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"> {source.publisher}<ExternalIcon /></a>] : [];
  });
  return <Panel data-market-panel={family}>
    <Crumbs items={[{ label: messages.text("details.title"), onSelect: () => update((current) => ({ ...current, market: null, section: null, item: null })) },
      { label: messages.text("details.markets"), onSelect: close }, { label: marketName(messages, family) }]} />
    <PanelHeading ref={heading} tabIndex={-1}>{marketName(messages, family)}</PanelHeading>
    {item ? <>
      <Facts>
        <dt>{messages.text("details.prediction")}</dt><dd><Pill $accent="orange">{pickLabel(messages, item.market.selection, home, away)}</Pill></dd>
        <dt>{messages.text("details.estimatedProbability")}</dt><dd><b>{percent(messages, item.market.selectedProbability)}</b></dd>
        <dt>{messages.text("details.odds")}</dt><dd>— <Note as="span">{messages.text("details.oddsMissing")}</Note></dd>
      </Facts>
      <SubHeading>{messages.text("details.allOutcomes")}</SubHeading>
      <Outcomes aria-label={messages.text("details.allOutcomes")}>
        {marketOutcomes(item.market.probabilities as Readonly<Record<string, number>>, family).map(({ selection, probability }) =>
          <li key={selection} data-selected={selection === item.market.selection || undefined}>
            <span>{pickLabel(messages, selection, home, away)}{selection === item.market.selection && <> · {messages.text("details.predicted")}</>}</span>
            <Bar value={probability ?? 0} $accent={selection === item.market.selection ? "orange" : "blue"} aria-hidden="true" />
            <b>{percent(messages, probability)}</b>
          </li>)}
      </Outcomes>
      <Note>{messages.text(exclusiveFamily(family) ? "details.exclusiveOutcomes" : "detail.overlappingProbabilities")}</Note>
      <SubHeading>{messages.text("details.sourceAndTiming")}</SubHeading>
      <Facts>
        <dt>{messages.text("details.source")}</dt><dd>{messages.text(`market.source.${item.source.kind}`)}{item.source.provisional && <> · {messages.text("match.provisional")}</>}</dd>
        {item.source.fallbackReason && <><dt>{messages.text("details.fallback")}</dt><dd>{messages.text(`detail.fallback.${item.source.fallbackReason}`)}</dd></>}
        <dt>{messages.text("match.published")}</dt><dd><Time at={data.snapshot!.publishedAt} /></dd>
        <dt>{messages.text("detail.evidenceCutoff")}</dt><dd><Time at={data.snapshot!.evidenceCutoffAt} /></dd>
        <dt>{messages.text("detail.retrieved")}</dt><dd><Time at={item.timestamps.retrievedAt} /></dd>
        <dt>{messages.text("detail.providerUpdated")}</dt><dd><Time at={item.timestamps.providerUpdatedAt} /></dd>
        <dt>{messages.text("details.bookmakerSource")}</dt><dd>{messages.text("details.notAvailable")}</dd>
        {data.snapshot!.applicability !== "historical" && <><dt>{messages.text("match.outcome")}</dt><dd><OutcomeBadge status={outcome?.status ?? "pending"} /></dd></>}
      </Facts>
      <SubHeading>{messages.text("details.explanation")}</SubHeading>
      {analysis?.state === "available" ? <>
        <Note>{messages.text("details.explanationGenerated")}</Note>
        <Reasons>
          {analysis.reasons.map((entry, index) => <li key={index}>{entry.text}{cite(entry.sourceUrls)}</li>)}
          {analysis.uncertainty && <li><b>{messages.text("detail.uncertainty")}:</b> {analysis.uncertainty.text}{cite(analysis.uncertainty.sourceUrls)}</li>}
        </Reasons>
      </> : <Note>{messages.text(analysis ? "detail.analysisWithheld" : "detail.analysisUnavailable")}</Note>}
      <Note>{messages.text("detail.probabilityDisclosure")}</Note>
    </> : <>
      <Note>{messages.text(`detail.unavailable.${reason}`)}</Note>
      <Note>{messages.text(`detail.refresh.${data.fixture.update?.prediction ?? "unavailable"}`)}</Note>
    </>}
    <LinkButton type="button" onClick={close}>‹ {messages.text("details.backToMarkets")}</LinkButton>
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
export const MarketsCard = memo(function MarketsCard() {
  const { data, messages, home, away, view, update } = useDetails();
  const list = useRef<HTMLUListElement>(null);
  useReturnFocus(list, view.market);
  const [search, setSearch] = useMarketSearch(view.marketSearch), query = useDeferredValue(search);
  const featured = featuredFamily(data), published = data.snapshot?.markets.length ?? 0;
  const label = (family: MarketFamily) => `${marketName(messages, family)} ${messages.text(`market.code.${family}`)}`;
  const shown = visibleMarkets(view.marketCategory, query, label);
  const categoryLabel = (category: MarketCategory) => messages.text(`details.category.${category}`);
  return <Card data-section="markets" data-open={view.marketsOpen || undefined} $accent="orange" aria-labelledby="section-markets-title"
    style={{ gridTemplateRows: "auto 1fr" }}>
    <CardHeader icon={<MarketsIcon />} accent="orange" title={messages.text("details.allMarkets")} open={view.marketsOpen} controls="section-markets"
      meta={messages.text("details.publishedCount", { count: messages.number(published), total: messages.number(publicPolicy.markets.length) })}
      onToggle={() => update((current) => ({ ...current, marketsOpen: !current.marketsOpen, market: current.marketsOpen ? null : current.market }))}
      headingId="section-markets-title" />
    <div id="section-markets" hidden={!view.marketsOpen} style={{ minInlineSize: 0 }}>
      {view.marketsOpen && (view.market ? <MarketPanel family={view.market} /> : <Body>
        <Search><SearchIcon aria-hidden="true" /><input type="search" value={search} maxLength={80} placeholder={messages.text("details.searchMarkets")}
          aria-label={messages.text("details.searchMarkets")} onChange={(event) => setSearch(event.target.value)} /></Search>
        {!query && <ChoiceGroup label={messages.text("details.categories")} value={view.marketCategory}
          options={marketCategories.map((category) => ({ value: category, label: categoryLabel(category) }))}
          onChange={(category) => update((current) => ({ ...current, marketCategory: category }), "replace")} />}
        <div>
          <Head aria-hidden="true"><span>{messages.text("details.market")}</span><span>{messages.text("details.prediction")}</span>
            <span>{messages.text("details.probability")}</span><span>{messages.text("details.odds")}</span><span /></Head>
          {shown.length > 0 ? <RowList ref={list}>
            {shown.map((family) => {
              const { item } = marketRow(data, family), Icon = familyIcon[family];
              const pick = item ? pickLabel(messages, item.market.selection, home, away) : messages.text("details.notAvailable");
              return <li key={family}>
                <MarketRow type="button" data-detail-market={family} data-item-key={family} onClick={() => update((current) => ({ ...current, market: family }))}
                  aria-label={messages.text("details.tileOpen", { market: marketName(messages, family), pick, probability: percent(messages, item?.market.selectedProbability ?? null) })}>
                  <span data-name><IconBadge $accent={familyAccent[family]}><Icon /></IconBadge><span>{marketName(messages, family)}</span></span>
                  <span data-pick><Pill $accent={!item ? "blue" : family === featured ? "orange" : "blue"} style={item ? undefined : { opacity: 0.7 }}>{pick}</Pill></span>
                  <span data-bar>{item ? <><b>{percent(messages, item.market.selectedProbability)}</b><Bar value={item.market.selectedProbability} /></>
                    : <b>—</b>}</span>
                  <span data-odds title={messages.text("details.oddsMissing")}>—</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 6 6 6-6 6" /></svg>
                </MarketRow>
              </li>;
            })}
          </RowList> : <Note>{query ? messages.text("details.noMarketMatch", { query })
            : messages.text("details.noCategoryMarkets", { category: categoryLabel(view.marketCategory) })}</Note>}
        </div>
        {!query && marketCategoryMembers[view.marketCategory].length === 0 && <Note>{messages.text("details.supportedMarkets")}</Note>}
        <Footer>
          <Note>{messages.text("details.oddsFooter")}</Note>
          <Note>{messages.text("details.probabilityNotOdds")}</Note>
        </Footer>
      </Body>)}
    </div>
    {!view.marketsOpen && <LinkButton type="button" onClick={() => update((current) => ({ ...current, marketsOpen: true }))}>{messages.text("details.showMarkets")}</LinkButton>}
  </Card>;
});

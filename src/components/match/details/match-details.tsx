"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import styled from "styled-components";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import type { MatchDetailResponse } from "@/domain/match-detail";
import type { InsightsPreview } from "@/domain/match-insights";
import { defaultMatchView, type MatchSection, type MatchView } from "@/domain/match-view";
import { feedReturnStorageKey, homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { BackIcon } from "./details-icons";
import { DetailsProvider, Note, ViewProvider, desktop, focusRing, size, useStableDetails } from "./details-ui";
import { ContextSection, HistorySection, NewsSection, RefereeSection } from "./info-sections";
import { MarketTiles, MatchBanner } from "./match-banner";
import { MarketsCard } from "./markets-card";
import { InjuriesSection, LineupsSection, PlayersSection } from "./squad-sections";
import { FormSection, H2HSection, StatsSection } from "./team-sections";
import { useMatchView } from "./use-match-view";


const Page = styled.article`
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  overflow-wrap: anywhere;
  ${desktop} { gap: 12px; }
`;
const PhoneBar = styled.div`
  display: grid;
  grid-template-columns: 2rem minmax(0, 1fr) 2rem;
  align-items: center;
  gap: 8px;
  ${desktop} { display: none; }
  > p { margin: 0; font-size: ${size("title")}; font-weight: ${({ theme }) => theme.typography.weight.bold}; text-align: center; }
`;
const RoundLink = styled(Link)`
  display: grid;
  place-items: center;
  inline-size: 2rem;
  block-size: 2rem;
  color: ${({ theme }) => theme.color.text};
  border-radius: 50%;
  font-size: 1.125rem;
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; } }
  ${focusRing}
`;
const RoundButton = styled.button`
  display: grid;
  place-items: center;
  inline-size: 2rem;
  block-size: 2rem;
  padding: 0;
  color: ${({ theme }) => theme.color.accent.blue.text};
  background: ${({ theme }) => theme.color.accent.blue.soft};
  border: 0;
  border-radius: 50%;
  font-size: 1rem;
  cursor: pointer;
  ${focusRing}
`;
const SearchForm = styled.form`
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 2.5rem;
  padding-inline: 10px 6px;
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.brand};
  border-radius: 6px;
  ${desktop} { display: none; }
  > svg { flex: none; color: ${({ theme }) => theme.color.mutedText}; }
  > input { flex: 1; min-inline-size: 0; color: ${({ theme }) => theme.color.text}; background: none; border: 0; font: inherit; font-size: ${size("emphasis")}; outline: none; }
  > button { padding: 4px 8px; color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border: 0; border-radius: 4px; font: inherit; font-size: ${size("secondary")}; cursor: pointer; ${focusRing} }
`;
const BackLink = styled(Link)`
  display: none;
  ${desktop} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: ${size("body")};
    text-decoration: none;
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; } }
    ${focusRing}
  }
`;

/**
 * Sections in reading order. Phones: markets full width, then two-up cards. Tablets: two or three
 * columns. Wide desktops reproduce the reference grid: markets on the left spanning three rows,
 * comparison and head-to-head, then form, lineups and players, then news, injuries, context and
 * referee. An opened section spans the full width (and moves to the top on wide desktops).
 */
const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-flow: row dense;
  gap: 8px;
  align-items: start;
  @media (min-width: 22rem) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  ${desktop} { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  > [data-section="markets"], > [data-section="history"], > [data-open] { grid-column: 1 / -1; }
  /* Two-up, Referee would sit alone beside an empty cell whenever eight other cards pair up. */
  @media (min-width: 22rem) and (max-width: 63.99rem) {
    &:not([data-open-section]) > [data-section="referee"],
    &[data-open-section="history"] > [data-section="referee"] { grid-column: 1 / -1; }
  }
  ${media.wide} {
    grid-template-columns: minmax(0, 22fr) repeat(24, minmax(0, 1fr));
    align-items: stretch;
    > [data-section="markets"] { grid-column: 1; grid-row: span 3; }
    > [data-section="stats"] { grid-column: 2 / 16; }
    > [data-section="h2h"] { grid-column: 16 / 26; }
    > [data-section="form"] { grid-column: 2 / 9; }
    > [data-section="lineups"] { grid-column: 9 / 16; }
    > [data-section="players"] { grid-column: 16 / 26; }
    > [data-section="news"] { grid-column: 2 / 8; }
    > [data-section="injuries"] { grid-column: 8 / 14; }
    > [data-section="context"] { grid-column: 14 / 20; }
    > [data-section="referee"] { grid-column: 20 / 26; }
    > [data-section="history"] { grid-column: 1 / -1; }
    > [data-open]:not([data-section="markets"]) { grid-column: 1 / -1; grid-row: 1; }
  }
`;

const subscribeNever = () => () => {};
/** The feed's last URL, written by the feed page; storage can be blocked, so null falls back to today. */
function readFeedReturn(): string | null {
  try { return window.sessionStorage.getItem(feedReturnStorageKey); } catch { return null; }
}
/** The stored feed URL resolves after hydration inside this link alone, not across the whole page. */
function useBackHref(locale: string) {
  const stored = useSyncExternalStore(subscribeNever, readFeedReturn, () => null);
  return stored && stored.startsWith(homeHref(locale)) && !stored.includes("//") ? stored : homeHref(locale);
}
function DesktopBackLink() {
  const { locale, messages } = useStableDetails();
  return <BackLink href={useBackHref(locale)} prefetch={false}><BackIcon />{messages.text("details.backToPredictions")}</BackLink>;
}
/** Phone header with back and search; opening search re-renders only this header. */
function PhoneHeader() {
  const { locale, messages } = useStableDetails();
  const backHref = useBackHref(locale);
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  return <>
    <PhoneBar>
      <RoundLink href={backHref} prefetch={false} aria-label={messages.text("details.backToMatches")}><BackIcon /></RoundLink>
      <p>{messages.text("details.title")}</p>
      <RoundButton type="button" aria-expanded={searching} aria-controls="details-search" aria-label={messages.text(searching ? "feed.search.close" : "feed.search.open")}
        onClick={() => { setSearching(!searching); if (!searching) requestAnimationFrame(() => searchInput.current?.focus()); }}>
        {searching ? <CloseIcon /> : <SearchIcon />}
      </RoundButton>
    </PhoneBar>
    {searching && <SearchForm id="details-search" action={homeHref(locale)} method="get" role="search" aria-label={messages.text("feed.search.open")}>
      <SearchIcon aria-hidden="true" />
      <input ref={searchInput} type="search" name="q" maxLength={100} autoComplete="off" placeholder={messages.text("navigation.search")}
        aria-label={messages.text("feed.filters.search")} />
      <button type="submit">{messages.text("feed.search.submit")}</button>
    </SearchForm>}
  </>;
}

/**
 * Each card reads the view through its own provider. The open card gets the live view; closed cards
 * share one value that changes only with the open section, so filters, pages and items inside one
 * section (and market changes) re-render that card alone. Handlers read the URL through `update`.
 */
function SectionView({ section, view, closed, children }: { section: MatchSection; view: MatchView; closed: MatchView; children: ReactNode }) {
  return <ViewProvider value={view.section === section ? view : closed}>{children}</ViewProvider>;
}

export const MatchDetails = memo(function MatchDetails({ data, preview, locale = "en", history, historyRequested = false }: {
  data: MatchDetailResponse; preview: InsightsPreview | null; locale?: string; history?: ReactNode; historyRequested?: boolean;
}) {
  const { view, go, update } = useMatchView();
  const messages = useMemo(() => createMessages(locale), [locale]);
  const fixture = data.fixture;
  const home = fixture.homeTeam.name || messages.text("match.homeUnknown"), away = fixture.awayTeam.name || messages.text("match.awayUnknown");
  // Revision-history links arrive without a section; open the history section for them once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (historyRequested && view.section === null) go({ ...view, section: "history" }, "replace");
  }, [go, historyRequested, view]);
  const value = useMemo(() => ({ data, preview, locale, messages, go, update, home, away, fixtureId: fixture.fixtureId, history }),
    [away, data, fixture.fixtureId, go, history, home, locale, messages, preview, update]);
  const closed = useMemo(() => ({ ...defaultMatchView, section: view.section }), [view.section]);
  const { marketsOpen, market, marketCategory, marketSearch } = view;
  const markets = useMemo(() => ({ ...defaultMatchView, marketsOpen, market, marketCategory, marketSearch }),
    [market, marketCategory, marketSearch, marketsOpen]);
  const scoped = { view, closed };
  return <DetailsProvider value={value}>
    <Page data-match-detail data-fixture-id={fixture.fixtureId} data-detail-revision={data.snapshot?.revisionId ?? ""}>
      <PhoneHeader />
      <DesktopBackLink />
      <MatchBanner />
      <MarketTiles />
      <Grid data-open-section={view.section ?? undefined}>
        <ViewProvider value={markets}><MarketsCard /></ViewProvider>
        <SectionView section="stats" {...scoped}><StatsSection /></SectionView>
        <SectionView section="h2h" {...scoped}><H2HSection /></SectionView>
        <SectionView section="form" {...scoped}><FormSection /></SectionView>
        <SectionView section="lineups" {...scoped}><LineupsSection /></SectionView>
        <SectionView section="players" {...scoped}><PlayersSection /></SectionView>
        <SectionView section="news" {...scoped}><NewsSection /></SectionView>
        <SectionView section="injuries" {...scoped}><InjuriesSection /></SectionView>
        <SectionView section="context" {...scoped}><ContextSection /></SectionView>
        <SectionView section="referee" {...scoped}><RefereeSection /></SectionView>
        <SectionView section="history" {...scoped}><HistorySection /></SectionView>
      </Grid>
      <Note>{messages.text("details.disclaimer")}</Note>
    </Page>
  </DetailsProvider>;
});

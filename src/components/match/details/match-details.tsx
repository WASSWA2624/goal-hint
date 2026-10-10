"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import styled from "styled-components";
import { CloseIcon, SearchIcon } from "@/components/ui/icons";
import type { MatchDetailResponse } from "@/domain/match-detail";
import type { InsightsPreview } from "@/domain/match-insights";
import { feedReturnStorageKey, homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { BackIcon } from "./details-icons";
import { DetailsProvider, Note, desktop, focusRing } from "./details-ui";
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
  > p { margin: 0; font-size: 1.0625rem; font-weight: ${({ theme }) => theme.typography.weight.bold}; text-align: center; }
`;
const RoundLink = styled(Link)`
  display: grid;
  place-items: center;
  inline-size: 2rem;
  block-size: 2rem;
  color: ${({ theme }) => theme.color.text};
  border-radius: 50%;
  font-size: 1.125rem;
  &:hover { background: ${({ theme }) => theme.color.surfaceMuted}; }
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
  > input { flex: 1; min-inline-size: 0; color: ${({ theme }) => theme.color.text}; background: none; border: 0; font: inherit; font-size: 0.875rem; outline: none; }
  > button { padding: 4px 8px; color: ${({ theme }) => theme.color.onBrand}; background: ${({ theme }) => theme.color.brand}; border: 0; border-radius: 4px; font: inherit; font-size: 0.75rem; cursor: pointer; ${focusRing} }
`;
const BackLink = styled(Link)`
  display: none;
  ${desktop} {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
    color: ${({ theme }) => theme.color.mutedText};
    font-size: 0.8125rem;
    text-decoration: none;
    &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; }
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
  @media (min-width: ${({ theme }) => theme.breakpoint.xl}) {
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

export function MatchDetails({ data, preview, locale = "en", history, historyRequested = false }: {
  data: MatchDetailResponse; preview: InsightsPreview | null; locale?: string; history?: ReactNode; historyRequested?: boolean;
}) {
  const { view, go } = useMatchView();
  const messages = useMemo(() => createMessages(locale), [locale]);
  const fixture = data.fixture;
  const home = fixture.homeTeam.name || messages.text("match.homeUnknown"), away = fixture.awayTeam.name || messages.text("match.awayUnknown");
  const stored = useSyncExternalStore(subscribeNever, readFeedReturn, () => null);
  const backHref = stored && stored.startsWith(homeHref(locale)) && !stored.includes("//") ? stored : homeHref(locale);
  const [searching, setSearching] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  // Revision-history links arrive without a section; open the history section for them once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (historyRequested && view.section === null) go({ ...view, section: "history" }, "replace");
  }, [go, historyRequested, view]);
  const value = useMemo(() => ({ data, preview, locale, messages, view, go, home, away, fixtureId: fixture.fixtureId, history }),
    [away, data, fixture.fixtureId, go, history, home, locale, messages, preview, view]);
  return <DetailsProvider value={value}>
    <Page data-match-detail data-fixture-id={fixture.fixtureId} data-detail-revision={data.snapshot?.revisionId ?? ""}>
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
      <BackLink href={backHref} prefetch={false}><BackIcon />{messages.text("details.backToPredictions")}</BackLink>
      <MatchBanner />
      <MarketTiles />
      <Grid data-open-section={view.section ?? undefined}>
        <MarketsCard />
        <StatsSection />
        <H2HSection />
        <FormSection />
        <LineupsSection />
        <PlayersSection />
        <NewsSection />
        <InjuriesSection />
        <ContextSection />
        <RefereeSection />
        <HistorySection />
      </Grid>
      <Note>{messages.text("details.disclaimer")}</Note>
    </Page>
  </DetailsProvider>;
}

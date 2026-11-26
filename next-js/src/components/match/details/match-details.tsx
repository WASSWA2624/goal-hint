"use client";

import Link from "@/components/navigation/navigation-link";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import { AccountLinks } from "@/components/members/account-link";
import { HeaderBrand } from "@/components/ui/brand";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { memo, useMemo, useSyncExternalStore, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import type { MatchDetailResponse } from "@/domain/match-detail";
import type { InsightsPreview } from "@/domain/match-insights";
import { feedReturnStorageKey, homeHref, localePath, matchesHref } from "@/domain/navigation";
import { detailTabForView, hasMatchPredictionAccess, openDetailTab } from "@/domain/match-detail-tabs";
import { desktopMatchDetailTabs, serializeMatchView, type MatchDetailTab, type MatchView } from "@/domain/match-view";
import { useMessages } from "@/i18n/use-messages";
import { media } from "@/styles/theme";
import { contentGutter } from "@/components/ui/layout";
import { CalendarIcon, LockIcon } from "@/components/ui/icons";
import { BackIcon, CompareIcon, ContextIcon, HeadToHeadIcon, HistoryIcon, LineupIcon, MarketsIcon, NewsIcon, PlayerIcon, ReasonIcon, RefereeIcon } from "./details-icons";
import { DetailsProvider, Note, desktop, useStableDetails, type Messages } from "./details-ui";
import { DesktopMatchNavigationLink, DesktopMatchWorkspace, desktopMatchContentId } from "./desktop-match-workspace";
import { MatchBanner } from "./match-banner";
import { MatchPredictions } from "./match-predictions";
import { Verdict } from "./verdict";
import { useMatchDesktopViewport, useMatchView } from "./use-match-view";
import { TouchlineFeatured } from "./touchline-featured";
import { MatchSectionContent, TouchlineTabs } from "./touchline-tabs";
import { TouchlineBody } from "./touchline-ui";


/** Compact phone layout retains the scoreboard, pick and horizontal information tabs. */
const Page = styled.article`
  display: grid;
  align-content: start;
  gap: var(--gh-spacing-2);
  min-inline-size: 0;
  overflow-wrap: anywhere;
  ${desktop} { display: none; }
`;
/**
 * The phone top bar shares the feed's branded surface and horizontal rails,
 * and reaches up through the app page's 10px top padding.
 */
const PhoneBar = styled.div`
  position: relative;
  ${compactHeaderRow}
  gap: var(--gh-spacing-1);
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  margin-block-start: calc(-1 * var(--gh-spacing-2_5));
  margin-inline: calc(-1 * (${contentGutter} + var(--app-phone-header-outset, 0px)));
  padding-inline: ${contentGutter};
  ${compactHeaderSurface}
  @media (max-width: ${({ theme }) => theme.viewport[23.6875]}) {
    [data-header-auth="register"] { > svg { display: block; } > span { display: none; } }
  }
  ${desktop} { display: none; }
`;
const PhoneHome = styled(Link)`
  ${compactHeaderBrand}
  flex: 1 1 0;
  min-inline-size: min(var(--gh-size-24), 100%);
  justify-self: start;
  max-inline-size: 100%;
  img { max-inline-size: 100%; block-size: auto; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: var(--gh-size-0_5); }
`;
/** The header accent keeps focus visible on the active bar surface. */
const barFocus = css`
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: var(--gh-size-0_5); }
`;
const RoundLink = styled(Link)`
  display: grid;
  place-items: center;
  inline-size: var(--gh-size-11);
  block-size: var(--gh-size-11);
  color: ${({ theme }) => theme.header.text};
  border-radius: ${({ theme }) => theme.radius.control};
  font-size: var(--gh-font-page);
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlFill}; } }
  ${barFocus}
`;
const subscribeNever = () => () => {};
/** The feed's last URL, written by the feed page; storage can be blocked, so null falls back to today. */
function readFeedReturn(): string | null {
  try { return window.sessionStorage.getItem(feedReturnStorageKey); } catch { return null; }
}
/** The stored feed URL resolves after hydration inside this link alone, not across the whole page. */
function useBackHref(locale: string) {
  const stored = useSyncExternalStore(subscribeNever, readFeedReturn, () => null);
  return stored && stored.startsWith(`${localePath(locale)}/`) && !stored.includes("//") ? stored : matchesHref(locale);
}
/** Phone header keeps back navigation and the same account menu as the app shell. */
function PhoneHeader() {
  const { locale, messages, showAccount } = useStableDetails();
  const backHref = useBackHref(locale);
  return <PhoneBar>
    <RoundLink href={backHref} contextBack prefetch={false} aria-label={messages.text("navigation.back")}><BackIcon /></RoundLink>
    <PhoneHome href={homeHref(locale)} prefetch={false} aria-label={messages.text("navigation.home")}><HeaderBrand alt="" /></PhoneHome>
    <AccountLinks locale={locale} showAccount={showAccount === true} />
    <NavigationProgress label={messages.text("navigation.loading")} />
  </PhoneBar>;
}

const sectionIcons = { details: CalendarIcon, stats: CompareIcon, events: HistoryIcon, lineups: LineupIcon, form: HeadToHeadIcon,
  standings: ContextIcon, players: PlayerIcon, markets: MarketsIcon, analysis: ReasonIcon, news: NewsIcon,
  venue: ContextIcon, referee: RefereeIcon, history: HistoryIcon };

function sectionLabel(messages: Messages, section: MatchDetailTab) {
  return section === "details" || section === "stats" || section === "events"
    ? messages.text(`touchline.desktop.${section}`) : messages.text(`touchline.tab.${section}`);
}

function DesktopDetail({ view, query, footer, mobileFallback }: { view: MatchView; query: URLSearchParams; footer?: ReactNode; mobileFallback: boolean }) {
  const { data, messages, update, home, away } = useStableDetails();
  const selected = detailTabForView(view, true), allowed = hasMatchPredictionAccess(data);
  return <DesktopMatchWorkspace label={messages.text("touchline.sections")} title={messages.text("match.title", { home, away })}
    section={selected} sectionLabel={sectionLabel(messages, selected)} footer={footer} mobileFallback={mobileFallback}
    navigation={desktopMatchDetailTabs.map(section => {
      const parameters = serializeMatchView(openDetailTab(view, section), query);
      const Icon = sectionIcons[section];
      return <li key={section}>
        <DesktopMatchNavigationLink href={`${data.route.path}?${parameters}`} prefetch={false} data-match-section={section}
          aria-current={selected === section ? "page" : undefined} aria-controls={desktopMatchContentId}
          onNavigate={event => { event.preventDefault(); if (selected !== section) update(current => openDetailTab(current, section)); }}>
          <Icon /><span data-sidebar-label>{sectionLabel(messages, section)}</span>
          {!allowed && (section === "markets" || section === "analysis") && <LockIcon data-lock aria-hidden="true" />}
        </DesktopMatchNavigationLink>
      </li>;
    })}>
    {selected === "details" ? <TouchlineBody>
      <MatchBanner workspace />
      <MatchPredictions />
    </TouchlineBody> : <MatchSectionContent selected={selected} view={view} desktop />}
  </DesktopMatchWorkspace>;
}

export const MatchDetails = memo(function MatchDetails({ data, preview, locale = "en", history, showAccount = false, offer = null, footer }: {
  data: MatchDetailResponse; preview: InsightsPreview | null; locale?: string; history?: ReactNode;
  showAccount?: boolean; offer?: SubscriptionOffer | null; footer?: ReactNode;
}) {
  const { view, go, update, parameters } = useMatchView();
  const desktopViewport = useMatchDesktopViewport();
  const messages = useMessages(locale);
  const fixture = data.fixture;
  const showReplay = data.selection === "applicable" && fixture.retrospective != null;
  const home = fixture.homeTeam.name || messages.text("match.homeUnknown"), away = fixture.awayTeam.name || messages.text("match.awayUnknown");
  const value = useMemo(() => ({ data, preview, locale, messages, go, update, home, away, fixtureId: fixture.fixtureId, history, showAccount, offer }),
    [away, data, fixture.fixtureId, go, history, home, locale, messages, preview, update, showAccount, offer]);
  // A scoped SSR panel can serve both widths without duplicate revision or item anchors.
  const mobileFallback = desktopViewport === null && detailTabForView(view, true) !== "details";
  const attributes = { "data-match-detail": "", "data-fixture-id": fixture.fixtureId, "data-detail-revision": data.snapshot?.revisionId ?? "" };
  return <DetailsProvider value={value}>
    {desktopViewport !== true && <Page {...attributes} data-match-design="phone">
      <PhoneHeader />
      <MatchBanner summaryId={desktopViewport === null && !mobileFallback ? "initial-phone-match-summary" : "current-match-summary"} />
      {showReplay && desktopViewport !== null ? <TouchlineFeatured /> : <Verdict />}
      {desktopViewport === false && <TouchlineTabs view={view} />}
      {desktopViewport === null && !mobileFallback && <noscript><TouchlineTabs view={view} /></noscript>}
      <Note>{messages.text("details.disclaimer")}</Note>
    </Page>}
    {desktopViewport !== false && <article {...attributes} data-match-design="touchline">
      <DesktopDetail view={view} query={parameters} footer={footer} mobileFallback={mobileFallback} />
    </article>}
  </DetailsProvider>;
});

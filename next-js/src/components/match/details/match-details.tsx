"use client";

import Link from "@/components/navigation/navigation-link";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import { AccountLinks } from "@/components/members/account-link";
import { SubscriptionStatusBar } from "@/components/members/subscription-status-bar";
import { HeaderBrand } from "@/components/ui/brand";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import type { MatchDetailResponse } from "@/domain/match-detail";
import type { InsightsPreview } from "@/domain/match-insights";
import { defaultMatchView, openSection, type MatchSection, type MatchView } from "@/domain/match-view";
import { feedReturnStorageKey, homeHref, matchesHref } from "@/domain/navigation";
import { useMessages } from "@/i18n/use-messages";
import { media } from "@/styles/theme";
import { BackIcon } from "./details-icons";
import { DetailsProvider, Note, ViewProvider, desktop, focusRing, size, useStableDetails } from "./details-ui";
import { ContextSection, HistorySection, NewsSection, RefereeSection } from "./info-sections";
import { MatchBanner } from "./match-banner";
import { MarketsCard } from "./markets-card";
import { AnalysisDrawer } from "./analysis-drawer";
import { Verdict } from "./verdict";
import { LiveMatchPanel } from "../live-match-panel";
import { InjuriesSection, LineupsSection, PlayersSection } from "./squad-sections";
import { FormSection, H2HSection, StatsSection } from "./team-sections";
import { DisclosureProvider } from "./section-card";
import { useMatchView, useOpenByDefault } from "./use-match-view";


/** One column at every width; desktop keeps it to the site's reading width, centred. */
const Page = styled.article`
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  overflow-wrap: anywhere;
  ${desktop} {
    gap: 12px;
    inline-size: 100%;
    max-inline-size: ${({ theme }) => theme.layout.maxWidth};
    margin-inline: auto;
  }
`;
const PhoneHeaderGroup = styled.div`
  display: grid;
  gap: 0;
  min-inline-size: 0;
  ${desktop} { display: none; }
`;
const PhoneSubscriptionStatus = styled(SubscriptionStatusBar)`
  margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter});
`;
/**
 * The phone top bar matches the feed's branded bar and quiet separator, full bleed
 * past the page gutter and up through the app page's 10px top padding, with themed text and icons.
 */
const PhoneBar = styled.div`
  position: relative;
  ${compactHeaderRow}
  gap: 4px;
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  margin-block-start: -10px;
  margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter});
  padding-inline: 8px;
  ${compactHeaderSurface}
  @media (max-width: 379px) {
    [data-header-auth="register"] { > svg { display: block; } > span { display: none; } }
  }
  ${desktop} { display: none; }
`;
const PhoneHome = styled(Link)`
  ${compactHeaderBrand}
  flex: 1 1 0;
  min-inline-size: min(6rem, 100%);
  justify-self: start;
  max-inline-size: 100%;
  img { max-inline-size: 100%; block-size: auto; }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;
/** The header accent keeps focus visible on the active bar surface. */
const barFocus = css`
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;
const RoundLink = styled(Link)`
  display: grid;
  place-items: center;
  inline-size: 2.75rem;
  block-size: 2.75rem;
  color: ${({ theme }) => theme.header.text};
  border-radius: 0;
  font-size: 1.375rem;
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlFill}; } }
  ${barFocus}
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
 * The drawers in reading order: markets first, then the reasons, the match itself, the teams and the record.
 * Phones run them as one full-bleed list; desktop frames the list. An opened drawer reveals its section in place.
 */
const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  min-inline-size: 0;
  ${(["markets", "analysis", "stats", "lineups", "injuries", "form", "h2h", "players", "news", "context", "referee", "history"] as const)
    .map((section, index) => `> [data-section="${section}"] { order: ${index}; }`).join("\n")}
  ${media.belowDesktop} { margin-inline: calc(-1 * ${({ theme }) => theme.layout.gutter}); }
  ${desktop} {
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-block-end: 0;
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
  return stored && stored.startsWith(homeHref(locale)) && !stored.includes("//") ? stored : matchesHref(locale);
}
function DesktopBackLink() {
  const { locale, messages } = useStableDetails();
  return <BackLink href={useBackHref(locale)} prefetch={false}><BackIcon />{messages.text("details.backToPredictions")}</BackLink>;
}
/** Phone header keeps back navigation and the same account menu as the app shell. */
function PhoneHeader() {
  const { locale, messages, showAccount } = useStableDetails();
  const backHref = useBackHref(locale);
  return <PhoneHeaderGroup>
    <PhoneBar>
      <RoundLink href={backHref} prefetch={false} aria-label={messages.text("details.backToMatches")}><BackIcon /></RoundLink>
      <PhoneHome href={homeHref(locale)} prefetch={false} aria-label={messages.text("navigation.home")}><HeaderBrand alt="" /></PhoneHome>
      <AccountLinks locale={locale} showAccount={showAccount === true} />
      <NavigationProgress label={messages.text("navigation.loading")} />
    </PhoneBar>
    <PhoneSubscriptionStatus locale={locale} />
  </PhoneHeaderGroup>;
}

/**
 * One section's view and disclosure. Desktop opens every section by default and remembers the reader's own
 * collapse; phones open one section at a time through the URL. The URL's section gets the live view, other open
 * sections a stable default view, closed ones a shared value that changes only with the URL's section, so
 * filters, pages and items inside one section re-render that card alone. Handlers read the URL through `update`.
 */
function SectionView({ section, view, closed, byDefault, children }: {
  section: MatchSection; view: MatchView; closed: MatchView; byDefault: boolean; children: ReactNode;
}) {
  const details = useStableDetails();
  const focused = view.section === section;
  // `choice`: the reader's own open or closed state on desktop. `inside`: the next focus change comes from this
  // section's own controls (a filter, a page, an item) and must not move the page.
  const [state, setState] = useState(() => ({ choice: null as boolean | null, focused, inside: false, reveal: focused ? 1 : 0 }));
  if (state.focused !== focused) setState({ ...state, focused, inside: false, reveal: focused && !state.inside ? state.reveal + 1 : state.reveal });
  const open = focused || (byDefault && state.choice !== false);
  const expanded = useMemo(() => ({ ...defaultMatchView, section }), [section]);
  // Interactions inside a section first make it the URL's section, so its filters, pages and items are addressable.
  const scoped = useMemo(() => ({ ...details, update: ((change, mode) => {
    setState((current) => ({ ...current, inside: true }));
    details.update((current) => change(current.section === section ? current : openSection(current, section)), mode);
  }) satisfies typeof details.update }), [details, section]);
  const toggle = useCallback(() => {
    if (open) {
      setState((current) => ({ ...current, choice: false }));
      if (focused) details.update((current) => openSection(current, null));
    } else {
      setState((current) => ({ ...current, choice: true, reveal: byDefault ? current.reveal + 1 : current.reveal }));
      if (!byDefault) details.update((current) => openSection(current, section));
    }
  }, [byDefault, details, focused, open, section]);
  const disclosure = useMemo(() => ({ open, byDefault: open && !focused && state.choice === null, reveal: state.reveal, toggle }),
    [focused, open, state.choice, state.reveal, toggle]);
  return <DetailsProvider value={scoped}>
    <DisclosureProvider value={disclosure}>
      <ViewProvider value={focused ? view : open ? expanded : closed}>{children}</ViewProvider>
    </DisclosureProvider>
  </DetailsProvider>;
}

export const MatchDetails = memo(function MatchDetails({ data, preview, locale = "en", history, historyRequested = false, showAccount = false, offer = null }: {
  data: MatchDetailResponse; preview: InsightsPreview | null; locale?: string; history?: ReactNode; historyRequested?: boolean; showAccount?: boolean; offer?: SubscriptionOffer | null;
}) {
  const { view, go, update } = useMatchView();
  const byDefault = useOpenByDefault();
  const messages = useMessages(locale);
  const fixture = data.fixture;
  const home = fixture.homeTeam.name || messages.text("match.homeUnknown"), away = fixture.awayTeam.name || messages.text("match.awayUnknown");
  // Revision-history links arrive without a section; open the history section for them once.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (historyRequested && view.section === null) go({ ...view, section: "history" }, "replace");
  }, [go, historyRequested, view]);
  const value = useMemo(() => ({ data, preview, locale, messages, go, update, home, away, fixtureId: fixture.fixtureId, history, showAccount, offer }),
    [away, data, fixture.fixtureId, go, history, home, locale, messages, preview, update, showAccount, offer]);
  const closed = useMemo(() => ({ ...defaultMatchView, section: view.section }), [view.section]);
  const { marketsOpen, market, marketCategory, marketSearch } = view;
  const markets = useMemo(() => ({ ...defaultMatchView, marketsOpen, market, marketCategory, marketSearch }),
    [market, marketCategory, marketSearch, marketsOpen]);
  const scoped = { view, closed, byDefault };
  return <DetailsProvider value={value}>
    <Page data-match-detail data-fixture-id={fixture.fixtureId} data-detail-revision={data.snapshot?.revisionId ?? ""}>
      <PhoneHeader />
      <DesktopBackLink />
      <MatchBanner />
      <Verdict />
      {data.liveMatch !== undefined && <LiveMatchPanel snapshot={data.liveMatch} asOf={data.asOf} home={home} away={away} locale={locale}
        historical={data.selection !== "applicable"} fixtureStatus={data.fixture.status} />}
      <Grid>
        <ViewProvider value={markets}><MarketsCard /></ViewProvider>
        <AnalysisDrawer />
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

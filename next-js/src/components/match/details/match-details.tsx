"use client";

import Link from "@/components/navigation/navigation-link";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import { AccountLinks } from "@/components/members/account-link";
import { SubscriptionStatusBar } from "@/components/members/subscription-status-bar";
import { HeaderBrand } from "@/components/ui/brand";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { memo, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import styled, { css } from "styled-components";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import type { MatchDetailResponse } from "@/domain/match-detail";
import type { InsightsPreview } from "@/domain/match-insights";
import { feedReturnStorageKey, homeHref, matchesHref } from "@/domain/navigation";
import { useMessages } from "@/i18n/use-messages";
import { media } from "@/styles/theme";
import { BackIcon } from "./details-icons";
import { DetailsProvider, Note, desktop, focusRing, size, useStableDetails } from "./details-ui";
import { MatchBanner } from "./match-banner";
import { Verdict } from "./verdict";
import { useMatchView, useOpenByDefault } from "./use-match-view";
import { TouchlineFeatured } from "./touchline-featured";
import { TouchlineTabs } from "./touchline-tabs";


/** One column at every width; desktop sections align with the full-width app frame. */
const Page = styled.article`
  display: grid;
  gap: 8px;
  min-inline-size: 0;
  overflow-wrap: anywhere;
  ${desktop} {
    gap: 12px;
    inline-size: 100%;
    > ${Note} { padding-inline: ${({ theme }) => theme.space.md}; }
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
  border-radius: ${({ theme }) => theme.radius.control};
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
    padding-inline: ${({ theme }) => theme.space.md};
    color: ${({ theme }) => theme.color.mutedText};
    font-size: ${size("body")};
    text-decoration: none;
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.accent.blue.solid}; } }
    ${focusRing}
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
    if (historyRequested && view.section === null) go({ ...view, section: "history", panel: null }, "replace");
  }, [go, historyRequested, view]);
  const value = useMemo(() => ({ data, preview, locale, messages, go, update, home, away, fixtureId: fixture.fixtureId, history, showAccount, offer }),
    [away, data, fixture.fixtureId, go, history, home, locale, messages, preview, update, showAccount, offer]);
  return <DetailsProvider value={value}>
    <Page data-match-detail data-match-design={byDefault ? "touchline" : "phone"} data-fixture-id={fixture.fixtureId} data-detail-revision={data.snapshot?.revisionId ?? ""}>
      <PhoneHeader />
      <DesktopBackLink />
      <MatchBanner touchline={byDefault} />
      {byDefault ? <TouchlineFeatured /> : <Verdict />}
      <TouchlineTabs view={view} />
      {!byDefault && <Note>{messages.text("details.disclaimer")}</Note>}
    </Page>
  </DetailsProvider>;
});

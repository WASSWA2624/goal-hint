"use client";

import { useContext, useMemo, type ReactNode } from "react";
import { useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { HeaderBrand } from "@/components/ui/brand";
import { AccountLinks } from "@/components/members/account-link";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { getReportingDate, type UtcInstant } from "@/domain/calendar";
import { getDateInTimeZone, validTimeZone } from "@/domain/device-calendar";
import { homeHref, type NavigationLocation } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { FallbackStyleProvider } from "@/styles/provider";
import { AppBrandBar } from "./app-brand-bar";
import { navigationDestinations } from "./navigation-destinations";
import { NavigationProgress } from "./navigation-progress";
import { PersistentShellContext } from "./persistent-shell-context";
import { SessionNavigation } from "./session-navigation";
import {
  DesktopNav, Header, HeaderActions, HeaderContent, HomeLink, PublicShellFrame, SkipLink, TabBar, WorkspaceHeaderContent,
} from "./shell-styles";

type NavigationProps = {
  locale: string;
  current?: NavigationLocation | undefined;
  destinations: ReturnType<typeof navigationDestinations>;
};

export function PublicHeader({ locale, current, destinations, app, wide, workspace, showAccount, administratorName }: NavigationProps & {
  app: boolean;
  wide: boolean;
  workspace: boolean;
  showAccount: boolean;
  administratorName?: string | undefined;
}) {
  const messages = createMessages(locale), ContentHeader = workspace ? WorkspaceHeaderContent : HeaderContent;
  return <Header $app={app}>
    <ContentHeader $wide={app || wide || workspace}>
      <HomeLink href={homeHref(locale)} aria-label={messages.text("navigation.home")} prefetch={false}>
        <HeaderBrand alt="" />
      </HomeLink>
      <DesktopNav aria-label={messages.text("navigation.primary")}>
        <SessionNavigation locale={locale} destinations={destinations} dashboardLabel={messages.text("navigation.dashboard")}
          moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
      </DesktopNav>
      <HeaderActions><AccountLinks locale={locale} showAccount={showAccount} {...(administratorName ? { administratorName } : {})} /></HeaderActions>
    </ContentHeader>
    <NavigationProgress label={messages.text("navigation.loading")} />
  </Header>;
}

export function PublicTabs({ locale, current, destinations }: NavigationProps) {
  const messages = createMessages(locale);
  return <TabBar aria-label={messages.text("navigation.tabs")}>
    <SessionNavigation mobile locale={locale} destinations={destinations} dashboardLabel={messages.text("navigation.dashboard")}
      moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
  </TabBar>;
}

/** Standalone pages retain their shell. App routes supply the same frame from their common layout. */
export function PublicShellBoundary({ children, header, tabs, app, locale, workspace }: {
  children: ReactNode;
  header: ReactNode;
  tabs: ReactNode;
  app: boolean;
  locale: string;
  workspace: boolean;
}) {
  const persistent = useContext(PersistentShellContext);
  if (persistent) return children;
  return <FallbackStyleProvider><PublicShellFrame $workspace={workspace}>
    {app && <MemberNavigationRecovery />}
    <SkipLink href="#main-content">{createMessages(locale).text("navigation.skip")}</SkipLink>
    {header}{children}{tabs}
  </PublicShellFrame></FallbackStyleProvider>;
}

/** Keep both viewport headers and the tab bar mounted across the three app entry pages. */
export function PersistentAppShell({ children, locale, asOf }: { children: ReactNode; locale: string; asOf: UtcInstant }) {
  const segment = useSelectedLayoutSegment(), search = useSearchParams();
  const current = segment === "matches" ? "today" : segment === "best-slips" || segment === "slips" ? segment : undefined;
  const candidate = current === "today" ? search.get("tz") : null;
  const zone = validTimeZone(candidate) ? candidate : null;
  const today = zone ? getDateInTimeZone(asOf, zone) : getReportingDate(asOf);
  const destinations = useMemo(() => navigationDestinations(today, locale, zone), [today, locale, zone]);
  const navigation: NavigationProps = { locale, current, destinations };
  return <FallbackStyleProvider><PublicShellFrame $workspace={false} data-app-navigation={segment ?? undefined}>
    <PersistentShellContext.Provider value={true}>
      <MemberNavigationRecovery />
      <SkipLink href="#main-content">{createMessages(locale).text("navigation.skip")}</SkipLink>
      <PublicHeader {...navigation} app wide workspace={false} showAccount />
      <AppBrandBar locale={locale} persistent />
      {children}
      <PublicTabs {...navigation} />
    </PersistentShellContext.Provider>
  </PublicShellFrame></FallbackStyleProvider>;
}

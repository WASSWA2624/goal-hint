import "server-only";
import type { ReactNode } from "react";
import { HeaderBrand, BrandMark } from "@/components/ui/brand";
import { AccountLinks } from "@/components/members/account-link";
import { SubscriptionStatusBar } from "@/components/members/subscription-status-bar";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { navigationDestinations } from "@/components/navigation/navigation-destinations";
import { SessionNavigation } from "@/components/navigation/session-navigation";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { Container, PageMain } from "@/components/ui/layout";
import {
  homeHref, informationHref, informationPages,
  type NavigationLocation,
} from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { FallbackStyleProvider } from "@/styles/provider";
import {
  DesktopNav, Footer, FooterBrand, FooterContent, FooterLink, FooterLinks, FooterNote, Header, HeaderActions, HeaderContent, HomeLink,
  ShellFrame, SkipLink, TabBar,
} from "@/components/navigation/shell-styles";

import { getShellDate } from "./shell-time";
export { getShellDate, getShellInstant } from "./shell-time";

export async function PublicShell({ children, locale, current, today: reportingDate, zone, app = false, compact = false, showAccount = true, wide = false, administratorName }: {
  children: ReactNode;
  locale?: string;
  current?: NavigationLocation;
  today?: Awaited<ReturnType<typeof getShellDate>>;
  /** A shared browsing zone keeps server-rendered navigation consistent with the selected day. */
  zone?: string | null;
  /** App screens have their own phone heading, wider desktop content and the phone tab bar. */
  app?: boolean;
  /** Dense mobile feeds use 8px gutters; other app screens retain their existing spacing. */
  compact?: boolean;
  showAccount?: boolean;
  /** Dense dashboards use the wide container while keeping the shared phone header. */
  wide?: boolean;
  administratorName?: string;
}) {
  const language = resolveLocale(locale);
  const messages = createMessages(language);
  const today = reportingDate ?? await getShellDate();
  const destinations = navigationDestinations(today, language, zone);

  return (
    <FallbackStyleProvider><ShellFrame>
      {app && <MemberNavigationRecovery />}
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header $app={app}>
        <HeaderContent $wide={app || wide}>
          <HomeLink href={homeHref(language)} aria-label={messages.text("navigation.home")} prefetch={false}>
            <HeaderBrand alt="" />
          </HomeLink>
          <DesktopNav aria-label={messages.text("navigation.primary")}>
            <SessionNavigation destinations={destinations} dashboardLabel={messages.text("navigation.dashboard")} moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
          </DesktopNav>
          <HeaderActions><AccountLinks locale={language} showAccount={showAccount} {...(administratorName ? { administratorName } : {})} /></HeaderActions>
        </HeaderContent>
        <NavigationProgress label={messages.text("navigation.loading")} />
      </Header>
      {!administratorName && <SubscriptionStatusBar locale={language} desktopOnly={app} wide={app || wide} bestSlips={current === "best-slips"} />}
      <PageMain id="main-content" tabIndex={-1} $app={app} $compact={compact} $compactTop={current === "best-slips"} $dashboard={current === "dashboard"}>
        <Container $wide={app || wide}>{children}</Container>
      </PageMain>
      {current !== "dashboard" && <Footer>
        <FooterContent $wide={app || wide}>
          <FooterBrand>
            <BrandMark alt="" />
            <span>{messages.text("navigation.copyright", { year: today.slice(0, 4) })}</span>
          </FooterBrand>
          <nav aria-label={messages.text("navigation.footer")}>
            <FooterLinks>
              {informationPages.map((page) => (
                <li key={page}>
                  <FooterLink href={informationHref(page, language)}
                    aria-current={current === page ? "page" : undefined} prefetch={false}>
                    {messages.text(`navigation.${page}`)}
                  </FooterLink>
                </li>
              ))}
            </FooterLinks>
          </nav>
          <FooterNote>{messages.text("navigation.footerNote")}</FooterNote>
        </FooterContent>
      </Footer>}
      <TabBar aria-label={messages.text("navigation.tabs")}>
        <SessionNavigation mobile destinations={destinations} dashboardLabel={messages.text("navigation.dashboard")} moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
      </TabBar>
    </ShellFrame></FallbackStyleProvider>
  );
}

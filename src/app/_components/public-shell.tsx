import "server-only";
import type { ReactNode } from "react";
import { cache } from "react";
import { connection } from "next/server";
import { BrandLogo, BrandMark } from "@/components/ui/brand";
import { AccountLinks } from "@/components/members/account-link";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import type { NavigationDestination } from "@/components/navigation/responsive-navigation";
import { SessionNavigation } from "@/components/navigation/session-navigation";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { Container, PageMain } from "@/components/ui/layout";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import {
  feedHref, getFeedEntry, homeHref, matchesHref, informationHref, informationPages, slipsHref,
  type NavigationLocation,
} from "@/domain/navigation";
import { deviceFeedEntryHref } from "@/domain/device-feed";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import {
  DesktopNav, Footer, FooterBrand, FooterContent, FooterLink, FooterLinks, FooterNote, Header, HeaderActions, HeaderContent, HomeLink,
  ShellFrame, SkipLink, TabBar,
} from "@/components/navigation/shell-styles";

/** One request-scoped EAT date; never freeze Today in the production build. */
export const getShellInstant = cache(async () => {
  await connection();
  return utcInstantFromEpochMilliseconds(Date.now());
});
export const getShellDate = cache(async () => getReportingDate(await getShellInstant()));

export async function PublicShell({ children, locale, current, today: reportingDate, zone, app = false, compact = false, showAccount = true, wide = false }: {
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
}) {
  const language = resolveLocale(locale);
  const messages = createMessages(language);
  const today = reportingDate ?? await getShellDate();
  const todayHref = zone ? deviceFeedEntryHref("today", today, zone, language) : matchesHref(language);
  const resultsHref = zone ? deviceFeedEntryHref("results", today, zone, language) : feedHref(getFeedEntry(today, "results"), language);
  const sections = [
    { key: "best-slips", href: homeHref(language), label: messages.text("bestSlips.title"), tab: messages.text("bestSlips.title"), icon: "slips", tone: "teal" },
    { key: "today", href: todayHref, label: messages.text("navigation.matches"), tab: messages.text("navigation.matches"), icon: "matches", tone: "teal" },
    { key: "live", href: zone ? deviceFeedEntryHref("live", today, zone, language) : `${matchesHref(language)}?status=live`, label: messages.text("navigation.live"), tab: messages.text("navigation.live"), icon: "live", tone: "red" },
    { key: "results", href: resultsHref, label: messages.text("navigation.results"), tab: messages.text("navigation.results"), icon: "results", tone: "violet" },
    { key: "slips", href: slipsHref(language), label: messages.text("navigation.slips"), tab: messages.text("navigation.slips"), icon: "slips", tone: "teal" },
  ] as const;
  const destinations: readonly NavigationDestination[] = [...sections, ...informationPages.map((page) => ({
    key: page, href: informationHref(page, language), label: messages.text(`navigation.${page}`),
    tab: messages.text(`navigation.${page}`), icon: page, tone: "blue" as const,
  }))];

  return (
    <ShellFrame>
      {app && <MemberNavigationRecovery />}
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header $app={app}>
        <HeaderContent $wide={app || wide}>
          <HomeLink href={homeHref(language)} aria-label={messages.text("navigation.home")} prefetch={false}>
            <BrandLogo alt="" variant="inverse" />
          </HomeLink>
          <DesktopNav aria-label={messages.text("navigation.primary")}>
            <SessionNavigation destinations={destinations} dashboardLabel={messages.text("navigation.dashboard")} moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
          </DesktopNav>
          <HeaderActions><AccountLinks locale={language} showAccount={showAccount} /></HeaderActions>
        </HeaderContent>
        <NavigationProgress label={messages.text("navigation.loading")} />
      </Header>
      <PageMain id="main-content" tabIndex={-1} $app={app} $compact={compact}>
        <Container $wide={app || wide}>{children}</Container>
      </PageMain>
      <Footer>
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
      </Footer>
      <TabBar aria-label={messages.text("navigation.tabs")}>
        <SessionNavigation mobile destinations={destinations} dashboardLabel={messages.text("navigation.dashboard")} moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
      </TabBar>
    </ShellFrame>
  );
}

import "server-only";
import type { ReactNode } from "react";
import { cache } from "react";
import { connection } from "next/server";
import { BrandLogo, BrandMark } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SearchIcon } from "@/components/ui/icons";
import { ResponsiveNavigation, type NavigationDestination } from "@/components/navigation/responsive-navigation";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { Container, PageMain } from "@/components/ui/layout";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import {
  feedHref, getFeedEntry, homeHref, informationHref, informationPages, slipsHref,
  type NavigationLocation,
} from "@/domain/navigation";
import { feedQueryRules } from "@/domain/feed-query";
import { deviceFeedEntryHref } from "@/domain/device-feed";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import {
  DesktopNav, Footer, FooterBrand, FooterContent, FooterLink, FooterLinks, FooterNote, Header, HeaderActions, HeaderContent, HeaderSearch, HomeLink,
  ShellFrame, SkipLink, TabBar,
} from "@/components/navigation/shell-styles";

/** One request-scoped EAT date; never freeze Today in the production build. */
export const getShellInstant = cache(async () => {
  await connection();
  return utcInstantFromEpochMilliseconds(Date.now());
});
export const getShellDate = cache(async () => getReportingDate(await getShellInstant()));

/** A GET search that keeps the visitor's other feed parameters. */
export type ShellSearch = Readonly<{ action: string; hidden: readonly (readonly [string, string])[]; value: string }>;

export async function PublicShell({ children, locale, current, today: reportingDate, zone, app = false, compact = false, search }: {
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
  /** null lets a page own its body search without a duplicate shell field. */
  search?: ShellSearch | null;
}) {
  const language = resolveLocale(locale);
  const messages = createMessages(language);
  const today = reportingDate ?? await getShellDate();
  const todayHref = zone ? deviceFeedEntryHref("today", today, zone, language) : feedHref(getFeedEntry(today, "today"), language);
  const resultsHref = zone ? deviceFeedEntryHref("results", today, zone, language) : feedHref(getFeedEntry(today, "results"), language);
  const sections = [
    { key: "today", href: todayHref, label: messages.text("navigation.predictions"), tab: messages.text("navigation.matches"), icon: "matches", tone: "teal" },
    { key: "live", href: zone ? deviceFeedEntryHref("live", today, zone, language) : feedHref({ date: today, status: "live" }, language), label: messages.text("navigation.live"), tab: messages.text("navigation.live"), icon: "live", tone: "red" },
    { key: "results", href: resultsHref, label: messages.text("navigation.results"), tab: messages.text("navigation.results"), icon: "results", tone: "violet" },
    { key: "slips", href: slipsHref(language), label: messages.text("navigation.slips"), tab: messages.text("navigation.slips"), icon: "slips", tone: "teal" },
  ] as const;
  const destinations: readonly NavigationDestination[] = [...sections, ...informationPages.map((page) => ({
    key: page, href: informationHref(page, language), label: messages.text(`navigation.${page}`),
    tab: messages.text(`navigation.${page}`), icon: page, tone: "blue" as const,
  }))];
  const searchForm = search ?? { action: homeHref(language), hidden: [], value: "" };

  return (
    <ShellFrame>
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header $app={app}>
        <HeaderContent $wide={app}>
          <HomeLink href={homeHref(language)} aria-label={messages.text("navigation.home")} prefetch={false}>
            <BrandLogo alt="" variant="inverse" />
          </HomeLink>
          <DesktopNav aria-label={messages.text("navigation.primary")}>
            <ResponsiveNavigation destinations={destinations} moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
          </DesktopNav>
          {search !== null && <HeaderSearch action={searchForm.action} method="get" role="search" aria-label={messages.text("navigation.searchLabel")}>
            <SearchIcon />
            {searchForm.hidden.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <input type="search" name="q" defaultValue={searchForm.value} maxLength={feedQueryRules.maximumSearchLength}
              placeholder={messages.text("navigation.search")} aria-label={messages.text("navigation.searchLabel")} autoComplete="off" />
          </HeaderSearch>}
          <HeaderActions><ThemeToggle /></HeaderActions>
        </HeaderContent>
        <NavigationProgress label={messages.text("navigation.loading")} />
      </Header>
      <PageMain id="main-content" tabIndex={-1} $app={app} $compact={compact}>
        <Container $wide={app}>{children}</Container>
      </PageMain>
      <Footer>
        <FooterContent $wide={app}>
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
        <ResponsiveNavigation mobile destinations={destinations} moreLabel={messages.text("navigation.more")} {...(current ? { current } : {})} />
      </TabBar>
    </ShellFrame>
  );
}

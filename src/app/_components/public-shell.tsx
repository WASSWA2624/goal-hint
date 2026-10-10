import "server-only";
import type { ReactNode } from "react";
import { cache } from "react";
import { connection } from "next/server";
import { BrandLogo } from "@/components/ui/brand";
import { TextLink } from "@/components/ui/controls";
import { ChevronDownIcon, HomeIcon, InfoIcon, LiveIcon, ResultsIcon, SearchIcon } from "@/components/ui/icons";
import { Container, PageMain } from "@/components/ui/layout";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import {
  feedHref, getFeedEntry, homeHref, informationHref, informationPages, performanceHref,
  type NavigationLocation,
} from "@/domain/navigation";
import { feedQueryRules } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import {
  DesktopNav, Footer, Header, HeaderContent, HeaderSearch, HomeLink, MoreList, MoreMenu, NavigationList, ShellFrame, SkipLink,
  TabBar, TabLink, TabList, TopNavLink, TopNavList,
} from "@/components/navigation/shell-styles";

/** One request-scoped EAT date; never freeze Today in the production build. */
export const getShellInstant = cache(async () => {
  await connection();
  return utcInstantFromEpochMilliseconds(Date.now());
});
export const getShellDate = cache(async () => getReportingDate(await getShellInstant()));

/** A GET search that keeps the visitor's other feed parameters. */
export type ShellSearch = Readonly<{ action: string; hidden: readonly (readonly [string, string])[]; value: string }>;

export async function PublicShell({ children, locale, current, today: reportingDate, app = false, search }: {
  children: ReactNode;
  locale?: string;
  current?: NavigationLocation;
  today?: Awaited<ReturnType<typeof getShellDate>>;
  /** Feed screens: their own phone heading, a wider desktop table and the phone tab bar. */
  app?: boolean;
  search?: ShellSearch;
}) {
  const language = resolveLocale(locale);
  const messages = createMessages(language);
  const today = reportingDate ?? await getShellDate();
  const todayHref = feedHref(getFeedEntry(today, "today"), language);
  const resultsHref = feedHref(getFeedEntry(today, "results"), language);
  const sections = [
    { key: "today", href: todayHref, label: messages.text("navigation.predictions"), tab: messages.text("navigation.matches"), Icon: HomeIcon, tone: "teal" },
    { key: "live", href: feedHref({ date: today, status: "live" }, language), label: messages.text("navigation.live"), tab: messages.text("navigation.live"), Icon: LiveIcon, tone: "red" },
    { key: "results", href: resultsHref, label: messages.text("navigation.results"), tab: messages.text("navigation.results"), Icon: ResultsIcon, tone: "violet" },
  ] as const;
  const informationCurrent = (informationPages as readonly string[]).includes(current ?? "");
  const searchForm = search ?? { action: homeHref(language), hidden: [], value: "" };

  return (
    <ShellFrame>
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header $app={app}>
        <HeaderContent $wide={app}>
          <HomeLink href={homeHref(language)} aria-label={messages.text("navigation.home")} prefetch={false}>
            <BrandLogo alt="" />
          </HomeLink>
          <DesktopNav aria-label={messages.text("navigation.primary")}>
            <TopNavList>
              {sections.map((section) => <li key={section.key}>
                <TopNavLink href={section.href} prefetch={false} aria-current={current === section.key ? "page" : undefined}>{section.label}</TopNavLink>
              </li>)}
              <li><TopNavLink href={performanceHref(language)} prefetch={false}>{messages.text("navigation.stats")}</TopNavLink></li>
              <li>
                <MoreMenu>
                  <summary aria-current={informationCurrent ? "page" : undefined}>{messages.text("navigation.more")}<ChevronDownIcon /></summary>
                  <MoreList>
                    {informationPages.map((page) => <li key={page}>
                      <TextLink href={informationHref(page, language)} prefetch={false} aria-current={current === page ? "page" : undefined}>
                        {messages.text(`navigation.${page}`)}
                      </TextLink>
                    </li>)}
                  </MoreList>
                </MoreMenu>
              </li>
            </TopNavList>
          </DesktopNav>
          <HeaderSearch action={searchForm.action} method="get" role="search" aria-label={messages.text("navigation.searchLabel")}>
            <SearchIcon />
            {searchForm.hidden.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <input type="search" name="q" defaultValue={searchForm.value} maxLength={feedQueryRules.maximumSearchLength}
              placeholder={messages.text("navigation.search")} aria-label={messages.text("navigation.searchLabel")} autoComplete="off" />
          </HeaderSearch>
        </HeaderContent>
      </Header>
      <PageMain id="main-content" tabIndex={-1}>
        <Container $wide={app}>{children}</Container>
      </PageMain>
      <Footer>
        <Container>
          <nav aria-label={messages.text("navigation.footer")}>
            <NavigationList>
              {informationPages.map((page) => (
                <li key={page}>
                  <TextLink href={informationHref(page, language)}
                    aria-current={current === page ? "page" : undefined} prefetch={false}>
                    {messages.text(`navigation.${page}`)}
                  </TextLink>
                </li>
              ))}
            </NavigationList>
          </nav>
        </Container>
      </Footer>
      <TabBar aria-label={messages.text("navigation.tabs")}>
        <TabList>
          {sections.map(({ key, href, tab, Icon, tone }) => <li key={key}>
            <TabLink href={href} prefetch={false} $tone={tone} aria-current={current === key ? "page" : undefined}><Icon />{tab}</TabLink>
          </li>)}
          <li>
            <TabLink href={informationHref("how-it-works", language)} prefetch={false} $tone="blue" aria-current={informationCurrent ? "page" : undefined}>
              <InfoIcon />{messages.text("navigation.info")}
            </TabLink>
          </li>
        </TabList>
      </TabBar>
    </ShellFrame>
  );
}

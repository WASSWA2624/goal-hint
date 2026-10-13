import "server-only";
import type { ReactNode } from "react";
import { cache } from "react";
import { connection } from "next/server";
import { BrandLogo, BrandMark } from "@/components/ui/brand";
import { TextLink } from "@/components/ui/controls";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HomeIcon, LiveIcon, MoreIcon, ResultsIcon, SearchIcon, SlipIcon } from "@/components/ui/icons";
import { Container, PageMain } from "@/components/ui/layout";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import {
  feedHref, getFeedEntry, homeHref, informationHref, informationPages, slipsHref,
  type NavigationLocation,
} from "@/domain/navigation";
import { feedQueryRules } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import {
  DesktopNav, Footer, FooterBrand, FooterContent, FooterLink, FooterLinks, FooterNote, Header, HeaderActions, HeaderContent, HeaderSearch, HomeLink,
  MoreList, MoreMenu, ShellFrame, SkipLink,
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

export async function PublicShell({ children, locale, current, today: reportingDate, app = false, compact = false, search }: {
  children: ReactNode;
  locale?: string;
  current?: NavigationLocation;
  today?: Awaited<ReturnType<typeof getShellDate>>;
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
  const todayHref = feedHref(getFeedEntry(today, "today"), language);
  const resultsHref = feedHref(getFeedEntry(today, "results"), language);
  const sections = [
    { key: "today", href: todayHref, label: messages.text("navigation.predictions"), tab: messages.text("navigation.matches"), Icon: HomeIcon, tone: "teal" },
    { key: "live", href: feedHref({ date: today, status: "live" }, language), label: messages.text("navigation.live"), tab: messages.text("navigation.live"), Icon: LiveIcon, tone: "red" },
    { key: "results", href: resultsHref, label: messages.text("navigation.results"), tab: messages.text("navigation.results"), Icon: ResultsIcon, tone: "violet" },
    { key: "slips", href: slipsHref(language), label: messages.text("navigation.slips"), tab: messages.text("navigation.slips"), Icon: SlipIcon, tone: "teal" },
  ] as const;
  const informationCurrent = informationPages.some((page) => page === current);
  const searchForm = search ?? { action: homeHref(language), hidden: [], value: "" };

  const moreLinks = (mobile = false) => <MoreList $mobile={mobile}>
    {informationPages.map((page) => <li key={page}>
      <TextLink href={informationHref(page, language)} prefetch={false} aria-current={current === page ? "page" : undefined}>
        {messages.text(`navigation.${page}`)}
      </TextLink>
    </li>)}
  </MoreList>;

  return (
    <ShellFrame>
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header $app={app}>
        <HeaderContent $wide={app}>
          <HomeLink href={homeHref(language)} aria-label={messages.text("navigation.home")} prefetch={false}>
            <BrandLogo alt="" variant="inverse" />
          </HomeLink>
          <DesktopNav aria-label={messages.text("navigation.primary")}>
            <TopNavList>
              {sections.map(({ key, href, label, Icon, tone }) => <li key={key}>
                <TopNavLink href={href} prefetch={false} $tone={tone} aria-current={current === key ? "page" : undefined}><Icon />{label}</TopNavLink>
              </li>)}
              <li>
                <MoreMenu $tone="blue" current={informationCurrent} label={<><MoreIcon />{messages.text("navigation.more")}</>}>
                  {moreLinks()}
                </MoreMenu>
              </li>
            </TopNavList>
          </DesktopNav>
          {search !== null && <HeaderSearch action={searchForm.action} method="get" role="search" aria-label={messages.text("navigation.searchLabel")}>
            <SearchIcon />
            {searchForm.hidden.map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
            <input type="search" name="q" defaultValue={searchForm.value} maxLength={feedQueryRules.maximumSearchLength}
              placeholder={messages.text("navigation.search")} aria-label={messages.text("navigation.searchLabel")} autoComplete="off" />
          </HeaderSearch>}
          <HeaderActions><ThemeToggle /></HeaderActions>
        </HeaderContent>
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
        <TabList>
          {sections.map(({ key, href, tab, Icon, tone }) => <li key={key}>
            <TabLink href={href} prefetch={false} $tone={tone} aria-current={current === key ? "page" : undefined}><Icon />{tab}</TabLink>
          </li>)}
          <li>
            <MoreMenu $mobile current={informationCurrent} label={<><MoreIcon />{messages.text("navigation.more")}</>}>
              {moreLinks(true)}
            </MoreMenu>
          </li>
        </TabList>
      </TabBar>
    </ShellFrame>
  );
}

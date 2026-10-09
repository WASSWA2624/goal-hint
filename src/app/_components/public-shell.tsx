import "server-only";
import type { ReactNode } from "react";
import { cache } from "react";
import { connection } from "next/server";
import { BrandLogo } from "@/components/ui/brand";
import { TextLink } from "@/components/ui/controls";
import { Container, PageMain } from "@/components/ui/layout";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import {
  feedHref, getFeedEntry, homeHref, informationHref, informationPages,
  type NavigationLocation,
} from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import {
  Footer, Header, HeaderContent, HomeLink, NavigationLink, NavigationList, ShellFrame, SkipLink,
} from "@/components/navigation/shell-styles";

/** One request-scoped EAT date; never freeze Today in the production build. */
export const getShellDate = cache(async () => {
  await connection();
  return getReportingDate(utcInstantFromEpochMilliseconds(Date.now()));
});

export async function PublicShell({ children, locale, current }: {
  children: ReactNode;
  locale?: string;
  current?: NavigationLocation;
}) {
  const language = resolveLocale(locale);
  const messages = createMessages(language);
  const today = await getShellDate();

  return (
    <ShellFrame>
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header>
        <HeaderContent>
          <HomeLink href={homeHref(language)} aria-label={messages.text("navigation.home")} prefetch={false}>
            <BrandLogo alt="" />
          </HomeLink>
          <nav aria-label={messages.text("navigation.primary")}>
            <NavigationList>
              {(["today", "results"] as const).map((entry) => (
                <li key={entry}>
                  <NavigationLink href={feedHref(getFeedEntry(today, entry), language)} variant="quiet"
                    aria-current={current === entry ? "page" : undefined} prefetch={false}>
                    {messages.text(`navigation.${entry}`)}
                  </NavigationLink>
                </li>
              ))}
            </NavigationList>
          </nav>
        </HeaderContent>
      </Header>
      <PageMain id="main-content" tabIndex={-1}>
        <Container>{children}</Container>
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
    </ShellFrame>
  );
}

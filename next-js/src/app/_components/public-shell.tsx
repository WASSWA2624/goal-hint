import "server-only";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/brand";
import { navigationDestinations } from "@/components/navigation/navigation-destinations";
import { PublicHeader, PublicShellBoundary, PublicTabs } from "@/components/navigation/public-shell-chrome";
import { Container, PageMain } from "@/components/ui/layout";
import { informationHref, informationPages, type NavigationLocation } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { Footer, FooterBrand, FooterContent, FooterLink, FooterLinks, FooterNote } from "@/components/navigation/shell-styles";

import { getShellDate } from "./shell-time";
export { getShellDate, getShellInstant } from "./shell-time";

export async function PublicShell({ children, locale, current, today: reportingDate, zone, app = false, compact = false, showAccount = true, wide = false, workspace = false, desktopWorkspace = false, administratorName }: {
  children: ReactNode;
  locale?: string;
  current?: NavigationLocation;
  today?: Awaited<ReturnType<typeof getShellDate>>;
  /** A shared browsing zone keeps server-rendered navigation consistent with the selected day. */
  zone?: string | null;
  /** App screens have their own phone heading, wider desktop content and the phone tab bar. */
  app?: boolean;
  /** Dense mobile feeds keep compact vertical spacing and the shared content gutter. */
  compact?: boolean;
  showAccount?: boolean;
  /** Dense dashboards use the wide container while keeping the shared phone header. */
  wide?: boolean;
  /** Account workspaces own their full-width content and subscription details. */
  workspace?: boolean;
  /** An independently scrolling desktop workspace places its footer inside its content pane. */
  desktopWorkspace?: boolean;
  administratorName?: string;
}) {
  const language = resolveLocale(locale);
  const today = reportingDate ?? await getShellDate();
  const destinations = navigationDestinations(today, language, zone);
  const navigation = { locale: language, current, destinations };

  return (
    <PublicShellBoundary app={app} locale={language} workspace={workspace}
      header={<PublicHeader {...navigation} app={app} wide={wide} workspace={workspace} showAccount={showAccount} administratorName={administratorName} />}
      tabs={<PublicTabs {...navigation} />}>
      <PageMain id="main-content" tabIndex={-1} $app={app} $compact={compact} $compactTop={current === "best-slips"} $dashboard={current === "dashboard"}
        $workspace={workspace} $desktopWorkspace={desktopWorkspace}>
        <Container $wide={app || wide}>{children}</Container>
      </PageMain>
      {current !== "dashboard" && !workspace && <PublicFooter locale={language} today={today} current={current} wide={app || wide} belowDesktop={desktopWorkspace} />}
    </PublicShellBoundary>
  );
}

export function PublicFooter({ locale, today, current, wide, belowDesktop = false }: {
  locale: string; today: string; current?: NavigationLocation | undefined; wide: boolean; belowDesktop?: boolean;
}) {
  const messages = createMessages(locale);
  return <Footer $belowDesktop={belowDesktop}>
    <FooterContent $wide={wide}>
      <FooterBrand>
        <BrandMark alt="" />
        <span>{messages.text("navigation.copyright", { year: today.slice(0, 4) })}</span>
      </FooterBrand>
      <nav aria-label={messages.text("navigation.footer")}>
        <FooterLinks>
          {informationPages.map(page => <li key={page}>
            <FooterLink href={informationHref(page, locale)} aria-current={current === page ? "page" : undefined} prefetch={false}>
              {messages.text(`navigation.${page}`)}
            </FooterLink>
          </li>)}
        </FooterLinks>
      </nav>
      <FooterNote>{messages.text("navigation.footerNote")}</FooterNote>
    </FooterContent>
  </Footer>;
}

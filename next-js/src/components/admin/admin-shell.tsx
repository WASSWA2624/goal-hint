import "server-only";

import type { ComponentProps } from "react";
import { HeaderBrand } from "@/components/ui/brand";
import { AccountLinks } from "@/components/members/account-link";
import { MemberNavigationRecovery } from "@/components/members/member-controls";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { DesktopNav, Header, HeaderActions, HomeLink, SkipLink, TabBar } from "@/components/navigation/shell-styles";
import { SessionNavigation } from "@/components/navigation/session-navigation";
import { dashboardDestination, navigationDestinations } from "@/components/navigation/navigation-destinations";
import { getShellDate } from "@/app/_components/shell-time";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { AdminHeaderContent, AdminMark, AdminSectionMenu, AdminShellFrame, AdminWorkspace } from "./admin-workspace";

/**
 * The owner layout keeps its header and section navigation mounted across admin and analytics routes.
 * Regular site destinations reuse the public header's navigation and responsive overflow menus.
 */
export async function AdminShell({ username, ...props }: ComponentProps<typeof AdminWorkspace> & { username: string }) {
  const messages = createMessages("en");
  const dashboardLabel = messages.text("navigation.dashboard");
  const destinations = [...navigationDestinations(await getShellDate(), "en"), dashboardDestination(dashboardLabel)];
  return (
    <AdminShellFrame data-admin-shell>
      <MemberNavigationRecovery expectedAdministrator />
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header>
        <AdminHeaderContent>
          <HomeLink href={homeHref("en")} aria-label={messages.text("navigation.home")} prefetch={false}>
            <HeaderBrand alt="" />
          </HomeLink>
          <AdminMark>Admin</AdminMark>
          <DesktopNav aria-label={messages.text("navigation.primary")}>
            <SessionNavigation locale="en" destinations={destinations} current="dashboard" dashboardLabel={dashboardLabel} moreLabel={messages.text("navigation.more")} />
          </DesktopNav>
          <HeaderActions><AccountLinks locale="en" administratorName={username} /></HeaderActions>
        </AdminHeaderContent>
        <AdminSectionMenu {...(props.current ? { initialSection: props.current } : {})} />
        <NavigationProgress label={messages.text("navigation.loading")} />
      </Header>
      <AdminWorkspace {...props} />
      <TabBar aria-label={messages.text("navigation.tabs")}>
        <SessionNavigation mobile locale="en" destinations={destinations} current="dashboard" dashboardLabel={dashboardLabel} moreLabel={messages.text("navigation.more")} />
      </TabBar>
    </AdminShellFrame>
  );
}

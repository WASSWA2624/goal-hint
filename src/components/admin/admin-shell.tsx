import "server-only";

import type { ComponentProps } from "react";
import { BrandLogo } from "@/components/ui/brand";
import { AccountLinks } from "@/components/members/account-link";
import { NavigationProgress } from "@/components/navigation/navigation-progress";
import { Header, HeaderActions, HomeLink, ShellFrame, SkipLink } from "@/components/navigation/shell-styles";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { AdminHeaderContent, AdminMark, AdminWorkspace } from "./admin-workspace";

/**
 * Every owner page shares its own chrome: the brand bar with the payments link, theme and account menu, then the section
 * list (a sidebar on desktop, one section menu on phones) beside the page. The public site navigation stays off owner pages.
 * Pages render it through `AdminFrame`, which reads the section counts.
 */
export function AdminShell({ username, ...props }: ComponentProps<typeof AdminWorkspace> & { username: string }) {
  const messages = createMessages("en");
  return (
    <ShellFrame>
      <SkipLink href="#main-content">{messages.text("navigation.skip")}</SkipLink>
      <Header>
        <AdminHeaderContent>
          <HomeLink href={homeHref("en")} aria-label={messages.text("navigation.home")} prefetch={false}>
            <BrandLogo alt="" variant="inverse" />
          </HomeLink>
          <AdminMark>Admin</AdminMark>
          <HeaderActions><AccountLinks locale="en" administratorName={username} /></HeaderActions>
        </AdminHeaderContent>
        <NavigationProgress label={messages.text("navigation.loading")} />
      </Header>
      <AdminWorkspace {...props} />
    </ShellFrame>
  );
}

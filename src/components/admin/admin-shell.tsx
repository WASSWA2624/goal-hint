"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { SkipLink } from "@/components/navigation/shell-styles";
import { Brand, BrandImage, HeaderButton, HeaderLink, Main, Notice, Shell, Tab, Tabs, TopActions, TopBar,
  TopBarContent } from "@/components/analytics/dashboard/dashboard-styles";

/** Owner dashboard sections, in tab order. Later prompts add their pages here (and the pending count). */
const sections = [
  { key: "overview", href: "/admin", label: "Overview" },
] as const;
export type AdminSection = (typeof sections)[number]["key"];

/**
 * Phone-first owner shell: one column, 44 px targets and a top tab strip. Signing out is a plain form POST, so it works
 * without JavaScript. Owner copy is English only.
 */
export function AdminShell({ current, username, developmentCredentials, children }: {
  current: AdminSection; username: string; developmentCredentials: boolean; children: ReactNode;
}) {
  return (
    <Shell>
      <SkipLink href="#main-content">Skip to admin</SkipLink>
      <TopBar>
        <TopBarContent>
          <BrandLink href="/en"><BrandImage src="/brand/goal-hint-logo-inverse.svg" alt="Goal Hint" width={112} height={26} /><span>Admin</span></BrandLink>
          <Actions>
            <span>Signed in as <strong>{username}</strong></span>
            <HeaderLink href="/analytics">Analytics</HeaderLink>
            <form method="post" action="/api/admin/logout"><HeaderButton type="submit">Sign out</HeaderButton></form>
          </Actions>
        </TopBarContent>
      </TopBar>
      <Strip>
        <Tabs as="nav" aria-label="Owner dashboard">
          {sections.map((section) => (
            <SectionTab key={section.key} as="a" href={section.href} $selected={section.key === current}
              aria-current={section.key === current ? "page" : undefined}>{section.label}</SectionTab>
          ))}
        </Tabs>
      </Strip>
      <Column id="main-content" tabIndex={-1}>
        {developmentCredentials && <Notice $tone="warning">
          Development sign-in is active. Production refuses it: set GOAL_HINT_ANALYTICS_ADMIN_USERNAME, GOAL_HINT_ANALYTICS_ADMIN_PASSWORD_HASH and GOAL_HINT_ANALYTICS_SECRET before deploying.
        </Notice>}
        {children}
      </Column>
    </Shell>
  );
}

const column = "48rem";

const BrandLink = styled(Brand)`
  min-block-size: ${({ theme }) => theme.control.minHeight};
`;
const Actions = styled(TopActions)`
  a, button { min-block-size: ${({ theme }) => theme.control.minHeight}; }
`;
const Strip = styled.div`
  background: ${({ theme }) => theme.color.surface};
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  ${Tabs} {
    max-inline-size: ${column};
    margin-inline: auto;
    padding-inline: 16px;
    border-block-end: 0;
  }
`;
const SectionTab = styled(Tab)`
  display: inline-flex;
  align-items: center;
  min-block-size: ${({ theme }) => theme.control.minHeight};
  text-decoration: none;
`;
const Column = styled(Main)`
  max-inline-size: ${column};
`;

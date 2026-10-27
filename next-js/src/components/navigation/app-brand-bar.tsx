"use client";

import Link from "@/components/navigation/navigation-link";
import styled from "styled-components";
import { BrandLogo } from "@/components/ui/brand";
import { compactHeaderBrand } from "@/components/ui/header-controls";
import { AccountLinks } from "@/components/members/account-link";
import { SubscriptionStatusBar } from "@/components/members/subscription-status-bar";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { NavigationProgress } from "./navigation-progress";

/** Compact app pages share the same full-bleed phone brand bar beneath the desktop-only shell. */
const Group = styled.div`
  display: grid;
  min-inline-size: 0;
  margin-block-start: -8px;
  margin-inline: -8px;
  ${media.desktop} { display: none; }
`;
const Bar = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-inline-size: 0;
  min-block-size: 3rem;
  padding-inline: 8px;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.gradient};
  border-block-end: 2px solid ${({ theme }) => theme.header.border};
  ${media.desktop} { display: none; }
`;
const Home = styled(Link)`
  ${compactHeaderBrand}
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: 2px;
  }
`;

export function AppBrandBar({ locale, showAccount = true }: { locale: string; showAccount?: boolean }) {
  return <Group><Bar>
    <Home href={homeHref(locale)} prefetch={false} aria-label={createMessages(locale).text("navigation.home")}>
      <BrandLogo alt="" />
    </Home>
    <AccountLinks locale={locale} showAccount={showAccount} />
    <NavigationProgress label={createMessages(locale).text("navigation.loading")} />
  </Bar><SubscriptionStatusBar locale={locale} compact /></Group>;
}

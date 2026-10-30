"use client";

import Link from "@/components/navigation/navigation-link";
import styled from "styled-components";
import { HeaderBrand } from "@/components/ui/brand";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { AccountLinks } from "@/components/members/account-link";
import { SubscriptionStatusBar } from "@/components/members/subscription-status-bar";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { NavigationProgress } from "./navigation-progress";

/** Compact app pages share the same full-bleed phone brand bar beneath the desktop-only shell. */
const Group = styled.div`
  position: sticky;
  inset-block-start: 0;
  z-index: 30;
  display: grid;
  min-inline-size: 0;
  margin-block-start: -8px;
  margin-inline: -8px;
  ${media.desktop} { display: none; }
`;
const Bar = styled.div`
  position: relative;
  ${compactHeaderRow}
  justify-content: space-between;
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  padding-inline: 8px;
  ${compactHeaderSurface}
  ${media.desktop} { display: none; }
`;
const Home = styled(Link)`
  ${compactHeaderBrand}
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: 2px;
  }
`;

export function AppBrandBar({ locale, showAccount = true, bestSlips = false }: { locale: string; showAccount?: boolean; bestSlips?: boolean }) {
  return <Group data-mobile-app-header><Bar>
    <Home href={homeHref(locale)} prefetch={false} aria-label={createMessages(locale).text("navigation.home")}>
      <HeaderBrand alt="" />
    </Home>
    <AccountLinks locale={locale} showAccount={showAccount} />
    <NavigationProgress label={createMessages(locale).text("navigation.loading")} />
  </Bar><SubscriptionStatusBar locale={locale} bestSlips={bestSlips} /></Group>;
}

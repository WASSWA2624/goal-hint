"use client";

import Link from "@/components/navigation/navigation-link";
import styled from "styled-components";
import { HeaderBrand } from "@/components/ui/brand";
import { compactHeaderBrand, compactHeaderRow, compactHeaderSurface } from "@/components/ui/header-controls";
import { AccountLinks } from "@/components/members/account-link";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { contentGutter } from "@/components/ui/layout";
import { NavigationProgress } from "./navigation-progress";

/** Compact app pages share the same phone brand bar within the app's outer rails. */
const Group = styled.div`
  position: sticky;
  inset-block-start: 0;
  z-index: var(--gh-layer-popover);
  display: grid;
  min-inline-size: 0;
  margin-block-start: calc(-1 * var(--gh-spacing-2));
  margin-inline: calc(-1 * ${contentGutter});
  ${media.desktop} { display: none; }
`;
const Bar = styled.div`
  position: relative;
  ${compactHeaderRow}
  justify-content: space-between;
  min-block-size: ${({ theme }) => theme.header.phoneHeight};
  padding-inline: ${contentGutter};
  ${compactHeaderSurface}
  ${media.desktop} { display: none; }
`;
const Home = styled(Link)`
  ${compactHeaderBrand}
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: var(--gh-size-0_5);
  }
`;

export function AppBrandBar({ locale, showAccount = true }: { locale: string; showAccount?: boolean }) {
  return <Group data-mobile-app-header><Bar>
    <Home href={homeHref(locale)} prefetch={false} aria-label={createMessages(locale).text("navigation.home")}>
      <HeaderBrand alt="" />
    </Home>
    <AccountLinks locale={locale} showAccount={showAccount} />
    <NavigationProgress label={createMessages(locale).text("navigation.loading")} />
  </Bar></Group>;
}

"use client";

import Link from "@/components/navigation/navigation-link";
import styled from "styled-components";
import { BrandLogo } from "@/components/ui/brand";
import { AccountLinks } from "@/components/members/account-link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { homeHref } from "@/domain/navigation";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { NavigationProgress } from "./navigation-progress";

/** Compact app pages share the same full-bleed phone brand bar beneath the desktop-only shell. */
const Bar = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-inline-size: 0;
  min-block-size: 3rem;
  margin-block-start: -8px;
  margin-inline: -8px;
  padding-inline: 8px;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.gradient};
  border-block-end: 2px solid ${({ theme }) => theme.header.accent};
  ${media.desktop} { display: none; }
`;
const Home = styled(Link)`
  display: inline-flex;
  flex: 0 1 160px;
  min-inline-size: 0;
  text-decoration: none;
  > span { padding: 0; }
  img { inline-size: 160px; max-inline-size: 100%; block-size: auto; }
  &:focus-visible {
    outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent};
    outline-offset: 2px;
  }
`;

const Actions = styled.div`display: flex; align-items: center; gap: 4px;`;

export function AppBrandBar({ locale, showAccount = true }: { locale: string; showAccount?: boolean }) {
  return <Bar>
    <Home href={homeHref(locale)} prefetch={false} aria-label={createMessages(locale).text("navigation.home")}>
      <BrandLogo alt="" variant="inverse" />
    </Home>
    <Actions>{showAccount && <AccountLinks locale={locale} />}<ThemeToggle /></Actions>
    <NavigationProgress label={createMessages(locale).text("navigation.loading")} />
  </Bar>;
}

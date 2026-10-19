"use client";

import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { UserIcon } from "@/components/ui/icons";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const Control = styled(Link)`
  display: inline-grid;
  flex: none;
  place-items: center;
  inline-size: 2rem;
  block-size: 2rem;
  color: ${({ theme }) => theme.header.text};
  font-size: 1.375rem;
  text-decoration: none;
  ${media.desktop} { font-size: 1rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: -4px; }
`;

/** Shared square account entry beside the theme control in each existing title bar. */
export function AccountLink({ locale = "en" }: { locale?: string }) {
  return <Control href="/en/account" aria-label={createMessages(locale).text("account.title")} prefetch={false}><UserIcon /></Control>;
}

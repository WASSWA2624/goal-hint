"use client";

import { useCallback, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronDownIcon, SubscriberIcon, UserIcon } from "@/components/ui/icons";
import { ThemeSelector } from "@/components/ui/theme-toggle";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";

const Disclosure = styled.details`
  position: relative;
  flex: none;
  > summary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-block-size: 2.75rem;
    padding-inline: 10px;
    color: ${({ theme }) => theme.header.text};
    border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.header.controlBorder};
    border-radius: 0;
    list-style: none;
    font-size: 0.8125rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    white-space: nowrap;
    cursor: pointer;
    &::-webkit-details-marker { display: none; }
    > svg { font-size: 0.875rem; }
    ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.accent}; outline-offset: -4px; }
  }
  &[open] > summary { background: ${({ theme }) => theme.header.controlHover}; }
  &[open] > summary > svg { transform: rotate(180deg); }
`;
const Popup = styled.div`
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 40;
  inline-size: min(15rem, calc(100vw - 16px));
  max-block-size: calc(100dvh - 5rem);
  overflow-y: auto;
  padding: 6px;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
`;
const Destination = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 2.75rem;
  padding-inline: 10px;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.875rem;
  text-decoration: none;
  > svg { flex: none; font-size: 1.125rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;

function AccountMenu({ locale, showAccount, pathname }: { locale: string; showAccount: boolean; pathname: string | null }) {
  const messages = createMessages(locale);
  const root = useRef<HTMLDetailsElement>(null);
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: dismiss });
  const base = `/${resolveLocale(locale)}`;
  return <Disclosure ref={root} data-account-menu onToggle={(event) => setOpen(event.currentTarget.open)}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !root.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      root.current.querySelector("summary")?.focus({ preventScroll: true });
    }}>
    <summary aria-controls={popupId} aria-expanded={open}>
      {messages.text(showAccount ? "account.title" : "navigation.menu")}<ChevronDownIcon />
    </summary>
    <Popup id={popupId}>
      {showAccount && <nav aria-label={messages.text("account.title")} onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a")) dismiss();
      }}>
        {pathname !== `${base}/account` && <Destination href={`${base}/account`} prefetch={false}><UserIcon />{messages.text("account.title")}</Destination>}
        {pathname !== `${base}/subscribe` && <Destination href={`${base}/subscribe`} prefetch={false}><SubscriberIcon />{messages.text("paywall.getAccess")}</Destination>}
      </nav>}
      <ThemeSelector locale={locale} />
    </Popup>
  </Disclosure>;
}

/** One labeled account and appearance menu for every desktop and phone header. */
export function AccountLinks({ locale = "en", showAccount = true }: { locale?: string; showAccount?: boolean }) {
  const pathname = usePathname();
  return <AccountMenu key={pathname} locale={locale} showAccount={showAccount} pathname={pathname} />;
}

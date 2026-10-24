"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronRightIcon, SignInIcon, SignOutIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { compactHeaderControl } from "@/components/ui/header-controls";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { formatPhone } from "@/domain/phone";
import { media } from "@/styles/theme";
import { MemberSignOut } from "./member-controls";
import { getMemberSessionSnapshot, getServerMemberSessionSnapshot, refreshMemberSession, subscribeMemberSession } from "./member-session";

const Actions = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
  ${media.desktop} { gap: 6px; }
`;
const AuthLink = styled(Link)<{ $primary?: boolean }>`
  ${compactHeaderControl}
  color: ${({ theme, $primary }) => $primary ? theme.header.onAccent : theme.header.text};
  background: ${({ theme, $primary }) => $primary ? theme.header.accent : "transparent"};
  border-color: ${({ theme, $primary }) => $primary ? theme.header.accent : theme.header.controlBorder};
  text-decoration: none;
  ${media.hover} { &:hover { filter: brightness(1.1); background: ${({ theme, $primary }) => $primary ? theme.header.accent : theme.header.controlHover}; } }
`;
const Disclosure = styled.details`
  position: relative;
  flex: none;
  > summary {
    ${compactHeaderControl}
    inline-size: 2rem;
    padding: 4px;
    color: ${({ theme }) => theme.header.text};
    background: ${({ theme }) => theme.header.controlFill};
    list-style: none;
    > svg { font-size: 1.125rem; }
    ${media.desktop} { inline-size: 2.25rem; }
    &::-webkit-details-marker { display: none; }
    ${media.hover} { &:hover { background: ${({ theme }) => theme.header.controlHover}; } }
  }
  &[open] > summary { background: ${({ theme }) => theme.header.controlHover}; }
`;
const Popup = styled.div`
  position: absolute;
  inset-block-start: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 40;
  inline-size: min(15rem, calc(100vw - 16px));
  max-block-size: calc(100dvh - 5rem);
  overflow-y: auto;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.border.radius};
  box-shadow: ${({ theme }) => theme.shadow.cardHover};
`;
const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-block-end: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  > svg { flex: none; font-size: 1.5rem; color: ${({ theme }) => theme.color.link}; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: 0.75rem; }
  strong { display: block; font-size: 0.875rem; font-weight: ${({ theme }) => theme.typography.weight.medium}; font-variant-numeric: tabular-nums; }
`;
const Destination = styled(Link)`
  display: flex;
  align-items: center;
  gap: 8px;
  min-block-size: 2.75rem;
  padding: 6px 14px;
  color: ${({ theme }) => theme.color.text};
  font-size: 0.875rem;
  text-decoration: none;
  > svg { flex: none; font-size: 1.125rem; }
  > svg:last-of-type { margin-inline-start: auto; font-size: 0.875rem; }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
`;
const SignOut = styled(MemberSignOut)`
  && {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    inline-size: 100%;
    min-block-size: 2.75rem;
    padding: 6px 14px;
    color: ${({ theme }) => theme.color.mutedText};
    background: transparent;
    border: 0;
    border-block-start: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
    border-radius: 0;
    font-size: 0.875rem;
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    > svg { flex: none; font-size: 1.125rem; }
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.rowHover}; } }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: -2px; }
  }
`;

function AccountMenu({ locale, phone, administratorName }: { locale: string; phone: string | null; administratorName?: string }) {
  const messages = createMessages(locale);
  const root = useRef<HTMLDetailsElement>(null);
  const popupId = useId();
  const [open, setOpen] = useState(false);
  const dismiss = useCallback(() => closeDetails(root.current, () => setOpen(false)), []);
  useOutsideDismiss({ enabled: open, root, onDismiss: dismiss });
  return <Disclosure ref={root} data-account-menu onToggle={(event) => setOpen(event.currentTarget.open)}
    onKeyDown={(event) => {
      if (event.key !== "Escape" || !root.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      root.current.querySelector("summary")?.focus({ preventScroll: true });
    }}>
    <summary aria-label={messages.text("account.title")} title={messages.text("account.title")} aria-controls={popupId} aria-expanded={open}>
      <UserIcon />
    </summary>
    <Popup id={popupId}>
      <Identity><UserIcon /><div>{administratorName ? <strong>{administratorName}</strong> : <><small>{messages.text("account.registeredNumber")}</small><strong>+{formatPhone((phone ?? "").replace(/^\+/, ""))}</strong></>}</div></Identity>
      {!administratorName && <nav aria-label={messages.text("account.title")} onClick={dismiss}>
        <Destination href={`/${resolveLocale(locale)}/account`} prefetch={false}><UserIcon />{messages.text("account.title")}<ChevronRightIcon /></Destination>
      </nav>}
      <SignOut logoutAction={administratorName ? "/api/admin/logout" : "/api/account/sign-out"}><SignOutIcon />{messages.text("account.logOut")}</SignOut>
    </Popup>
  </Disclosure>;
}

/** Single Rail: visible guest actions or a generic account avatar, plus the theme action in every header. */
export function AccountLinks({ locale = "en", administratorName }: { locale?: string; showAccount?: boolean; administratorName?: string }) {
  const pathname = usePathname();
  const phone = useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getServerMemberSessionSnapshot);
  useEffect(() => { void refreshMemberSession(); }, [pathname]);
  const messages = createMessages(locale);
  const base = `/${resolveLocale(locale)}/account`;
  return <Actions data-account-actions>
    {phone || administratorName ? <><ThemeToggle locale={locale} /><AccountMenu key={pathname} locale={locale} phone={phone} {...(administratorName ? { administratorName } : {})} /></> : <>
      <AuthLink href={`${base}?view=login`} prefetch={false}><SignInIcon />{messages.text("account.login")}</AuthLink>
      <AuthLink href={`${base}?view=register`} prefetch={false} $primary><UserPlusIcon />{messages.text("account.register")}</AuthLink>
      <ThemeToggle locale={locale} />
    </>}
  </Actions>;
}

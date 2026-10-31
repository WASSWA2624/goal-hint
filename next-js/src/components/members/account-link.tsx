"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { CardIcon, ChevronRightIcon, SignInIcon, SignOutIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { compactHeaderControl } from "@/components/ui/header-controls";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { formatPhone } from "@/domain/phone";
import { accountSectionHref, type AccountSection } from "@/domain/account-navigation";
import { accountSectionIcons } from "./account-navigation";
import { media } from "@/styles/theme";
import { MemberSignOut } from "./member-controls";
import { getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot, subscribePendingPayments } from "@/components/admin/pending-payments";
import { getAdminSessionSnapshot, getMemberSessionSnapshot, getServerAdminSessionSnapshot, getServerMemberSessionSnapshot,
  refreshMemberSession, subscribeMemberSession } from "./member-session";

const Actions = styled.div`
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  min-inline-size: 0;
  max-inline-size: 100%;
  align-items: center;
  justify-content: flex-end;
  margin-inline-start: auto;
  gap: 4px;
  ${media.desktop} { gap: 6px; }
`;
const AuthLink = styled(Link)<{ $primary?: boolean }>`
  ${compactHeaderControl}
  color: ${({ theme, $primary }) => $primary ? theme.header.onAccent : theme.header.text};
  background: ${({ theme, $primary }) => $primary ? theme.header.accent : "transparent"};
  border-color: ${({ theme, $primary }) => $primary ? theme.header.accent : "transparent"};
  text-decoration: none;
  > svg { display: none; }
  ${media.desktop} { > svg { display: block; } }
  &[data-admin-payments-link] {
    > svg { display: block; }
    > span { display: none; }
    ${media.desktop} { > svg { display: none; } > span { display: inline; } }
  }
  @media (max-width: 359px) {
    &[data-header-auth="register"] { > svg { display: block; } > span { display: none; } }
  }
  ${media.hover} { &:hover { filter: brightness(1.1); background: ${({ theme, $primary }) => $primary ? theme.header.accent : theme.header.controlHover}; } }
`;
const Disclosure = styled.details`
  position: relative;
  flex: none;
  > summary {
    ${compactHeaderControl}
    inline-size: 2.75rem;
    padding: 4px;
    color: ${({ theme }) => theme.header.text};
    background: transparent;
    border-color: transparent;
    list-style: none;
    > svg { font-size: 1.125rem; }
    ${media.desktop} { inline-size: 2rem; }
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
  /* Leave room for page gutters/scrollbars and two wrapped rows of header controls. */
  inline-size: min(15rem, calc(100vw - 32px));
  max-block-size: calc(100dvh - 5.5rem - 24px);
  overflow-y: auto;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: ${({ theme }) => theme.border.width} solid ${({ theme }) => theme.color.border};
  border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.popover};
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
    border-radius: ${({ theme }) => theme.radius.none};
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
        {(["overview", "subscription", "payments", "phone", "password"] satisfies AccountSection[]).map(section => {
          const Icon = accountSectionIcons[section];
          return <Destination key={section} href={accountSectionHref(locale, section)} prefetch={false}><Icon />
            {messages.text(section === "overview" ? "account.title" : `account.section.${section}`)}<ChevronRightIcon />
          </Destination>;
        })}
      </nav>}
      <SignOut logoutAction={administratorName ? "/api/admin/logout" : "/api/account/sign-out"}><SignOutIcon />{messages.text("auth.signOut")}</SignOut>
    </Popup>
  </Disclosure>;
}

function AdminPaymentsLink() {
  const count = useSyncExternalStore(subscribePendingPayments, getPendingPaymentsSnapshot, getServerPendingPaymentsSnapshot);
  const label = count === null ? "Payments" : count === 0 ? "Payments, none awaiting review" : `${count} payment${count === 1 ? "" : "s"} awaiting review`;
  return <AuthLink href="/admin/payments?tab=pending" prefetch={false} aria-label={label} title={label} data-admin-payments-link>
    <CardIcon /><span>Payments</span>{count !== null && count > 0 && <strong aria-live="polite" aria-atomic="true">{count > 99 ? "99+" : count}</strong>}
  </AuthLink>;
}

/** All headers share the same private account state; the access bar beneath them carries Subscribe and Extend. */
export function AccountLinks({ locale = "en", administratorName }: { locale?: string; showAccount?: boolean; administratorName?: string }) {
  const pathname = usePathname();
  const phone = useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getServerMemberSessionSnapshot);
  const administrator = useSyncExternalStore(subscribeMemberSession, getAdminSessionSnapshot, getServerAdminSessionSnapshot);
  useEffect(() => { void refreshMemberSession(); }, [pathname]);
  const messages = createMessages(locale);
  const base = `/${resolveLocale(locale)}/account`;
  const adminIdentity = administratorName ?? (administrator ? messages.text("navigation.dashboard") : undefined);
  return <Actions data-account-actions>
    {(administratorName || administrator) && <AdminPaymentsLink />}
    {phone || adminIdentity ? <><ThemeToggle locale={locale} /><AccountMenu key={pathname} locale={locale} phone={phone} {...(adminIdentity ? { administratorName: adminIdentity } : {})} /></> : <>
      <AuthLink href={`${base}?view=login`} prefetch={false} data-header-auth="login"><SignInIcon /><span>{messages.text("auth.signIn")}</span></AuthLink>
      <AuthLink href={`${base}?view=register`} prefetch={false} $primary aria-label={messages.text("auth.signUp")} data-header-auth="register"><UserPlusIcon /><span>{messages.text("auth.signUp")}</span></AuthLink>
      <ThemeToggle locale={locale} />
    </>}
  </Actions>;
}

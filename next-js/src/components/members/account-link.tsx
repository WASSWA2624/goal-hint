"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { CardIcon, ChevronRightIcon, SignInIcon, SignOutIcon, UserIcon, UserPlusIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NotificationUnread } from "./notification-unread";
import { DownloadHeaderLink } from "@/components/downloads/download-header-link";
import { compactHeaderControl, compactHeaderIconControl } from "@/components/ui/header-controls";
import { closeDetails, useOutsideDismiss } from "@/components/ui/use-outside-dismiss";
import { createMessages } from "@/i18n/messages";
import { memberAuthPath } from "@/domain/member-navigation";
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
  margin-inline-end: ${({ theme }) => theme.space.sm};
  gap: var(--gh-spacing-1);
  ${media.desktop} { gap: var(--gh-spacing-1_5); }
`;
const AuthLink = styled(Link)<{ $primary?: boolean }>`
  ${compactHeaderControl}
  color: ${({ theme, $primary }) => $primary ? theme.action.headerPrimaryText : theme.header.accent};
  background: ${({ theme, $primary }) => $primary ? theme.action.headerPrimaryBackground : theme.action.headerBackground};

  text-decoration: none;
  > svg { display: none; }
  ${media.desktop} { > svg { display: block; } }
  &[data-admin-payments-link] {
    > svg { display: block; }
    > span { display: none; }
    ${media.desktop} { > svg { display: none; } > span { display: inline; } }
  }
  @media (max-width: ${({ theme }) => theme.viewport[22.4375]}) {
    &[data-header-auth="register"] { > svg { display: block; } > span { display: none; } }
  }
  ${media.hover} { &:hover { filter: brightness(${({ theme }) => theme.interaction.headerHoverBrightness}); background: ${({ theme, $primary }) => $primary ? theme.action.headerPrimaryBackground : theme.header.controlHover}; } }
`;
const Disclosure = styled.details`
  position: relative;
  flex: none;
  > summary {
    ${compactHeaderIconControl}
    position: relative;
    list-style: none;
    > svg { font-size: var(--gh-font-title); }
    &::-webkit-details-marker { display: none; }
  }
  &[open] > summary { background: ${({ theme }) => theme.header.controlHover}; color: ${({ theme }) => theme.header.accent}; }
`;
const Popup = styled.div`
  position: absolute;
  inset-block-start: calc(100% + var(--gh-spacing-1_5));
  inset-inline-end: 0;
  z-index: var(--gh-layer-sheet);
  /* Leave room for page gutters/scrollbars and two wrapped rows of header controls. */
  inline-size: min(var(--gh-size-60), calc(100vw - var(--gh-size-8)));
  max-block-size: calc(100dvh - var(--gh-size-22) - var(--gh-size-6));
  overflow-y: auto;
  color: ${({ theme }) => theme.color.text};
  background: ${({ theme }) => theme.color.surface};
  border: 0;
  border-radius: ${({ theme }) => theme.radius.overlay};
  box-shadow: ${({ theme }) => theme.shadow.popover};
`;
const Identity = styled.div`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-2_5);
  padding: var(--gh-spacing-3) var(--gh-spacing-3_5);
  border-block-end: 0;
  > svg { flex: none; font-size: var(--gh-font-headline); color: ${({ theme }) => theme.color.link}; }
  small { display: block; color: ${({ theme }) => theme.color.mutedText}; font-size: var(--gh-font-secondary); }
  strong { display: block; font-size: var(--gh-font-emphasis); font-weight: ${({ theme }) => theme.typography.weight.medium}; font-variant-numeric: tabular-nums; }
`;
const Destination = styled(Link)`
  display: flex;
  align-items: center;
  gap: var(--gh-spacing-2);
  min-block-size: var(--form-control-height);
  padding: var(--gh-spacing-1_5) var(--gh-spacing-3_5);
  color: ${({ theme }) => theme.color.text};
  font-size: var(--gh-font-emphasis);
  text-decoration: none;
  > svg { flex: none; font-size: var(--gh-font-title); }
  > svg:last-of-type { margin-inline-start: auto; font-size: var(--gh-font-emphasis); }
  ${media.hover} { &:hover { background: ${({ theme }) => theme.color.rowHover}; } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
`;
const SignOut = styled(MemberSignOut)`
  && {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--gh-spacing-2);
    inline-size: 100%;
    min-block-size: var(--form-control-height);
    padding: var(--gh-spacing-1_5) var(--gh-spacing-3_5);
    color: ${({ theme }) => theme.color.mutedText};
    background: transparent;
    border: 0;
    border-block-start: 0;
    border-radius: ${({ theme }) => theme.radius.none};
    font-size: var(--gh-font-emphasis);
    font-weight: ${({ theme }) => theme.typography.weight.medium};
    > svg { flex: none; font-size: var(--gh-font-title); }
    ${media.hover} { &:hover { color: ${({ theme }) => theme.color.text}; background: ${({ theme }) => theme.color.rowHover}; } }
    &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.color.focus}; outline-offset: calc(-1 * var(--gh-size-0_5)); }
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
    <summary aria-label={messages.text("account.title")} title={messages.text("account.title")} aria-controls={popupId} aria-expanded={open} aria-describedby={!administratorName ? `${popupId}-unread` : undefined}>
      <UserIcon />
      {!administratorName && <NotificationUnread locale={locale} dot id={`${popupId}-unread`} />}
    </summary>
    <Popup id={popupId}>
      <Identity><UserIcon /><div>{administratorName ? <strong>{administratorName}</strong> : <><small>{messages.text("account.registeredNumber")}</small><strong>+{formatPhone((phone ?? "").replace(/^\+/, ""))}</strong></>}</div></Identity>
      {!administratorName && <nav aria-label={messages.text("account.title")} onClick={dismiss}>
        {(["overview", "subscription", "notifications", "payments", "phone", "password"] satisfies AccountSection[]).map(section => {
          const Icon = accountSectionIcons[section];
          return <Destination key={section} href={accountSectionHref(locale, section)} prefetch={false}><Icon />
            {messages.text(section === "overview" ? "account.title" : `account.section.${section}`)}{section === "notifications" && <NotificationUnread locale={locale} />}<ChevronRightIcon />
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
  const adminIdentity = administratorName ?? (administrator ? messages.text("navigation.dashboard") : undefined);
  return <Actions data-account-actions>
    {(administratorName || administrator) && <AdminPaymentsLink />}
    <DownloadHeaderLink locale={locale} />
    {phone || adminIdentity ? <><ThemeToggle locale={locale} /><AccountMenu key={pathname} locale={locale} phone={phone} {...(adminIdentity ? { administratorName: adminIdentity } : {})} /></> : <>
      <AuthLink href={memberAuthPath("login")} prefetch={false} data-header-auth="login"><SignInIcon /><span>{messages.text("auth.signIn")}</span></AuthLink>
      <AuthLink href={memberAuthPath("register")} prefetch={false} $primary aria-label={messages.text("auth.signUp")} data-header-auth="register"><UserPlusIcon /><span>{messages.text("auth.signUp")}</span></AuthLink>
      <ThemeToggle locale={locale} />
    </>}
  </Actions>;
}

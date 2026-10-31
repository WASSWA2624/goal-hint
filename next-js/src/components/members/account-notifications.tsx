"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { Button } from "@/components/ui/controls";
import { CardIcon, ClockIcon, GiftIcon, ShieldIcon } from "@/components/ui/icons";
import { accountSectionHref } from "@/domain/account-navigation";
import { accountNotificationRules, notificationSection, type AccountNotificationPage } from "@/domain/account-notifications";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountPanel } from "./account-workspace";
import { AccountError } from "./account-styles";
import { accountRequest } from "./account-security";
import { refreshNotificationUnread } from "./notification-state";

const List = styled.ul`
  list-style: none; margin: 0; padding: 0; display: grid;
  > li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px 12px; padding: 12px;
    border-block-end: 1px solid ${({ theme }) => theme.color.border}; }
  > li:last-child { border-block-end: 0; }
  > li[data-unread] { background: ${({ theme }) => theme.color.brandSoft}; }
  > li > svg { color: ${({ theme }) => theme.color.brand}; margin-block-start: 3px; }
  h3 { margin: 0; font-size: inherit; font-weight: ${({ theme }) => theme.typography.weight.bold}; }
  time { color: ${({ theme }) => theme.color.mutedText}; font-size: ${({ theme }) => theme.typography.scale.caption}; }
  [data-notice-body] { display: grid; gap: 4px; }
  [data-notice-actions] { display: flex; flex-wrap: wrap; gap: 4px; grid-column: 2; }
  ${media.desktop} { > li { grid-template-columns: 20px minmax(0, 1fr) auto; } [data-notice-actions] { grid-column: 3; grid-row: 1; align-self: center; } }
`;
const Pages = styled.nav`display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding-block-start: 12px;`;
const NotificationButton = styled(Button)`min-block-size: 44px;`;

export function AccountNotifications({ locale, page, older = false }: { locale: string; page: AccountNotificationPage | null; older?: boolean }) {
  const m = createMessages(locale), router = useRouter(), inFlight = useRef(false);
  const [busy, setBusy] = useState(false), [transition, startTransition] = useTransition(), [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") router.refresh(); };
    const timer = setInterval(refresh, accountNotificationRules.pollMs);
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [router]);
  async function update(action: "read" | "dismiss" | "read-all", id?: string) {
    if (inFlight.current || transition) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      await accountRequest("notifications", { action, ...(id ? { id } : {}) });
      void refreshNotificationUnread(); startTransition(() => router.refresh());
    } catch { setError(m.text("notifications.updateFailed")); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const disabled = busy || transition;
  return <AccountPanel title={m.text("notifications.inbox")} data-account-notification-feed
    actions={page && page.unread > 0 && <NotificationButton type="button" variant="quiet" disabled={disabled} onClick={() => void update("read-all")}>{m.text("notifications.readAll")}</NotificationButton>}>
    {error && <AccountError role="alert">{error}</AccountError>}
    {!page ? <AccountFine role="status">{m.text("notifications.unavailable")}</AccountFine> : <>
      {!page.items.length ? <AccountFine>{m.text("notifications.empty")}</AccountFine> : <List aria-busy={disabled}>{page.items.map(item => {
        const section = notificationSection(item.kind), Icon = section === "payments" ? CardIcon : section === "referrals" ? GiftIcon : item.kind === "access-activated" ? ShieldIcon : ClockIcon;
        return <li key={item.id} data-notification-id={item.id} data-unread={!item.read ? "true" : undefined}>
          <Icon /><div data-notice-body><h3>{m.text(`notifications.${item.kind}`)}</h3>
            {item.kind === "access-expiring" && item.expiresAt && <AccountFine>{m.text("notifications.expiry", { date: formatSubscriptionExpiry(new Date(item.expiresAt)) })}</AccountFine>}
            <time dateTime={item.occurredAt}>{formatSubscriptionExpiry(new Date(item.occurredAt))}</time>
            <AccountActionLink href={accountSectionHref(locale, section)} prefetch={false}>{m.text(`notifications.view.${section}`)}</AccountActionLink>
          </div><div data-notice-actions>
            {!item.read && <NotificationButton type="button" variant="quiet" disabled={disabled} onClick={() => void update("read", item.id)}>{m.text("notifications.read")}</NotificationButton>}
            <NotificationButton type="button" variant="quiet" disabled={disabled} onClick={() => void update("dismiss", item.id)}>{m.text("notifications.dismiss")}</NotificationButton>
          </div>
        </li>;
      })}</List>}
      {(older || page.next) && <Pages aria-label={m.text("notifications.pages")}>
        {older && <AccountActionLink href={accountSectionHref(locale, "notifications")} prefetch={false}>{m.text("notifications.latest")}</AccountActionLink>}
        {page.next && <AccountActionLink href={`${accountSectionHref(locale, "notifications")}&before=${encodeURIComponent(page.next)}`} prefetch={false}>{m.text("notifications.older")}</AccountActionLink>}
      </Pages>}
    </>}
  </AccountPanel>;
}

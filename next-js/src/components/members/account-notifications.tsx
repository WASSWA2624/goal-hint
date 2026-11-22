"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { visuallyHidden } from "@/components/admin/desk-styles";
import { RecordItemTitle, RecordRowContent } from "@/components/admin/record-workspace";
import { Button } from "@/components/ui/controls";
import { CardIcon, ClockIcon, GiftIcon, ShieldIcon } from "@/components/ui/icons";
import { accountSectionHref } from "@/domain/account-navigation";
import { accountNotificationRules, notificationSection, type AccountNotificationPage } from "@/domain/account-notifications";
import { referralReviewReasonLabel } from "@/domain/referral-review-labels";
import { formatSubscriptionExpiry } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { AccountActionLink, AccountFine } from "./account-overview";
import { AccountRecords } from "./account-records";
import { accountRequest } from "./account-request";
import { AccountError } from "./account-styles";
import { AccountSectionActions } from "./account-workspace";
import { refreshNotificationUnread } from "./notification-state";

const NoticeTitle = styled(RecordItemTitle)`
  &[data-unread]::after {
    content: "";
    display: inline-block;
    inline-size: var(--gh-size-1_5);
    block-size: var(--gh-size-1_5);
    margin-inline-start: var(--gh-spacing-1_5);
    vertical-align: middle;
    border-radius: ${({ theme }) => theme.radius.small};
    background: ${({ theme }) => theme.color.brand};
  }
`;
const UnreadLabel = styled.span`${visuallyHidden}`;

export function AccountNotifications({ locale, page, older = false, returnTo }: {
  locale: string; page: AccountNotificationPage | null; older?: boolean; returnTo?: string | null;
}) {
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
  const inboxHref = accountSectionHref(locale, "notifications", returnTo);
  return <div data-account-notification-feed>
    <AccountRecords locale={locale} title={m.text("notifications.inbox")} items={page?.items ?? []} busy={disabled}
      toolbar={!!page?.unread && <Button type="button" variant="quiet" disabled={disabled} onClick={() => void update("read-all")}>{m.text("notifications.readAll")}</Button>}
      feedback={error && <AccountError role="alert">{error}</AccountError>}
      empty={<AccountFine role="status">{m.text(page ? "notifications.empty" : "notifications.unavailable")}</AccountFine>}
      row={item => {
        const section = notificationSection(item.kind);
        const Icon = section === "payments" ? CardIcon : section === "referrals" ? GiftIcon : item.kind === "access-activated" ? ShieldIcon : ClockIcon;
        return <RecordRowContent icon={<Icon />} primary={<NoticeTitle data-notification-id={item.id} data-unread={!item.read || undefined}>
          {m.text(`notifications.${item.kind}`)}
          {!item.read && <UnreadLabel> • {m.plural("notifications.unread", 1)}</UnreadLabel>}
        </NoticeTitle>} secondary={<time dateTime={item.occurredAt}>{formatSubscriptionExpiry(new Date(item.occurredAt))}</time>} />;
      }}
      detail={item => <>
        <h3>{m.text(`notifications.${item.kind}`)}</h3>
        {item.reason && <AccountFine>Reason: {referralReviewReasonLabel[item.reason]}</AccountFine>}
        {item.kind === "access-expiring" && item.expiresAt && <AccountFine>{m.text("notifications.expiry", { date: formatSubscriptionExpiry(new Date(item.expiresAt)) })}</AccountFine>}
        <AccountFine><time dateTime={item.occurredAt}>{formatSubscriptionExpiry(new Date(item.occurredAt))}</time></AccountFine>
      </>}
      actions={item => {
        const section = notificationSection(item.kind);
        const href = accountSectionHref(locale, section, returnTo);
        return <AccountSectionActions data-record-actions>
          <AccountActionLink href={item.relatedCaseId ? `${href}#review-${item.relatedCaseId}` : href} prefetch={false}>{m.text(`notifications.view.${section}`)}</AccountActionLink>
          {!item.read && <Button type="button" variant="quiet" disabled={disabled} onClick={() => void update("read", item.id)}>{m.text("notifications.read")}</Button>}
          <Button type="button" variant="quiet" disabled={disabled} onClick={() => void update("dismiss", item.id)}>{m.text("notifications.dismiss")}</Button>
        </AccountSectionActions>;
      }}
      pagination={page && (older || page.next) && <AccountSectionActions as="nav" aria-label={m.text("notifications.pages")}>
        {older && <AccountActionLink href={inboxHref} prefetch={false}>{m.text("notifications.latest")}</AccountActionLink>}
        {page.next && <AccountActionLink href={`${inboxHref}&before=${encodeURIComponent(page.next)}`} prefetch={false}>{m.text("notifications.older")}</AccountActionLink>}
      </AccountSectionActions>}
    />
  </div>;
}

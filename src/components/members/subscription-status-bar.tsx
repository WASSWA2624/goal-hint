"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { Container } from "@/components/ui/layout";
import { subscriptionExpiryParts, subscriptionTimeLeft } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";
import { getServerSubscriptionSnapshot, getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";

const Bar = styled.aside<{ $desktopOnly: boolean }>`
  display: ${({ $desktopOnly }) => $desktopOnly ? "none" : "block"};
  min-inline-size: 0;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-end: 1px solid ${({ theme }) => theme.header.controlBorder};
  ${media.desktop} { display: block; }
`;
const Row = styled(Container)<{ $compact: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0 8px;
  min-block-size: 2rem;
  padding-inline: ${({ theme, $compact }) => $compact ? "8px" : theme.layout.gutter};
  font-size: 0.75rem;
  line-height: 1.5;
  > span { min-inline-size: 0; padding-block: 4px; }
  time { font-variant-numeric: tabular-nums; }
  ${media.desktop} { padding-inline: ${({ theme }) => theme.layout.gutter}; }
`;
const Action = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-block-size: 2rem;
  padding-inline: 4px;
  color: ${({ theme }) => theme.header.accent};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-underline-offset: 3px;
  white-space: nowrap;
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.text}; outline-offset: -2px; }
`;

const minute = 60_000;
const subscribeMinute = (notify: () => void) => { const timer = setInterval(notify, minute); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / minute) * minute;
const serverMinute = () => 0;

/** One private expiry line, shared by the desktop shell and the app's separate phone headers. */
export function SubscriptionStatusBar({ locale = "en", className, desktopOnly = false, compact = false, wide = false }: {
  locale?: string; className?: string; desktopOnly?: boolean; compact?: boolean; wide?: boolean;
}) {
  const subscription = useSyncExternalStore(subscribeMemberSession, getSubscriptionSnapshot, getServerSubscriptionSnapshot);
  const pathname = usePathname(), messages = createMessages(locale), now = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  // The account page opens with the same expiry and its Renew button, so the bar would only repeat it there.
  if (!subscription?.activeUntil || pathname === `/${resolveLocale(locale)}/account`) return null;
  const until = new Date(subscription.activeUntil), left = subscriptionTimeLeft(until, now);
  const subscribePath = `/${resolveLocale(locale)}/subscribe`, subscribing = pathname === subscribePath;
  return <Bar className={className} $desktopOnly={desktopOnly} aria-label={messages.text("account.accessSettings")} data-subscription-status-bar>
    <Row $wide={wide} $compact={compact}>
      <span>{messages.text("account.expiresOn")} <time dateTime={subscription.activeUntil}>{messages.text("account.expiresAt", subscriptionExpiryParts(until))}</time>
        {left && ` (${left.unit === "day" ? messages.plural("account.leftDays", left.count)
          : left.count ? messages.plural("account.leftHours", left.count) : messages.text("account.underAnHourLeft")})`}</span>
      {subscription.renewsFromCredit ? <span data-renewal-note>{messages.text("account.renewsFromCredit")}</span>
        : subscription.canSubscribe && (subscribing ? !subscription.paymentPending && <span data-renewal-note>{messages.text("account.renewalExtends")}</span> : <Action href={subscribePath} prefetch={false}>
        {messages.text(subscription.paymentPending ? "account.viewPayment" : "account.renew")}
      </Action>)}
    </Row>
  </Bar>;
}

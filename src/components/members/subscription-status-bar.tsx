"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronRightIcon, ClockIcon, LockIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/layout";
import { subscriptionExpiryParts, subscriptionTimeLeft } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";
import { getServerSubscriptionSnapshot, getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";
import { getPaymentPurpose, getServerPaymentPurpose, subscribePaymentPurpose } from "./payment-purpose";

const Bar = styled.aside<{ $desktopOnly: boolean }>`
  display: ${({ $desktopOnly }) => $desktopOnly ? "none" : "block"};
  min-inline-size: 0;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  ${media.desktop} { display: block; }
`;
const Row = styled(Container)<{ $compact: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 10px;
  min-block-size: 2.75rem;
  padding-block: 6px;
  padding-inline: ${({ theme, $compact }) => $compact ? "8px" : theme.layout.gutter};
  font-size: 0.75rem;
  line-height: 1.4;
  time { font-variant-numeric: tabular-nums; }
  ${media.desktop} { padding-inline: ${({ theme }) => theme.layout.gutter}; font-size: 0.8125rem; }
`;
const Status = styled.span`
  display: inline-flex;
  flex: 1 1 12rem;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  min-inline-size: 0;
  > svg { flex: none; font-size: 1rem; color: ${({ theme }) => theme.header.accent}; }
  strong { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const Price = styled.span`
  color: ${({ theme }) => theme.header.accent};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
`;
/** Days left as a pill, amber in the last two days so the end of access is hard to miss. */
const Left = styled.span<{ $urgent: boolean }>`
  padding: 1px 8px;
  color: ${({ theme, $urgent }) => $urgent ? theme.header.tone.amber : theme.header.accent};
  background: ${({ theme }) => theme.header.controlFill};
  border-radius: ${({ theme }) => theme.border.pillRadius};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;
const Note = styled.span`
  color: ${({ theme }) => theme.header.mutedText};
`;
const Action = styled(Link)`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  min-block-size: 2rem;
  padding-inline: 14px 10px;
  color: ${({ theme }) => theme.header.onAccent};
  background: ${({ theme }) => theme.header.accent};
  border-radius: ${({ theme }) => theme.border.pillRadius};
  font-size: 0.8125rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
  text-decoration: none;
  white-space: nowrap;
  > svg { flex: none; font-size: 0.875rem; }
  ${media.hover} { &:hover { filter: brightness(1.1); } }
  &:focus-visible { outline: ${({ theme }) => theme.border.focusWidth} solid ${({ theme }) => theme.header.text}; outline-offset: 2px; }
`;

const minute = 60_000;
const subscribeMinute = (notify: () => void) => { const timer = setInterval(notify, minute); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / minute) * minute;
const serverMinute = () => 0;

/**
 * One private access line, shared by the desktop shell and the app's separate phone headers: the expiry with Extend while
 * access lasts, otherwise the cheapest plan with Subscribe.
 */
export function SubscriptionStatusBar({ locale = "en", className, desktopOnly = false, compact = false, wide = false }: {
  locale?: string; className?: string; desktopOnly?: boolean; compact?: boolean; wide?: boolean;
}) {
  const subscription = useSyncExternalStore(subscribeMemberSession, getSubscriptionSnapshot, getServerSubscriptionSnapshot);
  const pathname = usePathname(), messages = createMessages(locale), now = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  const purpose = useSyncExternalStore(subscribePaymentPurpose, getPaymentPurpose, getServerPaymentPurpose);
  // The account page opens with the same access summary and its own button, so the bar would only repeat it there.
  if (!subscription || pathname === `/${resolveLocale(locale)}/account`) return null;
  const subscribePath = `/${resolveLocale(locale)}/subscribe`, subscribing = pathname === subscribePath;
  const bar = (row: ReactNode) => <Bar className={className} $desktopOnly={desktopOnly} aria-label={messages.text("account.accessSettings")} data-subscription-status-bar>
    <Row $wide={wide} $compact={compact}>{row}</Row>
  </Bar>;
  const action = (label: string) => <Action href={subscribePath} prefetch={false}>{label}<ChevronRightIcon /></Action>;
  if (!subscription.activeUntil) {
    // Without access the bar offers the cheapest plan, except on the subscribe page itself.
    if (!subscription.canSubscribe || subscribing) return null;
    const { offer } = subscription;
    return bar(subscription.paymentPending ? <>
      <Status><ClockIcon /><span>{messages.text("account.pending")}</span></Status>{action(messages.text("account.viewPayment"))}
    </> : <>
      <Status data-subscription-offer><LockIcon /><strong>{messages.text("account.unlockTitle")}</strong>
        {offer && <Price>{messages.text("account.unlockPrice", { price: messages.number(offer.priceUgx) })}</Price>}</Status>
      {action(messages.text("account.subscribe"))}
    </>);
  }
  const until = new Date(subscription.activeUntil), left = subscriptionTimeLeft(until, now);
  return bar(<>
    <Status><ClockIcon /><span>{messages.text("account.expiresOn")} <time dateTime={subscription.activeUntil}>{messages.text("account.expiresAt", subscriptionExpiryParts(until))}</time></span>
      {left && <Left $urgent={left.unit === "hour" || left.count < 2}>{left.unit === "day" ? messages.plural("account.leftDays", left.count)
        : left.count ? messages.plural("account.leftHours", left.count) : messages.text("account.underAnHourLeft")}</Left>}</Status>
    {subscription.renewsFromCredit ? <Note data-renewal-note>{messages.text("account.renewsFromCredit")}</Note>
      // A top-up adds credit and never extends access, so the subscribe page says nothing about extending while adding credit.
      : subscription.canSubscribe && (subscribing ? !subscription.paymentPending && purpose !== "topup" && <Note data-renewal-note>{messages.text("account.renewalExtends")}</Note>
        : action(messages.text(subscription.paymentPending ? "account.viewPayment" : "account.extend")))}
  </>);
}

"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { CheckIcon, ChevronRightIcon, ClockIcon, LockIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { subscriptionExpiryParts, subscriptionTimeRemaining } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";
import { getMemberSessionSnapshot, getServerMemberSessionSnapshot, getServerSubscriptionSnapshot, getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";
import { getPaymentPurpose, getServerPaymentPurpose, subscribePaymentPurpose } from "./payment-purpose";

const Bar = styled.aside<{ $desktopOnly: boolean }>`
  position: relative;
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
const DesktopStatus = styled.span`
  display: none;
  ${media.desktop} { display: contents; }
`;
const MobileStatus = styled(Link)<{ $singleLine: boolean }>`
  --status-icon-size: ${({ $singleLine }) => $singleLine ? "1.25rem" : "2rem"};
  display: grid;
  grid-template-columns: var(--status-icon-size) minmax(0, 1fr);
  align-items: ${({ $singleLine }) => $singleLine ? "center" : "stretch"};
  gap: ${({ $singleLine }) => $singleLine ? "8px" : "10px"};
  inline-size: 100%;
  min-inline-size: 0;
  color: inherit;
  text-decoration: none;
  -webkit-tap-highlight-color: transparent;
  &::after { content: ""; position: absolute; inset: 0; }
  &:active::after { background: ${({ theme }) => `color-mix(in srgb, ${theme.header.text} 8%, transparent)`}; }
  &:focus-visible { outline: none; }
  &:focus-visible::after { outline: 2px solid ${({ theme }) => theme.header.accent}; outline-offset: -2px; }
  ${media.tablet} { --status-icon-size: 2rem; align-items: stretch; gap: 10px; }
  ${media.desktop} { display: none; }
`;
type BannerState = "locked" | "pending" | "active" | "expired";
const StatusIcon = styled.span<{ $state: BannerState }>`
  display: grid;
  place-items: center;
  align-self: stretch;
  min-block-size: var(--status-icon-size);
  color: ${({ theme, $state }) => $state === "active" ? theme.header.tone.emerald
    : $state === "pending" || $state === "expired" ? theme.header.tone.amber : theme.header.accent};
  > svg { inline-size: var(--status-icon-size); block-size: var(--status-icon-size); }
`;
const MobileCopy = styled.div<{ $singleLine: boolean }>`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-inline-size: 0;
  > strong { display: ${({ $singleLine }) => $singleLine ? "none" : "block"}; color: ${({ theme }) => theme.header.mutedText}; font-size: 0.75rem; }
  ${media.tablet} { > strong { display: block; } }
`;
const MobileDetail = styled.span`
  color: ${({ theme }) => theme.header.text};
  font-size: 0.875rem;
  font-weight: ${({ theme }) => theme.typography.weight.bold};
`;
const PhoneOffer = styled.span`
  ${media.tablet} { display: none; }
`;
const TabletOffer = styled.span`
  display: none;
  ${media.tablet} { display: inline; }
`;
const MobileMeta = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  color: ${({ theme }) => theme.header.mutedText};
  font-size: 0.75rem;
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
 * The shared private access summary: a linked phone status banner and the desktop subscription controls.
 */
export function SubscriptionStatusBar({ locale = "en", className, desktopOnly = false, compact = false, wide = false }: {
  locale?: string; className?: string; desktopOnly?: boolean; compact?: boolean; wide?: boolean;
}) {
  const subscription = useSyncExternalStore(subscribeMemberSession, getSubscriptionSnapshot, getServerSubscriptionSnapshot);
  const phone = useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getServerMemberSessionSnapshot);
  const pathname = usePathname(), messages = createMessages(locale), now = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  const purpose = useSyncExternalStore(subscribePaymentPurpose, getPaymentPurpose, getServerPaymentPurpose);
  // The account page opens with the same access summary and its own button, so the bar would only repeat it there.
  if (!subscription || pathname === `/${resolveLocale(locale)}/account`) return null;
  const subscribePath = `/${resolveLocale(locale)}/subscribe`, subscribing = pathname === subscribePath;
  const accountPath = `/${resolveLocale(locale)}/account`, returnTo = memberReturnPath(pathname);
  const loginQuery = new URLSearchParams({ view: "login", ...(returnTo ? { return: returnTo } : {}) });
  const mobileHref = !phone ? `${accountPath}?${loginQuery}` : subscription.paymentPending
    ? `${memberNextPath("subscribe", returnTo)}#report` : subscription.activeUntil ? accountPath : `${memberNextPath("subscribe", returnTo)}#plans`;
  const mobileAction = messages.text(!phone ? "account.login" : subscription.paymentPending ? "account.viewPayment"
    : subscription.activeUntil ? "account.accessSettings" : "account.subscribe");
  const bar = (row: ReactNode, mobile: { state: BannerState; icon: ReactNode; title?: string; detail: ReactNode; phoneDetail?: ReactNode; note?: ReactNode }) =>
    <Bar className={className} $desktopOnly={desktopOnly} aria-label={messages.text("account.accessSettings")}
      data-subscription-status-bar data-subscription-state={mobile.state}>
    <Row $wide={wide} $compact={compact}>
      <MobileStatus href={mobileHref} prefetch={false} $singleLine={mobile.phoneDetail !== undefined} data-mobile-subscription-status>
        <StatusIcon $state={mobile.state}>{mobile.icon}</StatusIcon>
        <MobileCopy $singleLine={mobile.phoneDetail !== undefined} role="status" aria-atomic="true">{mobile.title && <strong>{mobile.title}</strong>}
          <MobileDetail>{mobile.phoneDetail === undefined ? mobile.detail : <><PhoneOffer>{mobile.phoneDetail}</PhoneOffer><TabletOffer>{mobile.detail}</TabletOffer></>}</MobileDetail>
          {mobile.note && <MobileMeta>{mobile.note}</MobileMeta>}
        </MobileCopy>
        <VisuallyHidden>{mobileAction}</VisuallyHidden>
      </MobileStatus>
      <DesktopStatus>{row}</DesktopStatus>
    </Row>
  </Bar>;
  const action = (label: string) => <Action href={subscribePath} prefetch={false}>{label}<ChevronRightIcon /></Action>;
  if (!subscription.activeUntil) {
    // Without access the bar offers the cheapest plan, except on the subscribe page itself.
    if (!subscription.canSubscribe || subscribing) return null;
    const { offer } = subscription;
    const price = offer ? messages.number(offer.priceUgx) : null;
    const unlock = price !== null ? messages.text("paywall.unlockPredictionPrice", { price })
      : messages.text("paywall.unlockPrediction");
    return subscription.paymentPending ? bar(<>
      <Status><ClockIcon /><span>{messages.text("account.pending")}</span></Status>{action(messages.text("account.viewPayment"))}
    </>, { state: "pending", icon: <ClockIcon />, title: messages.text("account.paymentPending"), detail: messages.text("account.pending") }) : bar(<>
      <Status data-subscription-offer><LockIcon /><strong>{messages.text("account.unlockTitle")}</strong>
        {price !== null && <Price>{messages.text("account.unlockPrice", { price })}</Price>}</Status>
      {action(messages.text("account.subscribe"))}
    </>, { state: subscription.expired ? "expired" : "locked", icon: <LockIcon />,
      title: messages.text(subscription.expired ? "account.subscriptionExpired" : "paywall.locked"), detail: unlock,
      ...(!subscription.expired && { phoneDetail: price !== null ? messages.text("account.unlockFullAccessPrice", { price })
        : messages.text("account.unlockFullAccess") }) });
  }
  const until = new Date(subscription.activeUntil), remaining = subscriptionTimeRemaining(until, now);
  const left = remaining && (remaining.days ? messages.text("account.leftDaysHours", {
    days: messages.plural("account.remainingDays", remaining.days), hours: messages.plural("account.remainingHours", remaining.hours),
  }) : remaining.hours || remaining.minutes ? messages.text("account.leftHoursMinutes", {
    hours: messages.plural("account.remainingShortHours", remaining.hours), minutes: messages.number(remaining.minutes),
  }) : messages.text("account.underAMinuteLeft"));
  const expiry = <>{messages.text("account.expiresOn")} <time dateTime={subscription.activeUntil}>{messages.text("account.expiresAt", subscriptionExpiryParts(until))}</time>{left && <> ({left})</>}</>;
  return bar(<>
    <Status><ClockIcon /><span>{expiry}</span></Status>
    {subscription.renewsFromCredit ? <Note data-renewal-note>{messages.text("account.renewsFromCredit")}</Note>
      // A top-up adds credit and never extends access, so the subscribe page says nothing about extending while adding credit.
      : subscription.canSubscribe && (subscribing ? !subscription.paymentPending && purpose !== "topup" && <Note data-renewal-note>{messages.text("account.renewalExtends")}</Note>
        : action(messages.text(subscription.paymentPending ? "account.viewPayment" : "account.extend")))}
  </>, { state: "active", icon: <CheckIcon />, detail: expiry,
    note: subscription.paymentPending ? <span>{messages.text("account.paymentPending")} · {messages.text("account.pending")}</span>
      : subscription.renewsFromCredit && <span>{messages.text("account.renewsFromCredit")}</span> });
}

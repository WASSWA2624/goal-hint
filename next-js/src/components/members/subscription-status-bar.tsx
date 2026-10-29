"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { CheckIcon, ClockIcon, LockIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { memberNextPath, memberReturnPath } from "@/domain/member-navigation";
import { subscriptionExpiryParts, subscriptionTimeRemaining } from "@/domain/subscription-expiry";
import { createMessages } from "@/i18n/messages";
import { resolveLocale } from "@/i18n/locales";
import { media } from "@/styles/theme";
import { getMemberSessionSnapshot, getServerMemberSessionSnapshot, getServerSubscriptionSnapshot, getSubscriptionSnapshot, subscribeMemberSession } from "./member-session";
import { DesktopSubscriptionBanner } from "./desktop-subscription-banner";

const phone = "@media (max-width: 47.99rem)";

const Bar = styled.aside`
  position: relative;
  display: block;
  min-inline-size: 0;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  ${media.desktop} { display: none; }
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
  ${phone} {
    [data-subscription-state="active"] & { min-block-size: 2rem; padding: 4px 8px; }
  }
  ${media.desktop} { padding-inline: ${({ theme }) => theme.layout.gutter}; font-size: 0.8125rem; }
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
  ${phone} {
    [data-subscription-state="active"] & { --status-icon-size: 1rem; min-block-size: 1.5rem; align-items: center; gap: 6px; }
  }
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
  ${phone} {
    [data-subscription-state="active"] & {
      font-size: clamp(0.6875rem, 3.1vw, 0.75rem);
      font-weight: ${({ theme }) => theme.typography.weight.medium};
      font-variant-numeric: tabular-nums;
    }
  }
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

const minute = 60_000;
const subscribeMinute = (notify: () => void) => { const timer = setInterval(notify, minute); return () => clearInterval(timer); };
const currentMinute = () => Math.floor(Date.now() / minute) * minute;
const serverMinute = () => 0;

/**
 * One confirmed session powers the approved desktop invitation and the existing mobile status design.
 */
export function SubscriptionStatusBar({ locale = "en", className, desktopOnly = false, compact = false, wide = false }: {
  locale?: string; className?: string; desktopOnly?: boolean; compact?: boolean; wide?: boolean;
}) {
  const subscription = useSyncExternalStore(subscribeMemberSession, getSubscriptionSnapshot, getServerSubscriptionSnapshot);
  const phone = useSyncExternalStore(subscribeMemberSession, getMemberSessionSnapshot, getServerMemberSessionSnapshot);
  const pathname = usePathname(), messages = createMessages(locale), now = useSyncExternalStore(subscribeMinute, currentMinute, serverMinute);
  // The account page opens with the same access summary and its own button, so the bar would only repeat it there.
  if (!subscription || pathname === `/${resolveLocale(locale)}/account`) return null;
  const subscribePath = `/${resolveLocale(locale)}/subscribe`, subscribing = pathname === subscribePath;
  const desktop = <DesktopSubscriptionBanner locale={locale} pathname={pathname} signedIn={phone !== null}
    subscription={subscription} now={now} wide={wide} {...(className ? { className } : {})} />;
  if (desktopOnly) return desktop;
  const accountPath = `/${resolveLocale(locale)}/account`, returnTo = memberReturnPath(pathname);
  const loginQuery = new URLSearchParams({ view: "login", ...(returnTo ? { return: returnTo } : {}) });
  const mobileHref = !phone ? `${accountPath}?${loginQuery}` : subscription.paymentPending
    ? `${memberNextPath("subscribe", returnTo)}#report` : subscription.activeUntil ? accountPath : `${memberNextPath("subscribe", returnTo)}#plans`;
  const mobileAction = messages.text(!phone ? "auth.signIn" : subscription.paymentPending ? "account.viewPayment"
    : subscription.activeUntil ? "account.accessSettings" : "account.subscribe");
  const bar = (mobile: { state: BannerState; icon: ReactNode; title?: string; detail: ReactNode; phoneDetail?: ReactNode; note?: ReactNode }) =>
    <>{desktop}<Bar className={className} aria-label={messages.text("account.accessSettings")}
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
    </Row>
  </Bar></>;
  if (!subscription.activeUntil) {
    // Without access the bar offers the cheapest plan, except on the subscribe page itself.
    if (!subscription.canSubscribe || subscribing) return desktop;
    const { offer } = subscription;
    const price = offer ? messages.number(offer.priceUgx) : null;
    if (subscription.paymentPending) return bar({ state: "pending", icon: <ClockIcon />, title: messages.text("account.paymentPending"), detail: messages.text("account.pending") });
    if (subscription.expired) {
      const renewal = price !== null ? messages.text("account.renewExpiredPrice", { price }) : messages.text("account.renewExpired");
      return bar({ state: "expired", icon: <LockIcon />, detail: renewal, phoneDetail: renewal });
    }
    const unlock = price !== null ? messages.text("paywall.unlockPredictionPrice", { price })
      : messages.text("paywall.unlockPrediction");
    return bar({ state: "locked", icon: <LockIcon />, title: messages.text("paywall.locked"), detail: unlock,
      phoneDetail: price !== null ? messages.text("account.unlockFullAccessPrice", { price }) : messages.text("account.unlockFullAccess") });
  }
  const until = new Date(subscription.activeUntil), remaining = subscriptionTimeRemaining(until, now);
  const left = remaining && (remaining.days ? messages.text("account.leftDaysHours", {
    days: messages.plural("account.remainingDays", remaining.days), hours: messages.plural("account.remainingHours", remaining.hours),
  }) : remaining.hours || remaining.minutes ? messages.text("account.leftHoursMinutes", {
    hours: messages.plural("account.remainingShortHours", remaining.hours), minutes: messages.number(remaining.minutes),
  }) : messages.text("account.underAMinuteLeft"));
  const expiryParts = subscriptionExpiryParts(until);
  const expiry = <>{messages.text("account.expiresOn")} <time dateTime={subscription.activeUntil}>{messages.text("account.expiresAt", expiryParts)}</time>{left && <> ({left})</>}</>;
  const compactLeft = remaining && (remaining.days ? messages.text("account.leftDaysHoursCompact", {
    days: messages.number(remaining.days), hours: messages.number(remaining.hours),
  }) : remaining.hours || remaining.minutes ? messages.text("account.leftHoursMinutesCompact", {
    hours: messages.number(remaining.hours), minutes: messages.number(remaining.minutes),
  }) : messages.text("account.underAMinuteLeftCompact"));
  const phoneExpiry = <><span aria-hidden="true" data-mobile-subscription-expiry>{messages.text("account.subscriptionExpires")} <time dateTime={subscription.activeUntil}>{messages.text("account.expiresAtCompact", expiryParts)}</time>{compactLeft && <> ({compactLeft})</>}</span><VisuallyHidden>{expiry}</VisuallyHidden></>;
  return bar({ state: "active", icon: <CheckIcon />, detail: expiry, phoneDetail: phoneExpiry,
    note: subscription.paymentPending ? <span>{messages.text("account.paymentPending")} · {messages.text("account.pending")}</span>
      : subscription.renewsFromCredit && <span>{messages.text("account.renewsFromCredit")}</span> });
}

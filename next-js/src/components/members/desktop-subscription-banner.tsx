"use client";

import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { CheckIcon, ChevronRightIcon, ClockIcon, LockIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/layout";
import { subscriptionBannerLinks, subscriptionBannerState } from "@/domain/subscription-banner";
import type { SubscriptionSummary } from "@/domain/subscription-summary";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";
import { richText } from "./rich-text";

const Banner = styled.aside`
  display: none;
  margin: 0;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  ${media.desktop} { display: block; }
`;
const Row = styled(Container)`
  display: flex;
  align-items: center;
  gap: 9px;
  min-block-size: 37px;
  padding-block: 5px;
  font-size: 0.8125rem;
  line-height: 1.5;
  > svg { flex: none; font-size: 1rem; color: ${({ theme }) => theme.header.accent}; }
  [data-subscription-state="active"] & > svg { color: ${({ theme }) => theme.header.tone.emerald}; }
  [data-subscription-state="pending"] & > svg { color: ${({ theme }) => theme.header.tone.amber}; }
`;
const Copy = styled.span`
  flex: 1;
  min-inline-size: 0;
  strong { font-weight: ${({ theme }) => theme.typography.weight.bold}; }
`;
const Price = styled.span`
  color: ${({ theme }) => theme.header.accent};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  white-space: nowrap;
`;
const Action = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-block-size: 24px;
  padding: 0;
  border-radius: 0;
  color: ${({ theme }) => theme.header.accent};
  font-weight: ${({ theme }) => theme.typography.weight.medium};
  text-decoration: underline;
  text-underline-offset: 3px;
  white-space: nowrap;
  > svg { font-size: 0.875rem; }
  &[data-banner-action] { flex: none; margin-inline-start: auto; }
  ${media.hover} { &:hover { text-decoration-thickness: 2px; } }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;

/** The approved Inline invitation consumes the same confirmed private session as every header. */
export function DesktopSubscriptionBanner({ locale, pathname, signedIn, subscription, now, wide, className }: {
  locale: string; pathname: string; signedIn: boolean; subscription: SubscriptionSummary | null;
  now: number; wide: boolean; className?: string;
}) {
  const state = subscriptionBannerState(signedIn, subscription, now), links = subscriptionBannerLinks(locale, pathname);
  if (!state || !subscription || pathname === links.account || pathname === links.subscribe && state !== "active") return null;
  const messages = createMessages(locale);
  const pending = subscription.paymentPending;
  const price = subscription.offer ? <Price>{messages.text("banner.from", { price: messages.number(subscription.offer.priceUgx) })}</Price> : null;
  const action = state === "signed-out" ? null : state === "pending" || state === "active" && pending
    ? { href: links.payment, label: messages.text("account.viewPayment") }
    : state === "active" ? { href: links.account, label: messages.text("banner.account") }
    : { href: links.plans, label: messages.text("account.subscribe") };
  const icon = state === "active" ? <CheckIcon /> : state === "pending" ? <ClockIcon /> : <LockIcon />;

  return <Banner className={className} aria-label={messages.text("banner.label")} data-desktop-subscription-status
    data-subscription-status-bar data-subscription-state={state}>
    <Row $wide={wide} data-desktop-subscription-row>
      {icon}
      <Copy role="status" aria-atomic="true">
        {state === "signed-out" ? <>{richText(messages.text("banner.invitation"), {
          signUp: <Action href={links.signUp} prefetch={false}>{messages.text("auth.signUp")}</Action>,
          signIn: <Action href={links.signIn} prefetch={false}>{messages.text("auth.signIn")}</Action>,
        })}{price ? <> {price}</> : "."}</>
          : state === "active" ? <><strong>{messages.text("banner.active")}</strong> {messages.text(pending ? "account.pending" : "banner.unlocked")}</>
          : state === "pending" ? <>{messages.text("account.pending")}</>
          : state === "expired" ? <><strong>{messages.text("banner.expired")}</strong> {messages.text("banner.renew")}{price ? <> {price}</> : "."}</>
          : <><strong>{messages.text("banner.unlock")}</strong>{price ? <> {price}</> : "."}</>}
      </Copy>
      {action && <Action href={action.href} prefetch={false} data-banner-action>{action.label}<ChevronRightIcon /></Action>}
    </Row>
  </Banner>;
}

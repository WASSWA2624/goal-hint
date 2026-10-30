"use client";

import styled from "styled-components";
import Link from "@/components/navigation/navigation-link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Container } from "@/components/ui/layout";
import { subscriptionBannerLinks, subscriptionBannerState } from "@/domain/subscription-banner";
import type { SubscriptionSummary } from "@/domain/subscription-summary";
import { createMessages } from "@/i18n/messages";
import { media } from "@/styles/theme";

const Banner = styled.aside`
  margin: 0;
  min-inline-size: 0;
  color: ${({ theme }) => theme.header.text};
  background: ${({ theme }) => theme.header.navigationBackground};
  border-block-end: 1px solid ${({ theme }) => theme.header.border};
  ${media.desktop} { display: none; }
`;
const Row = styled(Container)`
  display: flex;
  align-items: center;
  gap: 7px;
  min-block-size: 43px;
  padding: 0 12px;
  font-size: 0.8125rem;
  line-height: 1.5;
  strong { font-weight: 600; }
  @media (max-width: 359px) { gap: 5px; }
`;
const Price = styled.span`
  color: ${({ theme }) => theme.header.accent};
  font-weight: 600;
`;
const Separator = styled.span`color: ${({ theme }) => theme.header.mutedText};`;
const Auth = styled.span`display: inline-flex; align-items: center; flex: none; gap: 5px;`;
const Action = styled(Link)`
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 3px;
  min-block-size: 24px;
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.control};
  color: ${({ theme }) => theme.header.accent};
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  > svg { flex: none; font-size: 0.8125rem; }
  ${media.hover} { &:hover { text-decoration-thickness: 2px; } }
  &:focus-visible { outline: 2px solid ${({ theme }) => theme.header.accent}; outline-offset: 2px; }
`;

/** Approved mobile option 01: one brief row, driven by the shared confirmed session. */
export function MobileSubscriptionBanner({ locale, pathname, signedIn, subscription, now, wide, className }: {
  locale: string; pathname: string; signedIn: boolean; subscription: SubscriptionSummary | null;
  now: number; wide: boolean; className?: string;
}) {
  const state = subscriptionBannerState(signedIn, subscription, now), links = subscriptionBannerLinks(locale, pathname);
  if (!state || !subscription || pathname === links.account || pathname === links.subscribe && state !== "active") return null;
  const messages = createMessages(locale), pending = subscription.paymentPending;
  const action = state === "signed-out" ? null : state === "pending" || state === "active" && pending
    ? { href: links.payment, label: messages.text("account.viewPayment") }
    : state === "active" ? { href: links.account, label: messages.text("banner.account") }
    : { href: links.plans, label: messages.text("account.subscribe") };

  return <Banner className={className} aria-label={messages.text("banner.label")} data-mobile-subscription-status
    data-subscription-status-bar data-subscription-state={state}>
    <Row $wide={wide} data-mobile-subscription-row>
      <span role="status" aria-atomic="true">
        {state === "active" ? <strong>{messages.text("banner.mobile.active")}</strong> : state === "pending" ? messages.text("account.pending")
          : state === "expired" ? messages.text("banner.mobile.expired")
          : <>{messages.text("banner.mobile.access")}{subscription.offer && <> <Price>{messages.text("banner.mobile.from", { price: messages.number(subscription.offer.priceUgx) })}</Price></>}</>}
      </span>
      <Separator aria-hidden="true">·</Separator>
      {state === "signed-out" ? <Auth>
        <Action href={links.signUp} prefetch={false}>{messages.text("auth.signUp")}</Action>
        <Separator aria-hidden="true"> / </Separator>
        <Action href={links.signIn} prefetch={false}>{messages.text("auth.signIn")}</Action>
      </Auth> : action && <Action href={action.href} prefetch={false} data-mobile-banner-action>{action.label}<ChevronRightIcon /></Action>}
    </Row>
  </Banner>;
}

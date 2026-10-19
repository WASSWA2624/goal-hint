"use client";

import { ButtonLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { memberNextPath } from "@/domain/member-navigation";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import { createMessages } from "@/i18n/messages";

export function SubscriberPanel({ locale = "en", returnTo, offer }: { locale?: string; returnTo: string; offer?: SubscriptionOffer | null }) {
  const messages = createMessages(locale);
  return <Stack $gap="sm" data-subscriber-panel>
    <p>{messages.text("paywall.verdict")}{offer && <> {messages.text("paywall.from", {
      price: messages.number(offer.priceUgx), days: messages.plural("paywall.days", offer.durationDays),
    })}</>}</p>
    <Inline>
      <ButtonLink size="large" href={memberNextPath("subscribe", returnTo)} prefetch={false}>{messages.text("paywall.getAccess")}</ButtonLink>
      <ButtonLink size="large" variant="secondary" href={memberNextPath("account", returnTo)} prefetch={false}>{messages.text("paywall.haveCode")}</ButtonLink>
    </Inline>
  </Stack>;
}

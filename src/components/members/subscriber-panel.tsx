"use client";

import { ButtonLink } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { subscriberHref } from "@/domain/subscriber-navigation";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import { createMessages } from "@/i18n/messages";

export function SubscriberPanel({ locale = "en", returnTo, offer, signedIn = false }: { locale?: string; returnTo: string; offer?: SubscriptionOffer | null; signedIn?: boolean }) {
  const messages = createMessages(locale);
  return <Stack $gap="sm" data-subscriber-panel>
    <p>{messages.text("paywall.verdict")}{offer && <> {messages.text("paywall.from", {
      price: messages.number(offer.priceUgx), days: messages.plural("paywall.days", offer.durationDays),
    })}</>}</p>
    <Inline>
      <ButtonLink size="large" href={subscriberHref(signedIn, returnTo)} prefetch={false}>{messages.text(signedIn ? "subscribe.title" : "account.register")}</ButtonLink>
    </Inline>
  </Stack>;
}

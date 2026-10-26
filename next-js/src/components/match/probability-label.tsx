"use client";

import { probabilityEntry } from "@/domain/match-card";
import type { AcceptedMarket, MarketSelection } from "@/domain/markets";
import { createMessages } from "@/i18n/messages";
import { BodyText } from "@/components/ui/layout";

export type ProbabilityLabelProps = { market: AcceptedMarket; selection?: MarketSelection; locale?: string };

export function ProbabilityLabel({ market, selection, locale }: ProbabilityLabelProps) {
  const messages = createMessages(locale);
  const entry = probabilityEntry(market, selection);
  return <BodyText data-probability-selection={entry.selection}>
    {messages.text("probability.estimated")}: <strong>{messages.text(entry.labelKey, { percent: messages.number(entry.roundedPercent) })}</strong>
  </BodyText>;
}

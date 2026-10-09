"use client";

import type { SettlementOutcomeStatus } from "@/domain/market-settlement";
import { createMessages } from "@/i18n/messages";
import { StatusText } from "@/components/ui/feedback";

export type OutcomeBadgeProps = { status: SettlementOutcomeStatus; locale?: string };

/** StatusText supplies a distinct decorative icon as well as the explicit label. */
export function OutcomeBadge({ status, locale }: OutcomeBadgeProps) {
  return <StatusText tone={status} data-outcome={status}>{createMessages(locale).text(`outcome.${status}`)}</StatusText>;
}

"use client";

import type { ComponentPropsWithoutRef } from "react";
import { feedDatePresets, feedFilterStatuses, parseFeedStatus, type FeedStatus } from "@/domain/feed-query";
import { createMessages } from "@/i18n/messages";

type SelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "value" | "onChange"> & { locale: string };

/** Shared choices keep phone and desktop filters in the same order. */
export function FeedStatusSelect({ locale, value, onChange, ...props }: SelectProps & {
  value: FeedStatus; onChange: (status: FeedStatus) => void;
}) {
  const messages = createMessages(locale);
  const retained = !feedFilterStatuses.some((status) => status === value);
  return <select {...props} data-feed-status aria-label={messages.text("feed.filters.status")} value={value}
    onChange={(event) => onChange(parseFeedStatus(event.target.value))}>
    {feedFilterStatuses.map((status) => <option key={status} value={status}>{messages.text(`feed.filters.status.${status}`)}</option>)}
    {retained && <option value={value}>{messages.text(`feed.status.${value}`)}</option>}
  </select>;
}

export function FeedPeriodSelect({ locale, value, onChange, ...props }: SelectProps & {
  value: string; onChange: (period: string) => void;
}) {
  const messages = createMessages(locale);
  return <select {...props} data-feed-period aria-label={messages.text("feed.filters.period")} value={value}
    onChange={(event) => onChange(event.target.value)}>
    {feedDatePresets.map((kind) => <option key={kind} value={kind}>{messages.text(`feed.date.${kind}`)}</option>)}
    <option value="custom">{messages.text("feed.filters.customDates")}</option>
  </select>;
}

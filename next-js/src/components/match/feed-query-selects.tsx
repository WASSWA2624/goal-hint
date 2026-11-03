"use client";

import { FloatingField } from "@/components/ui/floating-field";

import type { ComponentPropsWithoutRef } from "react";
import { feedDatePresets, feedFilterStatuses, parseFeedStatus, type FeedStatus, type FeedQuery } from "@/domain/feed-query";
import { predictionResults } from "@/domain/performance-summary";
import { createMessages } from "@/i18n/messages";

type SelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "value" | "onChange"> & { locale: string };

/** Shared choices keep phone and desktop filters in the same order. */
export function FeedStatusSelect({ locale, value, result, onResultChange, onChange, ...props }: SelectProps & {
  value: FeedStatus; result?: FeedQuery["result"]; onResultChange?: ((result: FeedQuery["result"]) => void) | undefined; onChange: (status: FeedStatus) => void;
}) {
  const messages = createMessages(locale);
  if (result && onResultChange) return <FloatingField label={messages.text("feed.filters.result")}>
    <select {...props} name="result" data-feed-result aria-label={messages.text("feed.filters.result")} value={result}
      onChange={(event) => onResultChange(predictionResults.find((item) => item === event.target.value))}>
      <option value="all">{messages.text("performance.summary.all")}</option>
      {predictionResults.map((item) => <option key={item} value={item}>{messages.text(`performance.${item}`)}</option>)}
    </select>
  </FloatingField>;
  const retained = !feedFilterStatuses.some((status) => status === value);
  return <FloatingField label={messages.text("feed.filters.status")}><select {...props} data-feed-status aria-label={messages.text("feed.filters.status")} value={value}
    onChange={(event) => onChange(parseFeedStatus(event.target.value))}>
    {feedFilterStatuses.map((status) => <option key={status} value={status}>{messages.text(`feed.filters.status.${status}`)}</option>)}
    {retained && <option value={value}>{messages.text(`feed.status.${value}`)}</option>}
  </select></FloatingField>;
}

export function FeedPeriodSelect({ locale, value, onChange, ...props }: SelectProps & {
  value: string; onChange: (period: string) => void;
}) {
  const messages = createMessages(locale);
  return <FloatingField label={messages.text("feed.filters.period")}><select {...props} data-feed-period aria-label={messages.text("feed.filters.period")} value={value}
    onChange={(event) => onChange(event.target.value)}>
    {feedDatePresets.map((kind) => <option key={kind} value={kind}>{messages.text(`feed.date.${kind}`)}</option>)}
    <option value="custom">{messages.text("feed.filters.customDates")}</option>
  </select></FloatingField>;
}

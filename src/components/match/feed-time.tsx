"use client";

import { useId } from "react";
import type { FeedQuery } from "@/domain/feed-query";
import { validKickoffTime } from "@/domain/kickoff-time";
import { useDeviceTimeZone, useMessages } from "@/i18n/use-messages";
import { RangeFields, RangeFieldset, RangeHelp } from "./feed-range-fields";

/** Equal endpoints select one kickoff minute; blank endpoints remove the time filter. */
export function FeedTimeFilter({ query, from, to, onChange }: {
  query: FeedQuery; from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const messages = useMessages(query.locale), deviceZone = useDeviceTimeZone();
  const zone = query.zone ?? query.time?.zone ?? deviceZone, id = useId();
  const invalid = Boolean(from || to) && !validKickoffTime({ from, to, zone });
  return <RangeFieldset aria-label={messages.text("feed.time.range")}>
    <RangeFields>
      <label><span>{messages.text("feed.time.from")}</span><input type="time" step="60" value={from} title={zone}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value, to)} /></label>
      <label><span>{messages.text("feed.time.to")}</span><input type="time" step="60" value={to} min={from || undefined} title={zone}
        aria-describedby={invalid ? `${id}-error` : undefined} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(from, event.target.value)} /></label>
      {invalid && <RangeHelp id={`${id}-error`} role="alert">{messages.text("feed.time.invalid")}</RangeHelp>}
    </RangeFields>
  </RangeFieldset>;
}

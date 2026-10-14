"use client";

import { useId } from "react";
import type { FeedQuery } from "@/domain/feed-query";
import { validKickoffTime } from "@/domain/kickoff-time";
import { useDeviceTimeZone, useMessages } from "@/i18n/use-messages";
import { RangeFields, RangeFieldset, RangeHelp, RangeHint, RangeLegend } from "./feed-range-fields";

/** Equal endpoints select one kickoff minute; blank endpoints remove the time filter. */
export function FeedTimeFilter({ query, from, to, onChange }: {
  query: FeedQuery; from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const messages = useMessages(query.locale), deviceZone = useDeviceTimeZone();
  const zone = query.zone ?? query.time?.zone ?? deviceZone, id = useId();
  const invalid = Boolean(from || to) && !validKickoffTime({ from, to, zone });
  const descriptionId = `${id}-zone${invalid ? ` ${id}-error` : ""}`;
  return <RangeFieldset aria-label={messages.text("feed.time.range")}>
    <RangeLegend>{messages.text("feed.time.title")}</RangeLegend>
    <RangeFields>
      <label><span>{messages.text("feed.time.from")}</span><input type="time" step="60" value={from} title={zone}
        aria-describedby={descriptionId} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value, to)} /></label>
      <label><span>{messages.text("feed.time.to")}</span><input type="time" step="60" value={to} min={from || undefined} title={zone}
        aria-describedby={descriptionId} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(from, event.target.value)} /></label>
      <RangeHint id={`${id}-zone`}>{messages.text("feed.time.zone", { zone })}</RangeHint>
      {invalid && <RangeHelp id={`${id}-error`} role="alert">{messages.text("feed.time.invalid")}</RangeHelp>}
    </RangeFields>
  </RangeFieldset>;
}

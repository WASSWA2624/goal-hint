"use client";

import { useId } from "react";
import type { FeedQuery } from "@/domain/feed-query";
import { fullDayKickoffTime, validKickoffTime } from "@/domain/kickoff-time";
import { useDeviceTimeZone, useMessages } from "@/i18n/use-messages";
import { RangeFields, RangeFieldset, RangeHelp, RangeHint, RangeLegend } from "./feed-range-fields";

/** Equal endpoints select one kickoff minute; cleared endpoints return to the full-day bounds. */
export function FeedTimeFilter({ query, from, to, onChange }: {
  query: FeedQuery; from: string; to: string; onChange: (from: string, to: string) => void;
}) {
  const messages = useMessages(query.locale), deviceZone = useDeviceTimeZone();
  const zone = query.zone ?? query.time?.zone ?? deviceZone, id = useId();
  const fromTime = from || fullDayKickoffTime.from, toTime = to || fullDayKickoffTime.to;
  const invalid = !validKickoffTime({ from: fromTime, to: toTime, zone });
  const descriptionId = `${id}-zone${invalid ? ` ${id}-error` : ""}`;
  return <RangeFieldset aria-label={messages.text("feed.time.range")}>
    <RangeLegend>{messages.text("feed.time.title")}</RangeLegend>
    <RangeFields>
      <label><span>{messages.text("feed.time.from")}</span><input type="time" step="60" value={fromTime} title={zone}
        aria-describedby={descriptionId} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value || fullDayKickoffTime.from, toTime)} /></label>
      <label><span>{messages.text("feed.time.to")}</span><input type="time" step="60" value={toTime} min={fromTime} title={zone}
        aria-describedby={descriptionId} aria-invalid={invalid || undefined}
        onChange={(event) => onChange(fromTime, event.target.value || fullDayKickoffTime.to)} /></label>
      <RangeHint id={`${id}-zone`}>{messages.text("feed.time.zone", { zone })}</RangeHint>
      {invalid && <RangeHelp id={`${id}-error`} role="alert">{messages.text("feed.time.invalid")}</RangeHelp>}
    </RangeFields>
  </RangeFieldset>;
}

"use client";

import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { useMessages } from "@/i18n/use-messages";

/** A small client leaf keeps server-rendered history timestamps in the device zone. */
export function LocalTime({ at, locale }: { at: number; locale?: string }) {
  const messages = useMessages(locale), instant = utcInstantFromEpochMilliseconds(at);
  return <time dateTime={toUtcIsoString(instant)}>{messages.reportingInstant(instant)}</time>;
}

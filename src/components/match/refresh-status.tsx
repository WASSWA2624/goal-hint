"use client";

import { Button } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";
import { FeedNote } from "./feed-controls";

/** The live region always exists; the visible block, and its flex gap, only while a refresh has failed. */
export function RefreshStatus({ error, asOf, locale, retry }: { error: boolean; asOf: number; locale: string; retry(): void }) {
  const messages = createMessages(locale), at = utcInstantFromEpochMilliseconds(asOf);
  return <>
    <VisuallyHidden role="status" aria-live="polite">{error ? messages.text("refresh.failed") : ""}</VisuallyHidden>
    {error && <Stack $gap="sm" data-refresh-status>
      <FeedNote>{messages.text("refresh.failed")}</FeedNote>
      <FeedNote>{messages.text("refresh.lastRead")}: <time dateTime={toUtcIsoString(at)}>{messages.reportingInstant(at)}</time></FeedNote>
      <Button variant="secondary" onClick={retry}>{messages.text("feed.retry")}</Button>
    </Stack>}
  </>;
}

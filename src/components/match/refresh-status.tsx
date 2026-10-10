"use client";

import { Button } from "@/components/ui/controls";
import { MutedText, Stack } from "@/components/ui/layout";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import { createMessages } from "@/i18n/messages";

export function RefreshStatus({ error, asOf, locale, retry }: { error: boolean; asOf: number; locale: string; retry(): void }) {
  const messages = createMessages(locale), at = utcInstantFromEpochMilliseconds(asOf);
  return <Stack $gap="sm" data-refresh-status>
    <VisuallyHidden role="status" aria-live="polite">{error ? messages.text("refresh.failed") : ""}</VisuallyHidden>
    {error && <><MutedText>{messages.text("refresh.failed")}</MutedText>
      <MutedText>{messages.text("refresh.lastRead")}: <time dateTime={toUtcIsoString(at)}>{messages.reportingInstant(at)}</time></MutedText>
      <Button variant="secondary" onClick={retry}>{messages.text("feed.retry")}</Button></>}
  </Stack>;
}

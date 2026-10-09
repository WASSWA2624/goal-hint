import { BodyText, MutedText, Stack, Surface } from "@/components/ui/layout";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";

export function FeedRunStatus({ run, asOf, locale }: { run: NonNullable<MatchFeedResponse["run"]>; asOf: number; locale: string }) {
  const messages = createMessages(locale), observedAt = utcInstantFromEpochMilliseconds(asOf);
  return <Surface aria-label={messages.text("feed.runStatus")}>
    <Stack $gap="sm">
      <BodyText><strong>{messages.text(`feed.run.${run.phase}`)}</strong></BodyText>
      {run.total !== null && <BodyText>{messages.text("feed.runCounts", {
        completed: messages.number(run.completed), total: messages.number(run.total),
      })}</BodyText>}
      {run.failed > 0 && <MutedText>{messages.plural("feed.failedJobs", run.failed)}</MutedText>}
      {run.partialCoverage && <MutedText>{messages.text("feed.partialRun")}</MutedText>}
      <MutedText>{messages.text("feed.statusAsOf")}: <time dateTime={toUtcIsoString(observedAt)}>
        {messages.reportingInstant(observedAt)}
      </time></MutedText>
    </Stack>
  </Surface>;
}

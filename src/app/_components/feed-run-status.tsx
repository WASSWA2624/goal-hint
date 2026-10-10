import { RunBanner } from "@/components/match/feed-header";
import { toUtcIsoString, utcInstantFromEpochMilliseconds } from "@/domain/calendar";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";

/** One compact line: phase, job counts and the observation time. */
export function FeedRunStatus({ run, asOf, locale }: { run: NonNullable<MatchFeedResponse["run"]>; asOf: number; locale: string }) {
  const messages = createMessages(locale), observedAt = utcInstantFromEpochMilliseconds(asOf);
  const parts = [
    run.total !== null ? messages.text("feed.runCounts", { completed: messages.number(run.completed), total: messages.number(run.total) }) : null,
    run.failed > 0 ? messages.plural("feed.failedJobs", run.failed) : null,
    run.partialCoverage ? messages.text("feed.partialRun") : null,
  ].filter((part): part is string => part !== null);
  const tone = run.phase === "complete" ? "emerald" : run.phase === "partial" ? "amber" : run.phase === "not-started" ? "teal" : "blue";
  const summary = [messages.text(`feed.run.${run.phase}`), ...parts, `${messages.text("feed.statusAsOf")}: ${messages.reportingInstant(observedAt)}`].join(" · ");
  return <RunBanner aria-label={messages.text("feed.runStatus")} data-run-phase={run.phase} $tone={tone}>
    <p title={summary}><strong>{messages.text(`feed.run.${run.phase}`)}</strong>{parts.map((part) => <span key={part}> · {part}</span>)}
      <span> · {messages.text("feed.statusAsOf")}: <time dateTime={toUtcIsoString(observedAt)}>{messages.reportingInstant(observedAt)}</time></span></p>
  </RunBanner>;
}

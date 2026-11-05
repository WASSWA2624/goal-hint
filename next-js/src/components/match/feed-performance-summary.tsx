"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { TextButton } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { checkedFeedPerformance, feedPerformanceApiHref, performanceFeedQuery, retainedFeedPerformance, selectFeedSummaryResult, type FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { getFeedToday, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { useAppDispatch } from "@/state/hooks";
import { consumeRefresh, refreshApi } from "@/state/refresh-api";
import { FeedNote } from "./feed-controls";
import { LoadingTheme } from "@/styles/loading-theme";

type Presentation = { query: FeedQuery; data: MatchFeedResponse };
function summaryLabels({ query, data }: Presentation) {
  const from = parseReportingDate(data.range.from), to = parseReportingDate(data.range.to);
  const today = getFeedToday(query, data.asOf);
  const title = query.status === "live" ? "performance.summary.live"
    : query.status === "scheduled" ? "performance.summary.upcoming"
    : query.status === "finished" ? "performance.summary.completed"
    : from === today && to === today ? "performance.summary.today" : "performance.summary.title";
  const messages = createMessages(query.locale);
  const dayLabel = (day: ReportingDate) => `${messages.reportingDayParts(day).weekday.toUpperCase()} ${messages.reportingDateRangeCompact(day, day)}`;
  return { title: messages.text(title),
    period: from === to ? dayLabel(from) : `${dayLabel(from)} – ${dayLabel(to)}` };
}
const ignoreResult = () => {};

/** Render the actual heading and all outcome labels in the first HTML, with unknown values. */
export function FeedPerformancePlaceholder(props: Presentation) {
  return <LoadingTheme><PerformanceSummary counts={null} locale={props.query.locale} kind="matches" {...summaryLabels(props)}
    showCoverage={false} showAll compactHeader onResult={ignoreResult} disabled /></LoadingTheme>;
}

type Reply = { key: string; attempt: number; asOf: number; refreshAfter: number; counts: NonNullable<MatchFeedResponse["performance"]> | null; failed: boolean };

/** The initial audit streams from the server; later list polls retain the last confirmed figures. */
export function FeedPerformanceSummary({ query, today, data, enabled, onApply, initial, confirmed, onConfirmed }: Presentation & {
  today: ReportingDate; enabled: boolean; onApply: (query: FeedQuery) => void; initial?: Promise<FeedPerformanceSeed> | undefined;
  confirmed?: FeedPerformanceSeed | null | undefined; onConfirmed?: ((seed: FeedPerformanceSeed) => void) | undefined;
}) {
  const href = feedPerformanceApiHref(performanceFeedQuery(query), today);
  const seed = retainedFeedPerformance(confirmed, href, data) ?? (initial ? use(initial) : null);
  const dispatch = useAppDispatch(), messages = createMessages(query.locale);
  const [attempt, retry] = useState(0);
  const key = `${href}:${data.performanceVersion}:${data.access.tier}:${data.access.signedIn}`;
  const [reply, setReply] = useState<Reply | null>(() => {
    if (seed?.href !== href) return null;
    if (!seed.reply) return { key, attempt: 0, counts: null, asOf: data.asOf, refreshAfter: Infinity, failed: true };
    try {
      const checked = checkedFeedPerformance(seed.reply, data);
      return { key, attempt: 0, counts: checked.performance, asOf: checked.asOf, refreshAfter: checked.asOf + 60_000, failed: false };
    } catch {
      return null;
    }
  });
  const latest = useRef({ query, today, data });
  useEffect(() => { latest.current = { query, today, data }; }, [data, query, today]);
  const { tier, signedIn } = data.access;
  useEffect(() => {
    if (reply?.key === key && reply.counts && !reply.failed) onConfirmed?.({ href,
      reply: { performance: reply.counts, paginationVersion: data.performanceVersion, asOf: reply.asOf, access: { tier, signedIn } } });
  }, [data.performanceVersion, href, key, onConfirmed, reply, signedIn, tier]);
  const needsRead = enabled && (reply?.key !== key || reply.attempt !== attempt || data.asOf >= reply.refreshAfter);
  useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    const { query: currentQuery, today } = latest.current;
    const query = performanceFeedQuery(currentQuery);
    const request = dispatch(refreshApi.endpoints.feedSummary.initiate({ query, today }, { forceRefetch: true }));
    void consumeRefresh(request, controller.signal).then((value) => {
      const checked = checkedFeedPerformance(value, latest.current.data);
      if (!controller.signal.aborted) setReply({ key, attempt, asOf: checked.asOf, refreshAfter: latest.current.data.asOf + 60_000, counts: checked.performance, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setReply((previous) => ({ key, attempt, asOf: previous?.key === key ? previous.asOf : latest.current.data.asOf, refreshAfter: Infinity,
        counts: previous?.key === key ? previous.counts : null, failed: true }));
    });
    return () => controller.abort();
  }, [attempt, dispatch, key, needsRead]);
  const counts = reply?.key === key ? reply.counts : null, failed = reply?.key === key && reply.failed;
  const summaryCounts = useMemo(() => counts ? { ...counts, cancelled: counts.cancelled ?? 0 } : null, [counts]);
  return <Stack $gap="sm" data-feed-performance-state={failed ? "unavailable" : counts ? "ready" : "loading"}>
    <PerformanceSummary counts={summaryCounts} locale={query.locale} kind="matches"
      {...summaryLabels({ query, data })} activeResult={query.result} disabled={!enabled}
      onResult={(result) => onApply(selectFeedSummaryResult(query, result))} showCoverage={false} showAll compactHeader />
    {failed && <FeedNote data-performance-unavailable>
      <span role="status">{messages.text("performance.summary.unavailable")}</span>{" "}
      <TextButton disabled={!enabled} data-performance-retry onClick={() => retry((value) => value + 1)}>{messages.text("feed.retry")}</TextButton>
    </FeedNote>}
  </Stack>;
}

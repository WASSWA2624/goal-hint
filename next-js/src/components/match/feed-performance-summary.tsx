"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { Button } from "@/components/ui/controls";
import { Inline, Stack } from "@/components/ui/layout";
import { checkedPeriodPerformance, feedPerformanceApiHref, performanceFeedQuery, selectFeedSummaryResult, type FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { useAppDispatch } from "@/state/hooks";
import { consumeRefresh, refreshApi } from "@/state/refresh-api";
import { FeedNote } from "./feed-controls";
import { LoadingTheme } from "@/styles/loading-theme";

type Presentation = { query: FeedQuery; data: MatchFeedResponse; period: string };
function summaryLabels({ query, data, period }: Presentation) {
  return { title: createMessages(query.locale).text(query.summary ? "history.yesterday" : "history.performance"),
    period: query.summary ? `${addReportingDays(getReportingDate(utcInstantFromEpochMilliseconds(data.asOf)), -1)} · EAT` : period,
    asOf: data.asOf };
}
const ignoreResult = () => {};

/** Render the actual heading and all outcome labels in the first HTML, with unknown values. */
export function FeedPerformancePlaceholder(props: Presentation) {
  return <LoadingTheme><PerformanceSummary counts={null} locale={props.query.locale} kind="matches" {...summaryLabels(props)}
    showCoverage={false} showAll onResult={ignoreResult} disabled /></LoadingTheme>;
}

type Reply = { key: string; attempt: number; asOf: number; refreshAfter: number; counts: NonNullable<MatchFeedResponse["performance"]> | null; failed: boolean };

/** The initial audit streams from the server; later list polls retain the last confirmed figures. */
export function FeedPerformanceSummary({ query, today, data, enabled, period, onApply, initial }: Presentation & {
  today: ReportingDate; enabled: boolean; onApply: (query: FeedQuery) => void; initial?: Promise<FeedPerformanceSeed> | undefined;
}) {
  const seed = initial ? use(initial) : null;
  const summaryQuery = performanceFeedQuery(query, today, data.asOf), href = feedPerformanceApiHref(summaryQuery, today);
  const dispatch = useAppDispatch(), messages = createMessages(query.locale);
  const [attempt, retry] = useState(0);
  // List pagination/version changes do not change this independently scoped period.
  const key = `${href}:${data.access.tier}:${data.access.signedIn}`;
  const [reply, setReply] = useState<Reply | null>(() => {
    if (seed?.href !== href) return null;
    let counts = null;
    try { if (seed.reply) counts = checkedPeriodPerformance(seed.reply, data).performance; } catch { /* Changed viewers retry through the current endpoint. */ }
    return counts ? { key, attempt: 0, counts, asOf: seed.reply!.asOf, refreshAfter: seed.reply!.asOf + 60_000, failed: false }
      : { key, attempt: 0, counts: null, asOf: data.asOf, refreshAfter: Infinity, failed: true };
  });
  const latest = useRef({ query, today, data });
  useEffect(() => { latest.current = { query, today, data }; }, [data, query, today]);
  const needsRead = enabled && (reply?.key !== key || reply.attempt !== attempt || data.asOf >= reply.refreshAfter);
  useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    const { query: currentQuery, today, data } = latest.current;
    const query = performanceFeedQuery(currentQuery, today, data.asOf);
    const request = dispatch(refreshApi.endpoints.feedSummary.initiate({ query, today }, { forceRefetch: true }));
    void consumeRefresh(request, controller.signal).then((value) => {
      const checked = checkedPeriodPerformance(value, latest.current.data);
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
      {...summaryLabels({ query, data, period })} asOf={reply?.key === key ? reply.asOf : data.asOf} activeResult={query.result} disabled={!enabled}
      onResult={(result) => onApply(selectFeedSummaryResult(query, result, today, data.asOf))} showCoverage={false} showAll />
    {failed && <Inline><FeedNote role="status">{messages.text("performance.summary.unavailable")}</FeedNote>
      <Button type="button" variant="secondary" disabled={!enabled} onClick={() => retry((value) => value + 1)}>{messages.text("feed.retry")}</Button>
    </Inline>}
  </Stack>;
}

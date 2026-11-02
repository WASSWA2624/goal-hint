"use client";

import { useEffect, useRef, useState } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { Button } from "@/components/ui/controls";
import { Inline } from "@/components/ui/layout";
import { checkedPeriodPerformance, feedPerformanceApiHref, performanceFeedQuery } from "@/domain/feed-performance-summary";
import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { useAppDispatch } from "@/state/hooks";
import { consumeRefresh, refreshApi } from "@/state/refresh-api";
import { FeedNote } from "./feed-controls";

/** Complete-period audits load separately so cards and navigation stay usable. */
export function FeedPerformanceSummary({ query, today, data, enabled, period }: {
  query: FeedQuery; today: ReportingDate; data: MatchFeedResponse; enabled: boolean; period: string;
}) {
  const summaryQuery = performanceFeedQuery(query, today, data.asOf);
  const dispatch = useAppDispatch(), messages = createMessages(query.locale);
  const [attempt, retry] = useState(0);
  const [reply, setReply] = useState<{ key: string; attempt: number; refreshAfter: number; counts: NonNullable<MatchFeedResponse["performance"]> | null } | null>(null);
  const key = `${feedPerformanceApiHref(summaryQuery, today)}:${data.paginationVersion}:${data.total}:${data.access.tier}:${data.access.signedIn}`;
  const latest = useRef({ query, today, data });
  useEffect(() => { latest.current = { query, today, data }; }, [data, query, today]);
  // Keep successful period totals for a minute; list polling must not restart
  // the same audit. A changed cohort/viewer or an explicit retry starts a read.
  const needsRead = enabled &&
    (reply?.key !== key || reply.attempt !== attempt || reply.counts !== null && data.asOf >= reply.refreshAfter);
  useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    const { query: currentQuery, today, data } = latest.current;
    const query = performanceFeedQuery(currentQuery, today, data.asOf);
    const request = dispatch(refreshApi.endpoints.feedSummary.initiate({ query, today }, { forceRefetch: true }));
    void consumeRefresh(request, controller.signal).then((value) => {
      const checked = checkedPeriodPerformance(value, latest.current.data);
      if (!controller.signal.aborted) setReply({ key, attempt, refreshAfter: latest.current.data.asOf + 60_000, counts: checked.performance });
    }).catch(() => { if (!controller.signal.aborted) setReply({ key, attempt, refreshAfter: 0, counts: null }); });
    return () => controller.abort();
  }, [attempt, dispatch, key, needsRead]);
  const counts = reply?.key === key ? reply.counts : null;
  if (counts) return <PerformanceSummary counts={{ ...counts, cancelled: counts.cancelled ?? 0 }} locale={query.locale} kind="matches"
    title={messages.text(query.summary ? "history.yesterday" : "history.performance")}
    period={query.summary ? `${addReportingDays(getReportingDate(utcInstantFromEpochMilliseconds(data.asOf)), -1)} · EAT` : period}
    showCoverage={false} showAll />;
  const failed = reply?.key === key && reply.attempt === attempt && reply.counts === null;
  return <Inline data-feed-performance-state={failed ? "unavailable" : "loading"}>
    <FeedNote role="status">{messages.text(failed ? "performance.summary.unavailable" : "performance.summary.loading")}</FeedNote>
    {failed && <Button type="button" variant="secondary" disabled={!enabled} onClick={() => retry((value) => value + 1)}>{messages.text("feed.retry")}</Button>}
  </Inline>;
}

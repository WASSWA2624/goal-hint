"use client";

import { useEffect, useRef, useState } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { Button } from "@/components/ui/controls";
import { Inline } from "@/components/ui/layout";
import { checkedFeedPerformance, feedPerformanceApiHref } from "@/domain/feed-performance-summary";
import type { ReportingDate } from "@/domain/calendar";
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
  const dispatch = useAppDispatch(), messages = createMessages(query.locale);
  const [attempt, retry] = useState(0);
  const [reply, setReply] = useState<{ key: string; attempt: number; refreshAfter: number; counts: NonNullable<MatchFeedResponse["performance"]> | null } | null>(null);
  const key = `${feedPerformanceApiHref(query, today)}:${data.paginationVersion}:${data.total}:${data.access.tier}:${data.access.signedIn}`;
  const latest = useRef({ query, today, data });
  useEffect(() => { latest.current = { query, today, data }; }, [data, query, today]);
  // Keep successful period totals for a minute; list polling must not restart
  // the same audit. A changed cohort/viewer or an explicit retry starts a read.
  const needsRead = enabled && data.performance === null && data.total > 0 &&
    (reply?.key !== key || reply.attempt !== attempt || reply.counts !== null && data.asOf >= reply.refreshAfter);
  useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    const { query, today } = latest.current;
    const request = dispatch(refreshApi.endpoints.feedSummary.initiate({ query, today }, { forceRefetch: true }));
    void consumeRefresh(request, controller.signal).then((value) => {
      const checked = checkedFeedPerformance(value, latest.current.data);
      if (!controller.signal.aborted) setReply({ key, attempt, refreshAfter: latest.current.data.asOf + 60_000, counts: checked.performance });
    }).catch(() => { if (!controller.signal.aborted) setReply({ key, attempt, refreshAfter: 0, counts: null }); });
    return () => controller.abort();
  }, [attempt, dispatch, key, needsRead]);
  const counts = data.performance ?? (reply?.key === key ? reply.counts : null);
  if (counts) return <PerformanceSummary counts={counts} locale={query.locale} kind="matches" period={period} showCoverage={false} />;
  if (data.total === 0) return null;
  const failed = reply?.key === key && reply.attempt === attempt && reply.counts === null;
  return <Inline data-feed-performance-state={failed ? "unavailable" : "loading"}>
    <FeedNote role="status">{messages.text(failed ? "performance.summary.unavailable" : "performance.summary.loading")}</FeedNote>
    {failed && <Button type="button" variant="secondary" disabled={!enabled} onClick={() => retry((value) => value + 1)}>{messages.text("feed.retry")}</Button>}
  </Inline>;
}

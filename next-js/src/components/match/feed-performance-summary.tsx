"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { TextButton } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { checkedFeedPerformance, emptyFeedPerformanceReply, feedPerformanceApiHref, performanceFeedQuery, retainedFeedPerformance, selectFeedSummaryResult, type FeedPerformanceSeed } from "@/domain/feed-performance-summary";
import { parseReportingDate, type ReportingDate } from "@/domain/calendar";
import { FeedPaginationError } from "@/domain/feed-pagination-error";
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
    showCoverage={false} compactHeader activeResult={props.query.result} onResult={ignoreResult} onOthers={ignoreResult} disabled loading="background" /></LoadingTheme>;
}

type Reply = { key: string; scope: string; attempt: number; asOf: number; refreshAfter: number;
  counts: NonNullable<MatchFeedResponse["performance"]> | null; error: FeedPaginationError["code"] | null; retryAt: number };
const refreshIntervalMs = 60_000;
const automaticRetryDelayMs = 5_000;

/** The initial audit streams from the server; later list polls retain the last confirmed figures. */
export function FeedPerformanceSummary({ query, today, data, enabled, onApply, initial, confirmed, onConfirmed, onAccessChanged }: Presentation & {
  today: ReportingDate; enabled: boolean; onApply: (query: FeedQuery) => void; initial?: Promise<FeedPerformanceSeed> | undefined;
  confirmed?: FeedPerformanceSeed | null | undefined; onConfirmed?: ((seed: FeedPerformanceSeed | null) => void) | undefined;
  onAccessChanged?: (() => void) | undefined;
}) {
  const href = feedPerformanceApiHref(query, today);
  const empty = useMemo(() => emptyFeedPerformanceReply(query, data), [data, query]);
  const seed = empty ? { href, reply: empty } : retainedFeedPerformance(confirmed, href, data) ?? (initial ? use(initial) : null);
  const dispatch = useAppDispatch(), messages = createMessages(query.locale);
  const [attempt, retry] = useState({ number: 0, foreground: false });
  const [releasedRetry, setReleasedRetry] = useState(0);
  const retried = useRef<string | null>(null);
  const scope = `${href}:${data.access.tier}:${data.access.signedIn}`;
  const key = `${scope}:${data.performanceVersion}`;
  const readSeed = (): Reply | null => {
    if (seed?.href !== href) return null;
    if (!seed.reply) return { key, scope, attempt: attempt.number, counts: null, asOf: data.asOf, refreshAfter: Infinity,
      error: seed.failure?.code ?? "unavailable", retryAt: seed.failure?.retryAt ?? 0 };
    try {
      const checked = checkedFeedPerformance(seed.reply, data);
      return { key, scope, attempt: attempt.number, counts: checked.performance, asOf: checked.asOf,
        refreshAfter: checked.asOf + refreshIntervalMs, error: null, retryAt: 0 };
    } catch {
      return null;
    }
  };
  const [reply, setReply] = useState(readSeed);
  const [replyScope, setReplyScope] = useState(scope);
  if (replyScope !== scope) {
    setReplyScope(scope);
    setReply(readSeed());
  }
  const latest = useRef({ query, today, data });
  useEffect(() => { latest.current = { query, today, data }; }, [data, query, today]);
  const { tier, signedIn } = data.access;
  useEffect(() => {
    if (empty) onConfirmed?.({ href, reply: empty });
    else if (reply?.key === key && reply.counts && !reply.error) onConfirmed?.({ href,
      reply: { performance: reply.counts, paginationVersion: data.performanceVersion, asOf: reply.asOf, access: { tier, signedIn } } });
  }, [data.performanceVersion, empty, href, key, onConfirmed, reply, signedIn, tier]);
  const current = reply?.key === key ? reply : null;
  const matchingScope = reply?.scope === scope ? reply : null;
  const retrying = !empty && Boolean(current?.error) && current?.attempt !== attempt.number && attempt.foreground;
  const needsRead = enabled && !empty && (!current || current.attempt !== attempt.number || !current.error && data.asOf >= current.refreshAfter);
  const loading = needsRead && (!matchingScope || retrying);
  const retryAt = current?.retryAt ?? 0;
  const retryBlocked = retryAt > 0 && releasedRetry !== retryAt;
  useEffect(() => {
    if (!retryBlocked) return;
    let timer: number;
    const release = () => {
      const remaining = retryAt - Date.now();
      if (remaining <= 0) setReleasedRetry(retryAt);
      else timer = window.setTimeout(release, Math.min(remaining, 2_147_483_647));
    };
    release();
    return () => window.clearTimeout(timer);
  }, [retryAt, retryBlocked]);
  useEffect(() => {
    if (!enabled || empty || needsRead || current?.error !== "unavailable" || retried.current === key) return;
    const now = Date.now();
    const due = Math.max(now + automaticRetryDelayMs, retryAt) + Math.floor(Math.random() * 1_000);
    if (due - now > refreshIntervalMs) return;
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      if (!navigator.onLine || document.visibilityState !== "visible" || retried.current === key) return;
      timer = window.setTimeout(() => {
        if (!navigator.onLine || document.visibilityState !== "visible") return;
        retried.current = key;
        retry(({ number }) => ({ number: number + 1, foreground: false }));
      }, Math.max(0, due - Date.now()));
    };
    schedule();
    window.addEventListener("online", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [current?.error, empty, enabled, key, needsRead, retryAt]);
  useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    const { query: currentQuery, today } = latest.current;
    const query = performanceFeedQuery(currentQuery);
    const request = dispatch(refreshApi.endpoints.feedSummary.initiate({ query, today }, { forceRefetch: true }));
    void consumeRefresh(request, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      const { data } = latest.current;
      if (value.access.tier !== data.access.tier || value.access.signedIn !== data.access.signedIn)
        throw new FeedPaginationError("subscription-required");
      const checked = checkedFeedPerformance(value, data);
      retried.current = null;
      setReply(previous => {
        if (previous?.key === key && previous.counts && previous.asOf > checked.asOf) return { ...previous,
          attempt: attempt.number, refreshAfter: data.asOf + refreshIntervalMs, error: null, retryAt: 0 };
        return { key, scope, attempt: attempt.number, asOf: checked.asOf, refreshAfter: data.asOf + refreshIntervalMs,
          counts: checked.performance, error: null, retryAt: 0 };
      });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      const error = cause instanceof FeedPaginationError ? cause : new FeedPaginationError("unavailable");
      const accessChanged = error.code === "subscription-required";
      const retryAt = error.retryAfterMs ? Date.now() + error.retryAfterMs : 0;
      setReply((previous) => {
        const retained = !accessChanged && previous?.scope === scope ? previous : null;
        return { key, scope, attempt: attempt.number, asOf: retained?.asOf ?? latest.current.data.asOf,
          refreshAfter: Infinity, counts: retained?.counts ?? null, error: error.code, retryAt };
      });
      if (accessChanged) { onConfirmed?.(null); onAccessChanged?.(); }
    });
    return () => controller.abort();
  }, [attempt, dispatch, key, needsRead, onAccessChanged, onConfirmed, scope]);
  const counts = empty?.performance ?? matchingScope?.counts ?? null;
  const failed = !empty && !loading && !counts && current?.error;
  const stale = !empty && Boolean(matchingScope?.counts && (matchingScope.error || matchingScope.key !== key));
  const summaryCounts = useMemo(() => counts ? { ...counts, cancelled: counts.cancelled ?? 0 } : null, [counts]);
  return <Stack $gap="sm" data-feed-performance-state={loading ? "loading" : failed ? "unavailable" : stale ? "stale" : counts ? "ready" : "unknown"}>
    <PerformanceSummary counts={summaryCounts} locale={query.locale} kind="matches"
      {...summaryLabels({ query, data })} activeResult={query.result} disabled={!enabled} loading={loading && (retrying || "background")}
      onResult={(result) => onApply(selectFeedSummaryResult(query, result))}
      onOthers={() => onApply(selectFeedSummaryResult(query, "others"))} showCoverage={false} compactHeader />
    {(failed || retrying || stale) && <FeedNote data-performance-unavailable>
      <span role="status">{messages.text(stale ? "performance.summary.stale"
        : current?.error === "rate-limited" ? "feed.rateLimited" : "performance.summary.unavailable")}</span>{" "}
      {current?.error && current.error !== "subscription-required" && <TextButton disabled={!enabled || needsRead || retryBlocked}
        data-performance-retry onClick={() => retry(({ number }) => ({ number: number + 1, foreground: true }))}>{messages.text("feed.retry")}</TextButton>}
    </FeedNote>}
  </Stack>;
}

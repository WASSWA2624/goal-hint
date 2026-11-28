"use client";

import { use, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PerformanceSummary } from "@/components/performance/performance-summary";
import { TextButton } from "@/components/ui/controls";
import { Stack } from "@/components/ui/layout";
import { checkedFeedPerformance, emptyFeedPerformanceReply, feedPerformanceApiHref, performanceFeedQuery, retainedFeedPerformance, selectFeedSummaryResult, type FeedPerformanceReply, type FeedPerformanceSeed } from "@/domain/feed-performance-summary";
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
  counts: NonNullable<MatchFeedResponse["performance"]> | null; error: FeedPaginationError["code"] | null;
  retryAt: number; withinRetryBudget: boolean };
const refreshIntervalMs = 60_000;
const automaticRetryDelayMs = 5_000;
const initiallyOnline = () => false;
const offlineSnapshot = () => navigator.onLine === false;

function subscribeConnection(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

/** Browser audits load independently of the list and preserve confirmed figures during polling. */
export function FeedPerformanceSummary({ query, today, data, enabled, onApply, initial, confirmed, onConfirmed, onAccessChanged, onGenerationChanged }: Presentation & {
  today: ReportingDate; enabled: boolean; onApply: (query: FeedQuery) => void; initial?: Promise<FeedPerformanceSeed> | undefined;
  confirmed?: FeedPerformanceSeed | null | undefined; onConfirmed?: ((seed: FeedPerformanceSeed | null) => void) | undefined;
  onAccessChanged?: (() => void) | undefined;
  onGenerationChanged?: (() => Promise<void> | undefined) | undefined;
}) {
  const href = feedPerformanceApiHref(query, today);
  const empty = useMemo(() => emptyFeedPerformanceReply(query, data), [data, query]);
  const seed = empty ? { href, reply: empty } : retainedFeedPerformance(confirmed, href, data) ?? (initial ? use(initial) : null);
  const dispatch = useAppDispatch(), messages = createMessages(query.locale);
  const [attempt, retry] = useState({ number: 0, foreground: false });
  const [releasedRetry, setReleasedRetry] = useState(0);
  const [automaticallyRetried, setAutomaticallyRetried] = useState<string | null>(null);
  const retried = useRef<string | null>(null);
  const pendingGeneration = useRef<{ scope: string; reply: FeedPerformanceReply } | null>(null);
  const offline = useSyncExternalStore(subscribeConnection, offlineSnapshot, initiallyOnline);
  const scope = `${href}:${data.access.tier}:${data.access.signedIn}`;
  const key = `${scope}:${data.performanceVersion}`;
  const readSeed = (): Reply | null => {
    if (seed?.href !== href) return null;
    if (!seed.reply) {
      const retryAt = seed.failure?.retryAt ?? 0;
      return { key, scope, attempt: attempt.number, counts: null, asOf: data.asOf, refreshAfter: Infinity,
        error: seed.failure?.code ?? "unavailable", retryAt, withinRetryBudget: retryAt - data.asOf <= refreshIntervalMs };
    }
    try {
      const checked = checkedFeedPerformance(seed.reply, data);
      return { key, scope, attempt: attempt.number, counts: checked.performance, asOf: checked.asOf,
        refreshAfter: checked.asOf + refreshIntervalMs, error: null, retryAt: 0, withinRetryBudget: false };
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
  const counts = empty?.performance ?? matchingScope?.counts ?? null;
  const automaticRetryScheduled = enabled && !empty && !needsRead && current?.error === "unavailable"
    && current.withinRetryBudget && automaticallyRetried !== key;
  const automaticRetryActive = needsRead && current?.error === "unavailable" && automaticallyRetried === key && !attempt.foreground;
  const initialRetryPending = !counts && !offline && (automaticRetryScheduled || automaticRetryActive);
  const loading = initialRetryPending || needsRead && (!matchingScope || retrying);
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
    if (!automaticRetryScheduled || retried.current === key) return;
    const now = Date.now();
    const due = Math.min(now + refreshIntervalMs, Math.max(now + automaticRetryDelayMs, retryAt) + Math.floor(Math.random() * 1_000));
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      if (!navigator.onLine || document.visibilityState !== "visible" || retried.current === key) return;
      timer = window.setTimeout(() => {
        if (!navigator.onLine || document.visibilityState !== "visible") return;
        retried.current = key;
        setAutomaticallyRetried(key);
        retry(({ number }) => ({ number: number + 1, foreground: false }));
      }, Math.max(0, due - Date.now()));
    };
    schedule();
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [automaticRetryScheduled, key, retryAt]);
  useEffect(() => {
    if (!needsRead) return;
    const controller = new AbortController();
    const { query: currentQuery, today } = latest.current;
    const query = performanceFeedQuery(currentQuery);
    const queued = pendingGeneration.current;
    if (queued?.scope !== scope) pendingGeneration.current = null;
    const read = queued?.scope === scope && queued.reply.paginationVersion === latest.current.data.performanceVersion
      ? Promise.resolve(queued.reply)
      : consumeRefresh(dispatch(refreshApi.endpoints.feedSummary.initiate({ query, today }, { forceRefetch: true })), controller.signal);
    void read.then(async (value) => {
      if (controller.signal.aborted) return;
      const { data } = latest.current;
      if (value.access.tier !== data.access.tier || value.access.signedIn !== data.access.signedIn)
        throw new FeedPaginationError("subscription-required");
      // A newer audit can trigger one quiet list observation. It stays hidden
      // until that observation confirms the same generation and viewer.
      if (value.paginationVersion && value.paginationVersion !== data.performanceVersion && value.asOf >= data.asOf &&
          !pendingGeneration.current && navigator.onLine && document.visibilityState === "visible") {
        pendingGeneration.current = { scope, reply: value };
        await onGenerationChanged?.();
        if (controller.signal.aborted) return;
        // The effect for the new list generation owns acceptance of this reply.
        throw new FeedPaginationError("changed");
      }
      const checked = checkedFeedPerformance(value, data);
      pendingGeneration.current = null;
      retried.current = null;
      setAutomaticallyRetried(null);
      setReply(previous => {
        if (previous?.key === key && previous.counts && previous.asOf > checked.asOf) return { ...previous,
          attempt: attempt.number, refreshAfter: data.asOf + refreshIntervalMs, error: null, retryAt: 0 };
        return { key, scope, attempt: attempt.number, asOf: checked.asOf, refreshAfter: data.asOf + refreshIntervalMs,
          counts: checked.performance, error: null, retryAt: 0, withinRetryBudget: false };
      });
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      const error = cause instanceof FeedPaginationError ? cause : new FeedPaginationError("unavailable");
      const accessChanged = error.code === "subscription-required";
      const retryAfter = error.retryAfterMs ?? 0;
      const retryAt = retryAfter ? Date.now() + retryAfter : 0;
      setReply((previous) => {
        const retained = !accessChanged && previous?.scope === scope ? previous : null;
        return { key, scope, attempt: attempt.number, asOf: retained?.asOf ?? latest.current.data.asOf,
          refreshAfter: Infinity, counts: retained?.counts ?? null, error: error.code, retryAt, withinRetryBudget: retryAfter <= refreshIntervalMs };
      });
      if (accessChanged) { pendingGeneration.current = null; onConfirmed?.(null); onAccessChanged?.(); }
    });
    return () => controller.abort();
  }, [attempt, dispatch, key, needsRead, onAccessChanged, onConfirmed, onGenerationChanged, scope]);
  const failed = !empty && !loading && !counts && current?.error;
  const stale = !empty && Boolean(matchingScope?.counts && (matchingScope.error || matchingScope.key !== key));
  const summaryCounts = useMemo(() => counts ? { ...counts, cancelled: counts.cancelled ?? 0 } : null, [counts]);
  return <Stack $gap="sm" data-feed-performance-state={loading ? "loading" : failed ? "unavailable" : stale ? "stale" : counts ? "ready" : "unknown"}
    data-feed-performance-deferred={!initial && loading ? true : undefined}
    data-feed-summary-retry={initialRetryPending ? true : undefined}>
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

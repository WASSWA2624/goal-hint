"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MatchDetails } from "@/components/match/details/match-details";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import type { InsightsPreview } from "@/domain/match-insights";
import { gateInsights } from "@/domain/paywall";
import { isPlayedFinalStatus } from "@/domain/market-settlement";
import type { ReportingDate } from "@/domain/calendar";
import { liveRefreshRules, mergeLiveDetail } from "@/domain/live-refresh";
import { FeedPaginationError } from "@/domain/feed-pagination-error";
import type { MatchDetailResponse } from "@/domain/match-detail";
import { DetailStateProvider } from "@/state/detail-provider";
import { useDetailDispatch } from "@/state/detail-hooks";
import { consumeRefresh } from "@/state/refresh-base";
import { detailApi } from "@/state/detail-api";
import { useLiveRefresh } from "./use-live-refresh";

type LiveDetailProps = { initial: MatchDetailResponse; today: ReportingDate; locale: string; children?: ReactNode;
  preview?: InsightsPreview | null; previewPromise?: Promise<InsightsPreview | null>;
  historyRequested?: boolean; showAccount?: boolean; offer?: SubscriptionOffer | null };

/** Only this invisible boundary waits for optional summaries; the interactive match view stays mounted. */
function DeferredPreview({ promise, resolve }: { promise: Promise<InsightsPreview | null>; resolve: (preview: InsightsPreview | null) => void }) {
  const preview = use(promise);
  useEffect(() => { resolve(preview); }, [preview, resolve]);
  return null;
}

/** Everything the page shows: the read clock and sync time change on every poll without changing the view. */
const shown = (detail: MatchDetailResponse) => JSON.stringify({ ...detail, asOf: 0, fixture: { ...detail.fixture, syncedAt: 0 } });

function LiveDetail({ initial, today, locale, children, preview: initialPreview = null, previewPromise, historyRequested = false, showAccount = false, offer = null }: LiveDetailProps) {
  const [data, setData] = useState(initial), [asOf, setAsOf] = useState(initial.asOf);
  const [deferredPreview, setDeferredPreview] = useState<{ promise: Promise<InsightsPreview | null> | undefined; value: InsightsPreview | null } | null>(null);
  const resolvePreview = useCallback((value: InsightsPreview | null) => setDeferredPreview({ promise: previewPromise, value }), [previewPromise]);
  const preview = deferredPreview && deferredPreview.promise === previewPromise ? deferredPreview.value : initialPreview;
  // The newest accepted response (for staleness checks); `data` changes only when something visible does.
  const accepted = useRef(data), request = useRef<AbortController | null>(null), mounted = useRef(false);
  const dispatch = useDetailDispatch(), router = useRouter();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  const accept = useCallback((next: MatchDetailResponse) => {
    const changed = shown(next) !== shown(accepted.current);
    accepted.current = next; setAsOf(next.asOf);
    if (changed) setData(next);
  }, []);
  useEffect(() => {
    // The first server projection is already in state; merging it again would only re-render the page.
    if (initial === accepted.current) return;
    try { accept(mergeLiveDetail(accepted.current, initial)); }
    catch { /* A stale server navigation cannot replace an accepted browser snapshot. */ }
  }, [accept, initial]);
  const refresh = useCallback(async () => {
    if (request.current || !mounted.current) return;
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await consumeRefresh(dispatch(detailApi.endpoints.detail.initiate(initial.fixture.fixtureId,
        { forceRefetch: true })), controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const accessChanged = result.access.tier !== accepted.current.access.tier || result.access.signedIn !== accepted.current.access.signedIn;
      accept(mergeLiveDetail(accepted.current, result));
      if (accessChanged) router.refresh();
    } catch (cause) {
      if (cause instanceof FeedPaginationError && cause.code === "subscription-required") router.refresh();
      // Keep the accepted snapshot; the next scheduled refresh retries automatically.
    } finally { if (request.current === controller) request.current = null; }
  }, [accept, dispatch, initial.fixture.fixtureId, router]);
  // A scheduled match polls fast only near kickoff, judged by the last read clock (no render-time Date.now()).
  const fixture = data.fixture, kickoffAt = fixture.kickoffAt;
  const active = fixture.status === "live" || data.run?.phase === "updating" ||
    (fixture.status === "scheduled" && kickoffAt !== null && Math.abs(kickoffAt - asOf) <= liveRefreshRules.kickoffLeadMs);
  useLiveRefresh({ today, enabled: true, interval: active ? liveRefreshRules.activeMs : liveRefreshRules.quietMs,
    refresh, rollover: () => router.refresh() });
  const sections = preview ? gateInsights(preview, data.access, isPlayedFinalStatus(data.fixture.status)).sections : null;
  const currentPreview = preview && sections !== preview.sections ? { ...preview, sections: sections!, totals: { ...preview.totals, news: sections!.news.items.length } } : preview;
  return <>
    <MatchDetails showAccount={showAccount} offer={offer} data={data} preview={currentPreview} locale={locale} history={children} historyRequested={historyRequested} />
    {previewPromise && <Suspense fallback={null}><DeferredPreview promise={previewPromise} resolve={resolvePreview} /></Suspense>}
  </>;
}

/** One explicit server projection initializes a fresh per-page refresh store. */
export function LiveMatchDetail(props: LiveDetailProps) {
  return <DetailStateProvider key={`${props.initial.fixture.fixtureId}:${props.initial.access.tier}:${props.initial.access.signedIn}`}>
    <LiveDetail {...props} />
  </DetailStateProvider>;
}

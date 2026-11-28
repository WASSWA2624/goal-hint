"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MatchDetails } from "@/components/match/details/match-details";
import { hasMatchPredictionAccess } from "@/domain/match-detail-tabs";
import type { SubscriptionOffer } from "@/domain/subscription-offer";
import type { InsightsPreview } from "@/domain/match-insights";
import { gateInsights } from "@/domain/paywall";
import { isCompletedFixtureStatus } from "@/domain/market-settlement";
import type { ReportingDate } from "@/domain/calendar";
import { feedRefreshInterval, liveMatchFreshness, mergeLiveDetail } from "@/domain/live-refresh";
import { FeedPaginationError } from "@/domain/feed-pagination-error";
import type { MatchDetailResponse } from "@/domain/match-detail";
import { DetailStateProvider } from "@/state/detail-provider";
import { useDetailDispatch } from "@/state/detail-hooks";
import { consumeRefresh } from "@/state/refresh-base";
import { detailApi } from "@/state/detail-api";
import { useLiveRefresh } from "./use-live-refresh";

type LiveDetailProps = { initial: MatchDetailResponse; today: ReportingDate; locale: string; children?: ReactNode;
  preview?: InsightsPreview | null; previewPromise?: Promise<InsightsPreview | null>;
  showAccount?: boolean; offer?: SubscriptionOffer | null; offerPromise?: Promise<SubscriptionOffer | null>; footer?: ReactNode };

/** Apply optional values after their invisible boundaries resolve. */
function DeferredMatchValue<T>({ promise, resolve }: { promise: Promise<T>; resolve: (value: T) => void }) {
  const value = use(promise);
  useEffect(() => { resolve(value); }, [value, resolve]);
  return null;
}

/** Everything the page shows: the read clock and sync time change on every poll without changing the view. */
const shown = (detail: MatchDetailResponse) => JSON.stringify({ ...detail, asOf: 0,
  liveMatchFreshness: liveMatchFreshness(detail.liveMatch, detail.asOf, detail.fixture.status),
  fixture: { ...detail.fixture, syncedAt: 0, marketOdds: detail.fixture.marketOdds && {
    kind: detail.fixture.marketOdds.kind, prices: detail.fixture.marketOdds.prices,
  } },
  bookmakerOdds: detail.bookmakerOdds && { kind: detail.bookmakerOdds.kind, version: detail.bookmakerOdds.version },
  recoveredBookmakerOdds: detail.recoveredBookmakerOdds?.version,
  inPlayOdds: detail.inPlayOdds && (detail.inPlayOdds.version ?? detail.inPlayOdds.prices),
  extendedOdds: detail.extendedOdds && { kind: detail.extendedOdds.kind, selections: detail.extendedOdds.selections },
});

function LiveDetail({ initial, today, locale, children, preview: initialPreview = null, previewPromise,
  showAccount = false, offer: initialOffer = null, offerPromise, footer }: LiveDetailProps) {
  const [data, setData] = useState(initial);
  const [deferredPreview, setDeferredPreview] = useState<{ promise: Promise<InsightsPreview | null> | undefined; value: InsightsPreview | null } | null>(null);
  const resolvePreview = useCallback((value: InsightsPreview | null) => setDeferredPreview({ promise: previewPromise, value }), [previewPromise]);
  const preview = deferredPreview && deferredPreview.promise === previewPromise ? deferredPreview.value : initialPreview;
  const [deferredOffer, setDeferredOffer] = useState<{ promise: Promise<SubscriptionOffer | null> | undefined; value: SubscriptionOffer | null } | null>(null);
  const resolveOffer = useCallback((value: SubscriptionOffer | null) => setDeferredOffer({ promise: offerPromise, value }), [offerPromise]);
  const offer = deferredOffer && deferredOffer.promise === offerPromise ? deferredOffer.value : initialOffer;
  // The newest accepted response (for staleness checks); `data` changes only when something visible does.
  const accepted = useRef(data), request = useRef<AbortController | null>(null), mounted = useRef(false);
  const dispatch = useDetailDispatch(), router = useRouter();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  const accept = useCallback((next: MatchDetailResponse) => {
    const changed = shown(next) !== shown(accepted.current);
    accepted.current = next;
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
  // The timer reads the accepted result immediately, before React commits the next render.
  const interval = () => {
    const current = accepted.current;
    return feedRefreshInterval(current, [current.fixture], current.asOf);
  };
  useLiveRefresh({ today, enabled: true, interval,
    refresh, rollover: () => { void refresh(); } });
  const sections = preview ? gateInsights(preview, data.access, isCompletedFixtureStatus(data.fixture.status)).sections : null;
  const allowed = hasMatchPredictionAccess(data);
  const currentPreview = !allowed ? null : preview && sections !== preview.sections ? { ...preview, sections: sections!, totals: { ...preview.totals, news: sections!.news.items.length } } : preview;
  return <>
    <MatchDetails showAccount={showAccount} offer={offer} data={data} preview={currentPreview} locale={locale} history={children} footer={footer} />
    {previewPromise && <Suspense fallback={null}><DeferredMatchValue promise={previewPromise} resolve={resolvePreview} /></Suspense>}
    {offerPromise && <Suspense fallback={null}><DeferredMatchValue promise={offerPromise} resolve={resolveOffer} /></Suspense>}
  </>;
}

/** One explicit server projection initializes a fresh per-page refresh store. */
export function LiveMatchDetail(props: LiveDetailProps) {
  return <DetailStateProvider key={`${props.initial.fixture.fixtureId}:${props.initial.access.tier}:${props.initial.access.signedIn}`}>
    <LiveDetail {...props} />
  </DetailStateProvider>;
}

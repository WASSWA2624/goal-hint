"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MatchDetails } from "@/components/match/details/match-details";
import type { InsightsPreview } from "@/domain/match-insights";
import type { ReportingDate } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { liveRefreshRules, mergeLiveDetail } from "@/domain/live-refresh";
import type { MatchDetailResponse } from "@/domain/match-detail";
import { FeedStateProvider } from "@/state/provider";
import { useAppDispatch } from "@/state/hooks";
import { consumeRefresh } from "@/state/refresh-api";
import { detailApi } from "@/state/detail-api";
import { RefreshStatus } from "./refresh-status";
import { useLiveRefresh } from "./use-live-refresh";

type LiveDetailProps = { initial: MatchDetailResponse; today: ReportingDate; locale: string; children?: ReactNode;
  preview?: InsightsPreview | null; historyRequested?: boolean };

/** Everything the page shows: the read clock and sync time change on every poll without changing the view. */
const shown = (detail: MatchDetailResponse) => JSON.stringify({ ...detail, asOf: 0, fixture: { ...detail.fixture, syncedAt: 0 } });

function LiveDetail({ initial, today, locale, children, preview = null, historyRequested = false }: LiveDetailProps) {
  const [data, setData] = useState(initial), [asOf, setAsOf] = useState(initial.asOf), [error, setError] = useState(false);
  // The newest accepted response (for staleness checks); `data` changes only when something visible does.
  const accepted = useRef(data), request = useRef<AbortController | null>(null), mounted = useRef(false);
  const dispatch = useAppDispatch(), router = useRouter();
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
      accept(mergeLiveDetail(accepted.current, result)); setError(false);
    } catch {
      if (!controller.signal.aborted && mounted.current) setError(true);
    } finally { if (request.current === controller) request.current = null; }
  }, [accept, dispatch, initial.fixture.fixtureId]);
  // A scheduled match polls fast only near kickoff, judged by the last read clock (no render-time Date.now()).
  const fixture = data.fixture, kickoffAt = fixture.kickoffAt;
  const active = fixture.status === "live" || data.run?.phase === "updating" ||
    (fixture.status === "scheduled" && kickoffAt !== null && Math.abs(kickoffAt - asOf) <= liveRefreshRules.kickoffLeadMs);
  useLiveRefresh({ today, enabled: true, interval: active ? liveRefreshRules.activeMs : liveRefreshRules.quietMs,
    refresh, rollover: () => router.refresh() });
  return <>
    <RefreshStatus error={error} asOf={asOf} locale={locale} retry={() => { void refresh(); }} />
    <MatchDetails data={data} preview={preview} locale={locale} history={children} historyRequested={historyRequested} />
  </>;
}

/** One explicit server projection initializes a fresh per-page refresh store. */
export function LiveMatchDetail(props: LiveDetailProps) {
  return <FeedStateProvider key={props.initial.fixture.fixtureId}
    initial={{ query: parseFeedQuery(new URLSearchParams(), { today: props.today, locale: props.locale }), today: props.today, data: null }}>
    <LiveDetail {...props} />
  </FeedStateProvider>;
}

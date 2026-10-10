"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MatchDetail } from "@/app/_components/match-detail-content";
import type { ReportingDate } from "@/domain/calendar";
import { parseFeedQuery } from "@/domain/feed-query";
import { liveRefreshRules, mergeLiveDetail } from "@/domain/live-refresh";
import type { MatchDetailResponse } from "@/domain/match-detail";
import { FeedStateProvider } from "@/state/provider";
import { useAppDispatch } from "@/state/hooks";
import { consumeRefresh, refreshApi } from "@/state/refresh-api";
import { RefreshStatus } from "./refresh-status";
import { useLiveRefresh } from "./use-live-refresh";

function LiveDetail({ initial, today, locale, children }: {
  initial: MatchDetailResponse; today: ReportingDate; locale: string; children?: ReactNode;
}) {
  const [data, setData] = useState(initial), [error, setError] = useState(false);
  const accepted = useRef(data), request = useRef<AbortController | null>(null), mounted = useRef(false);
  const dispatch = useAppDispatch(), router = useRouter();
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  useEffect(() => {
    try { const next = mergeLiveDetail(accepted.current, initial); accepted.current = next; setData(next); }
    catch { /* A stale server navigation cannot replace an accepted browser snapshot. */ }
  }, [initial]);
  const refresh = useCallback(async () => {
    if (request.current || !mounted.current) return;
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await consumeRefresh(dispatch(refreshApi.endpoints.detail.initiate(initial.fixture.fixtureId,
        { forceRefetch: true })), controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      const next = mergeLiveDetail(accepted.current, result);
      accepted.current = next; setData(next); setError(false);
    } catch {
      if (!controller.signal.aborted && mounted.current) setError(true);
    } finally { if (request.current === controller) request.current = null; }
  }, [dispatch, initial.fixture.fixtureId]);
  const active = ["live", "scheduled"].includes(data.fixture.status) || data.run?.phase === "updating";
  useLiveRefresh({ today, enabled: true, interval: active ? liveRefreshRules.activeMs : liveRefreshRules.quietMs,
    refresh, rollover: () => router.refresh() });
  return <>
    <RefreshStatus error={error} asOf={data.asOf} locale={locale} retry={() => { void refresh(); }} />
    <MatchDetail data={data} locale={locale} history={children} />
  </>;
}

/** One explicit server projection initializes a fresh per-page refresh store. */
export function LiveMatchDetail(props: { initial: MatchDetailResponse; today: ReportingDate; locale: string; children?: ReactNode }) {
  return <FeedStateProvider key={props.initial.fixture.fixtureId}
    initial={{ query: parseFeedQuery(new URLSearchParams(), { today: props.today, locale: props.locale }), today: props.today, data: null }}>
    <LiveDetail {...props} />
  </FeedStateProvider>;
}

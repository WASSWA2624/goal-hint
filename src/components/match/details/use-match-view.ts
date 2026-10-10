"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { InsightSections } from "@/domain/match-insights";
import { parseMatchView, serializeMatchView, type MatchSection, type MatchView } from "@/domain/match-view";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { refreshApi } from "@/state/refresh-api";

export type ViewNavigation = "push" | "replace";

/**
 * The details view lives in the URL: opening sections and items adds history entries (Back and
 * Forward step through them), while tabs, filters and pages replace the current entry. Other
 * query parameters, such as revision history, are preserved.
 */
export function useMatchView() {
  const parameters = useSearchParams();
  const view = useMemo(() => parseMatchView(parameters), [parameters]);
  const go = useCallback((next: MatchView, mode: ViewNavigation = "push") => {
    const query = serializeMatchView(next, new URLSearchParams(window.location.search)).toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (url === `${window.location.pathname}${window.location.search}`) return;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }, []);
  return { view, go };
}

/**
 * One complete section, fetched on first expansion through the shared cached endpoint. Simultaneous
 * consumers share one request; the preview stays visible while loading or after a failure.
 */
export function useInsightSection<S extends MatchSection>(id: string, section: S, enabled: boolean) {
  const dispatch = useAppDispatch();
  const [attempt, setAttempt] = useState(0);
  const select = useMemo(() => refreshApi.endpoints.insights.select({ id, section }), [id, section]);
  const state = useAppSelector(select);
  useEffect(() => {
    if (!enabled) return;
    const request = dispatch(refreshApi.endpoints.insights.initiate({ id, section }, attempt > 0 ? { forceRefetch: true } : undefined));
    return () => request.unsubscribe();
  }, [attempt, dispatch, enabled, id, section]);
  return {
    // The endpoint validated this payload against the section's own schema.
    data: state.data?.section === section ? state.data.data as InsightSections[S] : null,
    loading: enabled && state.isLoading,
    error: enabled && state.isError,
    retry: () => setAttempt((value) => value + 1),
  };
}

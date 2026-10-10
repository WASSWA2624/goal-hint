"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { previewHoldsSection, type InsightSections, type InsightsPreview } from "@/domain/match-insights";
import { parseMatchView, serializeMatchView, type MatchSection, type MatchView } from "@/domain/match-view";
import { useAppDispatch, useAppSelector } from "@/state/hooks";
import { detailApi } from "@/state/detail-api";

export type ViewNavigation = "push" | "replace";
export type ViewUpdate = (change: (current: MatchView) => MatchView, mode?: ViewNavigation) => void;

/**
 * The details view lives in the URL: opening sections and items adds history entries (Back and
 * Forward step through them), while tabs, filters and pages replace the current entry. Other
 * query parameters, such as revision history, are preserved. `update` derives the next view from
 * the URL at call time, so handlers need no rendered view and closed cards can skip view changes.
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
  const update = useCallback<ViewUpdate>((change, mode = "push") =>
    go(change(parseMatchView(new URLSearchParams(window.location.search))), mode), [go]);
  return { view, go, update };
}

/** A complete preview older than this is refetched when its section opens. */
const previewReuseMs = 5 * 60_000;

/**
 * One complete section, fetched on first expansion through the shared cached endpoint. Simultaneous
 * consumers share one request; the preview stays visible while loading or after a failure. When the
 * page's recent preview already holds the whole collection, no request is made.
 */
export function useInsightSection<S extends MatchSection>(id: string, section: S, enabled: boolean, preview: InsightsPreview | null = null) {
  const dispatch = useAppDispatch();
  const [attempt, setAttempt] = useState(0);
  const select = useMemo(() => detailApi.endpoints.insights.select({ id, section }), [id, section]);
  const state = useAppSelector(select);
  const completeAt = preview && previewHoldsSection(preview, section) ? preview.asOf : null;
  useEffect(() => {
    if (!enabled || (completeAt !== null && Date.now() - completeAt < previewReuseMs)) return;
    const request = dispatch(detailApi.endpoints.insights.initiate({ id, section }, attempt > 0 ? { forceRefetch: true } : undefined));
    return () => request.unsubscribe();
  }, [attempt, completeAt, dispatch, enabled, id, section]);
  return {
    // The endpoint validated this payload against the section's own schema.
    data: state.data?.section === section ? state.data.data as InsightSections[S] : null,
    loading: enabled && state.isLoading,
    error: enabled && state.isError,
    retry: () => setAttempt((value) => value + 1),
  };
}

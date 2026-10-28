"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import type { FeedCheckpoint } from "@/domain/feed-navigation";
import { appendFeedPage, FeedPaginationError, initialLoadedFeed, replaceFeedPages, type LoadedFeed } from "@/domain/feed-pagination";
import { feedQueryHref, feedQueryKey, type FeedQuery } from "@/domain/feed-query";
import { feedRowNumber } from "@/domain/feed-presentation";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { consumeRefresh, refreshApi } from "@/state/refresh-api";
import { useAppDispatch } from "@/state/hooks";
import { acceptRun } from "@/domain/live-refresh";
import { ensureFeedEntry, restoreFeedCheckpoint, saveFeedCheckpoint } from "./feed-restoration";

type Mode = "append" | "refresh" | "restore" | "background";
type FocusTarget = { fixtureId: string | null; checkpoint?: FeedCheckpoint; retry?: boolean };
export function useFeedPagination({ query, today, data, enabled, onStatus }: {
  query: FeedQuery; today: ReportingDate; data: MatchFeedResponse; enabled: boolean;
  onStatus: (href: string, message: string) => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [view, setView] = useState(() => initialLoadedFeed(data));
  const [phase, setPhase] = useState<Mode | null>(null), [error, setError] = useState<FeedPaginationError["code"] | null>(null);
  // A refreshed server query with the same canonical href must not tear down the listeners below.
  const root = useRef<HTMLDivElement>(null), viewRef = useRef(view), enabledRef = useRef(enabled), queryRef = useRef(query);
  const mounted = useRef(false), request = useRef<AbortController | null>(null), entryId = useRef<string | null>(null);
  const restored = useRef(true), retryCheckpoint = useRef<FeedCheckpoint | null>(null), failedMode = useRef<Mode>("append");
  const focusTarget = useRef<FocusTarget | null>(null);
  const href = feedQueryHref(query, today), queryKey = feedQueryKey(query, today);
  const announce = useCallback((key: "loading" | "restoring" | "loaded" | "restored" | "refreshed" | "changed" | "failed" | "busy", loaded?: LoadedFeed, added = 0) => {
    const messages = createMessages(query.locale);
    const status = messages.text(`feed.pagination.${key}`, { shown: messages.number(loaded?.records.length ?? 0),
      total: messages.number(loaded?.data.total ?? 0), added: messages.number(added) });
    // Focus moves to the first added card, so say when similar search results begin among the added ones.
    const search = loaded?.data.search, start = loaded ? feedRowNumber(loaded.firstPage, loaded.data.pageSize, loaded.records.length - added) : 0;
    const similarFrom = search && search.similar > 0 ? search.exact + 1 : null;
    onStatus(href, similarFrom !== null && key === "loaded" && similarFrom >= start && similarFrom < start + added
      ? `${status} ${messages.text("feed.search.similarFrom", { position: messages.number(similarFrom) })}` : status);
  }, [href, onStatus, query.locale]);
  const save = useCallback(() => {
    if (!entryId.current || !restored.current) return;
    const current = viewRef.current, active = document.activeElement;
    const article = active instanceof Element ? active.closest("[data-fixture-id]") : null;
    saveFeedCheckpoint({ entryId: entryId.current, queryKey, href, firstPage: current.firstPage, lastPage: current.lastPage,
      scrollY: Math.max(0, Math.min(window.scrollY, 10_000_000)), focusFixtureId: article?.getAttribute("data-fixture-id") ?? null,
      paginationVersion: current.data.paginationVersion, savedAt: Date.now() });
  }, [href, queryKey]);

  const run = useCallback(async (mode: Mode, checkpoint?: FeedCheckpoint) => {
    // The synchronous lock also handles two clicks before React paints disabled.
    if (request.current || !enabledRef.current || !mounted.current) return;
    const base = viewRef.current;
    if (mode === "append" && base.data.nextPage === null) return;
    const controller = new AbortController(); request.current = controller;
    const deadline = window.setTimeout(() => controller.abort(new DOMException("Refresh timed out.", "TimeoutError")), 30_000);
    if (mode !== "background") { setPhase(mode); setError(null); announce(mode === "restore" ? "restoring" : "loading"); }
    const applied = queryRef.current;
    const fetchPage = (page: number) => consumeRefresh(dispatch(refreshApi.endpoints.feed.initiate({ query: applied, today, page },
      { forceRefetch: true })), controller.signal);
    try {
      let next: LoadedFeed;
      if (mode === "append") {
        next = appendFeedPage(base, await fetchPage(base.data.nextPage!));
      } else {
        const pages: MatchFeedResponse[] = [], last = checkpoint?.lastPage ?? base.lastPage;
        for (let page = base.firstPage; page <= last; page++) {
          const received = await fetchPage(page);
          pages.push(received);
          // Validate every boundary while accumulating, before committing anything.
          replaceFeedPages(base, pages);
          if (received.nextPage === null) break;
        }
        next = replaceFeedPages(base, pages);
      }
      if (controller.signal.aborted || !mounted.current || !enabledRef.current) return;
      acceptRun(base.data.run, next.data.run, getReportingDate(utcInstantFromEpochMilliseconds(next.data.asOf)));
      restored.current = true; retryCheckpoint.current = null;
      if (mode !== "background") focusTarget.current = { fixtureId: mode === "append" ? next.records[base.records.length]?.fixtureId ?? null : checkpoint?.focusFixtureId ?? null,
        ...(checkpoint ? { checkpoint } : {}) };
      viewRef.current = next; setView(next);
      if (checkpoint) announce(checkpoint.paginationVersion === next.data.paginationVersion ? "restored" : "refreshed", next);
      else if (mode !== "background") announce(mode === "append" ? "loaded" : "refreshed", next, next.records.length - base.records.length);
    } catch (cause) {
      if (!mounted.current || !enabledRef.current || controller.signal.aborted && controller.signal.reason?.name !== "TimeoutError") return;
      const code = cause instanceof FeedPaginationError ? cause.code : "unavailable";
      if (code === "subscription-required" || code === "changed") { router.refresh(); return; }
      if (mode === "background") return;
      failedMode.current = mode; retryCheckpoint.current = checkpoint ?? null; setError(code);
      focusTarget.current = { fixtureId: null, retry: true };
      announce(code === "stale-data" ? "changed" : code === "rate-limited" ? "busy" : "failed");
    } finally {
      clearTimeout(deadline);
      if (request.current === controller) { request.current = null; if (mounted.current) setPhase(null); }
    }
  }, [announce, dispatch, router, today]);

  useLayoutEffect(() => { queryRef.current = query; }, [query]);
  useLayoutEffect(() => {
    viewRef.current = view; enabledRef.current = enabled;
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const frame = requestAnimationFrame(() => {
      const article = target.fixtureId ? root.current?.querySelector<HTMLElement>(`[data-fixture-id="${CSS.escape(target.fixtureId)}"]`) : null;
      const focus = target.retry ? root.current?.querySelector<HTMLElement>("[data-pagination-retry]")
        : target.checkpoint ? article?.querySelector<HTMLElement>("[data-match-analysis-link]") ?? article?.querySelector<HTMLElement>("a") ?? root.current
        : article ?? root.current;
      focus?.focus({ preventScroll: true });
      if (target.checkpoint) window.scrollTo({ top: target.checkpoint.scrollY, behavior: "instant" });
      save();
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, error, save, view]);
  useEffect(() => { if (!enabled) request.current?.abort(); }, [enabled]);
  useEffect(() => {
    mounted.current = true;
    entryId.current = ensureFeedEntry(href);
    const checkpoint = restoreFeedCheckpoint(entryId.current, queryKey, href, data.page);
    restored.current = checkpoint === null;
    let active = true;
    const scrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    if (checkpoint) void Promise.resolve().then(() => { if (active) return run("restore", checkpoint); });
    const leaving = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          anchor.download || anchor.target && anchor.target !== "_self") return;
      const destination = new URL(anchor.href, location.href);
      if (destination.origin === location.origin && destination.pathname + destination.search !== location.pathname + location.search) save();
    };
    document.addEventListener("click", leaving, true);
    document.addEventListener("submit", save, true);
    window.addEventListener("pagehide", save);
    window.addEventListener("popstate", save);
    return () => {
      active = false; mounted.current = false; request.current?.abort();
      document.removeEventListener("click", leaving, true); document.removeEventListener("submit", save, true);
      window.removeEventListener("pagehide", save); window.removeEventListener("popstate", save);
      window.history.scrollRestoration = scrollRestoration;
    };
  }, [data.page, href, queryKey, run, save]);

  return { view, phase, error, root, refresh: useCallback(() => run("background"), [run]), retry: () => {
    const checkpoint = retryCheckpoint.current;
    return run(checkpoint ? "restore" : error === "changed" || error === "stale-data" ? "refresh" : failedMode.current, checkpoint ?? undefined);
  } };
}

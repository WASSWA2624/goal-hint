"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getReportingDate, utcInstantFromEpochMilliseconds, type ReportingDate } from "@/domain/calendar";
import { nextLoadedPage } from "@/domain/browse-period";
import { hashFeedContinuation, supportsFeedContinuation } from "@/domain/feed-continuation";
import { restoredLiveFeedSearch } from "@/domain/feed-live-search";
import type { FeedCheckpoint } from "@/domain/feed-navigation";
import { applyServerFeedPage, continueFeedPages, FeedPaginationError, initialLoadedFeed, observeFeedPage, replaceFeedPages, supportsFeedWindow, type LoadedFeed } from "@/domain/feed-pagination";
import { feedQueryHref, feedQueryKey, type FeedQuery } from "@/domain/feed-query";
import { feedRowNumber } from "@/domain/feed-presentation";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { createMessages } from "@/i18n/messages";
import { consumeRefresh, readRefreshFeedContinuation, readRefreshFeedPage, readRefreshFeedWindow, refreshApi } from "@/state/refresh-api";
import { useAppDispatch } from "@/state/hooks";
import { acceptRun, feedRefreshInterval, liveRefreshRules } from "@/domain/live-refresh";
import { startRequestDeadline } from "@/domain/request-deadline";
import { ensureFeedEntry, restoreFeedCheckpoint, saveFeedCheckpoint } from "./feed-restoration";

type Mode = "append" | "refresh" | "restore" | "background";
type FeedWork = { controller: AbortController; mode: Mode; completion?: Promise<void> };
type Failure = { code: FeedPaginationError["code"]; mode: Exclude<Mode, "background"> };
type FocusTarget = { fixtureId: string | null; checkpoint?: FeedCheckpoint; retry?: boolean };
const continuationDeadlineMs = 40_000;

function waitForContinuation(delayMs: number, signal: AbortSignal, deadlineAt: number) {
  if (signal.aborted || Date.now() + delayMs >= deadlineAt) return Promise.resolve(false);
  return new Promise<boolean>(resolve => {
    const cancel = () => { window.clearTimeout(timer); resolve(false); };
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(true); }, delayMs);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export function useFeedPagination({ query, today, data, enabled, onStatus }: {
  query: FeedQuery; today: ReportingDate; data: MatchFeedResponse; enabled: boolean;
  onStatus: (href: string, message: string) => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const href = feedQueryHref(query, today), queryKey = feedQueryKey(query, today);
  const [view, setView] = useState(() => initialLoadedFeed(data));
  const [source, setSource] = useState({ href, data });
  const [phase, setPhase] = useState<Mode | null>(null), [failure, setFailure] = useState<Failure | null>(null);
  if (source.href !== href) {
    setSource({ href, data }); setView(initialLoadedFeed(data)); setPhase(null); setFailure(null);
  } else if (source.data !== data) {
    setSource({ href, data });
    const next = applyServerFeedPage(view, data);
    if (next !== view) setView(next);
  }
  // A refreshed server query with the same canonical href must not tear down the listeners below.
  const root = useRef<HTMLDivElement>(null), viewRef = useRef(view), enabledRef = useRef(enabled), queryRef = useRef(query);
  const mounted = useRef(false), request = useRef<FeedWork | null>(null), entryId = useRef<string | null>(null);
  const restored = useRef(true), retryCheckpoint = useRef<FeedCheckpoint | null>(null);
  const focusTarget = useRef<FocusTarget | null>(null);
  const backgroundPage = useRef<number | null>(null);
  const announce = useCallback((key: "loading" | "restoring" | "loaded" | "restored" | "refreshed" | "changed" | "failed" | "busy", loaded?: LoadedFeed, added = 0) => {
    const messages = createMessages(query.locale);
    const status = messages.text(`feed.pagination.${key}`, { shown: messages.number(loaded?.records.length ?? 0),
      total: messages.number(loaded?.data.total ?? 0), added: messages.number(added) });
    // Say when similar search results begin within the newly loaded records.
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
      paginationVersion: current.data.paginationVersion, createdAt: Date.now() });
  }, [href, queryKey]);
  const focusAndSave = useCallback((target: FocusTarget) => {
    const article = target.fixtureId ? root.current?.querySelector<HTMLElement>(`[data-fixture-id="${CSS.escape(target.fixtureId)}"]`) : null;
    const focus = target.retry ? root.current?.querySelector<HTMLElement>("[data-pagination-retry]")
      : target.checkpoint ? article?.querySelector<HTMLElement>("[data-match-analysis-link]") ?? article?.querySelector<HTMLElement>("a") ?? root.current
      : article ?? root.current;
    focus?.focus({ preventScroll: true });
    if (target.checkpoint) window.scrollTo({ top: target.checkpoint.scrollY, behavior: "instant" });
    save();
  }, [save]);

  const run = useCallback(async (mode: Mode, checkpoint?: FeedCheckpoint, rebaseAppend = false) => {
    if (!enabledRef.current || !mounted.current) return;
    const foreground = (phase: Exclude<Mode, "background">) => {
      setPhase(phase); setFailure(null);
      if (phase !== "append") announce(phase === "restore" ? "restoring" : "loading");
    };
    const pending = request.current;
    if (pending) {
      // A foreground action supersedes a passive observation. Further pulls and
      // passive ticks join the active request.
      if ((mode !== "append" && mode !== "refresh") || pending.mode !== "background") return pending.completion;
      pending.controller.abort();
    }
    const base = viewRef.current;
    if (mode === "append" && base.data.nextPage === null) return;
    const controller = new AbortController(), work: FeedWork = { controller, mode };
    request.current = work;
    const budget = mode === "append" ? continuationDeadlineMs : liveRefreshRules.timeoutMs;
    const deadlineAt = Date.now() + budget, clearDeadline = startRequestDeadline(controller, budget);
    if (mode !== "background") foreground(mode);
    const applied = queryRef.current;
    const verifyAccess = (observed: MatchFeedResponse) => {
      if (observed.access.tier !== base.data.access.tier || observed.access.signedIn !== base.data.access.signedIn) {
        throw new FeedPaginationError("subscription-required");
      }
    };
    const fetchPage = async (page: number) => {
      controller.signal.throwIfAborted();
      const observed = mode === "append"
        ? await readRefreshFeedPage(applied, today, page, controller.signal, budget)
        : await consumeRefresh(dispatch(refreshApi.endpoints.feed.initiate({ query: applied, today, page },
          { forceRefetch: true })), controller.signal);
      verifyAccess(observed);
      return observed;
    };
    const fetchWindow = async (firstPage: number, lastPage: number) => {
      controller.signal.throwIfAborted();
      const pages = await readRefreshFeedWindow(applied, today, firstPage, lastPage, controller.signal, budget);
      verifyAccess(pages[0]!);
      return pages;
    };
    work.completion = (async () => {
      try {
        const current = viewRef.current;
        let next: LoadedFeed;
        if (mode === "append") {
          const through = base.data.nextPage;
          const hash = through !== null && !rebaseAppend && globalThis.crypto?.subtle
            && supportsFeedContinuation(base.firstPage, through, applied.pageSize)
            ? await hashFeedContinuation(base.firstPage, base.records.map(({ fixtureId }) => fixtureId)) : null;
          next = await continueFeedPages(base, fetchPage, delay => waitForContinuation(delay, controller.signal, deadlineAt),
            { rebase: rebaseAppend, readWindow: through !== null && supportsFeedWindow(base.firstPage, through, applied.pageSize)
              ? () => fetchWindow(base.firstPage, through) : undefined, readContinuation: hash && through !== null ? async () => {
                controller.signal.throwIfAborted();
                const page = await readRefreshFeedContinuation(applied, today, through, { firstPage: base.firstPage, hash }, controller.signal, budget);
                verifyAccess(page);
                return page;
              } : undefined });
        } else if (mode === "background" && base.pages > 1) {
          backgroundPage.current = nextLoadedPage(backgroundPage.current, base.firstPage, base.lastPage);
          const page = await fetchPage(backgroundPage.current);
          if (controller.signal.aborted || !mounted.current || !enabledRef.current) return;
          next = observeFeedPage(viewRef.current, page);
        } else {
          const firstPage = checkpoint?.firstPage ?? base.firstPage;
          const lastPage = checkpoint?.lastPage ?? base.lastPage;
          let pages: readonly MatchFeedResponse[];
          if (supportsFeedWindow(firstPage, lastPage, applied.pageSize)) {
            pages = await fetchWindow(firstPage, lastPage);
          } else {
            const sequential = [await fetchPage(firstPage)];
            for (let page = firstPage + 1; page <= lastPage && sequential.at(-1)?.nextPage === page; page++) {
              sequential.push(await fetchPage(page));
            }
            pages = sequential;
          }
          if (controller.signal.aborted || !mounted.current || !enabledRef.current) return;
          next = replaceFeedPages({ ...viewRef.current, firstPage }, pages);
        }
        if (request.current !== work || controller.signal.aborted || !mounted.current || !enabledRef.current) return;
        if (mode === "append" && viewRef.current !== base) throw new FeedPaginationError("changed");
        acceptRun(current.data.run, next.data.run, getReportingDate(utcInstantFromEpochMilliseconds(next.data.asOf)));
        restored.current = true; retryCheckpoint.current = null;
        if (checkpoint) focusTarget.current = { fixtureId: checkpoint.focusFixtureId, checkpoint };
        viewRef.current = next; setView(next);
        if (mode === "append") {
          save();
          const added = Math.max(0, next.records.length - base.records.length);
          if (added > 0) announce("loaded", next, added);
          else announce("refreshed", next);
        } else if (checkpoint) announce(checkpoint.paginationVersion === next.data.paginationVersion ? "restored" : "refreshed", next);
        else if (work.mode === "refresh") announce("refreshed", next);
      } catch (cause) {
        if (request.current !== work || !mounted.current || !enabledRef.current ||
          controller.signal.aborted && controller.signal.reason?.name !== "TimeoutError") return;
        const code = cause instanceof FeedPaginationError ? cause.code : "unavailable";
        if (code === "subscription-required") { router.refresh(); return; }
        if (work.mode === "background") return;
        retryCheckpoint.current = checkpoint ?? null; setFailure({ code, mode: work.mode });
        if (checkpoint) focusTarget.current = { fixtureId: null, retry: true };
        announce(code === "changed" || code === "stale-data" ? "changed" : code === "rate-limited" ? "busy" : "failed");
      } finally {
        clearDeadline();
        if (request.current === work) { request.current = null; if (mounted.current && work.mode !== "background") setPhase(null); }
      }
    })();
    return work.completion;
  }, [announce, dispatch, router, save, today]);

  useLayoutEffect(() => { queryRef.current = query; }, [query]);
  useLayoutEffect(() => {
    request.current?.controller.abort(); request.current = null; retryCheckpoint.current = null; focusTarget.current = null;
    backgroundPage.current = null;
  }, [href]);
  useLayoutEffect(() => {
    viewRef.current = view; enabledRef.current = enabled;
    const target = focusTarget.current;
    if (!target) return;
    focusTarget.current = null;
    const frame = requestAnimationFrame(() => focusAndSave(target));
    return () => cancelAnimationFrame(frame);
  }, [enabled, failure, focusAndSave, view]);
  useEffect(() => { if (!enabled) request.current?.controller.abort(); }, [enabled]);
  useEffect(() => {
    // A shallow-search return can briefly have the old server seed. Keep the real entry's checkpoint until the search is restored.
    if (restoredLiveFeedSearch(window.location.pathname + window.location.search, queryRef.current, today) !== null) return;
    mounted.current = true;
    entryId.current = ensureFeedEntry(href);
    const previousCheckpoint = restoreFeedCheckpoint(entryId.current, queryKey, href, data.page);
    const checkpoint = previousCheckpoint?.firstPage === data.page ? previousCheckpoint : null;
    restored.current = checkpoint === null;
    let active = true;
    let frame: number | undefined;
    const scrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    if (checkpoint) {
      const { data: current, records } = viewRef.current;
      const now = Date.now(), age = now - current.asOf;
      // The same guest snapshot can be restored while an older observation is
      // checked. A changed or private snapshot still needs a foreground read.
      if (checkpoint.lastPage === viewRef.current.lastPage && !current.access.signedIn && current.access.tier === "free"
        && age >= 0 && current.paginationVersion !== null && current.paginationVersion === checkpoint.paginationVersion) {
        frame = requestAnimationFrame(() => {
          restored.current = true;
          focusAndSave({ fixtureId: checkpoint.focusFixtureId, checkpoint });
          announce("restored", viewRef.current);
          if (age >= feedRefreshInterval(current, records, now) && document.visibilityState === "visible" && navigator.onLine) {
            void run("background");
          }
        });
      } else void Promise.resolve().then(() => { if (active) return run("restore", checkpoint); });
    }
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
      active = false; mounted.current = false; request.current?.controller.abort();
      if (frame !== undefined) cancelAnimationFrame(frame);
      document.removeEventListener("click", leaving, true); document.removeEventListener("submit", save, true);
      window.removeEventListener("pagehide", save); window.removeEventListener("popstate", save);
      window.history.scrollRestoration = scrollRestoration;
    };
  }, [announce, data.page, focusAndSave, href, queryKey, run, save, today]);

  const error = failure?.code ?? null, appendError = failure?.mode === "append";
  return { view, phase, error: appendError ? null : error, root, appendError,
    showMore: () => run("append", undefined, appendError && (error === "changed" || error === "stale-data")),
    refresh: useCallback(() => run("background"), [run]), refreshInPlace: useCallback(() => run("refresh"), [run]), retry: () => {
    const checkpoint = retryCheckpoint.current;
      return run(checkpoint ? "restore" : error === "changed" || error === "stale-data" ? "refresh" : failure?.mode ?? "refresh", checkpoint ?? undefined);
  } };
}

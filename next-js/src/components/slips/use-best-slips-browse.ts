"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipsPageSearch, bestSlipsQueryRules, parseBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import { nextLoadedPage } from "@/domain/browse-period";
import { startRequestDeadline } from "@/domain/request-deadline";
import { acceptsSlipBrowseAccess, appendSlipPage, canRetainSlipBrowseSeed, isSlipBrowseUnavailable, isUnverifiedSlipBrowseSeed,
  nextSlipPageQuery, observeSlipPage, sameSlipBrowseQuery, slipBrowseWindow, type SlipBrowsePage } from "@/domain/slip-browse-window";
import { singleSlipPage } from "@/domain/slip-pagination";
import { shareUnchanged } from "@/domain/structural-sharing";

type Mode = "append" | "replace" | "refresh" | "background";
type Intent = { query: BestSlipsQuery; mode: Mode; revision: number; depth: number; pushHistory: boolean; scrollY?: number | undefined;
  initialResult?: Promise<SlipBrowsePage | null> | undefined };
type Failure = { mode: Mode; issue: "changed" | "access" | "limited" | "unavailable"; retryable: boolean };
const historyKey = "goalHintBestSlips";

function withoutSlipAccess(page: SlipBrowsePage, signedIn: boolean): SlipBrowsePage {
  return { ...page, state: "data-unavailable", slips: [], statistics: null,
    ...(page.summary ? { summary: { ...page.summary, statistics: null } } : {}),
    browse: { ...page.browse, total: null, bandTotal: null, hasMore: false, nextCursor: null },
    entitled: false, access: { tier: "free", signedIn } };
}

function historyPosition(state: Record<string, unknown> | null) {
  const value = state?.[historyKey] as { href?: unknown; depth?: unknown; scrollY?: unknown } | undefined;
  return value && value.href === window.location.pathname + window.location.search
    && typeof value.depth === "number" && Number.isInteger(value.depth) && value.depth > 1
    && value.depth <= bestSlipsQueryRules.maximumPage && typeof value.scrollY === "number" && Number.isFinite(value.scrollY)
    && value.scrollY >= 0 ? { depth: value.depth, scrollY: value.scrollY } : null;
}

function savePosition(depth: number) {
  if (depth > 1) window.history.replaceState({ ...window.history.state,
    [historyKey]: { href: window.location.pathname + window.location.search, depth, scrollY: window.scrollY } }, "");
}
async function waitForInitialResult(initial: Promise<SlipBrowsePage | null>, signal: AbortSignal) {
  signal.throwIfAborted();
  let cancel!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(initial).catch(() => null), aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/** Both slip collections share paging, pinned dates, cancellation and access-safe refreshes. */
export function useBestSlipsBrowse(input: SlipsBrowseResult, onAccessChanged: () => void, endpoint = "/api/best-slips",
  initialRead = false, initialResult?: Promise<SlipBrowsePage | null>) {
  const initial = useMemo(() => singleSlipPage(input), [input]);
  const startsInitialRead = initialRead || initialResult !== undefined;
  const [seed, setSeed] = useState(initial);
  const [pages, setPages] = useState<readonly SlipBrowsePage[]>(() => [initial]);
  const [intent, setIntent] = useState<Intent>(() => ({ query: initial.browse.query, mode: "refresh", revision: 0, depth: 1, pushHistory: false }));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState<Failure | null>(null);
  const latest = useRef(pages), lock = useRef<Mode | null>(null);
  const pending = useRef<AbortController | null>(null);
  const backgroundPage = useRef<number | null>(null);
  const restoreScroll = useRef<number | undefined>(undefined);
  const retryAfter = useRef(0);
  const lastPassiveRead = useRef(0);
  const rolloverAttempted = useRef<SlipBrowsePage["day"] | null>(null);
  if (seed !== initial) {
    const retained = canRetainSlipBrowseSeed(pages, initial);
    setBusy(false);
    setFailed(retained && isSlipBrowseUnavailable(initial) ? {
      mode: "background", issue: initial.state === "rate-limited" ? "limited" : "unavailable", retryable: initial.state === "data-unavailable",
    } : null);
    setSeed(initial);
    if (!retained) setPages([initial]);
    else if (!isSlipBrowseUnavailable(initial)) setPages(observeSlipPage(pages, initial));
    setIntent({ query: initial.browse.query, mode: "refresh", revision: 0, depth: 1, pushHistory: false });
  }
  const accepted = useMemo(() => slipBrowseWindow(pages), [pages]);
  useLayoutEffect(() => {
    latest.current = pages;
    if (restoreScroll.current !== undefined) {
      window.scrollTo({ top: restoreScroll.current, behavior: "instant" });
      restoreScroll.current = undefined;
    }
  }, [pages]);
  useEffect(() => {
    if (intent.revision === 0) return;
    if (intent.mode === "background" && (document.visibilityState !== "visible" || !navigator.onLine)) { lock.current = null; return; }
    const controller = new AbortController(); let active = true; lock.current = intent.mode; pending.current = controller;
    const clearDeadline = startRequestDeadline(controller, 30_000);
    const clearAccess = (signedIn: boolean) => {
      setPages(([first]) => [withoutSlipAccess(first ?? initial, signedIn)]);
      onAccessChanged();
    };
    const verify = (result: SlipsBrowseResult, query: BestSlipsQuery): SlipBrowsePage => {
      if (!active || controller.signal.aborted) throw new Error("aborted");
      if (result && isSlipBrowseUnavailable(result)) throw new Error(result.state === "rate-limited" ? "limited" : "unavailable");
      if (!result?.browse || !Array.isArray(result.slips)
        || result.slips.length > result.browse.pageSize
        || !sameSlipBrowseQuery(result.browse.query, query)) throw new Error("changed");
      if (result.day !== initial.day) {
        if (rolloverAttempted.current !== initial.day) { rolloverAttempted.current = initial.day; onAccessChanged(); }
        throw new Error("changed");
      }
      const current = latest.current[0]!;
      if (!acceptsSlipBrowseAccess(current, result)) {
        if (current.entitled && !result.entitled || current.access?.signedIn && !result.access?.signedIn) clearAccess(result.access?.signedIn ?? false);
        else if (!isUnverifiedSlipBrowseSeed(current)) onAccessChanged();
        throw new Error("access");
      }
      return { ...result, browse: result.browse };
    };
    const read = async (query: BestSlipsQuery): Promise<SlipBrowsePage> => {
      const response = await fetch(`${endpoint}?${serializeBestSlipsQuery(query)}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (!active || controller.signal.aborted) throw new Error("aborted");
      if (response.status === 401 || response.status === 403) {
        if (!isUnverifiedSlipBrowseSeed(latest.current[0]!)) clearAccess(false);
        throw new Error("access");
      }
      if (response.status === 429) {
        const value = response.headers.get("retry-after");
        const delay = value && (/^\d+$/u.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now());
        retryAfter.current = Date.now() + (typeof delay === "number" && Number.isFinite(delay) ? Math.max(0, delay) : 60_000);
        throw new Error("limited");
      }
      if (!response.ok) throw new Error([502, 503, 504].includes(response.status) ? "unavailable" : "response");
      return verify(await response.json(), query);
    };
    void (async () => {
      let next: readonly SlipBrowsePage[];
      if (intent.mode === "append" && intent.depth === 0) {
        next = appendSlipPage(latest.current, await read(intent.query));
      } else if (intent.mode === "background") {
        next = observeSlipPage(latest.current, await read(intent.query));
      } else {
        const first = intent.initialResult ? await waitForInitialResult(intent.initialResult, controller.signal) : null;
        next = [first && first.state !== "data-unavailable" ? verify(first, intent.query) : await read(intent.query)];
        let query: BestSlipsQuery | null;
        while (next.length < intent.depth && (query = nextSlipPageQuery(next.at(-1)!))) {
          next = appendSlipPage(next, await read(query));
        }
        next = shareUnchanged(latest.current, next);
      }
      if (!active || controller.signal.aborted) return;
      if (intent.pushHistory) {
        const search = bestSlipsPageSearch(intent.query);
        if (search !== window.location.search) window.history.pushState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      }
      if (intent.mode === "append") savePosition(next.length);
      restoreScroll.current = intent.scrollY;
      setPages(intent.scrollY === undefined ? next : [...next]);
      setFailed(null);
    })().catch((cause: unknown) => {
      if (!active || pending.current !== controller) return;
      const message = cause instanceof Error ? cause.message : "";
      const issue = message === "changed" || message === "access" || message === "limited" ? message : "unavailable";
      setFailed({ mode: intent.mode, issue, retryable: message === "unavailable" || controller.signal.aborted || cause instanceof TypeError });
    }).finally(() => {
      clearDeadline();
      if (pending.current === controller) { pending.current = null; lock.current = null; if (active) setBusy(false); }
    });
    return () => {
      active = false; clearDeadline(); controller.abort();
      if (pending.current === controller) { pending.current = null; lock.current = null; }
    };
  }, [endpoint, initial, intent, onAccessChanged]);
  const request = useCallback((query: BestSlipsQuery, mode: Mode,
    { depth, pushHistory, scrollY, initialResult }: Pick<Intent, "depth" | "pushHistory" | "scrollY" | "initialResult">) => {
    const now = Date.now();
    if (lock.current || now < retryAfter.current || mode === "background" && now - lastPassiveRead.current < 5_000) return;
    if (mode === "background") lastPassiveRead.current = now;
    lock.current = mode; setBusy(mode !== "background");
    if (mode !== "background") setFailed(null);
    setIntent((current) => ({ query, mode, depth, pushHistory, scrollY, initialResult, revision: current.revision + 1 }));
  }, []);
  const cancel = useCallback(() => {
    pending.current?.abort(); pending.current = null; lock.current = null; restoreScroll.current = undefined;
  }, []);
  useEffect(() => {
    if (startsInitialRead || initial.state !== "data-unavailable") return;
    // A route render that couldn't read an archive gets one quiet client attempt.
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && navigator.onLine && sameSlipBrowseQuery(latest.current[0]!.browse.query, initial.browse.query)) {
        request(initial.browse.query, "background", { depth: 1, pushHistory: false });
      }
    }, 1_000 + Math.random() * 1_000);
    return () => window.clearTimeout(timer);
  }, [initial, request, startsInitialRead]);
  const initialRequest = startsInitialRead ? initial : null;
  useEffect(() => {
    const available = () => document.visibilityState === "visible" && navigator.onLine;
    const resume = () => {
      if (!available()) { if (lock.current === "background") cancel(); return; }
      if (failed && (failed.mode !== "background" || !failed.retryable)) return;
      const first = latest.current[0]!;
      if (first.state !== "rate-limited" && (first.entitled || first.browse.query.period !== "all" || failed || first.state === "data-unavailable")) {
        request(first.browse.query, "background", { depth: 1, pushHistory: false });
      }
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
    const timer = setInterval(() => {
      const pages = latest.current, first = pages[0]!.browse.query;
      if (!failed && first.period !== "all" && !lock.current && available()) {
        const page = nextLoadedPage(backgroundPage.current, first.page, pages.at(-1)!.browse.query.page);
        backgroundPage.current = page;
        request(pages[page - first.page]!.browse.query, "background", { depth: 1, pushHistory: false });
      }
    }, 60_000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    window.addEventListener("pageshow", restored);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
      window.removeEventListener("pageshow", restored);
    };
  }, [cancel, failed, request]);
  const change = useCallback((query: BestSlipsQuery) => {
    if (sameSlipBrowseQuery(query, latest.current[0]!.browse.query)) return;
    savePosition(latest.current.length);
    cancel();
    backgroundPage.current = null;
    request(query, "replace", { depth: 1, pushHistory: true });
  }, [cancel, request]);
  useEffect(() => {
    const pathname = window.location.pathname;
    function restore(state: Record<string, unknown> | null, seed?: Promise<SlipBrowsePage | null>) {
      let query: BestSlipsQuery;
      try { query = parseBestSlipsQuery(new URLSearchParams(window.location.search), initial.day); }
      catch { onAccessChanged(); return; }
      const position = historyPosition(state);
      const initialResult = seed && initialRequest && sameSlipBrowseQuery(query, initialRequest.browse.query) ? seed : undefined;
      cancel(); backgroundPage.current = null; request(query, "replace", { depth: 1, pushHistory: false, ...position, initialResult });
    }
    function onPopState(event: PopStateEvent) { if (window.location.pathname === pathname) restore(event.state); }
    const restoresWindow = historyPosition(window.history.state) && latest.current.length === 1;
    if (restoresWindow) restore(window.history.state, initialResult);
    if (initialRequest && !restoresWindow) {
      const current = latest.current[0]!;
      if (isUnverifiedSlipBrowseSeed(current) && sameSlipBrowseQuery(current.browse.query, initialRequest.browse.query)) {
        request(initialRequest.browse.query, "refresh", { depth: 1, pushHistory: false, initialResult });
      }
    }
    const leaving = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link && !link.download && (!link.target || link.target === "_self") && link.href !== window.location.href) savePosition(latest.current.length);
    };
    document.addEventListener("click", leaving, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", leaving, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [cancel, initial.day, initialRequest, initialResult, onAccessChanged, request]);
  const showMore = () => {
    const query = nextSlipPageQuery(latest.current.at(-1)!);
    if (!query) return;
    if (lock.current === "background") cancel();
    if (failed?.mode === "append" && failed.issue === "changed") {
      request(latest.current[0]!.browse.query, "append", { depth: latest.current.length + 1, pushHistory: false });
    } else request(query, "append", { depth: 0, pushHistory: false });
  };
  const goToFirstPage = () => {
    const query = latest.current[0]!.browse.query;
    const { cursor, ...first } = query;
    void cursor;
    change({ ...first, page: 1 });
  };
  const revokeAccess = useCallback(() => {
    cancel(); setBusy(false);
    setPages(([first]) => [withoutSlipAccess(first ?? initial, first?.access?.signedIn ?? false)]);
    onAccessChanged();
  }, [cancel, initial, onAccessChanged]);
  const loadingMore = busy && intent.mode === "append";
  const initialLoading = accepted.state === "data-unavailable" && !failed && (startsInitialRead || busy);
  return { displayQuery: accepted.browse.query, change, goToFirstPage, showMore, loadingMore,
    hasMore: nextSlipPageQuery(pages.at(-1)!) !== null, appendError: failed?.mode === "append",
    readError: failed?.mode === "replace" || failed?.mode === "refresh" ? failed.issue : null,
    stale: failed?.mode === "background" && failed.issue !== "access" && !isSlipBrowseUnavailable(accepted),
    entitled: accepted.entitled === true, revokeAccess,
    result: accepted, initialLoading, updating: initialLoading || busy && !loadingMore,
    retry: () => {
      if (lock.current === "background") cancel();
      if (failed?.mode === "replace") request(intent.query, "replace", intent);
      else request(latest.current[0]!.browse.query, "refresh", { depth: latest.current.length, pushHistory: false });
    },
  };
}

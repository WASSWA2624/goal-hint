"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipsPageSearch, bestSlipsQueryRules, parseBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import { nextLoadedPage } from "@/domain/browse-period";
import { appendSlipPage, nextSlipPageQuery, observeSlipPage, sameSlipBrowseAccess, slipBrowseWindow, type SlipBrowsePage } from "@/domain/slip-browse-window";
import { singleSlipPage } from "@/domain/slip-pagination";
import { shareUnchanged } from "@/domain/structural-sharing";

type Mode = "append" | "replace" | "refresh" | "background";
type Intent = { query: BestSlipsQuery; mode: Mode; revision: number; depth: number; pushHistory: boolean; scrollY?: number | undefined };
type Failure = { mode: Mode; changed: boolean };
const historyKey = "goalHintBestSlips";

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
/** Both slip collections share paging, pinned dates, cancellation and access-safe refreshes. */
export function useBestSlipsBrowse(input: SlipsBrowseResult, onAccessChanged: () => void, endpoint = "/api/best-slips") {
  const initial = useMemo(() => singleSlipPage(input), [input]);
  const [seed, setSeed] = useState(initial);
  const [pages, setPages] = useState<readonly SlipBrowsePage[]>(() => [initial]);
  const [intent, setIntent] = useState<Intent>(() => ({ query: initial.browse.query, mode: "refresh", revision: 0, depth: 1, pushHistory: false }));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState<Failure | null>(null);
  const latest = useRef(pages), lock = useRef<Mode | null>(null);
  const pending = useRef<AbortController | null>(null);
  const backgroundPage = useRef<number | null>(null);
  const restoreScroll = useRef<number | undefined>(undefined);
  if (seed !== initial) {
    setBusy(false); setFailed(null); setSeed(initial);
    const first = pages[0]!;
    const retained = pages.length > 1 && initial.day === first.day && sameSlipBrowseAccess(first, initial)
      && serializeBestSlipsQuery(initial.browse.query).toString() === serializeBestSlipsQuery(first.browse.query).toString();
    if (!retained) setPages([initial]);
    setIntent({ query: initial.browse.query, mode: retained ? "background" : "refresh", revision: retained ? intent.revision + 1 : 0,
      depth: retained ? pages.length : 1, pushHistory: false });
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
    const controller = new AbortController(); let active = true; lock.current = intent.mode; pending.current = controller;
    const deadline = window.setTimeout(() => controller.abort(), 30_000);
    const clearAccess = (signedIn: boolean) => {
      setPages(([first]) => first ? [{ ...first, slips: [], entitled: false, access: { tier: "free", signedIn } }] : [initial]);
      onAccessChanged();
    };
    const read = async (query: BestSlipsQuery): Promise<SlipBrowsePage> => {
      const response = await fetch(`${endpoint}?${serializeBestSlipsQuery(query)}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (!active || controller.signal.aborted) throw new Error("aborted");
      if (response.status === 401 || response.status === 403) clearAccess(false);
      if (!response.ok) throw new Error("unavailable");
      const result: SlipsBrowseResult = await response.json();
      if (!active || controller.signal.aborted) throw new Error("aborted");
      if (result?.state === "data-unavailable" || result?.state === "rate-limited") throw new Error("unavailable");
      if (!result?.browse || !Array.isArray(result.slips)
        || result.slips.length > result.browse.pageSize
        || serializeBestSlipsQuery(result.browse.query).toString() !== serializeBestSlipsQuery(query).toString()) throw new Error("changed");
      if (result.day !== initial.day) { onAccessChanged(); throw new Error("changed"); }
      const current = latest.current[0]!;
      if (!sameSlipBrowseAccess(current, result)) {
        if (current.entitled && !result.entitled || current.access?.signedIn && !result.access?.signedIn) clearAccess(result.access?.signedIn ?? false);
        else onAccessChanged();
        throw new Error("access");
      }
      return { ...result, browse: result.browse };
    };
    void (async () => {
      let next: readonly SlipBrowsePage[];
      if (intent.mode === "append" && intent.depth === 0) {
        next = appendSlipPage(latest.current, await read(intent.query));
      } else if (intent.mode === "background") {
        const observed = await read(intent.query);
        next = latest.current.length === 1 ? shareUnchanged(latest.current, [observed]) : observeSlipPage(latest.current, observed);
      } else {
        next = [await read(intent.query)];
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
    })().catch((cause: unknown) => {
      if (active && pending.current === controller && intent.mode !== "background") {
        setFailed({ mode: intent.mode, changed: cause instanceof Error && cause.message === "changed" });
        // History traversal already moved the address. Let the server render that address after a failed client read.
        if (intent.mode === "replace" && !intent.pushHistory) onAccessChanged();
      }
    }).finally(() => {
      clearTimeout(deadline);
      if (pending.current === controller) { pending.current = null; lock.current = null; if (active) setBusy(false); }
    });
    return () => {
      active = false; clearTimeout(deadline); controller.abort();
      if (pending.current === controller) { pending.current = null; lock.current = null; }
    };
  }, [endpoint, initial, intent, onAccessChanged]);
  const request = useCallback((query: BestSlipsQuery, mode: Mode, { depth, pushHistory, scrollY }: Pick<Intent, "depth" | "pushHistory" | "scrollY">) => {
    if (lock.current) return;
    lock.current = mode; setBusy(mode !== "background");
    if (mode !== "background") setFailed(null);
    setIntent((current) => ({ query, mode, depth, pushHistory, scrollY, revision: current.revision + 1 }));
  }, []);
  useEffect(() => {
    if (failed) return;
    const timer = setInterval(() => {
      const pages = latest.current, first = pages[0]!.browse.query;
      if (first.period !== "all" && !lock.current && document.visibilityState === "visible" && navigator.onLine) {
        const page = nextLoadedPage(backgroundPage.current, first.page, pages.at(-1)!.browse.query.page);
        backgroundPage.current = page;
        request(pages[page - first.page]!.browse.query, "background", { depth: 1, pushHistory: false });
      }
    }, 60_000);
    return () => clearInterval(timer);
  }, [failed, request]);
  const cancel = useCallback(() => {
    pending.current?.abort(); pending.current = null; lock.current = null; restoreScroll.current = undefined;
  }, []);
  const change = useCallback((query: BestSlipsQuery) => {
    if (serializeBestSlipsQuery(query).toString() === serializeBestSlipsQuery(latest.current[0]!.browse.query).toString()) return;
    savePosition(latest.current.length);
    cancel();
    backgroundPage.current = null;
    request(query, "replace", { depth: 1, pushHistory: true });
  }, [cancel, request]);
  useEffect(() => {
    const pathname = window.location.pathname;
    function restore(state: Record<string, unknown> | null) {
      let query: BestSlipsQuery;
      try { query = parseBestSlipsQuery(new URLSearchParams(window.location.search), initial.day); }
      catch { onAccessChanged(); return; }
      const position = historyPosition(state);
      cancel(); backgroundPage.current = null; request(query, "replace", { depth: 1, pushHistory: false, ...position });
    }
    function onPopState(event: PopStateEvent) { if (window.location.pathname === pathname) restore(event.state); }
    if (historyPosition(window.history.state) && latest.current.length === 1) restore(window.history.state);
    const leaving = (event: MouseEvent) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link && !link.download && (!link.target || link.target === "_self") && link.href !== window.location.href) savePosition(latest.current.length);
    };
    document.addEventListener("click", leaving, true);
    window.addEventListener("popstate", onPopState);
    return () => { document.removeEventListener("click", leaving, true); window.removeEventListener("popstate", onPopState); };
  }, [cancel, initial.day, onAccessChanged, request]);
  const showMore = () => {
    const query = nextSlipPageQuery(latest.current.at(-1)!);
    if (!query) return;
    if (lock.current === "background") cancel();
    if (failed?.mode === "append" && failed.changed) {
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
    setPages(([first]) => first ? [{ ...first, slips: [], entitled: false,
      access: { tier: "free", signedIn: first.access?.signedIn ?? false } }] : [initial]);
    onAccessChanged();
  }, [cancel, initial, onAccessChanged]);
  const loadingMore = busy && intent.mode === "append";
  return { displayQuery: accepted.browse.query, change, goToFirstPage, showMore, loadingMore,
    hasMore: nextSlipPageQuery(pages.at(-1)!) !== null, appendError: failed?.mode === "append",
    entitled: accepted.entitled === true, revokeAccess,
    result: accepted, updating: busy && !loadingMore,
    retry: () => {
      if (lock.current === "background") cancel();
      request(intent.query, intent.mode === "replace" ? "replace" : "refresh", intent);
    },
  };
}

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReportingDate } from "@/domain/calendar";
import { liveFeedSearchQuery, restoredLiveFeedSearch } from "@/domain/feed-live-search";
import { FeedPaginationError } from "@/domain/feed-pagination";
import { feedQueryHref, type FeedQuery } from "@/domain/feed-query";
import type { MatchFeedResponse } from "@/domain/match-feed";
import { useAppDispatch } from "@/state/hooks";
import { consumeRefresh, refreshApi } from "@/state/refresh-api";

type AcceptedSearch = Readonly<{ query: FeedQuery; data: MatchFeedResponse; href: string; replaceFrom: string | null }>;
type SearchError = "rate-limited" | "unavailable";
type SearchState = Readonly<{ scope: string; text: string; accepted: AcceptedSearch | null; pending: boolean; error: SearchError | null }>;
type SearchWork = { search: string; href: string; controller: AbortController; start?: () => void; timer?: number; deadline?: number };

const initialSearch = (scope: string, text: string): SearchState => ({ scope, text, accepted: null, pending: false, error: null });
const browserHref = () => window.location.pathname + window.location.search;

/** Keep a live list overlay within one server-owned filter, calendar and access scope. */
export function useLiveFeedSearch({ query, today, data, suspended, navigate, refresh }: {
  query: FeedQuery; today: ReportingDate; data: MatchFeedResponse | null; suspended: boolean;
  navigate: (next: FeedQuery) => void; refresh: () => void;
}) {
  const dispatch = useAppDispatch();
  const scope = `${feedQueryHref(query, today)}:${today}:${data?.access.tier}:${data?.access.signedIn}`;
  const [state, setState] = useState(() => initialSearch(scope, query.search));
  const current = state.scope === scope ? state : initialSearch(scope, query.search);
  if (state !== current) setState(current);
  const latest = useRef({ scope, query, today, data, suspended, navigate, refresh, accepted: current.accepted });
  useLayoutEffect(() => {
    latest.current = { scope, query, today, data, suspended, navigate, refresh, accepted: current.accepted };
  }, [scope, query, today, data, suspended, navigate, refresh, current.accepted]);
  useLayoutEffect(() => {
    const accepted = current.accepted;
    if (!accepted || accepted.replaceFrom !== browserHref() || accepted.href === accepted.replaceFrom) return;
    // App Router's History API integration retains its current tree and synchronizes the canonical URL for Back and refresh.
    try { window.history.replaceState(null, "", accepted.href); } catch { /* The accepted list remains usable. */ }
  }, [current.accepted]);
  const work = useRef<SearchWork | null>(null);
  const stopWork = useCallback(() => {
    const previous = work.current;
    if (!previous) return;
    work.current = null;
    window.clearTimeout(previous.timer);
    window.clearTimeout(previous.deadline);
    previous.controller.abort();
  }, []);
  useLayoutEffect(() => stopWork, [scope, stopWork]);
  const cancel = useCallback(() => {
    stopWork();
    setState(previous => previous.pending || previous.error ? { ...previous, pending: false, error: null } : previous);
  }, [stopWork]);
  const edit = useCallback((text: string) => {
    stopWork();
    setState(previous => ({ ...previous, text, pending: false, error: null }));
  }, [stopWork]);
  const reset = useCallback(() => {
    stopWork();
    const base = latest.current;
    base.accepted = null;
    setState(initialSearch(base.scope, base.query.search));
  }, [stopWork]);

  const search = useCallback((text: string, immediate = false, restore = false) => {
    const base = latest.current;
    const update = (values: Partial<SearchState>) => setState(previous => previous.scope === base.scope ? { ...previous, ...values } : previous);
    let next: FeedQuery;
    try { next = liveFeedSearchQuery(base.query, text); }
    catch { stopWork(); update({ text, pending: false, error: "unavailable" }); return; }
    const running = work.current, href = browserHref();
    if (!base.suspended && running?.search === next.search && (!restore || running.href === href)) {
      update({ text });
      if (immediate) running.start?.();
      return;
    }
    stopWork();
    const applied = base.accepted?.query ?? base.query;
    if (base.suspended || !restore && next.search === applied.search && (!immediate || applied.page === 1)) {
      update({ text, pending: false, error: null });
      return;
    }
    if (!base.data) {
      update({ text, pending: false, error: null });
      if (immediate && !restore) base.navigate(next);
      return;
    }
    const { access } = base.data;
    const operation: SearchWork = { search: next.search, href, controller: new AbortController() };
    const appliedHref = base.accepted?.href;
    work.current = operation;
    update({ text, pending: true, error: null });
    const active = () => work.current === operation && latest.current.scope === base.scope && !latest.current.suspended &&
      (browserHref() === href || browserHref() === appliedHref);
    const run = async () => {
      if (!active()) { if (work.current === operation) { stopWork(); update({ pending: false }); } return; }
      const { signal } = operation.controller;
      operation.deadline = window.setTimeout(() => operation.controller.abort(new DOMException("Search timed out.", "TimeoutError")), 30_000);
      try {
        // Cancel only this consumer. A same-query restore can attach before the shared request settles.
        const result = await consumeRefresh(dispatch(refreshApi.endpoints.feed.initiate({ query: next, today: base.today, page: 1 },
          { forceRefetch: true })), signal);
        if (!active() || signal.aborted) return;
        if (result.today !== base.today || result.access.tier !== access.tier || result.access.signedIn !== access.signedIn) {
          base.refresh();
          return;
        }
        const accepted = { query: next, data: result, href: feedQueryHref(next, base.today), replaceFrom: restore ? null : browserHref() };
        latest.current.accepted = accepted;
        update({ accepted, error: null });
      } catch (cause) {
        if (!active() || signal.aborted && signal.reason?.name !== "TimeoutError") return;
        const code = cause instanceof FeedPaginationError ? cause.code : "unavailable";
        if (code === "subscription-required" || code === "changed") base.refresh();
        else update({ error: code === "rate-limited" ? code : "unavailable" });
      } finally {
        window.clearTimeout(operation.deadline);
        if (work.current === operation) { work.current = null; update({ pending: false }); }
      }
    };
    if (immediate || next.search === "") void run();
    else {
      operation.start = () => {
        window.clearTimeout(operation.timer);
        delete operation.start;
        void run();
      };
      operation.timer = window.setTimeout(operation.start, 300);
    }
  }, [dispatch, stopWork]);

  useEffect(() => {
    const restore = () => {
      const base = latest.current;
      const text = restoredLiveFeedSearch(browserHref(), base.query, base.today);
      if (text === null) reset();
      else search(text, true, true);
    };
    const leaving = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
          anchor.download || anchor.target && anchor.target !== "_self") return;
      const target = new URL(anchor.href, window.location.href);
      if (target.pathname + target.search !== browserHref() || target.origin !== window.location.origin) cancel();
    };
    restore();
    document.addEventListener("click", leaving, true);
    window.addEventListener("popstate", restore);
    window.addEventListener("pagehide", cancel);
    return () => {
      document.removeEventListener("click", leaving, true);
      window.removeEventListener("popstate", restore);
      window.removeEventListener("pagehide", cancel);
    };
  }, [cancel, reset, scope, search]);

  return { ...current, search, cancel, edit, reset };
}

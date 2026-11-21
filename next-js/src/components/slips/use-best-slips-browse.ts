"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipsPageSearch, bestSlipsQueryRules, defaultBestSlipsQuery, parseBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import { shareUnchanged } from "@/domain/structural-sharing";

import { singleSlipPage } from "@/domain/slip-pagination";

type Intent = { query: BestSlipsQuery; mode: "replace" | "refresh" | "background"; revision: number; scroll: boolean; pushHistory: boolean };
/** Both slip collections share paging, pinned dates, cancellation and access-safe refreshes. */
export function useBestSlipsBrowse(input: SlipsBrowseResult, onAccessChanged: () => void, endpoint = "/api/best-slips") {
  const initial = useMemo(() => singleSlipPage(input), [input]);
  const [seed, setSeed] = useState(initial);
  const [content, setContent] = useState(initial);
  const [intent, setIntent] = useState<Intent>(() => ({ query: initial.browse.query, mode: "refresh", revision: 0, scroll: false, pushHistory: false }));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null), latest = useRef(content), lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  if (seed !== initial) {
    setBusy(false); setFailed(false); setSeed(initial); setContent(initial);
    setIntent({ query: initial.browse.query, mode: "refresh", revision: 0, scroll: false, pushHistory: false });
  }
  const accepted = seed === initial ? content : initial;
  useLayoutEffect(() => { latest.current = accepted; }, [accepted]);
  useEffect(() => {
    if (intent.revision === 0) return;
    const controller = new AbortController(); let active = true; lock.current = true; pending.current = controller;
    const deadline = window.setTimeout(() => controller.abort(), 30_000);
    const read = async (query: BestSlipsQuery) => {
      const response = await fetch(`${endpoint}?${serializeBestSlipsQuery(query)}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
      if (!active || controller.signal.aborted) throw new Error("aborted");
      if (response.status === 401 || response.status === 403) {
        setContent((current) => ({ ...current, slips: [], entitled: false, access: { tier: "free", signedIn: false } }));
        onAccessChanged();
      }
      if (!response.ok) throw new Error("unavailable");
      const result: SlipsBrowseResult = await response.json();
      if (!active || controller.signal.aborted) throw new Error("aborted");
      if (!result?.browse || !Array.isArray(result.slips) || result.state === "data-unavailable"
        || serializeBestSlipsQuery(result.browse.query).toString() !== serializeBestSlipsQuery(query).toString()) throw new Error("changed");
      if (result.day !== initial.day) { onAccessChanged(); throw new Error("changed"); }
      return { ...result, browse: result.browse };
    };
    void (async () => {
      const result = await read(intent.query);
      if (controller.signal.aborted) return;
      if (intent.pushHistory) {
        const search = bestSlipsPageSearch(intent.query);
        if (search !== window.location.search) window.history.pushState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
      }
      if (intent.mode === "replace" && intent.scroll) root.current?.scrollIntoView({ block: "start" });
      setContent((current) => shareUnchanged(current, result));
      if (result.entitled !== latest.current.entitled || result.access?.signedIn !== latest.current.access?.signedIn) onAccessChanged();
    })().catch(() => {
      if (active && pending.current === controller && intent.mode !== "background") {
        setFailed(true);
        // History traversal already moved the address. Let the server render that address after a failed client read.
        if (intent.mode === "replace" && !intent.pushHistory) onAccessChanged();
      }
    }).finally(() => {
      clearTimeout(deadline);
      if (pending.current === controller) { pending.current = null; lock.current = false; if (active) setBusy(false); }
    });
    return () => {
      active = false; clearTimeout(deadline); controller.abort();
      if (pending.current === controller) { pending.current = null; lock.current = false; }
    };
  }, [endpoint, initial.day, intent, onAccessChanged]);
  const request = useCallback((query: BestSlipsQuery, mode: Intent["mode"], scroll = false, pushHistory = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    if (mode !== "background") setFailed(false);
    setIntent((current) => ({ query, mode, scroll, pushHistory, revision: current.revision + 1 }));
  }, []);
  useEffect(() => {
    if (failed) return;
    const timer = setInterval(() => {
      if (latest.current.browse?.query.period !== "all" && !lock.current && document.visibilityState === "visible" && navigator.onLine) request(latest.current.browse?.query ?? defaultBestSlipsQuery(), "background");
    }, 60_000);
    return () => clearInterval(timer);
  }, [failed, request]);
  const cancel = useCallback(() => {
    pending.current?.abort(); pending.current = null; lock.current = false;
  }, []);
  const change = useCallback((query: BestSlipsQuery) => {
    cancel();
    request(query, "replace", false, true);
  }, [cancel, request]);
  useEffect(() => {
    function onPopState() {
      let query: BestSlipsQuery;
      try { query = parseBestSlipsQuery(new URLSearchParams(window.location.search), initial.day); }
      catch { onAccessChanged(); return; }
      cancel(); request(query, "replace");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [cancel, initial.day, onAccessChanged, request]);
  const goToPage = (page: number) => {
    const browse = latest.current.browse;
    if (!browse || browse.total == null || !Number.isSafeInteger(page) || page < 1
      || page > Math.min(bestSlipsQueryRules.maximumPage, Math.ceil(browse.total / bestSlipsQueryRules.pageSize))) return;
    cancel();
    request({ ...browse.query, page }, "replace", true, true);
  };
  const goToFirstPage = () => {
    const query = latest.current.browse?.query;
    if (!query) return;
    const { cursor, ...first } = query;
    void cursor;
    cancel(); request({ ...first, page: 1 }, "replace", true, true);
  };
  const goToOlder = () => {
    const browse = latest.current.browse;
    if (!browse?.nextCursor || browse.query.page >= bestSlipsQueryRules.maximumPage) return;
    cancel(); request({ ...browse.query, page: browse.query.page + 1, cursor: browse.nextCursor }, "replace", true, true);
  };
  const revokeAccess = useCallback(() => {
    cancel(); setBusy(false);
    setContent((current) => ({ ...current, slips: [], entitled: false,
      access: { tier: "free", signedIn: current.access?.signedIn ?? false } }));
    onAccessChanged();
  }, [cancel, onAccessChanged]);
  const applied = accepted.browse?.query ?? defaultBestSlipsQuery();
  return { root, displayQuery: applied, change, goToPage, goToFirstPage, goToOlder,
    entitled: accepted.entitled === true, revokeAccess,
    result: accepted, updating: busy && intent.mode !== "background", navigating: busy && intent.mode === "replace",
    retry: () => {
      if (intent.mode === "background") cancel();
      request(intent.query, intent.mode === "replace" ? "replace" : "refresh", intent.scroll, intent.pushHistory);
    },
  };
}

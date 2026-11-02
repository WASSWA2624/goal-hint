"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipsQueryRules, defaultBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import { appendSlipBrowse, slipBrowseScope } from "@/domain/slip-browse-window";

type Intent = { query: BestSlipsQuery; mode: "replace" | "append" | "refresh"; revision: number };
/** Both slip collections share paging, pinned dates, cancellation and access-safe refreshes. */
export function useBestSlipsBrowse(initial: SlipsBrowseResult, onAccessChanged: () => void, endpoint = "/api/best-slips") {
  const seedKey = `${initial.day}:${initial.entitled}:${initial.access?.signedIn}`;
  const [seed, setSeed] = useState(seedKey);
  const [content, setContent] = useState(initial);
  const [intent, setIntent] = useState<Intent>(() => ({ query: initial.browse?.query ?? defaultBestSlipsQuery(), mode: "refresh", revision: 0 }));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null), latest = useRef(content), lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const compensation = useRef<{ key: string; top: number } | null>(null);
  if (seed !== seedKey) {
    setBusy(false); setFailed(false); setSeed(seedKey); setContent(initial); setIntent({ query: initial.browse?.query ?? defaultBestSlipsQuery(), mode: "refresh", revision: 0 });
  }
  const accepted = seed === seedKey ? content : initial;
  useLayoutEffect(() => {
    latest.current = accepted;
    const anchor = compensation.current;
    if (anchor) {
      const element = root.current?.querySelector(`[data-slip-key="${CSS.escape(anchor.key)}"]`);
      if (element) window.scrollBy(0, element.getBoundingClientRect().top - anchor.top);
      compensation.current = null;
    }
  }, [accepted]);
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
      if (result.entitled !== latest.current.entitled || result.access?.signedIn !== latest.current.access?.signedIn) {
        setContent(result); onAccessChanged(); throw new Error("access-changed");
      }
      return result;
    };
    void (async () => {
      const previous = latest.current;
      let result: SlipsBrowseResult;
      if (intent.mode === "refresh" && previous.browse) {
        const first = previous.browse.firstPage ?? previous.browse.query.page;
        result = await read({ ...intent.query, page: first });
        for (let page = first + 1; page <= previous.browse.query.page; page++) result = appendSlipBrowse(result, await read({ ...intent.query, page }));
      } else {
        result = await read(intent.query);
        if (intent.mode === "append") {
          const anchor = [...(root.current?.querySelectorAll<HTMLElement>("[data-slip-key]") ?? [])]
            .find((element) => element.getBoundingClientRect().bottom > 0);
          if (anchor?.dataset.slipKey) compensation.current = { key: anchor.dataset.slipKey, top: anchor.getBoundingClientRect().top };
          result = appendSlipBrowse(previous, result);
        }
      }
      if (controller.signal.aborted) return;
      if (result.entitled !== previous.entitled || result.access?.signedIn !== previous.access?.signedIn) onAccessChanged();
      if (intent.mode === "replace") root.current?.scrollIntoView({ block: "start" });
      setContent(result);
    })().catch(() => { if (active) setFailed(true); }).finally(() => {
      clearTimeout(deadline); if (pending.current === controller) pending.current = null; if (active) { lock.current = false; setBusy(false); }
    });
    return () => { active = false; clearTimeout(deadline); controller.abort(); if (pending.current === controller) pending.current = null; lock.current = false; };
  }, [endpoint, initial.day, intent, onAccessChanged, seedKey]);
  const request = useCallback((query: BestSlipsQuery, mode: Intent["mode"]) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailed(false);
    setIntent((current) => ({ query, mode, revision: current.revision + 1 }));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (latest.current.browse?.query.period !== "all" && !lock.current && document.visibilityState === "visible" && navigator.onLine) request(latest.current.browse?.query ?? defaultBestSlipsQuery(), "refresh");
    }, 60_000);
    return () => clearInterval(timer);
  }, [request]);
  const change = useCallback((query: BestSlipsQuery) => {
    pending.current?.abort(); lock.current = false;
    request(query, "replace");
  }, [request]);
  const loadMore = useCallback(() => {
    const browse = latest.current.browse;
    if (!browse?.hasMore) return;
    request({ ...browse.query, page: browse.query.page + 1, ...(browse.nextCursor ? { cursor: browse.nextCursor } : {}) }, "append");
  }, [request]);
  const goToPage = (page: number) => {
    const browse = latest.current.browse;
    if (!browse || browse.total == null || !Number.isSafeInteger(page) || page < 1
      || page > Math.min(bestSlipsQueryRules.maximumPage, Math.ceil(browse.total / bestSlipsQueryRules.pageSize))) return;
    change({ ...browse.query, page });
  };
  const revokeAccess = useCallback(() => {
    pending.current?.abort(); lock.current = false; setBusy(false);
    setContent((current) => ({ ...current, slips: [], entitled: false,
      access: { tier: "free", signedIn: current.access?.signedIn ?? false } }));
    onAccessChanged();
  }, [onAccessChanged]);
  const applied = accepted.browse?.query ?? defaultBestSlipsQuery();
  return { root, query: intent.query, displayQuery: applied, change, goToPage, loadMore,
    entitled: accepted.entitled === true, revokeAccess, retained: slipBrowseScope(applied) !== slipBrowseScope(intent.query),
    result: accepted, loading: false, updating: busy, navigating: busy && intent.mode === "replace", failed,
    retry: () => request(intent.mode === "append" ? applied : intent.query, intent.mode === "append" ? "refresh" : intent.mode),
  };
}

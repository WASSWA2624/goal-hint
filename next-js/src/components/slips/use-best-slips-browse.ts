"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SlipsBrowseResult } from "@/domain/best-slips";
import { bestSlipsQueryRules, defaultBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import { slipBrowseScope } from "@/domain/slip-browse-window";
import { shareUnchanged } from "@/domain/structural-sharing";

import { singleSlipPage } from "@/domain/slip-pagination";

type Intent = { query: BestSlipsQuery; mode: "replace" | "refresh" | "background"; revision: number; scroll: boolean };
/** Both slip collections share paging, pinned dates, cancellation and access-safe refreshes. */
export function useBestSlipsBrowse(input: SlipsBrowseResult, onAccessChanged: () => void, endpoint = "/api/best-slips") {
  const initial = useMemo(() => singleSlipPage(input), [input]);
  const seedKey = `${initial.day}:${initial.entitled}:${initial.access?.signedIn}`;
  const [seed, setSeed] = useState(seedKey);
  const [content, setContent] = useState(initial);
  const [intent, setIntent] = useState<Intent>(() => ({ query: initial.browse?.query ?? defaultBestSlipsQuery(), mode: "refresh", revision: 0, scroll: false }));
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null), latest = useRef(content), lock = useRef(false);
  const pending = useRef<AbortController | null>(null);
  if (seed !== seedKey) {
    setBusy(false); setFailed(false); setSeed(seedKey); setContent(initial); setIntent({ query: initial.browse?.query ?? defaultBestSlipsQuery(), mode: "refresh", revision: 0, scroll: false });
  }
  const accepted = seed === seedKey ? content : initial;
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
      if (result.entitled !== latest.current.entitled || result.access?.signedIn !== latest.current.access?.signedIn) {
        setContent(result); onAccessChanged(); throw new Error("access-changed");
      }
      return result;
    };
    void (async () => {
      const result = await read(intent.query);
      if (controller.signal.aborted) return;
      if (intent.mode === "replace" && intent.scroll) root.current?.scrollIntoView({ block: "start" });
      setContent((current) => shareUnchanged(current, result));
    })().catch(() => {
      if (active && pending.current === controller && intent.mode !== "background") setFailed(true);
    }).finally(() => {
      clearTimeout(deadline);
      if (pending.current === controller) { pending.current = null; lock.current = false; if (active) setBusy(false); }
    });
    return () => {
      active = false; clearTimeout(deadline); controller.abort();
      if (pending.current === controller) { pending.current = null; lock.current = false; }
    };
  }, [endpoint, initial.day, intent, onAccessChanged, seedKey]);
  const request = useCallback((query: BestSlipsQuery, mode: Intent["mode"], scroll = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    if (mode !== "background") setFailed(false);
    setIntent((current) => ({ query, mode, scroll, revision: current.revision + 1 }));
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
    request(query, "replace");
  }, [cancel, request]);
  const goToPage = (page: number) => {
    const browse = latest.current.browse;
    if (!browse || browse.total == null || !Number.isSafeInteger(page) || page < 1
      || page > Math.min(bestSlipsQueryRules.maximumPage, Math.ceil(browse.total / bestSlipsQueryRules.pageSize))) return;
    cancel();
    request({ ...browse.query, page }, "replace", true);
  };
  const revokeAccess = useCallback(() => {
    cancel(); setBusy(false);
    setContent((current) => ({ ...current, slips: [], entitled: false,
      access: { tier: "free", signedIn: current.access?.signedIn ?? false } }));
    onAccessChanged();
  }, [cancel, onAccessChanged]);
  const applied = accepted.browse?.query ?? defaultBestSlipsQuery();
  return { root, query: intent.query, displayQuery: applied, change, goToPage,
    entitled: accepted.entitled === true, revokeAccess, retained: slipBrowseScope(applied) !== slipBrowseScope(intent.query),
    result: accepted, loading: false, updating: busy && intent.mode !== "background", navigating: busy && intent.mode === "replace", failed,
    retry: () => {
      if (intent.mode === "background") cancel();
      request(intent.query, intent.mode === "replace" ? "replace" : "refresh");
    },
  };
}

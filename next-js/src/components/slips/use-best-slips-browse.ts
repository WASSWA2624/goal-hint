"use client";

import { useCallback, useEffect, useState } from "react";
import type { BestSlipsResult } from "@/domain/best-slips";
import { bestSlipsQueryRules, defaultBestSlipsQuery, parseBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";
import { bestSlipsStatisticsMatch, findBestSlipsSnapshot, rememberBestSlipsSnapshot, type BestSlipsBrowseCache } from "@/domain/best-slips-client";

type ResponseState = Readonly<{
  source: BestSlipsResult; entitled: boolean; key: string; attempt: number; data: BestSlipsResult | null; failed: boolean;
}>;
type NavigationState = Readonly<{ entitled: boolean; desktop: boolean; query: BestSlipsQuery }>;

/** Both layouts page the daily view; date/result refinements remain desktop controls. */
export function useBestSlipsBrowse(initial: BestSlipsResult, desktop: boolean, onAccessChanged: () => void) {
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [observedAccess, setObservedAccess] = useState<Readonly<{ source: BestSlipsResult; entitled: boolean }> | null>(null);
  const initialEntitled = initial.entitled === true;
  // Keep the most recent access observation while a different filter request is loading.
  const entitled = observedAccess?.source === initial ? observedAccess.entitled : initialEntitled;
  const [cache, setCache] = useState<BestSlipsBrowseCache>(() => ({ source: initial, entitled, snapshots: [] }));
  if (cache.source !== initial || cache.entitled !== entitled) setCache({ source: initial, entitled, snapshots: [] });
  const [navigation, setNavigation] = useState<NavigationState>(() => ({ entitled, desktop, query: defaultBestSlipsQuery(entitled) }));
  // Access or layout changes restart from the viewer's daily default; pages still work on either layout.
  const navigationMatches = navigation.entitled === entitled && navigation.desktop === desktop;
  if (!navigationMatches) setNavigation({ entitled, desktop, query: defaultBestSlipsQuery(entitled) });
  const query = navigationMatches ? navigation.query : defaultBestSlipsQuery(entitled);
  const [attempt, setAttempt] = useState(0);
  const staleAccess = entitled !== initialEntitled;
  const refined = staleAccess || query.period !== defaultBestSlipsQuery(entitled).period || query.status !== "all" || query.page !== 1 || !!query.cursor;
  const key = serializeBestSlipsQuery(query).toString();
  const current = response?.source === initial && response.entitled === entitled && response.key === key && response.attempt === attempt ? response : null;
  const visible = !refined ? findBestSlipsSnapshot(cache, initial, entitled, query)
    ?? { data: initial, query: defaultBestSlipsQuery(entitled), retained: false }
    : current?.data ? { data: current.data, query, retained: false } : findBestSlipsSnapshot(cache, initial, entitled, query);
  const shouldRead = refined || attempt > 0 || visible?.retained === true;
  const requesting = shouldRead && !current;
  const revokeAccess = useCallback(() => {
    setObservedAccess({ source: initial, entitled: false });
    onAccessChanged();
  }, [initial, onAccessChanged]);

  useEffect(() => {
    if (!shouldRead) return;
    const requestedQuery = parseBestSlipsQuery(new URLSearchParams(key), initial.day);
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    const load = async () => {
      try {
        const request = await fetch(`/api/best-slips?${key}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
        if ((request.status === 401 || request.status === 403) && entitled && !disposed) revokeAccess();
        if (!request.ok) throw new Error("Slip filters unavailable.");
        const data: BestSlipsResult = await request.json();
        if (!data || !Array.isArray(data.slips) || !data.browse || typeof data.entitled !== "boolean" || data.state === "data-unavailable") throw new Error("Invalid slip response.");
        if (data.day !== initial.day) { if (!disposed) onAccessChanged(); throw new Error("Slip date changed."); }
        if (serializeBestSlipsQuery(data.browse.query).toString() !== key) throw new Error("Slip query changed.");
        if (controller.signal.aborted) throw new Error("Slip read timed out.");
        if (!disposed) {
          setResponse({ source: initial, entitled: data.entitled, key, attempt, data, failed: false });
          setCache((previous) => rememberBestSlipsSnapshot(previous, initial, requestedQuery, data));
          if (data.entitled !== entitled) {
            setObservedAccess({ source: initial, entitled: data.entitled });
            onAccessChanged();
          } else if (!refined && !bestSlipsStatisticsMatch(initial, data)) onAccessChanged();
        }
      } catch {
        if (!disposed) setResponse({ source: initial, entitled, key, attempt, data: null, failed: true });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [initial, entitled, key, refined, shouldRead, attempt, onAccessChanged, revokeAccess]);

  const change = useCallback((next: BestSlipsQuery) => {
    setNavigation({ entitled, desktop, query: next }); setAttempt((value) => value + 1);
  }, [entitled, desktop]);
  const goToPage = (page: number) => {
    const total = visible?.data.browse?.total;
    if (requesting || visible?.retained || total === null || total === undefined || !Number.isSafeInteger(page)
      || page < 1 || page > Math.min(bestSlipsQueryRules.maximumPage, Math.ceil(total / bestSlipsQueryRules.pageSize)) || page === query.page) return;
    change({ ...query, page });
  };

  return { query, change, goToPage,
    entitled, revokeAccess, displayQuery: visible?.query ?? query, retained: visible?.retained ?? false,
    result: visible?.data ?? null, loading: requesting && !visible, updating: requesting && !!visible,
    failed: shouldRead && current?.failed === true, retry: () => setAttempt((value) => value + 1) };
}

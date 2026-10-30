"use client";

import { useCallback, useEffect, useState } from "react";
import type { BestSlipsResult } from "@/domain/best-slips";
import { defaultBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";

type ResponseState = Readonly<{
  source: BestSlipsResult; key: string; attempt: number; data: BestSlipsResult | null; failed: boolean;
}>;
type NavigationState = Readonly<{ entitled: boolean; query: BestSlipsQuery; history: readonly BestSlipsQuery[] }>;

/** Desktop refinements use private reads; the original daily server result remains the phone and default view. */
export function useBestSlipsBrowse(initial: BestSlipsResult, enabled: boolean, onAccessChanged: () => void) {
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [observedAccess, setObservedAccess] = useState<Readonly<{ source: BestSlipsResult; entitled: boolean }> | null>(null);
  const initialEntitled = initial.entitled === true;
  // Keep the most recent access observation while a different filter request is loading.
  const entitled = observedAccess?.source === initial ? observedAccess.entitled : initialEntitled;
  const [navigation, setNavigation] = useState<NavigationState>(() => ({ entitled, query: defaultBestSlipsQuery(entitled), history: [] }));
  // A subscription change starts from that viewer's daily default, without retaining a previous member's navigation.
  if (navigation.entitled !== entitled) setNavigation({ entitled, query: defaultBestSlipsQuery(entitled), history: [] });
  const query = enabled && navigation.entitled === entitled ? navigation.query : defaultBestSlipsQuery(entitled);
  const history = enabled && navigation.entitled === entitled ? navigation.history : [];
  const [attempt, setAttempt] = useState(0);
  const staleAccess = entitled !== initialEntitled;
  const refined = staleAccess || enabled && (query.period !== defaultBestSlipsQuery(entitled).period || query.status !== "all" || query.page !== 1 || !!query.cursor);
  const key = serializeBestSlipsQuery(query).toString();
  const current = response?.source === initial && response.key === key && response.attempt === attempt ? response : null;

  useEffect(() => {
    if (!refined) return;
    const controller = new AbortController();
    let disposed = false;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    const load = async () => {
      try {
        const request = await fetch(`/api/best-slips?${key}`, { signal: controller.signal, cache: "no-store", credentials: "same-origin" });
        if (!request.ok) throw new Error("Slip filters unavailable.");
        const data: BestSlipsResult = await request.json();
        if (!data || !Array.isArray(data.slips) || !data.browse || typeof data.entitled !== "boolean" || data.state === "data-unavailable") throw new Error("Invalid slip response.");
        if (controller.signal.aborted) throw new Error("Slip read timed out.");
        if (!disposed) {
          setResponse({ source: initial, key, attempt, data, failed: false });
          if (data.entitled !== entitled) {
            setObservedAccess({ source: initial, entitled: data.entitled });
            onAccessChanged();
          }
        }
      } catch {
        if (!disposed) setResponse({ source: initial, key, attempt, data: null, failed: true });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [initial, entitled, key, refined, attempt, onAccessChanged]);

  const change = useCallback((next: BestSlipsQuery) => { setNavigation({ entitled, query: next, history: [] }); }, [entitled]);
  const next = () => {
    const browse = current?.data?.browse;
    if (!browse?.hasMore) return;
    setNavigation({ entitled, history: [...history, query],
      query: { ...query, page: query.page + 1, ...(browse.nextCursor ? { cursor: browse.nextCursor } : {}) } });
  };
  const previous = () => {
    const last = history.at(-1);
    if (!last) return;
    setNavigation({ entitled, history: history.slice(0, -1), query: last });
  };

  return { query, change, next, previous, canPrevious: history.length > 0,
    entitled,
    result: refined ? current?.data ?? null : initial, loading: refined && !current,
    failed: refined && current?.failed === true, retry: () => setAttempt((value) => value + 1) };
}

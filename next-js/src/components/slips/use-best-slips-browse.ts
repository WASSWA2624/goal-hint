"use client";

import { useCallback, useEffect, useState } from "react";
import type { BestSlipsResult } from "@/domain/best-slips";
import { defaultBestSlipsQuery, serializeBestSlipsQuery, type BestSlipsQuery } from "@/domain/best-slips-query";

type ResponseState = Readonly<{
  source: BestSlipsResult; key: string; attempt: number; data: BestSlipsResult | null; failed: boolean;
}>;

/** Desktop refinements use private reads; the original daily server result remains the phone and default view. */
export function useBestSlipsBrowse(initial: BestSlipsResult, enabled: boolean) {
  const [query, setQuery] = useState<BestSlipsQuery>(defaultBestSlipsQuery);
  const [history, setHistory] = useState<BestSlipsQuery[]>([]);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const refined = enabled && (query.period !== "today" || query.status !== "all" || query.page !== 1 || !!query.cursor);
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
        if (!data || !Array.isArray(data.slips) || !data.browse || data.state === "data-unavailable") throw new Error("Invalid slip response.");
        if (controller.signal.aborted) throw new Error("Slip read timed out.");
        if (!disposed) setResponse({ source: initial, key, attempt, data, failed: false });
      } catch {
        if (!disposed) setResponse({ source: initial, key, attempt, data: null, failed: true });
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [initial, key, refined, attempt]);

  const change = useCallback((next: BestSlipsQuery) => { setHistory([]); setQuery(next); }, []);
  const next = () => {
    const browse = current?.data?.browse;
    if (!browse?.hasMore) return;
    setHistory((previous) => [...previous, query]);
    setQuery({ ...query, page: query.page + 1, ...(browse.nextCursor ? { cursor: browse.nextCursor } : {}) });
  };
  const previous = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((items) => items.slice(0, -1)); setQuery(last);
  };

  return { query, change, next, previous, canPrevious: history.length > 0,
    result: refined ? current?.data ?? null : initial, loading: refined && !current,
    failed: refined && current?.failed === true, retry: () => setAttempt((value) => value + 1) };
}

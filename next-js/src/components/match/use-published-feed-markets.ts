"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalFeedMarketPicks, type FeedMarketPick } from "../../domain/feed-market-picks.ts";
import type { FeedStatus } from "../../domain/feed-query.ts";

type Catalog = { finishedOnly: boolean; marketPicks?: readonly FeedMarketPick[]; unavailable?: boolean };

function decodeCatalog(value: unknown): readonly FeedMarketPick[] {
  const picks = value && typeof value === "object" && "marketPicks" in value ? value.marketPicks : null;
  if (!Array.isArray(picks) || !picks.every((pick) => typeof pick === "string")) throw new Error("Invalid market catalog");
  const canonical = canonicalFeedMarketPicks(picks);
  if (!canonical) throw new Error("Invalid market catalog");
  return canonical;
}

/** Refresh exact published choices at each open so a stale entitlement cannot reopen a prior catalog. */
export function usePublishedFeedMarkets(finishedOnly: boolean) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, [finishedOnly]);

  const active = catalog?.finishedOnly === finishedOnly ? catalog : null;
  const openMarkets = useCallback((status: FeedStatus) => {
    if (finishedOnly && status !== "finished" || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setCatalog({ finishedOnly });
    const url = finishedOnly ? "/api/matches/markets?status=finished" : "/api/matches/markets";
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Market catalog unavailable");
        const marketPicks = decodeCatalog(await response.json());
        if (!controller.signal.aborted) setCatalog({ finishedOnly, marketPicks });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ finishedOnly, unavailable: true });
      })
      .finally(() => {
        if (request.current === controller) request.current = null;
      });
  }, [finishedOnly]);
  return { publishedMarkets: active?.marketPicks, marketsUnavailable: active?.unavailable, onMarketsOpen: openMarkets };
}

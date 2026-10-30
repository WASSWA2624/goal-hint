import type { BestSlipsResult } from "./best-slips.ts";
import { bestSlipsQueryRules, defaultBestSlipsQuery, resolveBestSlipsDates, serializeBestSlipsQuery, type BestSlipsQuery } from "./best-slips-query.ts";
import { slipStatusCategory } from "./slip-status.ts";

export type BestSlipsSnapshot = Readonly<{ query: BestSlipsQuery; data: BestSlipsResult }>;
export type BestSlipsBrowseCache = Readonly<{
  source: BestSlipsResult; entitled: boolean; snapshots: readonly BestSlipsSnapshot[];
}>;
const maximumSnapshots = 12;

export function bestSlipsStatisticsMatch(left: BestSlipsResult, right: BestSlipsResult): boolean {
  const a = left.statistics, b = right.statistics;
  if (!a || !b) return !a && !b;
  return (["total", "won", "lost", "pending", "void", "cancelled", "unavailable", "filteredOut"] as const)
    .every((key) => (a[key] ?? 0) === (b[key] ?? 0));
}

export function bestSlipsRangeKey(query: BestSlipsQuery, day: BestSlipsResult["day"]): string {
  const dates = resolveBestSlipsDates(query, day);
  return `${dates.from ?? "all"}:${dates.to ?? "all"}`;
}

/** Only a complete, unfiltered cohort can establish every result and its exact total locally. */
export function projectBestSlipsSnapshot(snapshot: BestSlipsSnapshot, query: BestSlipsQuery): BestSlipsSnapshot | null {
  const { data, query: original } = snapshot, browse = data.browse;
  if (data.state !== "generated" || original.status !== "all" || original.page !== 1 || original.cursor || query.cursor
    || original.period === "all" || query.period === "all" || !data.statistics || data.statistics.total !== data.slips.length
    || bestSlipsRangeKey(original, data.day) !== bestSlipsRangeKey(query, data.day)
    || browse && (browse.total === null || browse.total !== data.slips.length || browse.hasMore)) return null;
  const slips = data.slips.filter((view) => query.status === "all"
    || (view.status ? slipStatusCategory(view.status) : view.outcome ?? "pending") === query.status);
  const pageSize = bestSlipsQueryRules.pageSize, offset = (query.page - 1) * pageSize;
  return { query, data: { ...data, slips: slips.slice(offset, offset + pageSize),
    browse: { query, total: slips.length, pageSize, hasMore: offset + pageSize < slips.length, nextCursor: null,
      ...resolveBestSlipsDates(query, data.day) } } };
}

/** A bounded transient cache belongs to one server seed and one observed access tier. */
export function rememberBestSlipsSnapshot(cache: BestSlipsBrowseCache, source: BestSlipsResult,
  query: BestSlipsQuery, data: BestSlipsResult): BestSlipsBrowseCache {
  const entitled = data.entitled === true, key = serializeBestSlipsQuery(query).toString();
  if (data.day !== source.day) return cache;
  const previous = cache.source === source && cache.entitled === entitled ? cache.snapshots : [];
  return { source, entitled, snapshots: [{ query, data }, ...previous.filter((item) => serializeBestSlipsQuery(item.query).toString() !== key)]
    .slice(0, maximumSnapshots) };
}

/** Retained rows always carry their actual query; callers can label an unfinished change honestly. */
export function findBestSlipsSnapshot(cache: BestSlipsBrowseCache, source: BestSlipsResult, entitled: boolean,
  query: BestSlipsQuery): (BestSlipsSnapshot & Readonly<{ retained: boolean }>) | null {
  const snapshots = cache.source === source && cache.entitled === entitled ? cache.snapshots : [];
  const seed = source.entitled === entitled && source.state === "generated" ? [{
    query: source.browse?.query ?? defaultBestSlipsQuery(entitled), data: source,
  }] : [];
  const range = bestSlipsRangeKey(query, source.day), key = serializeBestSlipsQuery(query).toString();
  const candidates = [...snapshots, ...seed].filter((item) => item.data.day === source.day
    && bestSlipsRangeKey(item.query, source.day) === range);
  const latest = candidates[0];
  if (!latest) return null;
  for (const snapshot of candidates) {
    if (!bestSlipsStatisticsMatch(snapshot.data, latest.data)) continue;
    const projected = projectBestSlipsSnapshot(snapshot, query);
    if (projected) return { ...projected, retained: false };
    if (serializeBestSlipsQuery(snapshot.query).toString() === key) return { ...snapshot, retained: false };
  }
  return { ...latest, retained: true };
}

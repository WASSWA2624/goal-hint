import type { SlipsBrowseResult } from "./best-slips.ts";
import { bestSlipsQueryRules, bestSlipsRangeFields, resolveBestSlipsDates, serializeBestSlipsQuery, type BestSlipsQuery } from "./best-slips-query.ts";
import { slipStatusCategory } from "./slip-status.ts";
import { defaultBestSlipOddsBand } from "./best-slip-odds-bands.ts";
import { bestSlipActivePublicationDays } from "./best-slip-publication-hour.ts";

export type BestSlipsSnapshot = Readonly<{ query: BestSlipsQuery; data: SlipsBrowseResult }>;
export type BestSlipsBrowseCache = Readonly<{
  source: SlipsBrowseResult; entitled: boolean; snapshots: readonly BestSlipsSnapshot[];
}>;
const maximumSnapshots = 12;

export function bestSlipsStatisticsMatch(left: SlipsBrowseResult, right: SlipsBrowseResult): boolean {
  const a = left.statistics, b = right.statistics;
  if (!a || !b) return !a && !b;
  return (["total", "won", "lost", "pending", "void", "cancelled", "unavailable", "filteredOut"] as const)
    .every((key) => (a[key] ?? 0) === (b[key] ?? 0));
}

export function bestSlipsRangeKey(query: BestSlipsQuery, day: SlipsBrowseResult["day"], asOf?: number): string {
  const dates = resolveBestSlipsDates(query, day);
  const active = query.period === "today" && asOf !== undefined ? bestSlipActivePublicationDays(asOf) : [];
  return [active.length === 2 && active[1] === day ? "overlap" : "", dates.from ?? "all", dates.to ?? "all", query.oddsBand ?? defaultBestSlipOddsBand,
    ...bestSlipsRangeFields.map((field) => query[field] ?? "")].join(":");
}

/** Only a complete, unfiltered cohort can establish every result and its exact total locally. */
export function projectBestSlipsSnapshot(snapshot: BestSlipsSnapshot, query: BestSlipsQuery): BestSlipsSnapshot | null {
  const { data, query: original } = snapshot, browse = data.browse;
  if (original.summary !== query.summary || data.state !== "generated" || original.status !== "all" || original.page !== 1 || original.cursor || query.cursor
    || original.period === "all" || query.period === "all" || !data.statistics || data.statistics.total !== data.slips.length
    || bestSlipsRangeKey(original, data.day, data.summary?.asOf) !== bestSlipsRangeKey(query, data.day, data.summary?.asOf)
    || browse && (browse.total === null || browse.total !== data.slips.length || browse.hasMore)) return null;
  const slips = data.slips.filter((view) => query.status === "all"
    || (view.status ? slipStatusCategory(view.status) : view.outcome ?? "pending") === query.status);
  const pageSize = bestSlipsQueryRules.pageSize, offset = (query.page - 1) * pageSize;
  return { query, data: { ...data, slips: slips.slice(offset, offset + pageSize),
    browse: { query, total: slips.length, pageSize, hasMore: offset + pageSize < slips.length, nextCursor: null,
      ...(browse?.bandTotal !== undefined ? { bandTotal: browse.bandTotal } : {}),
      ...(browse?.dailyBandLimit !== undefined ? { dailyBandLimit: browse.dailyBandLimit } : {}),
      ...resolveBestSlipsDates(query, data.day) } } };
}

/** A bounded transient cache belongs to one server seed and one observed access tier. */
export function rememberBestSlipsSnapshot(cache: BestSlipsBrowseCache, source: SlipsBrowseResult,
  query: BestSlipsQuery, data: SlipsBrowseResult): BestSlipsBrowseCache {
  const entitled = data.entitled === true, key = serializeBestSlipsQuery(query).toString();
  if (data.day !== source.day) return cache;
  const previous = cache.source === source && cache.entitled === entitled ? cache.snapshots : [];
  return { source, entitled, snapshots: [{ query, data }, ...previous.filter((item) => serializeBestSlipsQuery(item.query).toString() !== key)]
    .slice(0, maximumSnapshots) };
}

/** Retained rows always carry their actual query; callers can label an unfinished change honestly. */
export function findBestSlipsSnapshot(cache: BestSlipsBrowseCache, source: SlipsBrowseResult, entitled: boolean,
  query: BestSlipsQuery): (BestSlipsSnapshot & Readonly<{ retained: boolean }>) | null {
  const snapshots = cache.source === source && cache.entitled === entitled ? cache.snapshots : [];
  const seed = source.entitled === entitled && source.state === "generated" ? [{
    query: source.browse?.query ?? { period: "today" as const, status: "all" as const, page: 1 }, data: source,
  }] : [];
  const asOf = [source, ...snapshots.map(({ data }) => data)].reduce<number | undefined>((latest, data) =>
    data.summary?.asOf === undefined ? latest : Math.max(latest ?? data.summary.asOf, data.summary.asOf), undefined);
  const range = bestSlipsRangeKey(query, source.day, asOf), key = serializeBestSlipsQuery(query).toString();
  const candidates = [...snapshots, ...seed].filter((item) => item.data.day === source.day
    && bestSlipsRangeKey(item.query, source.day, item.data.summary?.asOf ?? asOf) === range);
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

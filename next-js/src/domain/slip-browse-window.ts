import type { SlipsBrowseResult } from "./best-slips.ts";
import { bestSlipsQueryRules, serializeBestSlipsQuery, type BestSlipsQuery } from "./best-slips-query.ts";
import { shareUnchanged } from "./structural-sharing.ts";

export type SlipBrowsePage = SlipsBrowseResult & { browse: NonNullable<SlipsBrowseResult["browse"]> };

export const slipViewKey = (view: SlipsBrowseResult["slips"][number]) => view.id ?? view.slip?.id ?? `${view.publicationDay}:${view.rank}`;

export function nextSlipPageQuery({ browse }: SlipBrowsePage): BestSlipsQuery | null {
  const { query, total, hasMore, nextCursor } = browse;
  if (!hasMore || query.page >= bestSlipsQueryRules.maximumPage) return null;
  if (total === null) return nextCursor && nextCursor !== query.cursor ? { ...query, page: query.page + 1, cursor: nextCursor } : null;
  return { ...query, page: query.page + 1 };
}

export function sameSlipBrowseAccess(left: SlipsBrowseResult, right: SlipsBrowseResult) {
  return left.entitled === right.entitled && left.access?.tier === right.access?.tier && left.access?.signedIn === right.access?.signedIn;
}

export function isSlipBrowseUnavailable({ state }: SlipsBrowseResult) {
  return state === "data-unavailable" || state === "rate-limited";
}

export function sameSlipBrowseQuery(left: BestSlipsQuery, right: BestSlipsQuery) {
  return serializeBestSlipsQuery(left).toString() === serializeBestSlipsQuery(right).toString();
}

export function canRetainSlipBrowseSeed(pages: readonly SlipBrowsePage[], incoming: SlipBrowsePage) {
  const first = pages[0]!, last = pages.at(-1)!;
  return !isSlipBrowseUnavailable(first) && first.day === incoming.day && sameSlipBrowseAccess(first, incoming)
    && sameSlipBrowseQuery(first.browse.query, incoming.browse.query)
    && (isSlipBrowseUnavailable(incoming) || first.state === incoming.state
      && (pages.length > 1 || (incoming.summary?.asOf ?? -Infinity) < (last.summary?.asOf ?? -Infinity)));
}

export function appendSlipPage(pages: readonly SlipBrowsePage[], page: SlipBrowsePage): readonly SlipBrowsePage[] {
  const previous = pages.at(-1)!;
  const next = nextSlipPageQuery(previous);
  if (!next || page.day !== previous.day || !sameSlipBrowseAccess(previous, page)
    || !sameSlipBrowseQuery(next, page.browse.query)
    || previous.browse.total !== page.browse.total || previous.browse.version !== page.browse.version
    || previous.browse.pageSize !== page.browse.pageSize || page.slips.length > page.browse.pageSize) throw new Error("changed");
  const { total, pageSize, hasMore } = page.browse;
  if (total !== null && (page.slips.length !== Math.min(pageSize, Math.max(0, total - (next.page - 1) * pageSize))
    || hasMore !== (next.page * pageSize < total))) throw new Error("changed");

  const known = new Set(pages.flatMap(({ slips }) => slips.map(slipViewKey)));
  for (const slip of page.slips) {
    const key = slipViewKey(slip);
    if (known.has(key)) throw new Error("changed");
    known.add(key);
  }
  return [...pages, page];
}

export function slipBrowseWindow(pages: readonly SlipBrowsePage[]): SlipBrowsePage {
  const first = pages[0]!, last = pages.at(-1)!;
  if (first === last) return first;
  return { ...last, slips: pages.flatMap(({ slips }) => slips),
    browse: { ...last.browse, query: first.browse.query, firstPage: first.browse.query.page,
      from: last.browse.from, to: first.browse.to } };
}

/** A passive observation may refresh currently displayed slips and the period totals. */
export function observeSlipPage(pages: readonly SlipBrowsePage[], page: SlipBrowsePage): readonly SlipBrowsePage[] {
  const last = pages.at(-1)!;
  if (isSlipBrowseUnavailable(page) || !pages.some(previous => sameSlipBrowseQuery(previous.browse.query, page.browse.query))
    || !sameSlipBrowseAccess(last, page) || page.day !== last.day
    || !isSlipBrowseUnavailable(last) && (page.summary?.asOf ?? -Infinity) < (last.summary?.asOf ?? -Infinity)) return pages;
  if (pages.length === 1) return shareUnchanged(pages, [page]);
  const observed = new Map(page.slips.map((slip) => [slipViewKey(slip), slip]));
  const browse = { ...last.browse };
  if (page.browse.bandTotal === undefined) delete browse.bandTotal;
  else browse.bandTotal = page.browse.bandTotal;
  if (page.browse.dailyBandLimit === undefined) delete browse.dailyBandLimit;
  else browse.dailyBandLimit = page.browse.dailyBandLimit;
  const updated = pages.map((previous) => {
    const slips = previous.slips.map((slip) => {
      const next = observed.get(slipViewKey(slip));
      return next ? shareUnchanged(slip, next) : slip;
    });
    if (previous === last) return shareUnchanged(previous, { ...previous, browse, slips,
      ...(page.summary ? { summary: page.summary } : {}), ...(page.statistics === undefined ? {} : { statistics: page.statistics }) });
    return slips.some((slip, index) => slip !== previous.slips[index]) ? { ...previous, slips } : previous;
  });
  return updated.some((page, index) => page !== pages[index]) ? updated : pages;
}

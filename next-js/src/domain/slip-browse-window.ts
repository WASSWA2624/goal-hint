import type { SlipsBrowseResult } from "./best-slips.ts";
import { serializeBestSlipsQuery } from "./best-slips-query.ts";
import { browseRules } from "./browse-period.ts";

export const slipViewKey = (view: SlipsBrowseResult["slips"][number]) => view.id ?? view.slip?.id ?? `${view.publicationDay}:${view.rank}`;
export function slipBrowseScope(query: NonNullable<SlipsBrowseResult["browse"]>["query"]) {
  const { cursor: _cursor, ...scope } = query; void _cursor;
  return serializeBestSlipsQuery({ ...scope, page: 1 }).toString();
}
/** An append commits only a coherent cohort and access projection, with a bounded DOM window. */
export function appendSlipBrowse(base: SlipsBrowseResult, next: SlipsBrowseResult): SlipsBrowseResult {
  const a = base.browse, b = next.browse;
  if (!a || !b || base.day !== next.day || base.entitled !== next.entitled || base.access?.signedIn !== next.access?.signedIn
    || slipBrowseScope(a.query) !== slipBrowseScope(b.query) || b.query.page !== a.query.page + 1
    || a.total !== b.total || a.version != null && a.version !== b.version) throw new Error("changed");
  const ids = new Set(base.slips.map(slipViewKey));
  if (next.slips.some((view) => ids.has(slipViewKey(view)))) throw new Error("changed");
  const first = a.firstPage ?? a.query.page;
  const drop = b.query.page - first >= browseRules.maximumLoadedSlipPages ? a.pageSize : 0;
  return { ...next, slips: [...base.slips.slice(drop), ...next.slips], browse: { ...b, firstPage: first + Number(drop > 0) } };
}

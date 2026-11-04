import { browseRules } from "./browse-period.ts";
import type { SlipsBrowseResult } from "./best-slips.ts";
/** Shared display size for generated slips and Best Slips browsing. */
export const slipPageSize = browseRules.pageSize;

/** Presentation uses the average shown on the card. Equal values retain their input order. */
export function compareSlipDisplayProbability(left: { averageProbability: number }, right: { averageProbability: number }): number {
  return right.averageProbability - left.averageProbability;
}

/** Also bound legacy daily seeds that predate the paginated response contract. */
export function singleSlipPage(result: SlipsBrowseResult): SlipsBrowseResult {
  const browse = result.browse ?? { query: { period: "today" as const, status: "all" as const, page: 1 },
    total: result.slips.length, pageSize: slipPageSize, hasMore: result.slips.length > slipPageSize,
    nextCursor: null, from: result.day, to: result.day };
  const slips = result.browse ? result.slips : [...result.slips].sort(compareSlipDisplayProbability);
  return { ...result, slips: slips.slice(0, slipPageSize), browse: { ...browse, firstPage: browse.query.page } };
}

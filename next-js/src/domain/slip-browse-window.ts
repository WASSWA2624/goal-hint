import type { SlipsBrowseResult } from "./best-slips.ts";
import { serializeBestSlipsQuery } from "./best-slips-query.ts";

export const slipViewKey = (view: SlipsBrowseResult["slips"][number]) => view.id ?? view.slip?.id ?? `${view.publicationDay}:${view.rank}`;
export function slipBrowseScope(query: NonNullable<SlipsBrowseResult["browse"]>["query"]) {
  const { cursor: _cursor, ...scope } = query; void _cursor;
  return serializeBestSlipsQuery({ ...scope, page: 1 }).toString();
}

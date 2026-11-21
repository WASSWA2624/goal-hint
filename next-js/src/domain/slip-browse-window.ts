import type { SlipsBrowseResult } from "./best-slips.ts";

export const slipViewKey = (view: SlipsBrowseResult["slips"][number]) => view.id ?? view.slip?.id ?? `${view.publicationDay}:${view.rank}`;

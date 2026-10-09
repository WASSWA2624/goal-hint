import { z } from "zod";
import { feedPaginationRules } from "./feed-pagination.ts";
import { feedQueryRules } from "./feed-query.ts";

export const restorationRules = Object.freeze({ maximumEntries: 20, maximumAgeMilliseconds: 30 * 60 * 1000 });
export const feedNavigationRules = Object.freeze({ maximumCharacters: 65_536, maximumScroll: 10_000_000 });
const page = z.number().int().min(1).max(feedQueryRules.maximumPage);
export const feedCheckpointSchema = z.strictObject({
  entryId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u), queryKey: z.string().min(1).max(4096),
  href: z.string().max(4096).startsWith("/"), firstPage: page, lastPage: page,
  scrollY: z.number().finite().min(0).max(feedNavigationRules.maximumScroll),
  focusFixtureId: z.string().max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/u).nullable(),
  paginationVersion: z.string().regex(/^[a-f0-9]{64}$/u).nullable(), savedAt: z.number().int().nonnegative(),
}).refine((value) => value.lastPage >= value.firstPage && value.lastPage - value.firstPage < feedPaginationRules.maximumLoadedPages);
export type FeedCheckpoint = z.infer<typeof feedCheckpointSchema>;
const recordsSchema = z.strictObject({ version: z.literal(1), entries: z.array(feedCheckpointSchema).max(restorationRules.maximumEntries) });
function current(checkpoint: FeedCheckpoint, now: number) {
  return checkpoint.savedAt <= now && now - checkpoint.savedAt <= restorationRules.maximumAgeMilliseconds;
}
export function readFeedCheckpoints(serialized: string | null, now: number): FeedCheckpoint[] {
  if (serialized === null || serialized.length > feedNavigationRules.maximumCharacters || !Number.isSafeInteger(now)) return [];
  try {
    const value = recordsSchema.parse(JSON.parse(serialized));
    if (new Set(value.entries.map((entry) => entry.entryId)).size !== value.entries.length) return [];
    return value.entries.filter((entry) => current(entry, now));
  } catch { return []; }
}
export function writeFeedCheckpoint(entries: readonly FeedCheckpoint[], checkpoint: FeedCheckpoint, now: number): string {
  const checked = feedCheckpointSchema.parse(checkpoint);
  const next = [checked, ...entries.filter((entry) => entry.entryId !== checked.entryId && current(entry, now))]
    .sort((a, b) => b.savedAt - a.savedAt).slice(0, restorationRules.maximumEntries);
  let serialized = JSON.stringify({ version: 1, entries: next });
  while (serialized.length > feedNavigationRules.maximumCharacters && next.length > 1) {
    next.pop(); serialized = JSON.stringify({ version: 1, entries: next });
  }
  if (serialized.length > feedNavigationRules.maximumCharacters || !current(checked, now)) throw new RangeError("Invalid navigation checkpoint.");
  return serialized;
}
export function matchingFeedCheckpoint(entries: readonly FeedCheckpoint[], entryId: string, queryKey: string, href: string, firstPage: number) {
  return entries.find((entry) => entry.entryId === entryId && entry.queryKey === queryKey && entry.href === href && entry.firstPage === firstPage) ?? null;
}

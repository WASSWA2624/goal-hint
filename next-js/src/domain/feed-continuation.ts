import { maximumFeedContinuationRecords } from "./match-feed-rules.ts";

export type FeedContinuationPrefix = Readonly<{ firstPage: number; hash: string }>;

export function supportsFeedContinuation(firstPage: number, nextPage: number, pageSize: number): boolean {
  return Number.isSafeInteger(firstPage) && firstPage >= 1 && Number.isSafeInteger(nextPage) && nextPage > firstPage
    && Number.isSafeInteger(pageSize) && pageSize >= 1 && (nextPage - firstPage) * pageSize <= maximumFeedContinuationRecords;
}

/** Hash the exact ordered membership already visible before the next offset. */
export function feedContinuationEvidence(firstPage: number, fixtureIds: readonly string[]): string {
  return JSON.stringify([firstPage, fixtureIds]);
}

export async function hashFeedContinuation(firstPage: number, fixtureIds: readonly string[]): Promise<string> {
  const input = new TextEncoder().encode(feedContinuationEvidence(firstPage, fixtureIds));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

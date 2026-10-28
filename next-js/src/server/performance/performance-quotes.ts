import "server-only";

import { z } from "zod";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import type { HistoryRow } from "../predictions/history-read.ts";
import { predictionQuoteFromRow } from "../predictions/prediction-quote-store.ts";

/** A server-owned binding for permitted historical odds. No public input or reference string grants access. */
export type PerformanceQuoteBinding = Readonly<{
  bookmakerId: number;
  maximumAgeMs: number;
  verifyPublicDisplay(): boolean;
}>;
export type PerformanceQuotePolicy = Readonly<{ bookmakerId: number; maximumAgeMs: number }>;
const policySchema = z.strictObject({ bookmakerId: z.number().int().positive().max(4_294_967_295),
  maximumAgeMs: z.number().int().positive().max(7 * 86_400_000) });
export function verifiedQuotePolicy(binding: PerformanceQuoteBinding | null): PerformanceQuotePolicy | null {
  if (!binding) return null;
  try {
    const parsed = policySchema.safeParse({ bookmakerId: binding.bookmakerId, maximumAgeMs: binding.maximumAgeMs });
    if (!parsed.success) return null;
    const proof: unknown = binding.verifyPublicDisplay();
    if (proof instanceof Promise) void proof.catch(() => undefined);
    return proof === true ? parsed.data : null;
  } catch { return null; }
}

type Target = Readonly<{ fixtureId: string; cycleId: string; revisionId: string; openedAt: number; publishedAt: number; cutoffAt: number; kickoffAt: number }>;
export type PerformanceQuotes = ReadonlyMap<string, string>;
export const performanceQuoteKey = (revisionId: string, family: string) => `${revisionId}:${family}`;

/** Only contemporaneous immutable sidecars may price a locked selection. Older revisions remain explicitly unpriced.
 * The bounded reader never reconstructs publication availability from transient provider snapshots. */
export async function readPerformanceQuotes(tx: Prisma.TransactionClient, targets: readonly Target[],
  policy: PerformanceQuotePolicy, budget: { remainingBytes: number; overflow?: () => never }): Promise<PerformanceQuotes> {
  const quotes = new Map<string, string>();
  if (!targets.length) return quotes;
  const from = Prisma.sql`FROM PredictionQuote r WHERE r.revisionId IN (${Prisma.join(targets.map(target => target.revisionId))})`;
  const [size] = await tx.$queryRaw<{ bytes: bigint; total: bigint }[]>(Prisma.sql`SELECT
    COALESCE(SUM(OCTET_LENGTH(CAST(r.body AS CHAR))),0) AS bytes,COUNT(*) AS total ${from}`);
  const bytes = Number(size?.bytes), total = Number(size?.total);
  if (!Number.isSafeInteger(bytes) || bytes < 0 ||
    !Number.isSafeInteger(total) || total < 0 || total > targets.length * 4) throw new MatchFeedError("unavailable");
  if (bytes > budget.remainingBytes) {
    if (budget.overflow) budget.overflow();
    throw new MatchFeedError("unavailable");
  }
  budget.remainingBytes -= bytes;
  const rows = await tx.$queryRaw<HistoryRow[]>(Prisma.sql`SELECT r.*,r.integrity=SHA2(CAST(r.body AS CHAR),256) AS validIntegrity ${from}`);
  if (rows.length !== total) throw new MatchFeedError("unavailable");
  const byRevision = new Map(targets.map(target => [target.revisionId, target])), seen = new Set<string>();
  for (const row of rows) {
    const quote = predictionQuoteFromRow(row), target = byRevision.get(quote.revisionId);
    const key = `${performanceQuoteKey(quote.revisionId, quote.family)}:${quote.selection}`;
    if (!target || seen.has(`${quote.revisionId}:${quote.family}`) || quote.fixtureId !== target.fixtureId || quote.cycleId !== target.cycleId ||
      quote.recordedAt !== target.publishedAt || quote.recordedAt >= target.cutoffAt || String(row.cycleId) !== quote.cycleId) throw new MatchFeedError("unavailable");
    seen.add(`${quote.revisionId}:${quote.family}`);
    const price = quote.price;
    if (quote.state !== "quoted" || !price || price.bookmakerId !== policy.bookmakerId || price.retrievedAt < target.openedAt ||
      price.retrievedAt > target.publishedAt || price.retrievedAt >= target.cutoffAt || target.publishedAt - price.retrievedAt > policy.maximumAgeMs) continue;
    quotes.set(key, price.display);
  }
  return quotes;
}

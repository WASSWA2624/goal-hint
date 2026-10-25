import "server-only";

import { z } from "zod";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { launchOddsGroup, launchOddsMapping } from "../../domain/odds-markets.ts";
import { formatOddsHundredths } from "../../domain/odds.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import { oddsValuesHash, storedOddsBatchSchema, storedOddsSnapshotSchema } from "../odds/odds-mysql-store.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";

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

type Target = Readonly<{ fixtureId: string; externalId: bigint; revisionId: string; openedAt: number; publishedAt: number; cutoffAt: number; kickoffAt: number }>;
type QuoteRow = { id: string; fixtureId: string; betExternalId: number; body: unknown; validIntegrity: unknown;
  batchId: string; batchBody: unknown; validBatchIntegrity: unknown };
export type PerformanceQuotes = ReadonlyMap<string, string>;
export const performanceQuoteKey = (revisionId: string, family: string) => `${revisionId}:${family}`;

/** Bounded as-of lookup, one bookmaker and cycle only. Never read mutable current prices or borrow a later quote.
 * An invalid latest snapshot is an integrity failure, not a reason to fall back to a more convenient older quote. */
export async function readPerformanceQuotes(tx: Prisma.TransactionClient, targets: readonly Target[],
  policy: PerformanceQuotePolicy, budget: { remainingBytes: number }): Promise<PerformanceQuotes> {
  const quotes = new Map<string, string>();
  if (!targets.length) return quotes;
  const from = Prisma.sql`FROM ProviderOddsSnapshot s JOIN OddsImportBatch b ON b.id=s.batchId
    JOIN PredictionSet r ON r.fixtureId=s.fixtureId
    JOIN PredictionCycle c ON c.id=r.cycleId AND c.fixtureId=r.fixtureId
    WHERE r.id IN (${Prisma.join(targets.map((target) => target.revisionId))})
    AND s.bookmakerExternalId=${policy.bookmakerId} AND s.betExternalId IN (${Prisma.join(launchOddsMapping.map((mapping) => mapping.betId))})
    AND b.kind='prices' AND b.status IN ('complete','partial') AND b.receivedAt<=r.publishedAt
    AND b.scopeKey=CONCAT('date:',DATE_FORMAT(DATE_ADD(c.kickoffAt,INTERVAL 3 HOUR),'%Y-%m-%d'),':bookmaker:',${policy.bookmakerId})
    AND NOT EXISTS (SELECT 1 FROM OddsImportBatch later WHERE later.kind='prices' AND later.scopeKey=b.scopeKey
      AND later.id<>b.id AND later.receivedAt>=b.receivedAt AND later.receivedAt<=r.publishedAt)
    AND NOT EXISTS (SELECT 1 FROM ProviderOddsSnapshot successor WHERE successor.previousId=s.id AND successor.retrievedAt<=r.publishedAt)
    AND s.retrievedAt>=c.openedAt AND s.retrievedAt<=r.publishedAt AND s.retrievedAt<c.cutoffAt
    AND TIMESTAMPDIFF(MICROSECOND,s.retrievedAt,r.publishedAt)<=${policy.maximumAgeMs * 1000}
    AND (s.providerUpdatedAt IS NULL OR s.providerUpdatedAt<=r.publishedAt)`;
  const ranked = Prisma.sql`SELECT s.id,s.fixtureId,s.betExternalId,
    ROW_NUMBER() OVER (PARTITION BY r.id,s.betExternalId ORDER BY s.retrievedAt DESC,s.id DESC) AS quoteOrder ${from}`;
  const selected = Prisma.sql`FROM ProviderOddsSnapshot s JOIN OddsImportBatch b ON b.id=s.batchId
    JOIN (${ranked}) chosen ON chosen.id=s.id AND chosen.quoteOrder=1`;
  const maximumRows = targets.length * launchOddsMapping.length;
  const [size] = await tx.$queryRaw<{ bytes: bigint; total: bigint }[]>(Prisma.sql`SELECT
    COALESCE(SUM(OCTET_LENGTH(CAST(s.body AS CHAR))+OCTET_LENGTH(CAST(b.body AS CHAR))),0) AS bytes,COUNT(*) AS total ${selected}`);
  const bytes = Number(size?.bytes), total = Number(size?.total);
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > budget.remainingBytes ||
    !Number.isSafeInteger(total) || total < 0 || total > maximumRows) throw new MatchFeedError("unavailable");
  budget.remainingBytes -= bytes;
  const rows = await tx.$queryRaw<QuoteRow[]>(Prisma.sql`SELECT s.id,s.fixtureId,s.betExternalId,s.body,
    s.integrity=SHA2(CAST(s.body AS CHAR),256) AS validIntegrity,b.id AS batchId,b.body AS batchBody,
    b.integrity=SHA2(CAST(b.body AS CHAR),256) AS validBatchIntegrity ${selected}`);
  if (rows.length !== total) throw new MatchFeedError("unavailable");
  const byFixture = new Map(targets.map((target) => [target.fixtureId, target]));
  for (const row of rows) {
    assertHistorySeal(row.validIntegrity);
    assertHistorySeal(row.validBatchIntegrity);
    const body = storedOddsSnapshotSchema.parse(historyJson(row.body)), target = byFixture.get(row.fixtureId);
    const { id: batchId, ...batchContent } = storedOddsBatchSchema.parse(historyJson(row.batchBody));
    const mapping = launchOddsMapping.find((item) => item.betId === Number(row.betExternalId));
    const { id, fixtureId, bookmakerId, bookmakerName, betId, betName, valuesHash, previousId } = body;
    if (!target || !mapping || body.id !== row.id || body.fixtureId !== row.fixtureId || body.bookmakerId !== policy.bookmakerId ||
      body.betId !== Number(row.betExternalId) || body.retrievedAt < target.openedAt || body.retrievedAt > target.publishedAt ||
      body.retrievedAt >= target.cutoffAt || target.publishedAt - body.retrievedAt > policy.maximumAgeMs ||
      body.providerUpdatedAt !== null && body.providerUpdatedAt > target.publishedAt || oddsValuesHash(body.values) !== body.valuesHash ||
      evidenceFingerprint({ fixtureId, bookmakerId, bookmakerName, betId, betName, valuesHash, previousId }) !== id) throw new MatchFeedError("unavailable");
    if (batchId !== row.batchId || evidenceFingerprint(batchContent) !== batchId || batchContent.kind !== "prices" || batchContent.status === "failed" ||
      batchContent.date !== getReportingDate(utcInstantFromEpochMilliseconds(target.kickoffAt)) ||
      batchContent.scopeKey !== `date:${batchContent.date}:bookmaker:${policy.bookmakerId}` ||
      batchContent.receivedAt > target.publishedAt || !batchContent.pages.some((page) => page.retrievedAt === body.retrievedAt) ||
      !batchContent.fixtures.some((fixture) => BigInt(fixture.externalId) === target.externalId && fixture.outcome === "apply")) throw new MatchFeedError("unavailable");
    // The approved binding covers this versioned mapping; an unknown or renamed provider bet cannot price it.
    const group = launchOddsGroup(mapping, { betId: body.betId, betName: body.betName, values: body.values }, mapping.betName);
    if (!group) continue;
    for (const price of group.selections) quotes.set(`${performanceQuoteKey(target.revisionId, mapping.family)}:${price.selection}`,
      formatOddsHundredths(price.displayHundredths));
  }
  return quotes;
}

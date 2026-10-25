import "server-only";

import { Prisma } from "../generated/prisma/client.ts";
import { parseForecastSourceReceipts, type ForecastSourceReceipts } from "../fallback/source-receipts.ts";
import { MatchFeedError } from "../matches/feed-error.ts";
import type { StoredRevision } from "../predictions/history-contract.ts";

type Tx = Prisma.TransactionClient;
export type SourceReceiptRead = ForecastSourceReceipts | "not-captured";
const BATCH = 1000;

/** Reads the source receipts sealed in each revision's fallback stage, by job. Only revisions whose candidate froze a
 * source order can have them; a denied fallback stage stored none and reads as "not-captured". Each row's seal is
 * checked in SQL on the full body, but only `$.value.sources` leaves the database, under its own byte budget. */
export async function readSourceReceipts(tx: Tx, revisions: readonly StoredRevision[], maxBytes = 2_000_000): Promise<ReadonlyMap<string, SourceReceiptRead>> {
  const ordered = new Map<string, StoredRevision>();
  for (const revision of revisions) {
    if (revision.candidate.audit.sourceOrder === undefined) continue;
    if (revision.candidate.context.jobId !== revision.jobId) throw new MatchFeedError("unavailable");
    ordered.set(revision.jobId, revision);
  }
  const jobIds = [...ordered.keys()], receipts = new Map<string, SourceReceiptRead>();
  let remainingBytes = maxBytes;
  for (let offset = 0; offset < jobIds.length; offset += BATCH) {
    const batch = jobIds.slice(offset, offset + BATCH);
    const from = Prisma.sql`FROM PredictionRefreshStage WHERE phase = 'fallback' AND kind = 'completed' AND jobId IN (${Prisma.join(batch)})`;
    const [size] = await tx.$queryRaw<{ bytes: bigint; total: bigint }[]>(Prisma.sql`SELECT
      COALESCE(SUM(OCTET_LENGTH(CAST(JSON_EXTRACT(body, '$.value.sources') AS CHAR))), 0) AS bytes, COUNT(*) AS total ${from}`);
    const bytes = Number(size?.bytes), total = Number(size?.total);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > remainingBytes || !Number.isSafeInteger(total) || total > batch.length)
      throw new MatchFeedError("unavailable");
    remainingBytes -= bytes;
    const rows = await tx.$queryRaw<{ jobId: string; sealed: unknown; sources: unknown }[]>(Prisma.sql`SELECT jobId,
      integrity = SHA2(CAST(body AS CHAR), 256) AS sealed, JSON_EXTRACT(body, '$.value.sources') AS sources ${from}`);
    for (const row of rows) {
      const revision = ordered.get(row.jobId);
      if (!revision || ![true, 1, 1n].includes(row.sealed as boolean | number | bigint)) throw new MatchFeedError("unavailable");
      if (row.sources === null || row.sources === undefined) { receipts.set(row.jobId, "not-captured"); continue; }
      let parsed: ForecastSourceReceipts;
      try { parsed = parseForecastSourceReceipts(JSON.parse(typeof row.sources === "string" ? row.sources : JSON.stringify(row.sources))); }
      catch { throw new MatchFeedError("unavailable"); }
      if (parsed.order !== revision.candidate.audit.sourceOrder) throw new MatchFeedError("unavailable");
      receipts.set(row.jobId, parsed);
    }
  }
  for (const jobId of jobIds) if (!receipts.has(jobId)) receipts.set(jobId, "not-captured");
  return receipts;
}

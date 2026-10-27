import "server-only";

import { recommendationPolicy } from "../../domain/recommendation.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { recommendationQuotesFromSnapshots } from "../odds/recommendation-quotes.ts";
import { storedOddsBatchSchema, storedOddsSnapshotSchema } from "../odds/odds-mysql-store.ts";
import type { OddsBatchBody } from "../odds/odds-contract.ts";
import { assertHistorySeal, historyJson } from "./history-read.ts";
import { refreshArchiveJson } from "../refresh/refresh-archive.ts";
import { publicationFail, type PublishRevisionInput } from "./publication-contract.ts";

type Tx = Prisma.TransactionClient;
type Sealed = { body: unknown; validIntegrity: unknown };
const body = (row: Sealed | undefined, decode = historyJson) => {
  if (!row) return publicationFail("invalid-request");
  assertHistorySeal(row.validIntegrity);
  const value = decode(row.body);
  if (value === null || typeof value !== "object" || Array.isArray(value)) return publicationFail("invalid-request");
  return value as Record<string, unknown>;
};

/** A recommendation can only accompany the exact completed, sealed decision of its owning refresh.
 * Price provenance is checked again from private immutable rows inside the acceptance transaction. */
export async function validatePublishedRecommendation(tx: Tx, input: PublishRevisionInput, now: number): Promise<boolean> {
  const recommendation = input.candidate.audit.recommendation;
  if (recommendation === undefined) return true;
  const context = input.candidate.context, jobId = context.jobId;
  const stage = body((await tx.$queryRaw<Sealed[]>`SELECT body,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM PredictionRefreshStage WHERE jobId=${jobId} AND phase='fallback' AND kind='completed'`)[0], refreshArchiveJson);
  const resolved = stage.value as { candidate?: unknown } | undefined;
  const intent = body((await tx.$queryRaw<Sealed[]>`SELECT body,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
    FROM PredictionRefreshIntent WHERE jobId=${jobId}`)[0], refreshArchiveJson);
  const frozen = intent.plan as { recommendationPolicy?: unknown } | undefined;
  const owner = intent.member as { jobId?: string; context?: unknown } | undefined;
  if (stage.jobId !== jobId || stage.phase !== "fallback" || stage.kind !== "completed" ||
    typeof stage.at !== "number" || stage.at > now || owner?.jobId !== jobId || !owner.context || !resolved?.candidate || !frozen?.recommendationPolicy ||
    evidenceFingerprint(owner.context) !== evidenceFingerprint(context.context) ||
    evidenceFingerprint(resolved?.candidate) !== evidenceFingerprint(input.candidate) ||
    evidenceFingerprint(frozen?.recommendationPolicy) !== evidenceFingerprint(recommendationPolicy) ||
    recommendation.policyVersion !== recommendationPolicy.version) return publicationFail("unauthorized");
  const selected = recommendation.selected;
  if (!selected) return true;
  const quote = selected.quote;
  const original = (await tx.$queryRaw<(Sealed & { batchId: string })[]>`SELECT batchId,body,
    integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM ProviderOddsSnapshot WHERE id=${quote.snapshotId}`)[0];
  if (!original) return publicationFail("unauthorized");
  const snapshot = storedOddsSnapshotSchema.parse(body(original));
  const sourceBatch = storedOddsBatchSchema.parse(body((await tx.$queryRaw<Sealed[]>`SELECT body,
    integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM OddsImportBatch WHERE id=${original.batchId}`)[0])) as unknown as OddsBatchBody;
  const batch = quote.observationReceiptId === undefined || quote.observationReceiptId === sourceBatch.id ? sourceBatch
    : storedOddsBatchSchema.parse(body((await tx.$queryRaw<Sealed[]>`SELECT body,integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity
      FROM OddsImportBatch WHERE id=${quote.observationReceiptId}`)[0])) as unknown as OddsBatchBody;
  const catalog = storedOddsBatchSchema.parse(body((await tx.$queryRaw<Sealed[]>`SELECT body,
    integrity=SHA2(CAST(body AS CHAR),256) AS validIntegrity FROM OddsImportBatch WHERE scopeKey='bets' AND kind='bets'
    AND status='complete' AND receivedAt<=${new Date(context.context.cutoffAt)} ORDER BY receivedAt DESC,id DESC LIMIT 1`)[0]));
  const quotes = recommendationQuotesFromSnapshots({ context: context.context, bookmakerId: quote.bookmakerId,
    freshnessMs: recommendationPolicy.quoteMaxAgeMs, batch, snapshots: [snapshot],
    catalog: new Map(catalog.catalog.map((entry) => [entry.id, entry.name])), permitted: true });
  const comparison = (item: typeof quote) => {
    const { observationReceiptId: _receipt, ...content } = item; void _receipt;
    return evidenceFingerprint(content);
  };
  if (sourceBatch.id !== original.batchId || batch.id !== (quote.observationReceiptId ?? original.batchId) || snapshot.id !== quote.snapshotId ||
    !sourceBatch.pages.some((page) => page.endpoint === "odds" && page.retrievedAt === snapshot.retrievedAt) ||
    !sourceBatch.fixtures.some((fixture) => fixture.externalId === context.context.externalFixtureId && fixture.outcome === "apply") ||
    !quotes.some((item) => comparison(item) === comparison(quote))) return publicationFail("unauthorized");
  return quote.observedAt <= now && now - quote.observedAt <= recommendationPolicy.quoteMaxAgeMs &&
    (quote.providerUpdatedAt === null || quote.providerUpdatedAt <= now && now - quote.providerUpdatedAt <= recommendationPolicy.quoteMaxAgeMs);
}

import "server-only";

import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import { isPlayedFinalStatus } from "../../domain/market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { CatalogAuthority, CatalogImportRequest } from "./catalog-contract.ts";
import { catalogScopeKey, CatalogInputError, validateCatalogBatch } from "./catalog-input.ts";
import { catalogPersistenceUnavailable, createFootballCatalogStore, historyReplayKind, historyReplayScopePrefix } from "./catalog-mysql-store.ts";
import { API_FOOTBALL_CONTRACT_VERSION } from "./api-football-contract.ts";
import { normalizeFixture, type NormalizedFixture } from "./api-football-normalize.ts";
import { rawReviewedFixtureId, reviewedDuplicateReplacement, reviewedFixtureMatches, reviewedFixtureRejectionCount,
  reviewedFixtureScoreMatches, reviewedHistoryFixtureRepair,
  reviewedHistoryFixtureRepairs } from "./history-fixture-correction.ts";
import { createFootballHistorySource, footballHistorySourceMaxRows } from "./history-source.ts";

const selector = z.strictObject({ kind: z.literal("fixtures"), query: z.strictObject({
  competitionId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  season: z.number().int().min(1000).max(9999), round: z.string().min(1).max(200).optional(),
}) });
const provenance = z.tuple([z.strictObject({
  provider: z.literal("api-football"), endpoint: z.literal("fixtures"), contractVersion: z.literal(API_FOOTBALL_CONTRACT_VERSION),
  requestParameters: z.record(z.string(), z.string()), retrievedAt: z.number().int().nonnegative(), providerUpdatedAt: z.null(),
  fromCache: z.literal(false), currentPage: z.literal(1), totalPages: z.literal(1),
})]);
type DeferredReceipt = Readonly<{ id: string; selection: unknown; scopeKey: string; provenance: unknown; observedAt: Date;
  receivedCount: number; rejectedCount: number; retentionEvidenceRef: string }>;

/** Replay checksummed observations whose writes were deferred or whose conflicts were reviewed. */
export function createFootballHistoryFixtureReplay(database: DatabaseRuntime, authority: CatalogAuthority, retentionEvidenceRef: string,
  clock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) }) {
  const source = createFootballHistorySource(database);
  const store = createFootballCatalogStore(database, { historicalResults: true, clock });
  async function read(receipt: DeferredReceipt) {
    const parsed = selector.safeParse(receipt.selection), original = provenance.safeParse(receipt.provenance);
    if (!parsed.success || !original.success || receipt.retentionEvidenceRef !== retentionEvidenceRef || !Number.isSafeInteger(receipt.receivedCount) ||
      receipt.receivedCount < 1 || receipt.receivedCount > footballHistorySourceMaxRows) return null;
    const { competitionId, season, round } = parsed.data.query;
    const roundSelector = round === undefined ? {} : { round };
    const selection = { kind: "fixtures", query: { competitionId, season, ...roundSelector } } as const;
    if (receipt.scopeKey !== catalogScopeKey(selection)) return null;
    const parameters = { league: String(competitionId), season: String(season), timezone: "Africa/Kampala", ...roundSelector };
    const [observation] = original.data;
    const retrievedAt = utcInstantFromEpochMilliseconds(receipt.observedAt.getTime());
    if (retrievedAt !== observation.retrievedAt || retrievedAt > clock.now() ||
      Object.keys(observation.requestParameters).length !== Object.keys(parameters).length ||
      Object.entries(parameters).some(([key, value]) => observation.requestParameters[key] !== value)) return null;
    const archived = await source.readExactFixtureScope(parameters, { retrievedAt, rowCount: receipt.receivedCount });
    if (!archived) return null;
    const reviewed = reviewedHistoryFixtureRepair(receipt.id);
    if (reviewed && (archived.id !== reviewed.pageId || receipt.rejectedCount !== reviewedFixtureRejectionCount(reviewed) ||
      receipt.receivedCount !== reviewed.expectedRows || competitionId !== reviewed.competitionId || season !== reviewed.season ||
      round !== reviewed.round)) return null;
    const replayAuthority: CatalogAuthority = reviewed ? Object.freeze({ ...authority,
      regulationEvidenceRef: (candidate) => reviewed.corrections.find((entry) => reviewedFixtureScoreMatches(entry, candidate))?.evidenceRef ??
        authority.regulationEvidenceRef?.(candidate) ?? null,
    }) : authority;

    const data: NormalizedFixture[] = [], missing = new Set<string>();
    const normalize = (row: unknown) => normalizeFixture(row, { endpoint: "/fixtures", retrievedAt,
      verifyLogo: authority.verifyLogo, verifyRegulationScore: authority.verifyRegulationScore });
    const omissions = new Map<number, string>();
    if (reviewed?.duplicates.length) {
      const rawById = new Map(archived.rows.map((row) => [rawReviewedFixtureId(row), row]));
      for (const duplicate of reviewed.duplicates) {
        const canonical = rawById.get(duplicate.canonicalFixtureId);
        if (!canonical || duplicate.fixtureId === duplicate.canonicalFixtureId || omissions.has(duplicate.fixtureId) ||
          evidenceFingerprint(canonical) !== duplicate.canonicalRawFingerprint) return null;
        const result = normalize(canonical);
        if (!result.valid || !reviewedFixtureMatches(reviewed, reviewedDuplicateReplacement(duplicate), result.data)) return null;
        omissions.set(duplicate.fixtureId, duplicate.rawFingerprint);
      }
    }
    const corrections = new Set<number>();
    for (const row of archived.rows) {
      let result = normalize(row);
      if (!result.valid && reviewed) {
        const rawId = omissions.size ? rawReviewedFixtureId(row) : null;
        const omission = rawId === null ? undefined : omissions.get(rawId);
        if (rawId !== null && omission !== undefined) {
          if (evidenceFingerprint(row) !== omission || corrections.has(rawId)) return null;
          corrections.add(rawId);
          continue;
        }
        const projected = reviewed.project(row);
        if (projected === null || corrections.has(projected.correction.fixtureId)) return null;
        result = normalize(projected.row);
        if (!result.valid || !reviewedFixtureMatches(reviewed, projected.correction, result.data)) return null;
        corrections.add(projected.correction.fixtureId);
      }
      if (!result.valid) return null;
      data.push(result.data);
      for (const value of result.missingCoverage) missing.add(value);
    }
    if (reviewed && corrections.size !== reviewedFixtureRejectionCount(reviewed)) return null;
    const request: CatalogImportRequest = { id: receipt.id, selection, retentionEvidenceRef,
      bounds: { priority: "enrichment", deadlineAt: retrievedAt, timeoutMs: 1, maxRequests: 1, maxPages: 1,
        maxRows: footballHistorySourceMaxRows, maxResponseBytes: 24_000_000, cacheMaxAgeMs: 0,
        retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 } } };
    try {
      const batch = validateCatalogBatch(request, { status: "complete", data, error: null, requestsDispatched: 0,
        completeness: { complete: true, reasons: [], missingIds: [], missingCoverage: [...missing], invalidRows: 0 },
        provenance: [{ ...observation, retrievedAt, fromCache: true, quota: { kind: "success" } }] }, replayAuthority, clock);
      if (batch.status !== "complete" || reviewed && batch.rows.fixtures.filter((fixture) => isPlayedFinalStatus(fixture.status) &&
        fixture.regulationScore?.verified && fixture.kickoff !== null && fixture.kickoff < retrievedAt).length !== reviewed.expectedVerifiedResults) return null;
      return { batch, pageId: archived.id, replayAuthority };
    } catch (error) {
      if (error instanceof CatalogInputError && ["invalid-result", "unverified-observation"].includes(error.reason)) return null;
      throw error;
    }
  }

  return async function replay(signal?: AbortSignal, maxChunks = 6,
    options: Readonly<{ reviewedCorrectionOnly?: boolean; reviewedReceiptIds?: readonly string[] }> = {}) {
    if (!Number.isSafeInteger(maxChunks) || maxChunks < 1 || maxChunks > 10) throw new RangeError("Invalid fixture replay batch size.");
    const reviewedRepairs = options.reviewedReceiptIds === undefined ? reviewedHistoryFixtureRepairs :
      reviewedHistoryFixtureRepairs.filter(({ receiptId }) => options.reviewedReceiptIds?.includes(receiptId));
    const reviewed = reviewedRepairs.length ? Prisma.sql`(${Prisma.join(reviewedRepairs.map((repair) => Prisma.sql`
      (source.id = ${repair.receiptId} AND source.receivedCount = ${repair.expectedRows}
        AND source.rejectedCount = ${reviewedFixtureRejectionCount(repair)} AND JSON_LENGTH(source.reasons) = ${repair.reasons.length}
        AND JSON_CONTAINS(source.reasons, ${JSON.stringify(repair.reasons)}))`), " OR ")})` : Prisma.sql`FALSE`;
    const deferred = Prisma.sql`(source.rejectedCount = 0 AND JSON_LENGTH(source.reasons) = 1
      AND JSON_CONTAINS(source.reasons, JSON_QUOTE(${catalogPersistenceUnavailable})))`;
    const condition = options.reviewedCorrectionOnly || options.reviewedReceiptIds !== undefined ? reviewed : Prisma.sql`(${deferred} OR ${reviewed})`;
    const ordinaryMarker = Prisma.sql`source.id NOT IN (${Prisma.join(reviewedHistoryFixtureRepairs.map(({ receiptId }) => receiptId))})`;
    const reviewedMarkers = reviewedRepairs.map((repair) => Prisma.sql`(source.id = ${repair.receiptId}
      AND replay.subsetEvidenceRef = ${repair.reference} AND replay.receivedCount = ${repair.expectedRows}
      AND replay.importedCount = ${repair.expectedVerifiedResults} AND replay.rejectedCount = 0)`);
    const candidates = await database.query((client) => client.$queryRaw<DeferredReceipt[]>(Prisma.sql`
      SELECT source.id, source.selection, source.scopeKey, source.provenance, source.observedAt, source.receivedCount,
        source.rejectedCount, source.retentionEvidenceRef
      FROM FootballImport AS source
      WHERE source.provider = 'api-football' AND source.kind = 'fixtures' AND source.status = 'partial'
        AND source.requestsDispatched = 1 AND source.importedCount = 0 AND source.receivedCount > 0 AND ${condition}
        AND NOT EXISTS (SELECT 1 FROM FootballImport AS replay
          WHERE replay.scopeKey = SHA2(CONCAT(${historyReplayScopePrefix}, source.id), 256)
            AND replay.kind = ${historyReplayKind} AND replay.status = 'complete' AND replay.requestsDispatched = 0
            AND (${Prisma.join([ordinaryMarker, ...reviewedMarkers], " OR ")}))
      ORDER BY source.observedAt DESC, source.sequence DESC`));
    let written = 0, imported = 0, completed = 0, unverified = 0;
    for (const candidate of candidates) {
      if (signal?.aborted || written >= maxChunks) break;
      const prepared = await read(candidate);
      if (!prepared) { unverified++; continue; }
      const result = await store.replayHistory(prepared.batch, prepared.replayAuthority, prepared.pageId, maxChunks - written, signal);
      written += result.written;
      imported += result.imported;
      completed += Number(result.complete);
    }
    const pending = candidates.length - completed;
    return { status: pending === 0 ? "complete" : "partial", requests: 0, written, imported, completed, pending, unverified,
      stopped: signal?.aborted ? "interrupted" : pending > 0 && written >= maxChunks ? "chunk-budget" : null };
  };
}

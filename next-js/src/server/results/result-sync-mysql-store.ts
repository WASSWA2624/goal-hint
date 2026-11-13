import "server-only";

import { z } from "zod";
import { getReportingDate, getReportingDayBounds, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { isPlayedFinalStatus, type SettlementStatus } from "../../domain/market-settlement.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { createMysqlPredictionHistoryStore } from "../predictions/history-mysql-store.ts";
import { historyHash, historyInstant } from "../predictions/history-input.ts";
import { assertHistorySeal, historyJson } from "../predictions/history-read.ts";
import type { createScheduleLifecycleService } from "../predictions/lifecycle-service.ts";
import { lifecycleObservationSchema } from "../predictions/lifecycle-input.ts";
import { lifecycleContentHash } from "../predictions/lifecycle-policy.ts";
import { finalStatus } from "./result-sync-policy.ts";
import { ResultSyncError, resultSyncFail, type PollLease, type ResultSyncStore } from "./result-sync-contract.ts";
import { storedFixtureResult } from "./result-read.ts";
import { fixtureResultValue, insertFixtureResult } from "./result-write.ts";

type Tx = Prisma.TransactionClient;
type TrackedFixtureRow = Readonly<{
  fixtureId: string; externalId: bigint; competitionId: bigint; season: number; kickoff: Date | null;
  status: string; retrievedAt: Date; createdAt: Date; regulationVerifiedAt: Date | null;
  firstTrackedAt: Date | null; firstFinalAt: Date | null; lastSyncAt: Date | null; nextCheckAt: Date | null; failures: bigint | number | null;
}>;
const batchSchema = z.strictObject({ id: historyHash, accountId: historyHash, policyHash: historyHash,
  receivedAt: historyInstant, channel: z.enum(["date", "live", "ids"]), date: z.string().nullable(),
  requestedIds: z.array(z.number().int().positive()), observations: z.array(lifecycleObservationSchema),
  error: z.string().max(128).nullable(), requestsDispatched: z.number().int().nonnegative() });
const now = async (tx: Tx) => utcInstantFromEpochMilliseconds((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime());
const epoch = new Date(0);

export function createMysqlResultSyncStore(options: Readonly<{
  database: DatabaseRuntime; accountId: string; lifecycle: ReturnType<typeof createScheduleLifecycleService>;
}>) {
  const { database, lifecycle } = options, accountId = historyHash.parse(options.accountId);
  const history = createMysqlPredictionHistoryStore(database);
  async function transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    let failure: unknown;
    try { return await database.transaction(async (tx) => {
      try { return await operation(tx); } catch (error) { failure = error; throw error; }
    }, { isolationLevel: "ReadCommitted", timeout: 30_000 }); }
    catch { if (failure instanceof ResultSyncError) throw failure; return resultSyncFail("unavailable"); }
  }
  async function locked(tx: Tx, lease?: PollLease) {
    const rows = await tx.$queryRaw<{ ownerId: string | null; fence: bigint; leaseUntil: Date }[]>`SELECT ownerId, fence, leaseUntil
      FROM ResultPollerLease WHERE accountId = ${accountId} FOR UPDATE`;
    const row = rows[0], at = await now(tx);
    if (!row || lease && (lease.accountId !== accountId || row.ownerId !== lease.ownerId || row.fence !== lease.fence || row.leaseUntil.getTime() <= at))
      return resultSyncFail("lost-lease");
    return { row, at };
  }
  async function readLease(tx: Tx): Promise<PollLease> {
    const row = await tx.resultPollerLease.findUniqueOrThrow({ where: { accountId } });
    return freezeEvidence({ accountId, ownerId: row.ownerId!, fence: row.fence, until: utcInstantFromEpochMilliseconds(row.leaseUntil.getTime()),
      nextLiveAt: row.nextLiveAt.getTime(), nextDateAt: row.nextDateAt.getTime(), liveFailures: row.liveFailures, dateFailures: row.dateFailures });
  }
  async function sealedBatch(tx: Tx, id: string) {
    const row = (await tx.$queryRaw<{ body: unknown; validIntegrity: bigint }[]>`SELECT body, integrity = SHA2(CAST(body AS CHAR), 256) AS validIntegrity
      FROM ResultSyncBatch WHERE id = ${id} AND accountId = ${accountId}`)[0];
    if (!row) return resultSyncFail("unavailable");
    assertHistorySeal(row.validIntegrity);
    const value = batchSchema.parse(historyJson(row.body));
    if (value.id !== id || value.accountId !== accountId) return resultSyncFail("unavailable");
    return freezeEvidence(value);
  }
  const store: ResultSyncStore = {
    acquire(ownerId, leaseMs) {
      historyHash.parse(ownerId);
      return transaction(async (tx) => {
        // Lock the permanent account before creating its first lease row. This
        // avoids concurrent INSERT IGNORE shared-lock upgrades on cold starts.
        const accounts = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM ApiQuotaAccount WHERE id = ${accountId} FOR UPDATE`;
        if (accounts.length !== 1) return resultSyncFail("unavailable");
        await tx.$executeRaw`INSERT IGNORE INTO ResultPollerLease (accountId, fence, leaseUntil, nextLiveAt, nextDateAt, liveFailures, dateFailures)
          VALUES (${accountId}, 0, ${epoch}, ${epoch}, ${epoch}, 0, 0)`;
        const { row, at } = await locked(tx);
        if (row.ownerId !== null && row.leaseUntil.getTime() > at) return null;
        await tx.resultPollerLease.update({ where: { accountId }, data: { ownerId, fence: { increment: 1 }, leaseUntil: new Date(at + leaseMs) } });
        return readLease(tx);
      });
    },
    renew(lease, leaseMs) {
      return transaction(async (tx) => { const { at } = await locked(tx, lease);
        await tx.resultPollerLease.update({ where: { accountId }, data: { leaseUntil: new Date(at + leaseMs) } }); return readLease(tx); });
    },
    release(lease) {
      return transaction(async (tx) => {
        const { row } = await locked(tx);
        if (row.ownerId === lease.ownerId && row.fence === lease.fence)
          await tx.resultPollerLease.update({ where: { accountId }, data: { ownerId: null, leaseUntil: epoch } });
      });
    },
    tracked(policy, at) {
      return database.query(async (tx) => {
        const day = getReportingDayBounds(getReportingDate(at));
        const lower = new Date(at - policy.activeWindowMs - (policy.unresolved.at(-1)?.untilAgeMs ?? 0));
        // A result observed at the end of its unresolved window can still need corrections.
        const correctionLower = new Date(lower.getTime() - (policy.corrections.at(-1)?.untilAgeMs ?? 0));
        const upper = new Date(at + policy.approachMs);
        const scope = JSON.stringify(policy.coverage);
        // A single relation join per table supports large competition lists.
        // Group provider aliases before joining fixtures to avoid duplicates.
        const fixtures = await tx.$queryRaw<TrackedFixtureRow[]>`
          WITH coveredSeasons AS (
            SELECT s.id, s.year, MIN(cp.externalId) AS competitionId
            FROM JSON_TABLE(${scope}, '$[*]' COLUMNS (competitionId BIGINT PATH '$.competitionId', season INTEGER PATH '$.season')) wanted
            JOIN FootballCompetitionProvider cp ON cp.provider = 'api-football' AND cp.externalId = wanted.competitionId
            JOIN FootballSeason s ON s.competitionId = cp.competitionId AND s.year = wanted.season
            GROUP BY s.id, s.year
          )
          SELECT f.id AS fixtureId, f.externalId, s.competitionId, s.year AS season, f.kickoff, f.status, f.retrievedAt,
            f.createdAt, f.regulationVerifiedAt, r.firstTrackedAt, r.firstFinalAt, r.lastSyncAt, r.nextCheckAt, r.failures
          FROM FootballFixture f JOIN coveredSeasons s ON s.id = f.seasonId
          LEFT JOIN FixtureResultState r ON r.fixtureId = f.id
          WHERE f.provider = 'api-football' AND (
            (f.kickoff >= ${new Date(day.startInclusive)} AND f.kickoff < ${new Date(day.endExclusive)})
            OR (${policy.skipConfirmedFinals !== true} AND f.kickoff BETWEEN ${correctionLower} AND ${upper})
            OR (f.kickoff BETWEEN ${lower} AND ${upper} AND (
              f.status NOT IN ('finished-regulation', 'finished-extra-time', 'finished-penalties', 'canceled', 'abandoned', 'awarded')
              OR (f.regulationVerifiedAt IS NULL AND f.status IN ('finished-regulation', 'finished-extra-time', 'finished-penalties'))))
            OR (f.kickoff IS NULL AND f.createdAt >= ${lower} AND (
              ${policy.skipConfirmedFinals !== true}
              OR f.status NOT IN ('finished-regulation', 'finished-extra-time', 'finished-penalties', 'canceled', 'abandoned', 'awarded')))
          )`;
        return freezeEvidence(fixtures.map((fixture) => ({ fixtureId: fixture.fixtureId, externalId: Number(fixture.externalId),
          competitionId: Number(fixture.competitionId), season: fixture.season, kickoffAt: fixture.kickoff?.getTime() ?? null,
          status: fixture.status, retrievedAt: fixture.retrievedAt.getTime(),
          firstTrackedAt: fixture.firstTrackedAt?.getTime() ?? Math.min(at, fixture.createdAt.getTime()),
          firstFinalAt: fixture.firstFinalAt?.getTime() ?? (finalStatus(fixture.status) ? fixture.retrievedAt.getTime() : null),
          lastSyncAt: fixture.lastSyncAt?.getTime() ?? null,
          nextCheckAt: fixture.firstTrackedAt === null ? 0 : fixture.nextCheckAt?.getTime() ?? null,
          failures: Number(fixture.failures ?? 0),
          ...(policy.skipConfirmedFinals ? { finalConfirmed: finalStatus(fixture.status) &&
            (!isPlayedFinalStatus(fixture.status as SettlementStatus) || fixture.regulationVerifiedAt !== null) } : {}) })));
      });
    },
    pending(lease) {
      return transaction(async (tx) => { await locked(tx, lease);
        const rows = await tx.resultSyncBatch.findMany({ where: { accountId, completedAt: null }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 100 });
        return Promise.all(rows.map((row) => sealedBatch(tx, row.id))); });
    },
    save(lease, input) {
      const batch = batchSchema.parse(input), body = evidenceSerialize(batch);
      return transaction(async (tx) => {
        const { at } = await locked(tx, lease);
        if (batch.accountId !== accountId || batch.receivedAt > at || batch.observations.some((entry) => entry.retrievedAt > batch.receivedAt))
          return resultSyncFail("invalid-request");
        await tx.$executeRaw`INSERT IGNORE INTO ResultSyncBatch (id, accountId, receivedAt, integrity, body)
          VALUES (${batch.id}, ${accountId}, ${new Date(batch.receivedAt)}, SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
        if (evidenceFingerprint(await sealedBatch(tx, batch.id)) !== evidenceFingerprint(batch)) return resultSyncFail("invalid-request");
      });
    },
    async apply(lease, input) {
      // Recover from the sealed source, never caller-modified normalized data.
      const batch = await transaction(async (tx) => { await locked(tx, lease); return sealedBatch(tx, input.id); });
      const renewalMs = await transaction(async (tx) => { const { row, at } = await locked(tx, lease); return row.leaseUntil.getTime() - at; });
      for (const observation of batch.observations) {
        await transaction(async (tx) => {
          const { at, row } = await locked(tx, lease);
          if (row.leaseUntil.getTime() - at < renewalMs / 2)
            await tx.resultPollerLease.update({ where: { accountId }, data: { leaseUntil: new Date(at + renewalMs) } });
          await history.withFixtureTransaction(observation.fixtureId, async (_writer, tx) => {
            const id = evidenceFingerprint({ batchId: batch.id, fixtureId: observation.fixtureId });
            if (await tx.resultProviderObservation.findUnique({ where: { id } })) return;
            const before = await tx.footballFixture.findUniqueOrThrow({ where: { id: observation.fixtureId }, select: { status: true, retrievedAt: true } });
            const receipt = await lifecycle.observeProjection(observation, tx);
            async function record(outcome: string, resultId: string | null, reason?: string) {
              const body = evidenceSerialize({ observation, lifecycleId: receipt.id, outcome, lifecycleOutcome: receipt.outcome,
                resultId, appliedAt: at, ...(reason ? { reason } : {}) });
              await tx.$executeRaw`INSERT INTO ResultProviderObservation (id, batchId, fixtureId, lifecycleId, retrievedAt, integrity, body)
                VALUES (${id}, ${batch.id}, ${observation.fixtureId}, ${receipt.id}, ${new Date(observation.retrievedAt)},
                  SHA2(CAST(JSON_EXTRACT(${body}, '$') AS CHAR), 256), JSON_EXTRACT(${body}, '$'))`;
            }
            if (receipt.outcome === "conflict" && receipt.reason === "identity-unresolved") {
              await record("conflict", null, receipt.reason);
              return;
            }
            const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: observation.fixtureId } });
            const state = await tx.fixtureResultState.findUnique({ where: { fixtureId: fixture.id } });
            const previous = state?.resultId ? await tx.fixtureResult.findUniqueOrThrow({ where: { id: state.resultId } }) : null;
            const cursor = await tx.fixtureLifecycleState.findUniqueOrThrow({ where: { fixtureId: fixture.id } });
            // An exact lifecycle replay returns its original accepted receipt.
            // It cannot authorize old scores after a newer cursor has advanced.
            const originallyAccepted = receipt.outcome === "accepted" || receipt.outcome === "unchanged";
            const accepted = originallyAccepted && cursor.retrievedAt.getTime() === observation.retrievedAt &&
              cursor.contentHash === lifecycleContentHash(observation) && fixture.retrievedAt.getTime() === observation.retrievedAt &&
              fixture.status === observation.status && fixture.providerStatus === observation.providerStatus;
            const outcome = originallyAccepted && !accepted ? "stale" : receipt.outcome;
            const value = fixtureResultValue(fixture, observation);
            const contentHash = evidenceFingerprint(value);
            let resultId = previous?.id ?? null;
            if (accepted && previous?.contentHash !== contentHash) {
              const version = (await tx.footballFixture.update({ where: { id: fixture.id }, data: { dataVersion: { increment: 1 } }, select: { dataVersion: true } })).dataVersion;
              resultId = await insertFixtureResult(tx, { fixtureId: fixture.id, fixtureVersion: version, previousId: previous?.id ?? null,
                observationId: id, observedAt: observation.retrievedAt, providerUpdatedAt: observation.providerUpdatedAt,
                regulationVerifiedAt: fixture.regulationVerifiedAt, value, contentHash });
              await tx.predictionChangeEvent.create({ data: { fixtureId: fixture.id, version, fixtureResultId: resultId, kind: "fixture-result", at: new Date(at) } });
            }
            const lastSyncAt = new Date(Math.max(state?.lastSyncAt?.getTime() ?? 0, observation.retrievedAt));
            const firstFinalAt = state?.firstFinalAt ?? (finalStatus(before.status) ? before.retrievedAt
              : accepted && finalStatus(fixture.status) ? new Date(observation.retrievedAt) : null);
            const data = { resultId, lastSyncAt, firstFinalAt,
              ...(accepted ? { failures: 0, delayReason: null } : { delayReason: outcome === "stale" ? "older-observation" : receipt.reason }) };
            await tx.fixtureResultState.upsert({ where: { fixtureId: fixture.id },
              create: { fixtureId: fixture.id, firstTrackedAt: new Date(at), nextCheckAt: epoch, ...data }, update: data });
            await record(outcome, resultId);
          }, tx);
          await locked(tx, lease);
        });
      }
      await transaction(async (tx) => { const { at } = await locked(tx, lease);
        await tx.resultSyncBatch.update({ where: { id: batch.id }, data: { completedAt: new Date(at) } }); });
    },
    schedule(lease, channel, nextAt, failures, error) {
      return transaction(async (tx) => { await locked(tx, lease);
        await tx.resultPollerLease.update({ where: { accountId }, data: channel === "live"
          ? { nextLiveAt: new Date(nextAt), liveFailures: failures, liveError: error }
          : { nextDateAt: new Date(nextAt), dateFailures: failures, dateError: error } }); });
    },
    attempts(lease, entries) {
      return transaction(async (tx) => { const { at } = await locked(tx, lease);
        for (const entry of entries) {
          const data = { lastAttemptAt: new Date(at), nextCheckAt: entry.nextAt === null ? null : new Date(entry.nextAt), failures: entry.failures };
          await tx.fixtureResultState.upsert({ where: { fixtureId: entry.fixtureId },
            create: { fixtureId: entry.fixtureId, firstTrackedAt: new Date(at), delayReason: entry.error, ...data },
            update: { ...data, ...(entry.error === null ? {} : { delayReason: entry.error }) } });
        }
      });
    },
  };
  return Object.freeze({ ...store,
    health: () => database.query((tx) => tx.resultPollerLease.findUnique({ where: { accountId } })),
    result(fixtureId: string) {
      return database.transaction(async (tx) => {
        const state = await tx.fixtureResultState.findUnique({ where: { fixtureId } });
        if (!state?.resultId) return { state, result: null };
        return { state, result: await storedFixtureResult(tx, fixtureId, state.resultId) };
      }, { isolationLevel: "RepeatableRead" });
    },
  });
}

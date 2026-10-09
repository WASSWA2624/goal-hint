import "server-only";

import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import { JobQueueError, type JobLease, type JobQueue } from "../jobs/job-contract.ts";
import { durableJobId } from "../jobs/job-input.ts";
import { defineJob } from "../jobs/job-registry.ts";
import { CutoffLockingError, cutoffFail, type CutoffAuthority, type CutoffOperation, type CutoffRecoveryInput,
  type CutoffResult, type CutoffTarget, type VoidLockedCycleInput } from "./cutoff-contract.ts";
import { reconstructCutoff, revisionEligibleForLock } from "./cutoff-eligibility.ts";
import { CUTOFF_JOB_TYPE, cutoffEnvelope, cutoffPayloadSchema, parseCutoff, parseCutoffPolicy,
  parseCutoffRecovery, parseCutoffTarget, parseCutoffVoid } from "./cutoff-input.ts";
import { cutoffResult, storedCutoffOperation } from "./cutoff-read.ts";
import { createMysqlPredictionHistoryStore, type PredictionHistoryWriter } from "./history-mysql-store.ts";
import { historyId } from "./history-input.ts";
import { historyTime, storedCycle, storedRevision } from "./history-read.ts";
import { recordPublicationBarrier } from "./publication-barrier.ts";
import type { PublicationObservation } from "./publication-contract.ts";
import { observationShowsPlay, statusShowsPlay } from "./publication-eligibility.ts";
import { parsePublicationObservation } from "./publication-input.ts";
import { storedPublicationBarrier, storedRefreshResult } from "./publication-read.ts";

type Transaction = Prisma.TransactionClient;
async function serverNow(tx: Transaction): Promise<UtcInstant> {
  return historyTime((await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at);
}
function checked(value: unknown, expected: true | undefined) {
  if (value === expected) return;
  void Promise.resolve(value).catch(() => {}); cutoffFail("unauthorized");
}
export function createCutoffLockingService(options: Readonly<{
  database: DatabaseRuntime; queue: JobQueue; policy: unknown; authority: CutoffAuthority;
}>) {
  const { database, queue, authority } = options, policy = parseCutoffPolicy(options.policy);
  const history = createMysqlPredictionHistoryStore(database);
  function authorize(action: Parameters<CutoffAuthority["authorize"]>[0], target: CutoffTarget, proof?: () => unknown) {
    try { checked(authority.authorize(action, target), undefined); checked(authority.verifyPolicy(policy), true);
      if (proof) checked(proof(), true);
    } catch { return cutoffFail("unauthorized"); }
  }
  async function mutate<Result>(target: CutoffTarget, operation: (writer: PredictionHistoryWriter, tx: Transaction) => Promise<Result>, tx?: Transaction) {
    let failure: unknown;
    try { return await history.withFixtureTransaction(target.fixtureId, async (writer, transaction) => {
      try { return await operation(writer, transaction); } catch (error) { failure = error; throw error; }
    }, tx); } catch {
      if (failure instanceof CutoffLockingError) throw failure;
      if (failure instanceof JobQueueError && failure.reason === "lost-lease") return cutoffFail("lost-lease");
      return cutoffFail("unavailable");
    }
  }
  async function schedules(tx: Transaction, target: CutoffTarget) {
    return (await tx.predictionSchedule.findMany({ where: target, orderBy: { version: "asc" } })).map((row) => ({
      version: row.version, kickoffAt: historyTime(row.kickoffAt), cutoffAt: historyTime(row.cutoffAt), observedAt: historyTime(row.observedAt),
      actualStartedAt: row.actualStartedAt === null ? null : historyTime(row.actualStartedAt) }));
  }
  async function save(tx: Transaction, operation: CutoffOperation) {
    const payload = evidenceSerialize(operation);
    await tx.$executeRaw`INSERT INTO PredictionCycleOperation
      (id, fixtureId, cycleId, kind, fixtureVersion, revisionId, at, integrity, operationJson)
      VALUES (${operation.id}, ${operation.fixtureId}, ${operation.cycleId}, ${operation.kind}, ${operation.fixtureVersion},
        ${operation.cycle.lockedSetId}, ${new Date(operation.at)}, SHA2(CAST(CAST(${payload} AS JSON) AS CHAR), 256), CAST(${payload} AS JSON))`;
    await tx.predictionChangeEvent.create({ data: { fixtureId: operation.fixtureId, version: operation.fixtureVersion,
      operationId: operation.id, kind: operation.kind === "close" ? "cycle-closed" : "cycle-voided", at: new Date(operation.at) } });
    return cutoffResult(tx, (await storedCutoffOperation(tx, operation.cycleId, operation.kind))!);
  }
  async function scheduleCycle(input: CutoffTarget, recovery?: CutoffRecoveryInput) {
    const target = parseCutoffTarget(input);
    let failure: unknown;
    try {
      return await queue.withTransaction(async (enqueue, tx) => {
        try {
          return await mutate(target, async (_writer, transaction) => {
            const action = recovery ? "recover" : "schedule", proof = recovery ? () => authority.verifyRecovery(recovery) : undefined;
            authorize(action, target, proof);
            const cycle = await storedCycle(transaction, target.cycleId);
            if (!cycle || cycle.fixtureId !== target.fixtureId) return cutoffFail("wrong-cycle");
            if (cycle.state !== "open") return null;
            const fixture = await transaction.footballFixture.findUniqueOrThrow({ where: { id: target.fixtureId } });
            if (fixture.activeCycleId !== cycle.id) return cutoffFail("wrong-cycle");
            const job = await enqueue(cutoffEnvelope(cycle, policy, recovery?.recoveryKey ?? null, recovery ? {
              actor: recovery.actor, reason: recovery.reason, evidenceRef: recovery.evidenceRef } : null));
            authorize(action, target, proof);
            return job;
          }, tx);
        } catch (error) { failure = error; throw error; }
      });
    } catch {
      if (failure instanceof CutoffLockingError) throw failure;
      return cutoffFail("unavailable");
    }
  }
  async function close(input: CutoffTarget, lease?: JobLease, observation?: PublicationObservation): Promise<CutoffResult> {
    const target = parseCutoffTarget(input);
    return mutate(target, async (writer, tx) => {
      const proof = observation === undefined ? undefined : () => authority.verifyObservation(observation);
      authorize(observation ? "observe-play" : "close", target, proof);
      const previous = await storedCutoffOperation(tx, target.cycleId, "close");
      if (previous) {
        if (previous.fixtureId !== target.fixtureId) return cutoffFail("wrong-cycle");
        return cutoffResult(tx, previous);
      }
      const cycle = await storedCycle(tx, target.cycleId);
      if (!cycle || cycle.fixtureId !== target.fixtureId || cycle.state !== "open") return cutoffFail("wrong-cycle");
      const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: target.fixtureId } });
      if (fixture.activeCycleId !== cycle.id) return cutoffFail("wrong-cycle");
      let now = await serverNow(tx);
      if (lease) {
        const payload = parseCutoff(cutoffPayloadSchema, lease.job.envelope.payload);
        if (payload.fixtureId !== target.fixtureId || payload.cycleId !== target.cycleId || payload.scheduleVersion > cycle.scheduleVersion ||
          lease.jobId !== durableJobId({ type: CUTOFF_JOB_TYPE, handlerVersion: 1,
            idempotencyKey: evidenceFingerprint({ cycleId: cycle.id, scheduleVersion: payload.scheduleVersion, recoveryKey: payload.recoveryKey }) }))
          return cutoffFail("invalid-request");
        await queue.assertOwned(tx, lease);
      }
      let barrier = await storedPublicationBarrier(tx, cycle.id);
      if (observation) {
        if (observation.fixtureId !== target.fixtureId || observation.cycleId !== cycle.id ||
          observation.externalFixtureId !== Number(fixture.externalId) || observation.retrievedAt > now || !observationShowsPlay(observation))
          return cutoffFail("invalid-request");
        barrier = await recordPublicationBarrier(tx, observation, now);
      }
      const rows = await schedules(tx, target);
      const canonicalStart = statusShowsPlay(fixture.status) && fixture.retrievedAt.getTime() <= now ? fixture.retrievedAt.getTime() : null;
      const starts = [barrier?.closedAt, observation?.actualStartedAt ?? observation?.retrievedAt, canonicalStart]
        .filter((at): at is UtcInstant => at != null);
      const eligibility = reconstructCutoff(cycle, rows, now, starts.length ? utcInstantFromEpochMilliseconds(Math.min(...starts)) : null);
      if (!eligibility.due) return cutoffFail("not-due");
      // Traverse accepted runs in their stored order. Neither the current pointer
      // nor scores, outcome labels, source confidence or completion order choose a pick.
      const accepted = await tx.predictionRefreshResult.findMany({ where: { ...target, outcome: "published" }, orderBy: { runSequence: "desc" }, select: { id: true } });
      let revision = null;
      for (const row of accepted) {
        const receipt = await storedRefreshResult(tx, row.id);
        if (!receipt || receipt.outcome !== "published") return cutoffFail("unavailable");
        const candidate = await storedRevision(tx, receipt.revisionId!);
        if (!candidate || candidate.runId !== receipt.runId || candidate.runSequence !== receipt.runSequence ||
          candidate.fixtureId !== receipt.fixtureId || candidate.cycleId !== receipt.cycleId || candidate.publishedAt !== receipt.at)
          return cutoffFail("unavailable");
        if (revisionEligibleForLock(candidate, cycle, rows, eligibility.effectiveCloseAt)) { revision = candidate; break; }
      }
      now = await serverNow(tx);
      const closedAt = utcInstantFromEpochMilliseconds(Math.max(cycle.openedAt, eligibility.effectiveCloseAt));
      if (now < closedAt) return cutoffFail("unavailable");
      const id = evidenceFingerprint({ cycleId: cycle.id, kind: "close" });
      const next = await writer.changeCycle({ actor: "cutoff-locking", reason: eligibility.reason,
        evidenceRef: observation?.evidenceRef ?? policy.evidenceRef, cycleId: cycle.id, expectedVersion: cycle.version, eventKey: id, at: now,
        next: { state: "closed", currentSetId: cycle.currentSetId, lockedSetId: revision?.id ?? null,
          closedAt, lockedAt: revision ? now : null, voidedAt: null, voidReason: null } });
      const version = (await tx.footballFixture.findUniqueOrThrow({ where: { id: target.fixtureId }, select: { dataVersion: true } })).dataVersion;
      const result = await save(tx, freezeEvidence({ id, ...target, kind: "close", fixtureVersion: version, at: now,
        effectiveCloseAt: eligibility.effectiveCloseAt, actor: "cutoff-locking", reason: eligibility.reason,
        evidenceRef: observation?.evidenceRef ?? policy.evidenceRef, scheduleHash: evidenceFingerprint(rows), cycle: next }));
      if (lease) await queue.assertOwned(tx, lease);
      authorize(observation ? "observe-play" : "close", target, proof);
      if (await serverNow(tx) < now) return cutoffFail("unavailable");
      return result;
    });
  }
  return Object.freeze({ scheduleCycle, close,
    async scheduleRun(runId: string) {
      parseCutoff(historyId, runId);
      const entries = await database.query(async (tx) => {
        const run = await tx.dailyRun.findUnique({ where: { id: runId }, select: { committedAt: true } });
        if (!run || run.committedAt === null) return cutoffFail("invalid-request");
        return tx.runFixture.findMany({ where: { runId }, orderBy: { rank: "asc" }, select: { fixtureId: true, cycleId: true } });
      });
      for (const entry of entries) await scheduleCycle(entry);
      return entries.length;
    },
    closeObservedPlay(input: PublicationObservation) {
      const observation = parsePublicationObservation(input);
      return close({ fixtureId: observation.fixtureId, cycleId: observation.cycleId }, undefined, observation);
    },
    recoverCycle(input: CutoffRecoveryInput) {
      const recovery = parseCutoffRecovery(input);
      return scheduleCycle({ fixtureId: recovery.fixtureId, cycleId: recovery.cycleId }, recovery);
    },
    async voidLockedCycle(input: VoidLockedCycleInput): Promise<CutoffResult> {
      const action = parseCutoffVoid(input), target = { fixtureId: action.fixtureId, cycleId: action.cycleId };
      return mutate(target, async (writer, tx) => {
        authorize("void", target, () => authority.verifyVoid(action));
        const previous = await storedCutoffOperation(tx, target.cycleId, "void");
        if (previous) {
          if (previous.fixtureId !== target.fixtureId) return cutoffFail("wrong-cycle");
          return cutoffResult(tx, previous);
        }
        const cycle = await storedCycle(tx, target.cycleId);
        if (!cycle || cycle.fixtureId !== target.fixtureId || cycle.state !== "closed") return cutoffFail("wrong-cycle");
        const now = await serverNow(tx), id = evidenceFingerprint({ cycleId: cycle.id, kind: "void" });
        const next = await writer.changeCycle({ actor: action.actor, reason: action.reason, evidenceRef: action.evidenceRef,
          cycleId: cycle.id, expectedVersion: cycle.version, eventKey: id, at: now,
          next: { state: "void", currentSetId: cycle.currentSetId, lockedSetId: cycle.lockedSetId, closedAt: cycle.closedAt,
            lockedAt: cycle.lockedAt, voidedAt: now, voidReason: action.reason } });
        const version = (await tx.footballFixture.findUniqueOrThrow({ where: { id: target.fixtureId }, select: { dataVersion: true } })).dataVersion;
        const result = await save(tx, freezeEvidence({ id, ...target, kind: "void", fixtureVersion: version, at: now,
          effectiveCloseAt: cycle.closedAt!, actor: action.actor, reason: action.reason, evidenceRef: action.evidenceRef,
          scheduleHash: evidenceFingerprint(await schedules(tx, target)), cycle: next }));
        authorize("void", target, () => authority.verifyVoid(action));
        if (await serverNow(tx) < now) return cutoffFail("unavailable");
        return result;
      });
    },
  });
}
export function createCutoffJob(service: ReturnType<typeof createCutoffLockingService>) {
  return defineJob({ type: CUTOFF_JOB_TYPE, handlerVersion: 1, payload: cutoffPayloadSchema,
    async handle(payload, context) {
      if (context.signal.aborted) return { status: "failed", reason: "worker-stopping", retryable: true };
      const target = { fixtureId: payload.fixtureId, cycleId: payload.cycleId };
      try { await service.close(target, context.lease); return { status: "succeeded" }; }
      catch (error) {
        if (error instanceof CutoffLockingError && error.reason === "not-due") {
          const next = await service.scheduleCycle(target);
          return next?.id === context.lease.jobId ? { status: "failed", reason: "handler-failed", retryable: true } : { status: "succeeded" };
        }
        return { status: "failed", reason: "handler-failed", retryable: true };
      }
    },
  });
}

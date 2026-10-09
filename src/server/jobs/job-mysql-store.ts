import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { freezeEvidence } from "../evidence/evidence-input.ts";
import { JobQueueError, jobFail, type JobEnvelope, type JobLease, type JobQueue, type JobReason,
  type JobState, type JobTransaction, type JobUsage, type StoredJob } from "./job-contract.ts";
import { durableJobId, jobEnqueueBucket, jobFingerprint, jobHash, jobInstant, jobReason, jobSerialize, jobType, jobVersion,
  parseJob, parseJobEnvelope, retryDelay, usageInput } from "./job-input.ts";

type Row = Record<string, unknown>;
const instant = (value: unknown) => value instanceof Date ? parseJob(jobInstant, value.getTime()) : jobFail("unavailable");
const nullableTime = (value: unknown) => value === null ? null : instant(value);
const integer = (value: unknown) => parseJob(jobVersion, typeof value === "bigint" ? Number(value) : value);
const counter = (value: unknown) => value === 0 || value === 0n ? 0 : integer(value);
async function serverNow(transaction: JobTransaction): Promise<number> {
  const rows = await transaction.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`;
  return instant(rows[0]?.at);
}
async function load(transaction: JobTransaction, id: string, lock = false): Promise<StoredJob | null> {
  const rows = await transaction.$queryRaw<Row[]>(Prisma.sql`SELECT *,
    integrity = SHA2(CONCAT(id, ':', requestHash, ':', CAST(envelopeJson AS CHAR)), 256) AS validIntegrity
    FROM DurableJob WHERE id = ${id} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  const row = rows[0]; if (!row) return null;
  try {
    if (![true, 1, 1n].includes(row.validIntegrity as boolean)) return jobFail("unavailable");
    const envelope = parseJobEnvelope(typeof row.envelopeJson === "string" ? JSON.parse(row.envelopeJson) : row.envelopeJson);
    if (durableJobId(envelope) !== id || jobFingerprint(envelope) !== row.requestHash || envelope.type !== row.type ||
      envelope.handlerVersion !== integer(row.handlerVersion) || envelope.idempotencyKey !== row.idempotencyKey ||
      envelope.priority !== counter(row.priority) || envelope.expiresAt !== instant(row.expiresAt) ||
      (envelope.refresh?.runId ?? null) !== row.refreshRunId || (envelope.refresh?.fixtureId ?? null) !== row.refreshFixtureId ||
      (envelope.refresh?.cycleId ?? null) !== row.refreshCycleId) return jobFail("unavailable");
    if (!["pending", "running", "succeeded", "failed", "expired"].includes(String(row.state))) return jobFail("unavailable");
    return freezeEvidence({ id, envelope, state: row.state as JobState, version: integer(row.version),
      attemptCount: counter(row.attemptCount), fence: counter(row.fence), availableAt: instant(row.availableAt),
      createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt), ownerId: row.ownerId === null ? null : parseJob(jobHash, row.ownerId),
      leaseExpiresAt: nullableTime(row.leaseExpiresAt), attemptDeadlineAt: nullableTime(row.attemptDeadlineAt),
      finishedAt: nullableTime(row.finishedAt), terminalReason: row.terminalReason === null ? null : parseJob(jobReason, row.terminalReason) });
  } catch { return jobFail("unavailable"); }
}

export function createMysqlJobQueue(database: DatabaseRuntime): JobQueue {
  async function transact<Result>(operation: (transaction: JobTransaction) => Promise<Result>, readOnly = false): Promise<Result> {
    let domainError: JobQueueError | undefined;
    try {
      return await database.transaction(async (transaction) => {
        try { return await operation(transaction); }
        catch (error) { if (error instanceof JobQueueError) domainError = error; throw error; }
      }, { isolationLevel: readOnly ? "RepeatableRead" : "ReadCommitted", timeout: 15_000 });
    } catch { if (domainError) throw domainError; return jobFail("unavailable"); }
  }
  async function event(transaction: JobTransaction, job: StoredJob, kind: string, reason: JobReason | null, at: number, attemptId: string | null) {
    const version = parseJob(jobVersion, job.version + 1);
    await transaction.durableJob.update({ where: { id: job.id }, data: { version, updatedAt: new Date(at) } });
    await transaction.durableJobEvent.create({ data: { id: randomUUID(), jobId: job.id, version, kind, reason, at: new Date(at), attemptId } });
  }
  async function enqueue(transaction: JobTransaction, input: JobEnvelope): Promise<StoredJob> {
    const envelope = parseJobEnvelope(input), id = durableJobId(envelope), requestHash = jobFingerprint(envelope);
    const bucket = jobEnqueueBucket(envelope);
    const locks = await transaction.$queryRaw<{ id: number }[]>`SELECT id FROM DurableJobEnqueueLock WHERE id = ${bucket} FOR UPDATE`;
    if (locks.length !== 1) return jobFail("unavailable");
    const known = await load(transaction, id, true);
    if (known) {
      if (jobFingerprint(known.envelope) !== requestHash) return jobFail("conflicting-request");
      return known;
    }
    const at = await serverNow(transaction), json = jobSerialize(envelope);
    // The shard serializes first insertion as well as refresh-key conflicts.
    // Never retry the surrounding callback or arbitrary business effects.
    try {
      await transaction.$executeRaw`INSERT INTO DurableJob
        (id, type, handlerVersion, idempotencyKey, requestHash, integrity, envelopeJson,
         refreshRunId, refreshFixtureId, refreshCycleId, priority, availableAt, expiresAt, createdAt, updatedAt)
        VALUES (${id}, ${envelope.type}, ${envelope.handlerVersion}, ${envelope.idempotencyKey}, ${requestHash},
          SHA2(CONCAT(${id}, ':', ${requestHash}, ':', CAST(CAST(${json} AS JSON) AS CHAR)), 256), CAST(${json} AS JSON),
          ${envelope.refresh?.runId ?? null}, ${envelope.refresh?.fixtureId ?? null}, ${envelope.refresh?.cycleId ?? null},
          ${envelope.priority}, ${new Date(envelope.notBefore)}, ${new Date(envelope.expiresAt)}, ${new Date(at)}, ${new Date(at)})`;
    } catch {
      const winner = await load(transaction, id, true);
      if (winner) {
        if (jobFingerprint(winner.envelope) !== requestHash) return jobFail("conflicting-request");
        return winner;
      }
      if (envelope.refresh && await transaction.durableJob.findFirst({ where: {
        refreshRunId: envelope.refresh.runId, refreshFixtureId: envelope.refresh.fixtureId, refreshCycleId: envelope.refresh.cycleId,
      } })) return jobFail("conflicting-request");
      return jobFail("unavailable");
    }
    await transaction.durableJobEvent.create({ data: { id: randomUUID(), jobId: id, version: 1, kind: "enqueued", at: new Date(at) } });
    return (await load(transaction, id))!;
  }
  async function withTransaction<Result>(operation: (write: (input: JobEnvelope) => Promise<StoredJob>, transaction: JobTransaction) => Promise<Result>): Promise<Result> {
    return transact(async (transaction) => {
      let active = true, failed = false, failure: unknown;
      const write = async (input: JobEnvelope) => {
        if (!active) return jobFail("invalid-request");
        if (failed) throw failure;
        try { return await enqueue(transaction, input); }
        catch (error) { failed = true; failure = error; throw error; }
      };
      try { const result = await operation(write, transaction); if (failed) throw failure; return result; }
      finally { active = false; }
    });
  }
  async function owned(transaction: JobTransaction, lease: JobLease): Promise<{ job: StoredJob; at: number }> {
    parseJob(jobHash, lease.jobId); parseJob(jobHash, lease.attemptId); parseJob(jobHash, lease.ownerId); parseJob(jobVersion, lease.fence);
    const job = await load(transaction, lease.jobId, true), at = await serverNow(transaction);
    if (!job || job.state !== "running" || job.ownerId !== lease.ownerId || job.fence !== lease.fence ||
      job.leaseExpiresAt === null || at >= job.leaseExpiresAt || job.attemptDeadlineAt === null || at >= job.attemptDeadlineAt ||
      at >= job.envelope.expiresAt) return jobFail("lost-lease");
    const attempt = await transaction.durableJobAttempt.findUnique({ where: { jobId_number: { jobId: job.id, number: job.attemptCount } } });
    if (!attempt || attempt.id !== lease.attemptId || attempt.ownerId !== lease.ownerId || attempt.fence !== lease.fence || attempt.outcome !== "running") return jobFail("lost-lease");
    return { job, at };
  }
  async function finish(transaction: JobTransaction, job: StoredJob, attemptId: string | null, at: number,
    reason: JobReason, retryable: boolean, success = false): Promise<StoredJob> {
    let state: JobState = success ? "succeeded" : "failed", terminal: JobReason | null = reason;
    let availableAt = job.availableAt;
    if (!success && (reason === "eligibility-expired" || at >= job.envelope.expiresAt)) { state = "expired"; terminal = "eligibility-expired"; }
    else if (!success && retryable) {
      if (job.attemptCount >= job.envelope.maxAttempts) terminal = "attempts-exhausted";
      else {
        availableAt = at + retryDelay(job.envelope, Math.max(1, job.attemptCount));
        if (availableAt >= job.envelope.expiresAt) { state = "expired"; terminal = "eligibility-expired"; }
        else { state = "pending"; terminal = null; }
      }
    }
    if (attemptId) await transaction.durableJobAttempt.update({ where: { id: attemptId }, data: {
      outcome: success ? "succeeded" : state === "pending" ? "retry" : state === "expired" ? "expired" : "failed",
      reason, finishedAt: new Date(at),
    } });
    await transaction.durableJob.update({ where: { id: job.id }, data: {
      state, terminalReason: terminal, availableAt: new Date(availableAt), ownerId: null,
      leaseExpiresAt: null, attemptDeadlineAt: null, finishedAt: state === "pending" ? null : new Date(at),
    } });
    await event(transaction, job, success ? "acknowledged" : state === "pending" ? "retry-scheduled" : state, reason, at, attemptId);
    return (await load(transaction, job.id))!;
  }
  async function completeInTransaction(transaction: JobTransaction, lease: JobLease): Promise<StoredJob> {
    const { job, at } = await owned(transaction, lease);
    return finish(transaction, job, lease.attemptId, at, "completed", false, true);
  }
  return Object.freeze({
    withTransaction, enqueueInTransaction: enqueue, enqueue: (input) => withTransaction((write) => write(input)),
    async claim(ownerId, types) {
      parseJob(jobHash, ownerId);
      if (types.length < 1 || types.length > 64) return jobFail("invalid-request");
      for (const type of types) { parseJob(jobType, type.type); parseJob(jobVersion, type.handlerVersion); }
      return transact(async (transaction) => {
        const accepted = Prisma.join(types.map((type) => Prisma.sql`(type = ${type.type} AND handlerVersion = ${type.handlerVersion})`), " OR ");
        for (let scan = 0; scan < 32; scan++) {
          const rows = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM DurableJob
            WHERE (${accepted}) AND ((state = 'pending' AND availableAt <= UTC_TIMESTAMP(3)) OR
              (state = 'running' AND leaseExpiresAt <= UTC_TIMESTAMP(3)))
            ORDER BY priority DESC, availableAt ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`);
          if (!rows[0]) return null;
          const job = (await load(transaction, rows[0].id))!, at = await serverNow(transaction);
          if (job.state === "running") {
            const attempt = await transaction.durableJobAttempt.findUniqueOrThrow({ where: { jobId_number: { jobId: job.id, number: job.attemptCount } } });
            await finish(transaction, job, attempt.id, at, at >= job.envelope.expiresAt ? "eligibility-expired" :
              at >= attempt.deadlineAt.getTime() ? "timeout" : "lease-expired", true);
            continue;
          }
          if (at >= job.envelope.expiresAt || job.attemptCount >= job.envelope.maxAttempts) {
            await finish(transaction, job, null, at, at >= job.envelope.expiresAt ? "eligibility-expired" : "attempts-exhausted", false); continue;
          }
          const number = job.attemptCount + 1, fence = parseJob(jobVersion, job.fence + 1);
          const deadlineAt = Math.min(at + job.envelope.timeoutMs, job.envelope.expiresAt);
          const leaseExpiresAt = Math.min(at + job.envelope.leaseMs, deadlineAt), attemptId = jobFingerprint(randomUUID());
          await transaction.durableJobAttempt.create({ data: { id: attemptId, jobId: job.id, number, fence, ownerId,
            startedAt: new Date(at), deadlineAt: new Date(deadlineAt), outcome: "running" } });
          await transaction.durableJob.update({ where: { id: job.id }, data: { state: "running", attemptCount: number, fence,
            ownerId, leaseExpiresAt: new Date(leaseExpiresAt), attemptDeadlineAt: new Date(deadlineAt) } });
          await event(transaction, job, "claimed", null, at, attemptId);
          return freezeEvidence({ job: (await load(transaction, job.id))!, jobId: job.id, attemptId, ownerId, fence, leaseExpiresAt, deadlineAt, serverNow: at });
        }
        return null;
      });
    },
    async renew(lease) {
      return transact(async (transaction) => {
        const { job, at } = await owned(transaction, lease), leaseExpiresAt = Math.min(at + job.envelope.leaseMs, job.attemptDeadlineAt!);
        await transaction.durableJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(leaseExpiresAt) } });
        await event(transaction, job, "renewed", null, at, lease.attemptId);
        return freezeEvidence({ ...lease, job: (await load(transaction, job.id))!, leaseExpiresAt, serverNow: at });
      });
    },
    completeInTransaction, assertOwned: async (transaction, lease) => (await owned(transaction, lease)).at,
    acknowledge: (lease) => transact((transaction) => completeInTransaction(transaction, lease)),
    retry: (lease, reason, retryable) => {
      parseJob(jobReason, reason);
      if (reason === "completed" || typeof retryable !== "boolean") return jobFail("invalid-request");
      return transact(async (transaction) => { const { job, at } = await owned(transaction, lease); return finish(transaction, job, lease.attemptId, at, reason, retryable); });
    },
    async recordUsage(lease: JobLease, input: JobUsage) {
      const usage = parseJob(usageInput, input), requestHash = jobFingerprint(usage);
      const id = jobFingerprint([lease.attemptId, usage.requestReference, usage.phase]);
      await transact(async (transaction) => {
        const { job, at } = await owned(transaction, lease);
        const known = await transaction.durableJobUsage.findUnique({ where: { id } });
        if (known) { if (known.requestHash !== requestHash) jobFail("conflicting-request"); return; }
        await transaction.durableJobUsage.create({ data: { ...usage, id, jobId: job.id, attemptId: lease.attemptId,
          version: job.version + 1, requestHash, recordedAt: new Date(at) } });
        await event(transaction, job, "usage-recorded", null, at, lease.attemptId);
      });
    },
    inspect(id) { parseJob(jobHash, id); return transact((transaction) => load(transaction, id), true); },
    history(id, afterVersion = 0, limit = 30) {
      parseJob(jobHash, id); counter(afterVersion); if (!Number.isInteger(limit) || limit < 1 || limit > 100) return jobFail("invalid-request");
      return transact(async (transaction) => freezeEvidence((await transaction.durableJobEvent.findMany({ where: { jobId: id, version: { gt: afterVersion } },
        orderBy: { version: "asc" }, take: limit })).map((row) => ({ ...row, at: instant(row.at) }))), true);
    },
    attempts(id) {
      parseJob(jobHash, id);
      return transact(async (transaction) => freezeEvidence((await transaction.durableJobAttempt.findMany({ where: { jobId: id }, orderBy: { number: "asc" }, take: 16 }))
        .map((row) => ({ ...row, startedAt: instant(row.startedAt), deadlineAt: instant(row.deadlineAt), finishedAt: nullableTime(row.finishedAt) }))), true);
    },
    usage(id, afterVersion = 0, limit = 30) {
      parseJob(jobHash, id); counter(afterVersion); if (!Number.isInteger(limit) || limit < 1 || limit > 100) return jobFail("invalid-request");
      return transact(async (transaction) => freezeEvidence((await transaction.durableJobUsage.findMany({ where: { jobId: id, version: { gt: afterVersion } },
        orderBy: { version: "asc" }, take: limit })).map((row) => ({ ...row, recordedAt: instant(row.recordedAt) }))), true);
    },
  });
}

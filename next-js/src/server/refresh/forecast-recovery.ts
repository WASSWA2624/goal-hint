import "server-only";

import { calendarRules } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { Prisma } from "../generated/prisma/client.ts";
import type { JobQueue } from "../jobs/job-contract.ts";
import { durableJobId, jobType, parseJob, parseJobEnvelope } from "../jobs/job-input.ts";
import { storedRefreshResult } from "../predictions/publication-read.ts";
import type { RefreshPublicationResult } from "../predictions/publication-contract.ts";
import { storedSelectionManifest } from "../selection/selection-read.ts";
import { PredictionRefreshError } from "./refresh-contract.ts";
import { createMysqlRefreshStore, recoverPublicationOutcome } from "./refresh-mysql-store.ts";

const transientFailures = ["handler-failed", "timeout", "lease-expired", "worker-stopping", "rate-limited"];
const dbTime = async (tx: Prisma.TransactionClient) => (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at;

/** Background recovery repairs the original sealed job. It never issues a new forecast for an unchanged key. */
export function createForecastRecovery({ database, queue, jobType: type, scheduleCutoff }: Readonly<{
  database: DatabaseRuntime; queue: JobQueue; jobType: string;
  scheduleCutoff?(target: Readonly<{ fixtureId: string; cycleId: string }>, tx: Prisma.TransactionClient): Promise<unknown>;
}>) {
  parseJob(jobType, type);
  const refresh = createMysqlRefreshStore(database, queue);
  async function restore(key: { runId: string; fixtureId: string; cycleId: string }) {
    return queue.withTransaction(async (enqueue, tx) => {
      await tx.$queryRaw`SELECT id FROM DailyRun WHERE id = ${key.runId} FOR UPDATE`;
      const member = await tx.runFixture.findUnique({ where: { runId_fixtureId_cycleId: key }, include: { run: true } });
      if (!member || member.jobId !== null || member.run.committedAt === null) return false;
      const envelope = parseJobEnvelope(member.envelopeJson);
      if (envelope.type !== type || envelope.expiresAt <= (await dbTime(tx)).getTime()) return false;
      const manifest = await storedSelectionManifest(tx, member.run);
      const entry = manifest?.entries[member.rank];
      if (!entry || entry.rank !== member.rank || entry.fixtureId !== key.fixtureId || entry.cycleId !== key.cycleId ||
        entry.kickoffAt !== member.kickoffAt.getTime() || evidenceFingerprint(entry.envelope) !== evidenceFingerprint(envelope) ||
        evidenceFingerprint(envelope.refresh) !== evidenceFingerprint(key)) throw new Error("Forecast recovery could not verify the sealed job.");
      const job = await enqueue(envelope);
      if (durableJobId(envelope) !== job.id) throw new Error("Forecast recovery found a conflicting job.");
      await tx.runFixture.update({ where: { runId_fixtureId_cycleId: key },
        data: { jobId: job.id, jobState: job.state, terminalReason: job.terminalReason } });
      await scheduleCutoff?.({ fixtureId: key.fixtureId, cycleId: key.cycleId }, tx);
      return true;
    });
  }

  async function retry(row: Readonly<{ id: string; version: number }>) {
    return database.transaction(async (tx) => {
      const sealed: { publication?: RefreshPublicationResult } = {};
      const recovered = await queue.recoverInTransaction(tx, row.id, row.version, async (client, job) => {
        if (job.envelope.type !== type || job.envelope.refresh === null) return "failed";
        const result = await client.predictionRefreshResult.findFirst({ where: { jobId: job.id }, select: { id: true } });
        // A committed abstention or retained revision completes the original job just as a publication does.
        const publication = result ? await storedRefreshResult(client, result.id) : null;
        if (publication?.jobId === job.id) { sealed.publication = publication; return "succeeded"; }
        if (await client.predictionRefreshOutcome.findUnique({ where: { jobId: job.id }, select: { jobId: true } })) return "failed";
        try { await refresh.recoveryMember(client, job); }
        catch (error) { if (error instanceof PredictionRefreshError && error.reason === "ineligible") return "expired"; throw error; }
        return "retry";
      });
      if (recovered?.state === "succeeded" && sealed.publication) await recoverPublicationOutcome(tx, recovered, sealed.publication);
      return recovered && recovered.version !== row.version ? recovered.state : null;
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  }

  return {
    async run(maxJobs = 200) {
      if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 1_000) throw new RangeError("Invalid forecast recovery batch size.");
      const { missing, stalled } = await database.query(async (tx) => {
        const now = await dbTime(tx), kickoffAfter = new Date(now.getTime() + calendarRules.cutoffSecondsBeforeKickoff * 1000);
        const missing = await tx.runFixture.findMany({ where: { jobId: null, kickoffAt: { gt: kickoffAfter }, run: { committedAt: { not: null } },
          envelopeJson: { path: "$.type", equals: type } },
          orderBy: [{ kickoffAt: "asc" }, { runId: "asc" }, { fixtureId: "asc" }], take: maxJobs + 1,
          select: { runId: true, fixtureId: true, cycleId: true } });
        // Filter exhausted jobs before taking the bounded oldest batch or they can starve later work.
        const stalled = await tx.$queryRaw<{ id: string; version: number | bigint }[]>(Prisma.sql`
          SELECT job.id, job.version FROM DurableJob job
          WHERE job.type = ${type} AND job.expiresAt > ${now} AND (
            (job.state = 'running' AND (job.leaseExpiresAt <= ${now} OR job.attemptDeadlineAt <= ${now})) OR
            (job.state = 'failed' AND NOT EXISTS (SELECT 1 FROM PredictionRefreshOutcome outcome WHERE outcome.jobId = job.id) AND (
              (job.terminalReason IN (${Prisma.join(transientFailures)}) AND
                job.attemptCount < CAST(JSON_UNQUOTE(JSON_EXTRACT(job.envelopeJson, '$.maxAttempts')) AS UNSIGNED)) OR
              EXISTS (SELECT 1 FROM PredictionRefreshResult result WHERE result.jobId = job.id)
            ))
          ) ORDER BY job.availableAt, job.id LIMIT ${maxJobs + 1}`);
        return { missing, stalled };
      });
      let restored = 0, retried = 0, completed = 0, failed = 0, readMissing = 0, readStalled = 0;
      for (let index = 0; index < maxJobs && (readMissing < missing.length || readStalled < stalled.length); index++) {
        try {
          if (readMissing < missing.length && (index % 2 === 0 || readStalled >= stalled.length)) {
            if (await restore(missing[readMissing++]!)) restored++;
          } else {
            const row = stalled[readStalled++]!, state = await retry({ id: row.id, version: Number(row.version) });
            if (state === "pending") retried++;
            if (state === "succeeded") completed++;
          }
        } catch { failed++; }
      }
      const counts = await database.query(async (tx) => {
        const now = await dbTime(tx);
        const pending = await tx.durableJob.aggregate({ where: { type, state: "pending", expiresAt: { gt: now } },
          _count: { _all: true }, _min: { availableAt: true } });
        const active = await tx.durableJob.count({ where: { type, state: "running", expiresAt: { gt: now },
          leaseExpiresAt: { gt: now }, attemptDeadlineAt: { gt: now } } });
        return { pending: pending._count._all, active, lagMs: pending._min.availableAt === null ? 0
          : Math.max(0, now.getTime() - pending._min.availableAt.getTime()) };
      });
      return { restored, retried, completed, failed, ...counts, hasMore: readMissing < missing.length || readStalled < stalled.length };
    },
  };
}

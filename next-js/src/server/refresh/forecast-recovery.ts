import "server-only";

import { calendarRules } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import type { Prisma } from "../generated/prisma/client.ts";
import type { JobQueue } from "../jobs/job-contract.ts";
import { durableJobId, jobType, parseJob, parseJobEnvelope } from "../jobs/job-input.ts";
import { storedSelectionManifest } from "../selection/selection-read.ts";
import { PredictionRefreshError } from "./refresh-contract.ts";
import { createMysqlRefreshStore } from "./refresh-mysql-store.ts";

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
      const recovered = await queue.recoverInTransaction(tx, row.id, row.version, async (client, job) => {
        if (job.envelope.type !== type || job.envelope.refresh === null) return "failed";
        const published = await client.predictionRefreshResult.findFirst({ where: { jobId: job.id, outcome: "published" }, select: { id: true } });
        if (published) return "succeeded";
        if (await client.predictionRefreshOutcome.findUnique({ where: { jobId: job.id }, select: { jobId: true } })) return "failed";
        try { await refresh.recoveryMember(client, job); }
        catch (error) { if (error instanceof PredictionRefreshError && error.reason === "ineligible") return "expired"; throw error; }
        return "retry";
      });
      return recovered?.state === "pending" && recovered.version !== row.version;
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
        const candidates = await tx.durableJob.findMany({ where: { type, expiresAt: { gt: now }, OR: [
          { state: "running", OR: [{ leaseExpiresAt: { lte: now } }, { attemptDeadlineAt: { lte: now } }] },
          { state: "failed", terminalReason: { in: transientFailures }, refreshOutcome: null },
        ] }, orderBy: [{ availableAt: "asc" }, { id: "asc" }], take: maxJobs + 1,
        select: { id: true, version: true, state: true, attemptCount: true, envelopeJson: true } });
        const stalled = candidates.filter((job) => {
          if (job.state === "running") return true;
          try { return job.attemptCount < parseJobEnvelope(job.envelopeJson).maxAttempts; } catch { return false; }
        });
        return { missing, stalled };
      });
      let restored = 0, retried = 0, failed = 0, readMissing = 0, readStalled = 0;
      for (let index = 0; index < maxJobs && (readMissing < missing.length || readStalled < stalled.length); index++) {
        try {
          if (readMissing < missing.length && (index % 2 === 0 || readStalled >= stalled.length)) {
            if (await restore(missing[readMissing++]!)) restored++;
          } else if (await retry(stalled[readStalled++]!)) retried++;
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
      return { restored, retried, failed, ...counts, hasMore: readMissing < missing.length || readStalled < stalled.length };
    },
  };
}

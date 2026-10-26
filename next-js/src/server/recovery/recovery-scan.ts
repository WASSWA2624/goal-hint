import "server-only";

import { addReportingDays, createPredictionWindow, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { createMarketSettlementService } from "../settlement/settlement-service.ts";
import { parseRecovery, recoveryFail, recoveryScope, type RecoveryAction, type RecoveryPolicy, type RecoveryScope } from "./recovery-input.ts";

/** Read-only keyset pages. Inspection never acquires leases, creates runs or calls providers. */
export async function scanRecovery(database: DatabaseRuntime, policy: RecoveryPolicy,
  settlement: Pick<ReturnType<typeof createMarketSettlementService>, "pending">, scope: RecoveryScope, after = "") {
  parseRecovery(recoveryScope, scope);
  if (!/^[a-zA-Z0-9-]{0,64}$/u.test(after)) return recoveryFail("invalid-request");
  // The canonical service owns its query; release it before borrowing a transaction connection.
  const pending = scope === "settlement" ? await settlement.pending(policy.maxItems) : [];
  return database.transaction(async (tx) => {
    const now = (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
    const actions: RecoveryAction[] = [], findings: unknown[] = []; let next: string | null = null;
    const limit = policy.maxItems;
    if (scope === "runs") {
      const today = getReportingDate(utcInstantFromEpochMilliseconds(now));
      for (let age = policy.lookbackDays - 1; age >= 0; age--) {
        const date = addReportingDays(today, -age); if (date <= after) continue;
        const scheduledFor = createPredictionWindow(date).startInclusive;
        if (now < scheduledFor + policy.runGraceMs) continue;
        const run = await tx.dailyRun.findUnique({ where: { eatDate: new Date(`${date}T00:00:00Z`) } });
        const undispatched = run ? await tx.runFixture.count({ where: { runId: run.id, jobId: null } }) : 0;
        const stale = run?.leaseExpiresAt != null && run.leaseExpiresAt.getTime() <= now;
        const terminal = run ? await tx.runFixture.count({ where: { runId: run.id, job: { state: { in: ["succeeded", "failed", "expired"] } } } }) : 0;
        const needed = !run || !run.committedAt || undispatched > 0 || stale || terminal !== run.terminalJobs;
        const busy = run?.ownerId != null && run.leaseExpiresAt != null && run.leaseExpiresAt.getTime() > now;
        findings.push({ date, runId: run?.id ?? null, committed: run?.committedAt != null, partial: run?.partial ?? false,
          undispatched, terminal, busy, needed });
        if (needed && !busy) actions.push({ kind: "selection", scheduledFor, selectionHash: run?.selectionHash ?? null });
      }
    } else if (scope === "jobs") {
      const rows = await tx.durableJob.findMany({ where: { id: { gt: after }, OR: [
        { state: "running", OR: [{ leaseExpiresAt: { lte: new Date(now) } }, { attemptDeadlineAt: { lte: new Date(now) } }] },
        { state: "pending", availableAt: { lte: new Date(now - policy.stalledJobMs) } }, { state: "failed" },
      ] }, orderBy: { id: "asc" }, take: limit });
      for (const row of rows) {
        actions.push({ kind: "job", jobId: row.id, expectedVersion: row.version });
        findings.push({ jobId: row.id, state: row.state, version: row.version, attemptCount: row.attemptCount,
          disposition: row.state === "pending" ? "worker-required" : "review-eligibility" });
      }
      if (rows.length === limit) next = rows.at(-1)!.id;
    } else if (scope === "locks") {
      const rows = await tx.predictionCycle.findMany({ where: { id: { gt: after }, state: "open",
        activeForFixtures: { some: {} }, OR: [{ cutoffAt: { lte: new Date(now - policy.lockGraceMs) } },
          { publicationBarrier: { isNot: null } }, { fixture: { status: { in: ["live", "finished-regulation", "finished-extra-time", "finished-penalties"] } } }],
      }, select: { id: true, fixtureId: true }, orderBy: { id: "asc" }, take: limit });
      for (const row of rows) actions.push({ kind: "cutoff", fixtureId: row.fixtureId, cycleId: row.id });
      if (rows.length === limit) next = rows.at(-1)!.id;
    } else if (scope === "results" && policy.resultAccountId) {
      const row = await tx.resultPollerLease.findUnique({ where: { accountId: policy.resultAccountId } });
      const pending = await tx.resultSyncBatch.count({ where: { accountId: policy.resultAccountId, completedAt: null } });
      const overdue = await tx.fixtureResultState.count({ where: { OR: [
        { nextCheckAt: { lte: new Date(now - policy.resultGraceMs) } }, { nextCheckAt: null, resultId: null },
      ] } });
      const busy = row?.ownerId != null && row.leaseUntil.getTime() > now;
      if (!row || pending || overdue || row.nextDateAt.getTime() + policy.resultGraceMs <= now) {
        findings.push({ accountId: policy.resultAccountId, pending, overdue, busy, disposition: "existing-poller-and-horizon" });
        if (!busy) actions.push({ kind: "results", accountId: policy.resultAccountId });
      }
    } else if (scope === "settlement") {
      // The canonical pending query consumes change receipts; unresolved projections do not fabricate results.
      for (const fixtureId of pending) actions.push({ kind: "settlement", fixtureId });
    }
    return freezeEvidence({ scope, findings, next, draft: actions.length ? { version: 1 as const,
      policyHash: evidenceFingerprint(policy), plannedAt: now, expiresAt: now + policy.planTtlMs, actions } : null });
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}

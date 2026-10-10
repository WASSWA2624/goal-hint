import "server-only";

import { addReportingDays, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { evidenceFingerprint, evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import type { CatalogAuthority } from "../football/catalog-contract.ts";
import type { FootballCatalogStore } from "../football/catalog-mysql-store.ts";
import { JobQueueError, type JobLease, type JobQueue, type JobTransaction } from "../jobs/job-contract.ts";
import { durableJobId, parseJobEnvelope } from "../jobs/job-input.ts";
import { defineJob } from "../jobs/job-registry.ts";
import type { createCutoffLockingService } from "../predictions/cutoff-service.ts";
import { storedRefreshResult } from "../predictions/publication-read.ts";
import { createMysqlRefreshStore } from "../refresh/refresh-mysql-store.ts";
import { PredictionRefreshError } from "../refresh/refresh-contract.ts";
import type { SelectionPolicy } from "../selection/selection-contract.ts";
import { parseSelectionPolicy, selectionWindow } from "../selection/selection-input.ts";
import type { createDailySelectionService } from "../selection/selection-service.ts";
import type { createMarketSettlementService } from "../settlement/settlement-service.ts";
import { RecoveryError, parseRecovery, recoveryFail, recoveryPlan, recoveryPolicySchema,
  type RecoveryAction, type RecoveryPlan, type RecoveryPolicy, type RecoveryScope } from "./recovery-input.ts";
import { scanRecovery } from "./recovery-scan.ts";

export const RECOVERY_JOB_TYPE = "operations.recovery";
export type RecoveryAuthority = Readonly<{
  /** Validate current credentials/workload identity and named permission, not the actor string. */
  authorize(permission: "inspect" | "repair", plan?: RecoveryPlan): boolean | Promise<boolean>;
  verifyPolicy(policy: RecoveryPolicy): boolean;
  /** Resolve reviewed approval to this exact immutable plan and authenticated actor. */
  verifyPlan(plan: RecoveryPlan): boolean | Promise<boolean>;
}>;
export type RecoveryServices = Readonly<{
  selectionPolicy: SelectionPolicy;
  selection(policy: SelectionPolicy): ReturnType<typeof createDailySelectionService>;
  cutoff: Pick<ReturnType<typeof createCutoffLockingService>, "close">;
  settlement: Pick<ReturnType<typeof createMarketSettlementService>, "pending" | "settleFixture">;
  results?: Readonly<{ accountId: string; runOnce(signal?: AbortSignal): Promise<unknown> }>;
  mapping?: Readonly<{ store: Pick<FootballCatalogStore, "registerTeamMapping">; authority: CatalogAuthority }>;
}>;

async function now(tx: JobTransaction) {
  return (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
}
async function snapshot(tx: JobTransaction, action: RecoveryAction) {
  switch (action.kind) {
    case "job": {
      const job = await tx.durableJob.findUnique({ where: { id: action.jobId }, select: { state: true, version: true, fence: true, attemptCount: true } });
      return { job };
    }
    case "selection": {
      const date = selectionWindow(action.scheduledFor).runDate;
      const run = await tx.dailyRun.findUnique({ where: { eatDate: new Date(`${date}T00:00:00Z`) }, select: {
        id: true, selectionHash: true, committedAt: true, partial: true, totalJobs: true, terminalJobs: true } });
      return { run: run ? { ...run, committedAt: run.committedAt?.getTime() ?? null } : null };
    }
    case "cutoff": {
      const cycle = await tx.predictionCycle.findUnique({ where: { id: action.cycleId }, select: { state: true, lockedSetId: true, currentSetId: true } });
      return { cycle };
    }
    case "results": {
      const lease = await tx.resultPollerLease.findUnique({ where: { accountId: action.accountId }, select: { fence: true, leaseUntil: true } });
      return { lease: lease ? { fence: String(lease.fence), leaseUntil: lease.leaseUntil.getTime() } : null,
        pendingBatches: await tx.resultSyncBatch.count({ where: { accountId: action.accountId, completedAt: null } }) };
    }
    case "settlement": return { projection: await tx.marketSettlement.findMany({ where: { fixtureId: action.fixtureId },
      select: { cycleId: true, family: true, revisionId: true }, take: 100, orderBy: [{ cycleId: "asc" }, { family: "asc" }] }) };
    case "mapping": {
      const rows = await tx.footballTeamProvider.findMany({ where: { provider: "api-football",
        externalId: { in: [BigInt(action.externalId), BigInt(action.candidateExternalId)] } }, select: { externalId: true, teamId: true } });
      return { identities: rows.map((row) => ({ externalId: String(row.externalId), teamId: row.teamId })) };
    }
  }
}
async function auditRead(tx: JobTransaction, id: string) {
  const rows = await tx.$queryRaw<{ body: unknown; sealed: number | bigint }[]>`SELECT body,
    integrity = SHA2(CAST(body AS CHAR), 256) AS sealed FROM RecoveryAudit WHERE id = ${id}`;
  if (!rows[0]) return null;
  if (![1, 1n].includes(rows[0].sealed)) return recoveryFail("unavailable");
  return typeof rows[0].body === "string" ? JSON.parse(rows[0].body) as unknown : rows[0].body;
}
async function appendAudit(tx: JobTransaction, jobId: string, actionId: string, phase: "intent" | "outcome" | "failure", body: unknown) {
  const id = evidenceFingerprint([jobId, actionId, phase]);
  if (await auditRead(tx, id)) return;
  const encoded = evidenceSerialize(body), at = await now(tx);
  await tx.$executeRaw`INSERT INTO RecoveryAudit (id, jobId, actionId, phase, at, integrity, body)
    VALUES (${id}, ${jobId}, ${actionId}, ${phase}, ${new Date(at)},
      SHA2(CAST(CAST(${encoded} AS JSON) AS CHAR), 256), CAST(${encoded} AS JSON))`;
}

export function createRecoveryWatchdog(options: Readonly<{ database: DatabaseRuntime; queue: JobQueue;
  policy: unknown; authority: RecoveryAuthority; services: RecoveryServices }>) {
  const { database, queue, authority, services } = options;
  if (!options.policy) return recoveryFail("policy-required");
  const policy = parseRecovery(recoveryPolicySchema, options.policy), policyHash = evidenceFingerprint(policy);
  const refresh = createMysqlRefreshStore(database, queue);
  async function transact<Value>(operation: (tx: JobTransaction) => Promise<Value>): Promise<Value> {
    let failure: unknown;
    try { return await database.transaction(async (tx) => {
      try { return await operation(tx); } catch (error) { failure = error; throw error; }
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 }); }
    catch {
      if (failure instanceof RecoveryError || failure instanceof JobQueueError) throw failure;
      return recoveryFail("unavailable");
    }
  }
  async function authorize(permission: "inspect" | "repair", plan?: RecoveryPlan) {
    let allowed = false;
    try { allowed = authority.verifyPolicy(policy) === true && await authority.authorize(permission, plan) === true &&
      (permission !== "repair" || plan !== undefined && await authority.verifyPlan(plan) === true); } catch { /* Fail closed. */ }
    if (!allowed) return recoveryFail("unauthorized");
  }
  function validate(plan: RecoveryPlan, at: number) {
    if (plan.policyHash !== policyHash || plan.actions.length > policy.maxItems || plan.plannedAt > at || at >= plan.expiresAt ||
      plan.expiresAt - plan.plannedAt > policy.planTtlMs || new Set(plan.actions.map(evidenceFingerprint)).size !== plan.actions.length)
      return recoveryFail("invalid-request");
  }
  async function execute(action: RecoveryAction, lease: JobLease, signal: AbortSignal) {
    switch (action.kind) {
      case "selection": {
        const state = await transact(async (tx) => {
          await queue.assertOwned(tx, lease);
          const at = await now(tx), window = selectionWindow(action.scheduledFor), today = getReportingDate(utcInstantFromEpochMilliseconds(at));
          if (window.runDate < addReportingDays(today, 1 - policy.lookbackDays) || window.startInclusive + policy.runGraceMs > at)
            return recoveryFail("invalid-request");
          const row = await tx.dailyRun.findUnique({ where: { eatDate: new Date(`${window.runDate}T00:00:00Z`) } });
          if (action.selectionHash !== null && row?.selectionHash !== action.selectionHash) return recoveryFail("invalid-request");
          if (row?.selectionHash && evidenceFingerprint(row.selectionJson) !== row.selectionHash) return recoveryFail("unavailable");
          return row?.selectionHash ? parseSelectionPolicy(row.selectionJson) : parseSelectionPolicy(services.selectionPolicy);
        });
        const result = await services.selection(state).run(action.scheduledFor, undefined, signal);
        return { status: result.status, runId: result.status === "committed" ? result.runId : null };
      }
      case "job": return transact(async (tx) => {
        await queue.assertOwned(tx, lease);
        if (action.jobId === lease.jobId) return recoveryFail("invalid-request");
        const result = await queue.recoverInTransaction(tx, action.jobId, action.expectedVersion, async (client, job) => {
          if (job.envelope.refresh) {
            const receipt = await client.predictionRefreshResult.findFirst({ where: { jobId: job.id }, select: { id: true } });
            if (receipt) {
              const stored = await storedRefreshResult(client, receipt.id);
              return stored!.outcome === "published" ? "succeeded" : "failed";
            }
            if (await client.predictionRefreshOutcome.findUnique({ where: { jobId: job.id } })) return "failed";
            try { await refresh.recoveryMember(client, job); }
            catch (error) { if (error instanceof PredictionRefreshError && error.reason === "ineligible") return "expired"; throw error; }
          }
          if (["invalid-payload", "unknown-handler", "non-retryable"].includes(job.terminalReason ?? "")) return "failed";
          return "retry";
        });
        const receipt = result?.envelope.refresh ? await tx.predictionRefreshResult.findFirst({
          where: { jobId: result.id }, select: { id: true } }) : null;
        const publication = receipt ? await storedRefreshResult(tx, receipt.id) : null;
        return { state: result?.state ?? "missing", version: result?.version ?? null,
          publication: publication ? { receiptId: publication.id, revisionId: publication.revisionId, outcome: publication.outcome } : null,
          disposition: result?.state === "pending" ? "worker-required" : "final-or-changed" };
      });
      case "cutoff": {
        const result = await services.cutoff.close({ fixtureId: action.fixtureId, cycleId: action.cycleId });
        return { operationId: result.operation.id, revisionId: result.revision?.id ?? null, state: result.operation.cycle.state };
      }
      case "results": {
        if (action.accountId !== policy.resultAccountId || services.results?.accountId !== action.accountId) return recoveryFail("policy-required");
        await services.results.runOnce(signal); return { status: "poller-attempted", horizonOverride: false };
      }
      case "settlement": {
        await services.settlement.settleFixture(action.fixtureId); return { status: "stored-results-reconciled" };
      }
      case "mapping": {
        const mapping = { externalId: action.externalId, candidateExternalId: action.candidateExternalId,
          evidenceRef: action.evidenceRef, sourceRef: action.sourceRef, observedAt: utcInstantFromEpochMilliseconds(action.observedAt) };
        if (!services.mapping || services.mapping.authority.verifyMapping(mapping) !== true) return recoveryFail("unauthorized");
        const result = await services.mapping.store.registerTeamMapping(mapping, services.mapping.authority, action.retentionEvidenceRef);
        return { status: result.status, reviewId: result.reviewId, teamId: result.teamId, reason: result.reason };
      }
    }
  }
  const definition = defineJob({ type: RECOVERY_JOB_TYPE, handlerVersion: 1, payload: recoveryPlan,
    async handle(plan, context) {
      await authorize("repair", plan);
      for (const [index, action] of plan.actions.entries()) {
        await context.checkpoint(); await authorize("repair", plan);
        const actionId = evidenceFingerprint([evidenceFingerprint(plan), index]);
        const done = await transact(async (tx) => {
          const at = await queue.assertOwned(tx, context.lease); validate(plan, at);
          if (!await auditRead(tx, evidenceFingerprint([context.lease.jobId, actionId, "intent"]))) return recoveryFail("invalid-request");
          return await auditRead(tx, evidenceFingerprint([context.lease.jobId, actionId, "outcome"])) !== null;
        });
        if (done) continue;
        let outcome: unknown;
        try { outcome = await execute(action, context.lease, context.signal); }
        catch (error) {
          // A failed attempt is not a completion receipt. Resume the same domain operation after a crash.
          await transact(async (tx) => {
            await queue.assertOwned(tx, context.lease);
            await authorize("repair", plan);
            await appendAudit(tx, context.lease.jobId, evidenceFingerprint([actionId, context.lease.attemptId]), "failure",
              { actor: plan.actor, reason: plan.reason, approvalRef: plan.approvalRef, action,
                outcome: "refused-or-interrupted", actionId });
          }).catch(() => { /* Lost owners cannot append. The durable attempt remains the interruption record. */ });
          throw error;
        }
        await context.checkpoint(); await authorize("repair", plan);
        await transact(async (tx) => {
          const at = await queue.assertOwned(tx, context.lease); validate(plan, at);
          await appendAudit(tx, context.lease.jobId, actionId, "outcome", { actor: plan.actor, reason: plan.reason,
            approvalRef: plan.approvalRef, action, outcome });
        });
      }
      return { status: "succeeded" };
    },
  });
  return Object.freeze({ definition, policyHash,
    async inspect(scope: RecoveryScope, after?: string) {
      await authorize("inspect"); return scanRecovery(database, policy, services.settlement, scope, after);
    },
    async enqueue(input: unknown) {
      const plan = parseRecovery(recoveryPlan, input); await authorize("repair", plan);
      const envelope = parseJobEnvelope({ version: 1, type: RECOVERY_JOB_TYPE, handlerVersion: 1,
        idempotencyKey: evidenceFingerprint(plan), payload: plan, refresh: null, notBefore: plan.plannedAt,
        expiresAt: plan.expiresAt, fallbackReserveMs: 0, ...policy.job });
      let failure: unknown;
      try { return await queue.withTransaction(async (write, tx) => {
        try {
          validate(plan, await now(tx)); await authorize("repair", plan);
          const job = await write(envelope);
          for (const [index, action] of plan.actions.entries()) {
            const actionId = evidenceFingerprint([evidenceFingerprint(plan), index]);
            await appendAudit(tx, durableJobId(envelope), actionId, "intent", { actor: plan.actor, reason: plan.reason,
              approvalRef: plan.approvalRef, action, previous: await snapshot(tx, action) });
          }
          await authorize("repair", plan); return { jobId: job.id, state: job.state };
        } catch (error) { failure = error; throw error; }
      }); } catch (error) { if (failure instanceof RecoveryError) throw failure; throw error; }
    },
    async audit(jobId: string, after = "") {
      await authorize("inspect");
      if (!/^[a-f0-9]{64}$/u.test(jobId) || !/^(?:[a-f0-9]{64})?$/u.test(after)) return recoveryFail("invalid-request");
      return transact(async (tx) => {
        const rows = await tx.recoveryAudit.findMany({ where: { jobId, id: { gt: after } }, orderBy: { id: "asc" }, take: 100 });
        return freezeEvidence({ next: rows.length === 100 ? rows.at(-1)!.id : null,
          records: await Promise.all(rows.map(async (row) => ({ id: row.id, phase: row.phase, at: row.at.getTime(), body: await auditRead(tx, row.id) }))) });
      });
    },
  });
}

import "server-only";

import { addReportingDays, createPredictionWindow, getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { operatingRules } from "../config/runtime-policy.ts";
import { quotaAccountStateSchema, quotaPeriodStateSchema } from "../football/quota-mysql-store.ts";
import { authorizeMonitoring, monitoringPolicySchema, monitoringSnapshotSchema, monitoringReasons, operationMetrics,
  parseMonitoring, type MonitoringAuthority, type MonitoringCost, type MonitoringSnapshot } from "./monitoring-contract.ts";

/** Aggregate reads only; no provider calls, lease acquisition or forecast/recovery mutations. */
export function createMonitoringInspector(options: Readonly<{ database: DatabaseRuntime; policy: unknown;
  authority: MonitoringAuthority; costs?: () => Promise<readonly MonitoringCost[]> }>) {
  const policy = parseMonitoring(monitoringPolicySchema, options.policy);
  return Object.freeze({ async inspect(): Promise<MonitoringSnapshot> {
    await authorizeMonitoring(options.authority, policy, "inspect");
    let costs: readonly MonitoringCost[] = [];
    try { costs = await options.costs?.() ?? []; } catch { /* Missing billing evidence stays pending. */ }
    costs = parseMonitoring(monitoringSnapshotSchema.shape.costs, costs);
    await authorizeMonitoring(options.authority, policy, "inspect");
    try {
      const snapshot = await options.database.transaction(async (tx) => {
        const at = (await tx.$queryRaw<{ at: Date }[]>`SELECT UTC_TIMESTAMP(3) AS at`)[0]!.at.getTime();
        const today = getReportingDate(utcInstantFromEpochMilliseconds(at));
        const firstDate = addReportingDays(today, 1 - policy.lookbackDays), since = new Date(createPredictionWindow(firstDate).startInclusive);
        const t = policy.thresholds;
        const metrics = Object.fromEntries(operationMetrics.map((key) => [key, 0])) as MonitoringSnapshot["metrics"];
        metrics.available = 1;
        const runs = await tx.dailyRun.findMany({ where: { eatDate: { gte: new Date(`${firstDate}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } },
          select: { id: true, eatDate: true, createdAt: true, committedAt: true, partial: true, totalJobs: true, terminalJobs: true,
            jobs: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } }, take: 7 });
        for (let age = 0; age < policy.lookbackDays; age++) {
          const date = addReportingDays(today, -age), due = createPredictionWindow(date).startInclusive + t.runGraceMs;
          if (at < due) continue;
          const run = runs.find((r) => r.eatDate.toISOString().slice(0, 10) === date);
          if (!run || !run.committedAt) metrics["missing-runs"]!++;
          if (run?.partial) metrics["partial-runs"]!++;
          if (run && (!run.committedAt || run.terminalJobs < run.totalJobs) &&
            at - (run.jobs[0]?.updatedAt ?? run.createdAt).getTime() >= t.jobStallMs) metrics["stalled-runs"]!++;
        }
        metrics["failed-jobs"] = await tx.durableJob.count({ where: { state: "failed", updatedAt: { gte: since } } });
        metrics["jobs-completed"] = await tx.durableJob.count({ where: { state: "succeeded", finishedAt: { gte: since } } });
        metrics["stalled-jobs"] = await tx.durableJob.count({ where: { OR: [
          { state: "pending", availableAt: { lte: new Date(at - t.jobStallMs) } },
          { state: "running", OR: [{ leaseExpiresAt: { lte: new Date(at) } }, { attemptDeadlineAt: { lte: new Date(at) } }] },
        ] } });
        metrics["source-failures"] = await tx.dailyRunImport.count({ where: { finishedAt: { gte: since }, failure: { not: null } } });
        const duration = (await tx.$queryRaw<{ total: bigint; count: bigint }[]>`SELECT
          COALESCE(SUM(GREATEST(0, TIMESTAMPDIFF(MICROSECOND, startedAt, finishedAt) DIV 1000)), 0) AS total,
          COUNT(*) AS count FROM DurableJobAttempt WHERE finishedAt >= ${since}`)[0]!;
        metrics["job-duration-ms"] = Number(duration.total); metrics["job-duration-count"] = Number(duration.count);
        metrics["missing-locks"] = await tx.predictionCycle.count({ where: { state: "open", activeForFixtures: { some: {} }, OR: [
          { cutoffAt: { lte: new Date(at - t.lockGraceMs) } }, { publicationBarrier: { isNot: null } },
          { fixture: { status: { in: ["live", "finished-regulation", "finished-extra-time", "finished-penalties"] } } },
        ] } });
        metrics["cutoff-misses"] = await tx.predictionCycle.count({ where: { activeForFixtures: { some: {} }, currentSetId: null,
          cutoffAt: { gte: since, lte: new Date(at) }, state: { in: ["open", "closed"] } } });
        metrics["stale-data"] = await tx.footballFixture.count({ where: { activeCycleId: { not: null }, status: { in: ["scheduled", "live"] },
          kickoff: { gte: since, lte: new Date(at + 86_400_000) }, retrievedAt: { lte: new Date(at - t.staleMs) } } });
        metrics["unresolved-results"] = await tx.fixtureResultState.count({ where: { resultId: null } });
        // Only due tracking is delayed. A future fixture or exhausted approved polling horizon is not a final-result outage.
        metrics["delayed-results"] = await tx.fixtureResultState.count({ where: {
          nextCheckAt: { lte: new Date(at - t.resultDelayMs) }, fixture: { kickoff: { lte: new Date(at) } } } });
        const badges = (await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(DISTINCT s.fixtureId) AS count
          FROM FixtureResultState s JOIN FixtureResult r ON r.id = s.resultId
          JOIN PredictionCycle c ON c.fixtureId = s.fixtureId AND c.lockedSetId IS NOT NULL AND c.state = 'closed'
          JOIN MarketPrediction p ON p.setId = c.lockedSetId AND p.available = TRUE
          LEFT JOIN MarketSettlement m ON m.cycleId = c.id AND m.family = p.family
          LEFT JOIN MarketSettlementRevision v ON v.id = m.revisionId
          WHERE r.regulationVerified = TRUE AND r.status IN ('finished-regulation', 'finished-extra-time', 'finished-penalties')
          AND r.observedAt <= ${new Date(at - t.resultDelayMs)} AND (v.resultId IS NULL OR v.resultId <> r.id)`)[0]!;
        metrics["final-badge-delays"] = Number(badges.count);
        const recovery = await tx.recoveryAudit.groupBy({ by: ["phase"], where: { at: { gte: since } }, _count: true });
        metrics["recovery-failures"] = recovery.find((r) => r.phase === "failure")?._count ?? 0;
        metrics["recovery-completed"] = recovery.find((r) => r.phase === "outcome")?._count ?? 0;
        let quota: MonitoringSnapshot["quota"] = null;
        if (policy.accountId) {
          const row = await tx.apiQuotaAccount.findUnique({ where: { id: policy.accountId }, select: { stateJson: true } });
          if (row?.stateJson) {
            const account = parseMonitoring(quotaAccountStateSchema, row.stateJson);
            const periodRow = await tx.apiQuotaPeriod.findUnique({ where: { accountId_id: { accountId: policy.accountId, id: account.activePeriodId } } });
            if (periodRow) {
              const period = parseMonitoring(quotaPeriodStateSchema, periodRow.stateJson);
              const counts = (await tx.$queryRaw<{ launched: bigint; uncertain: bigint; rateLimited: bigint; providerErrors: bigint }[]>`SELECT
                COALESCE(SUM(JSON_EXTRACT(payloadJson, '$.launchedAt') != CAST('null' AS JSON)), 0) AS launched,
                COALESCE(SUM(state = 'uncertain'), 0) AS uncertain,
                COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.responseKind')) = 'rate-limited'), 0) AS rateLimited,
                COALESCE(SUM(JSON_UNQUOTE(JSON_EXTRACT(payloadJson, '$.responseKind')) = 'provider-error'), 0) AS providerErrors
                FROM ApiQuotaAttempt WHERE accountId = ${policy.accountId} AND periodId = ${period.id}`)[0]!;
              const remaining = Math.max(0, Math.min(period.dayRemaining, period.dayLimit - period.used));
              // MySQL distinguishes unsigned integers from signed/double JSON numbers. Null is never a launch.
              const rolling = (await tx.$queryRaw<{ second: bigint; minute: bigint }[]>`SELECT
                COALESCE(SUM(JSON_TYPE(JSON_EXTRACT(payloadJson, '$.launchedAt')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE') AND JSON_EXTRACT(payloadJson, '$.launchedAt') >= ${at - 1000}), 0) AS second,
                COALESCE(SUM(JSON_TYPE(JSON_EXTRACT(payloadJson, '$.launchedAt')) IN ('INTEGER', 'UNSIGNED INTEGER', 'DOUBLE') AND JSON_EXTRACT(payloadJson, '$.launchedAt') >= ${at - 60_000}), 0) AS minute
                FROM ApiQuotaAttempt WHERE accountId = ${policy.accountId} AND dispatchedAt >= ${new Date(at - 61_000)}`)[0]!;
              quota = { remaining, reserved: period.used, launched: Number(counts.launched), uncertain: Number(counts.uncertain),
                essentialUsed: period.used - period.ordinaryUsed, essentialRemaining: Math.min(operatingRules.football.essentialReserveRequests, remaining),
                essentialReserveUsed: Math.min(operatingRules.football.essentialReserveRequests,
                  Math.max(0, period.used - Math.max(0, period.dayLimit - operatingRules.football.essentialReserveRequests))),
                rollingSecondLaunches: Number(rolling.second), rollingMinuteLaunches: Number(rolling.minute),
                rateLimited: Number(counts.rateLimited), providerErrors: Number(counts.providerErrors),
                resetPending: account.candidatePeriodId !== null || at >= period.endsAt,
                credentialFailure: account.status === "credential-failure", subscriptionExpired: account.status === "subscription-expired" || at >= period.subscriptionExpiresAt,
                expiresAt: period.subscriptionExpiresAt };
              metrics["source-failures"]! += quota.providerErrors;
            }
          }
          const poller = await tx.resultPollerLease.findUnique({ where: { accountId: policy.accountId }, select: { ownerId: true, leaseUntil: true, nextDateAt: true } });
          metrics["poller-missing"] = !poller || !poller.ownerId || poller.leaseUntil.getTime() <= at ? 1 : 0;
          metrics["poller-delayed"] = poller && poller.nextDateAt.getTime() <= at - t.resultDelayMs ? 1 : 0;
          metrics["result-backlog"] = await tx.resultSyncBatch.count({ where: { accountId: policy.accountId,
            completedAt: null, receivedAt: { lte: new Date(at - t.resultDelayMs) } } });
        } else { metrics["poller-missing"] = null; metrics["poller-delayed"] = null; metrics["result-backlog"] = null; }
        const groups = await tx.predictionRefreshResult.groupBy({ by: ["outcome", "reason"], where: { at: { gte: since } }, _count: true });
        const jobReasons = await tx.durableJob.groupBy({ by: ["terminalReason"], where: { finishedAt: { gte: since } }, _count: true });
        const reasons = new Map<string, MonitoringSnapshot["reasons"][number]>();
        for (const group of [...groups.flatMap((g) => [{ kind: "refresh-outcome" as const, reason: g.outcome, count: g._count },
          { kind: "refresh-reason" as const, reason: g.reason, count: g._count }]), ...jobReasons.map((g) => ({ kind: "job" as const, reason: g.terminalReason, count: g._count }))]) {
          const reason = monitoringReasons.find((r) => r === group.reason) ?? "other";
          const key = `${group.kind}:${reason}`;
          reasons.set(key, { kind: group.kind, reason, count: (reasons.get(key)?.count ?? 0) + group.count });
        }
        const sets = await tx.predictionSet.findMany({ where: { publishedAt: { gte: since } }, orderBy: { publishedAt: "desc" }, take: 25,
          select: { runId: true, fixtureId: true, cycleId: true, jobId: true, modelVersionId: true } });
        const jobs = await tx.durableJob.findMany({ where: { updatedAt: { gte: since }, state: { in: ["failed", "running", "pending"] } },
          orderBy: { updatedAt: "desc" }, take: 25, select: { id: true, refreshRunId: true, refreshFixtureId: true, refreshCycleId: true } });
        const correlations = [...sets.map((s) => ({ ...s, eatDate: runs.find((r) => r.id === s.runId)?.eatDate.toISOString().slice(0, 10) ?? null })),
          ...jobs.map((j) => ({ jobId: j.id, runId: j.refreshRunId, fixtureId: j.refreshFixtureId, cycleId: j.refreshCycleId, modelVersionId: null,
            eatDate: runs.find((r) => r.id === j.refreshRunId)?.eatDate.toISOString().slice(0, 10) ?? null }))];
        return parseMonitoring(monitoringSnapshotSchema, { at, metrics, quota, costs, correlations,
          reasons: [...reasons.values()] });
      }, { isolationLevel: "RepeatableRead", maxWait: 1000, timeout: 15_000 });
      await authorizeMonitoring(options.authority, policy, "inspect");
      return snapshot;
    } catch {
      await authorizeMonitoring(options.authority, policy, "inspect");
      return parseMonitoring(monitoringSnapshotSchema, { at: Date.now(), metrics: Object.fromEntries(operationMetrics.map((key) => [key, key === "available" ? 0 : null])),
        quota: null, costs, reasons: [], correlations: [] });
    }
  } });
}

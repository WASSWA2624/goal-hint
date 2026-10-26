import "server-only";

import { createHash } from "node:crypto";
import type { QuotaAdmission, QuotaPeriodState, QuotaTransaction } from "../football/quota-contract.ts";
import type { LiveWorkload } from "./live-plan.ts";

/** Upgrade a running provider day once; subsequent admissions use constant-size counters.
 * No historical quota attempt or uncertain dispatch is deleted or refunded. */
async function priorityUse(tx: QuotaTransaction, period: QuotaPeriodState) {
  if (period.priorityUsed === undefined) {
    const counts: NonNullable<QuotaPeriodState["priorityUsed"]> = tx.priorityCounts ? await tx.priorityCounts(period.id) : {};
    if (!tx.priorityCounts) for (const attempt of await tx.periodAttempts(period.id, 0)) {
      if (attempt.dispatchedAt !== null) counts[attempt.priority] = (counts[attempt.priority] ?? 0) + 1;
    }
    period.priorityUsed = counts;
    await tx.savePeriod(period);
  }
  return { detail: period.priorityUsed["live-details"] ?? 0, enrichment: period.priorityUsed.enrichment ?? 0,
    ordinary: Object.entries(period.priorityUsed).reduce((sum, [priority, count]) =>
      sum + (priority === "live-details" || priority === "enrichment" ? 0 : count ?? 0), 0) };
}

/** Both detail and optional enrichment admission are atomic with the account's
 * dispatch counter, including across processes and uncertain provider responses. */
export function createLiveQuotaAdmission(workload: () => LiveWorkload | null, accountKey?: () => string | null): QuotaAdmission {
  return async (tx, period, attempt) => {
    if (attempt.priority !== "live-details" && attempt.priority !== "enrichment") return true;
    const plan = workload();
    if (!plan) return false;
    if (!plan.liveDetails.eligible) return attempt.priority !== "live-details";
    const used = await priorityUse(tx, period);
    // Provider-reported or prior-plan use is not proof that this runtime's
    // selection/result/refresh obligations have been completed.
    const owed = Math.max(0, plan.liveDetails.floor - used.ordinary);
    if (period.dayRemaining <= plan.liveDetails.reserve) return false;
    if (attempt.priority === "live-details") {
      if (used.detail >= plan.liveDetails.requests || period.dayRemaining - owed < 1) return false;
      if (!accountKey) return true;
      const stable = accountKey();
      if (stable === null || !/^[a-f0-9]{64}$/u.test(stable) || !tx.consumeBudget) return false;
      const id = createHash("sha256").update(`live-details:v1:${stable}:${period.startsAt}`).digest("hex");
      return tx.consumeBudget(id, plan.liveDetails.requests, period.endsAt);
    }
    return used.enrichment < plan.odds.spare &&
      period.dayRemaining - owed - Math.max(0, plan.liveDetails.requests - used.detail) >= 1;
  };
}

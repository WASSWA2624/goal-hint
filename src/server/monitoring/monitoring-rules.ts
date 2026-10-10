import "server-only";

import { costUsdDecimal, costUsdPicosFromDecimal } from "../cost-control/cost-input.ts";
import { budgetCategories, monitoringSnapshotSchema, parseMonitoring, type MonitoringPolicy, type MonitoringSnapshot } from "./monitoring-contract.ts";

export const alertRules = ["outage", "missing-runs", "partial-runs", "stalled-runs", "failed-jobs", "stalled-jobs", "source-failures",
  "cutoff-misses", "missing-locks", "stale-data", "poller-missing", "poller-delayed", "result-backlog", "final-badge-delays", "delayed-results", "recovery-failures", "quota-pressure",
  "essential-reserve", "rate-limited", "reset-pending", "credential-failure", "subscription-expired", "subscription-expiry",
  "cost-pressure", "cost-cap", "evidence-pending", "backup-failures", "backup-stale", "restore-verification-pending"] as const;
export type AlertRule = typeof alertRules[number];
export type AlertCondition = Readonly<{ rule: AlertRule; scope: "application" | typeof budgetCategories[number];
  active: boolean | null; severity: "warning" | "critical"; value: number | string | null }>;

/** Only fixed rule/scope labels. IDs and timestamps never become metric dimensions. */
export function evaluateMonitoring(input: unknown, policy: MonitoringPolicy): readonly AlertCondition[] {
  const snapshot: MonitoringSnapshot = parseMonitoring(monitoringSnapshotSchema, input), t = policy.thresholds;
  const conditions: AlertCondition[] = [];
  const add = (rule: AlertRule, scope: AlertCondition["scope"], active: boolean | null, value: AlertCondition["value"], severity: AlertCondition["severity"] = "warning") =>
    conditions.push({ rule, scope, active, value, severity });
  add("outage", "application", snapshot.metrics.available === null ? null : snapshot.metrics.available === 0, snapshot.metrics.available, "critical");
  for (const rule of ["missing-runs", "partial-runs", "stalled-runs", "failed-jobs", "stalled-jobs", "source-failures",
    "cutoff-misses", "missing-locks", "stale-data", "poller-missing", "poller-delayed", "result-backlog", "final-badge-delays", "delayed-results", "recovery-failures",
    "backup-failures", "backup-stale", "restore-verification-pending"] as const) {
    const value = snapshot.metrics[rule];
    const threshold = rule === "backup-stale" || rule === "restore-verification-pending" ? 1 : t.failureCount;
    add(rule, "application", value === null ? null : value >= threshold, value,
      ["missing-locks", "cutoff-misses", "failed-jobs", "missing-runs", "backup-failures", "backup-stale"].includes(rule) ? "critical" : "warning");
  }
  const q = snapshot.quota;
  for (const [rule, active, value] of [
    ["quota-pressure", q ? q.remaining <= t.quotaRemainingWarn : null, q?.remaining ?? null],
    ["essential-reserve", q ? q.essentialRemaining <= t.essentialReserveWarn : null, q?.essentialRemaining ?? null],
    ["rate-limited", q ? q.rateLimited >= t.rateLimitCount : null, q?.rateLimited ?? null],
    ["reset-pending", q?.resetPending ?? null, q ? Number(q.resetPending) : null],
    ["credential-failure", q?.credentialFailure ?? null, q ? Number(q.credentialFailure) : null],
    ["subscription-expired", q?.subscriptionExpired ?? null, q ? Number(q.subscriptionExpired) : null],
    ["subscription-expiry", q ? q.expiresAt - snapshot.at <= t.expiryWarnMs : null, q ? Math.max(0, q.expiresAt - snapshot.at) : null],
  ] as const) add(rule, "football", active, value, rule === "credential-failure" || rule === "subscription-expired" ? "critical" : "warning");
  for (const category of budgetCategories) {
    const cost = snapshot.costs.find((c) => c.category === category);
    const fresh = cost && cost.measuredAt <= snapshot.at && snapshot.at - cost.measuredAt <= policy.evidenceMaxAgeMs &&
      cost.startsAt <= snapshot.at && snapshot.at < cost.endsAt;
    // The football payable ceiling is fixed, including tax/FX/fees. Lower approved caps remain binding.
    const configured = cost ? costUsdPicosFromDecimal(cost.capUsd) : 0n;
    const cap = category === "football" && configured > 45_000_000_000_000n ? 45_000_000_000_000n : configured;
    const committed = cost ? costUsdPicosFromDecimal(cost.committedUsd) : 0n;
    const invoice = cost?.invoicedUsd ? costUsdPicosFromDecimal(cost.invoicedUsd) : 0n;
    const used = committed > invoice ? committed : invoice;
    const pressured = used > 0n && used * 100n >= cap * BigInt(t.costWarnPercent), exhausted = used > cap || used === cap && cap > 0n;
    const amount = cost ? costUsdDecimal(used) : null;
    add("cost-pressure", category, fresh ? (pressured || cost.coverage === "complete" ? pressured : null) : null, amount);
    add("cost-cap", category, fresh ? (exhausted || cost.coverage === "complete" ? exhausted : null) : null, amount, "critical");
    add("evidence-pending", category, !fresh || cost.coverage !== "complete", null);
  }
  add("evidence-pending", "application", Object.values(snapshot.metrics).some((v) => v === null) || !q, null);
  return Object.freeze(conditions);
}

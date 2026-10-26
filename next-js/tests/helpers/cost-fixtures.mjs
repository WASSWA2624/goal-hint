import { createHash } from "node:crypto";

// Prices, billing approvals, account identifiers and clocks here are synthetic.
// They exercise local durable accounting without authorizing a paid provider.
export const COST_NOW = Date.parse("2026-10-09T10:00:00.000Z");
export const costId = (value) => createHash("sha256").update(value).digest("hex");
export const USD = 1_000_000_000_000n;

export function syntheticCostAuthority(overrides = {}) {
  return { authorize() {}, verifyPeriod: () => true, verifyJob: () => true,
    verifyRate: () => true, verifyRequest: () => true, verifyUsage: () => true, ...overrides };
}

export function costPeriod(label, category = "ai", overrides = {}) {
  return { accountId: costId(`account:${label}`), category, periodId: costId(`period:${label}:first`),
    startsAt: COST_NOW - 3_600_000, endsAt: COST_NOW + 86_400_000,
    capUsdPicos: 10n * USD, openingChargedUsdPicos: 0n,
    evidenceRef: `synthetic-period-approval:${label}`, ...overrides };
}

export function costJob(period, label, overrides = {}) {
  return { accountId: period.accountId, category: period.category,
    jobId: costId(`job:${label}`), workKey: costId(`work:${label}`), costCapUsdPicos: 10n * USD,
    requestLimit: 20, inputTokenLimit: 1000, outputTokenLimit: 1000, billedUnitLimit: 1000,
    startsAt: COST_NOW, deadlineAt: COST_NOW + 60_000, timeLimitMs: 50_000, fallbackReserveMs: 2000,
    evidenceRef: `synthetic-job-approval:${label}`, ...overrides };
}

export function costRate(category = "ai", overrides = {}) {
  return { category, provider: "synthetic-provider", model: category === "ai" ? "synthetic-model" : null,
    version: "synthetic-rate-v1", currency: "USD", startsAt: COST_NOW - 3_600_000, endsAt: COST_NOW + 86_400_000,
    usdConversion: { numerator: "1", denominator: "1", evidenceRef: "synthetic-usd-conversion" },
    rounding: "ceil-per-component", billingRule: "measured-usage",
    rates: { requests: { amount: "1", perUnits: 1 }, inputTokens: { amount: "0.01", perUnits: 1 },
      outputTokens: { amount: "0.02", perUnits: 1 }, billedUnits: { amount: "0.01", perUnits: 1 } },
    evidenceRef: "synthetic-rate-approval", ...overrides };
}

export function costRequest(job, label, overrides = {}) {
  return { accountId: job.accountId, category: job.category, attemptId: costId(`attempt:${label}`), jobId: job.jobId,
    rateVersion: "synthetic-rate-v1", provider: "synthetic-provider", model: job.category === "ai" ? "synthetic-model" : null,
    maximum: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }, timeoutMs: 1000,
    priority: { kind: "background" }, evidenceRef: `synthetic-request-approval:${label}`, ...overrides };
}

export function costUsage(permit, label, overrides = {}) {
  return { attemptId: permit.attemptId, reconciliationId: costId(`reconciliation:${label}`), kind: "complete",
    observedQuantities: { requests: 1, inputTokens: 0, outputTokens: 0, billedUnits: 0 }, elapsedMs: 100,
    observedUsdPicos: null, invoicedUsdPicos: null, observedAt: COST_NOW + 100,
    evidenceRef: `synthetic-usage-proof:${label}`, ...overrides };
}

export function costTestEnvironment(applicationUrl, migrationUrl) {
  const env = { ...process.env };
  const credentials = new Set(["DATABASE_URL", "TEST_DATABASE_URL", "MIGRATION_DATABASE_URL", "API_FOOTBALL_KEY", "AI_API_KEY", "RESEARCH_API_KEY"]);
  for (const key of Object.keys(env)) {
    if (key.startsWith("GOAL_HINT_") || key.startsWith("NEXT_PUBLIC_") || credentials.has(key)) delete env[key];
  }
  return { ...env, NODE_ENV: "test", DEBUG: "", GOAL_HINT_OPERATION_SCOPE: "disabled", GOAL_HINT_DATABASE_ENABLED: "true",
    TEST_DATABASE_URL: applicationUrl, MIGRATION_DATABASE_URL: migrationUrl,
    GOAL_HINT_DATABASE_CONNECTION_MODE: "direct", GOAL_HINT_DATABASE_POOL_LIMIT: "4",
    GOAL_HINT_DATABASE_TLS_MODE: "disabled", GOAL_HINT_DATABASE_CONNECT_TIMEOUT_MS: "1000",
    GOAL_HINT_DATABASE_ACQUIRE_TIMEOUT_MS: "10000" };
}

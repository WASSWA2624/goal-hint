import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import { assertOperationAllowed, operatingRules, type EvidenceVerifier, type RuntimePolicy } from "../config/runtime-policy.ts";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { API_FOOTBALL_ORIGIN } from "../football/api-football-contract.ts";
import type { QuotaDecision, QuotaDenialReason, QuotaFeedback, QuotaPeriodEvidence, QuotaPermit, QuotaRequest, QuotaStore } from "../football/quota-contract.ts";
import type { GatewayQuotaLimiter } from "../football/quota-gateway.ts";
import { createQuotaLimiter, type QuotaLimiter } from "../football/quota-limiter.ts";

const DAY_MS = 86_400_000;
/** No new provider day opens until rolling minute windows from the old day have elapsed. */
export const PROVIDER_DAY_SETTLE_MS = 60_000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class LiveAccountError extends Error {
  readonly reason: "credential-failure" | "subscription-expired" | "subscription-inactive" | "unavailable" | "settling";
  constructor(reason: LiveAccountError["reason"]) {
    super(`API-Football account check failed (${reason}); private provider diagnostics are withheld.`);
    this.name = "LiveAccountError"; this.reason = reason;
  }
}
const statusSchema = z.object({
  errors: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]),
  response: z.union([z.array(z.unknown()), z.object({
    account: z.object({ email: z.string().trim().min(3).max(320) }).loose(),
    subscription: z.object({ plan: z.string().trim().min(1).max(64), end: z.string().nullable().optional(), active: z.boolean() }).loose(),
    requests: z.object({ current: z.number().int().nonnegative(), limit_day: z.number().int().positive() }).loose(),
  }).loose()]),
}).loose();
export type AccountStatus = Readonly<{
  accountKey: string; plan: string; active: boolean; expiresAt: UtcInstant | null;
  dailyLimit: number; usedToday: number; minuteLimit: number; secondLimit: number; retrievedAt: UtcInstant;
}>;
/** Documented API-Football per-minute plan limits; unknown plans use the free floor until headers lower them further. */
export function planMinuteLimit(plan: string): number {
  const limits: Readonly<Record<string, number>> = { free: 10, pro: 300, ultra: 450, mega: 900 };
  return limits[plan.trim().toLowerCase()] ?? 10;
}
export function parseAccountStatus(body: unknown, retrievedAt: UtcInstant): AccountStatus {
  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) throw new LiveAccountError("unavailable");
  const errors = parsed.data.errors;
  if (Array.isArray(errors) ? errors.length > 0 : Object.keys(errors).length > 0) throw new LiveAccountError("credential-failure");
  const response = parsed.data.response;
  if (Array.isArray(response)) throw new LiveAccountError("unavailable");
  const end = response.subscription.end ? Date.parse(response.subscription.end) : NaN;
  const minuteLimit = planMinuteLimit(response.subscription.plan);
  return Object.freeze({
    // A stable account identity, never derived from the rotating credential.
    accountKey: hash(`api-football-account:v1:${response.account.email.toLowerCase()}`),
    plan: response.subscription.plan, active: response.subscription.active,
    expiresAt: Number.isFinite(end) ? utcInstantFromEpochMilliseconds(end) : null,
    dailyLimit: response.requests.limit_day, usedToday: Math.min(response.requests.current, response.requests.limit_day),
    minuteLimit, secondLimit: Math.max(1, Math.min(operatingRules.football.requestsPerRollingSecond, Math.floor(minuteLimit / 60))),
    retrievedAt,
  });
}
/** The documented account endpoint does not consume daily quota, so it can seed the limiter. */
export function createAccountStatusReader(options: Readonly<{ policy: RuntimePolicy; verifyEvidence: EvidenceVerifier;
  fetcher?: typeof fetch; clock?: Clock; timeoutMs?: number }>) {
  const fetcher = options.fetcher ?? fetch, clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  return async function readAccountStatus(): Promise<AccountStatus> {
    assertOperationAllowed(options.policy, "football", options.verifyEvidence);
    const credential = options.policy.secrets.footballKey?.read();
    if (!credential) throw new LiveAccountError("credential-failure");
    let body: unknown;
    try {
      const response = await fetcher(new URL("/status", API_FOOTBALL_ORIGIN), { headers: { "x-apisports-key": credential },
        redirect: "error", signal: AbortSignal.timeout(options.timeoutMs ?? 10_000) });
      if (response.status === 401 || response.status === 403) throw new LiveAccountError("credential-failure");
      if (!response.ok) throw new LiveAccountError("unavailable");
      body = await response.json();
    } catch (error) { throw error instanceof LiveAccountError ? error : new LiveAccountError("unavailable"); }
    return parseAccountStatus(body, clock.now());
  };
}

type Denied = Extract<QuotaDecision, { status: "denied" }>;
const deny = (reason: QuotaDenialReason): Denied => Object.freeze({ status: "denied", reason });
export type QuotaDay = Readonly<{ accountId: string; periodId: string; startsAt: UtcInstant; endsAt: UtcInstant; status: AccountStatus }>;
/** Operator reconciliation for provider days: each account, plan and UTC provider day
 * gets its own durable limiter seeded from the provider's remaining count. Old days keep
 * their counters, in-flight permits finish on their issuing limiter, and missed days or
 * plan changes start from verified provider usage instead of an unconfirmable probe. */
export function createQuotaRouter(options: Readonly<{ store: QuotaStore; readStatus: () => Promise<AccountStatus>; clock?: Clock }>) {
  const clock = options.clock ?? { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
  const observed = new Set<string>(), limiters = new Map<string, QuotaLimiter>();
  let active: Readonly<QuotaDay & { limiter: QuotaLimiter }> | null = null;
  function evidenceFor(status: AccountStatus, startsAt: UtcInstant): QuotaPeriodEvidence {
    const accountId = hash(`${status.accountKey}:${status.plan.toLowerCase()}:${startsAt}`);
    const endsAt = utcInstantFromEpochMilliseconds(startsAt + DAY_MS);
    return Object.freeze({ accountId, periodId: hash(`${accountId}:period`), startsAt, endsAt,
      subscriptionExpiresAt: utcInstantFromEpochMilliseconds(Math.min(status.expiresAt ?? endsAt, 253_402_300_799_000)),
      providerDailyLimit: status.dailyLimit, dailyRemaining: Math.max(0, status.dailyLimit - status.usedToday),
      secondLimit: status.secondLimit, minuteLimit: status.minuteLimit, evidenceRef: `api-football-status:${status.retrievedAt}` });
  }
  const routed: GatewayQuotaLimiter = Object.freeze({
    reserve: async (request: QuotaRequest) => {
      const day = active;
      return day && clock.now() < day.endsAt ? day.limiter.reserve(request) : deny("reset-unconfirmed");
    },
    claimLaunch: async (permit: QuotaPermit) => limiters.get(permit.periodId)?.claimLaunch(permit) ?? deny("dispatch-expired"),
    complete: async (permit: QuotaPermit, feedback: QuotaFeedback) => limiters.get(permit.periodId)?.complete(permit, feedback) ?? deny("dispatch-expired"),
    // Only the provider-day limiter that queued the request knows it; the others report unchanged.
    abandon: async (requestId: string) => {
      for (const limiter of limiters.values()) if ((await limiter.abandon(requestId)).status === "abandoned") return { status: "abandoned" as const };
      return { status: "unchanged" as const };
    },
  });
  return Object.freeze({
    /** Re-reads the account and initializes or tightens today's limiter. */
    async refresh(): Promise<QuotaDay> {
      const status = await options.readStatus(), now = clock.now();
      if (!status.active) throw new LiveAccountError("subscription-inactive");
      if (status.expiresAt !== null && status.expiresAt <= now) throw new LiveAccountError("subscription-expired");
      const startsAt = utcInstantFromEpochMilliseconds(Math.floor(now / DAY_MS) * DAY_MS);
      if (now < startsAt + PROVIDER_DAY_SETTLE_MS) throw new LiveAccountError("settling");
      const evidence = evidenceFor(status, startsAt);
      observed.add(evidenceFingerprint(evidence));
      let limiter = limiters.get(evidence.periodId);
      if (!limiter) {
        limiter = createQuotaLimiter({ accountId: evidence.accountId, store: options.store,
          verifyEvidence: (candidate, purpose) => purpose === "initial-period" && observed.has(evidenceFingerprint(candidate)) });
        limiters.set(evidence.periodId, limiter);
      }
      const result = await limiter.initialize(evidence);
      if (result.status !== "initialized") throw new LiveAccountError(result.reason === "subscription-expired" ? "subscription-expired"
        : result.reason === "credential-failure" ? "credential-failure" : "unavailable");
      active = Object.freeze({ accountId: evidence.accountId, periodId: evidence.periodId, startsAt, endsAt: evidence.endsAt, status, limiter });
      return active;
    },
    current(): QuotaDay | null { return active && clock.now() < active.endsAt ? active : null; },
    /** Durable remaining allowance for the active provider day; zero when no day is open. */
    async remaining(): Promise<number> {
      const day = active;
      if (!day || clock.now() >= day.endsAt) return 0;
      return options.store.transaction(day.accountId, async (tx) => (await tx.period(day.periodId))?.dayRemaining ?? 0);
    },
    limiter: routed,
  });
}
export type QuotaRouter = ReturnType<typeof createQuotaRouter>;

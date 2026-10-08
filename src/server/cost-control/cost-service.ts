import "server-only";

import { randomBytes } from "node:crypto";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import type {
  CostAttempt, CostAuthority, CostCategory, CostDecision, CostDenialReason, CostJobPolicy,
  CostPeriodPolicy, CostPermit, CostRateCard, CostRequest, CostStore, CostTotals, CostTransaction, CostUsage,
} from "./cost-contract.ts";
import {
  costFingerprint, parseCostJob, parseCostPeriod, parseCostPermit, parseCostRate,
  parseCostRequest, parseCostUsage,
} from "./cost-input.ts";
import { priceCost } from "./cost-pricing.ts";
import { costObservedQuantities } from "./cost-totals.ts";

type Denial = Extract<CostDecision, { status: "denied" }>;
type Context = { period: CostPeriodPolicy; now: UtcInstant };
export type CostSummary = Readonly<CostTotals & {
  status: "summary"; accountId: string; category: CostCategory; periodId: string; capUsdPicos: bigint;
  openingChargedUsdPicos: bigint; remainingUsdPicos: bigint; overageBlocked: boolean;
}>;
export type CostJobSummary = Readonly<CostTotals & {
  status: "summary"; accountId: string; category: CostCategory; jobId: string; costCapUsdPicos: bigint;
  remainingUsdPicos: bigint;
}>;
const denied = (reason: CostDenialReason): Denial => ({ status: "denied", reason });
const instant = (value: number): UtcInstant => utcInstantFromEpochMilliseconds(value);
const max = (...values: bigint[]): bigint => values.reduce((highest, value) => value > highest ? value : highest, 0n);
const LAUNCH_WINDOW_MS = 1_000;
class CostRollback extends Error {
  readonly reason: CostDenialReason;
  constructor(reason: CostDenialReason) { super("Cost policy changed."); this.reason = reason; }
}
function owns(attempt: CostAttempt | null, permit: CostPermit): attempt is CostAttempt {
  return attempt !== null && attempt.request.attemptId === permit.attemptId && attempt.request.jobId === permit.jobId
    && attempt.periodId === permit.periodId && attempt.ownerToken === permit.ownerToken
    && attempt.reservedAt === permit.reservedAt && attempt.launchBefore === permit.launchBefore
    && attempt.maximumCostUsdPicos === permit.maximumCostUsdPicos;
}
function priorityCompare(left: CostAttempt, right: CostAttempt): number {
  const a = left.request.priority, b = right.request.priority;
  if (a.kind !== b.kind) return a.kind === "fixture" ? -1 : 1;
  if (a.kind === "fixture" && b.kind === "fixture" && a.kickoffAt !== b.kickoffAt) return a.kickoffAt - b.kickoffAt;
  // Queue time is the ordering tie break; opaque IDs never express time/version.
  return left.queuedAt - right.queuedAt;
}
function timeDenial(job: CostJobPolicy, now: UtcInstant, timeoutMs: number, chargedMs = 0n): Denial | null {
  if (now >= job.deadlineAt) return denied("timeout");
  if (now < job.startsAt) return denied("period-inactive");
  const hardDeadline = Math.min(job.deadlineAt, job.startsAt + job.timeLimitMs);
  if (now >= hardDeadline || now + timeoutMs > hardDeadline
    || chargedMs + BigInt(timeoutMs) > BigInt(job.timeLimitMs)) return denied("time-limit");
  const paidDeadline = hardDeadline - job.fallbackReserveMs;
  if (now >= paidDeadline || now + timeoutMs > paidDeadline
    || chargedMs + BigInt(timeoutMs) > BigInt(job.timeLimitMs - job.fallbackReserveMs)) return denied("fallback-time-reserved");
  return null;
}
function capacityDenial(attempt: CostAttempt, job: CostJobPolicy, ctx: Context,
  periodTotals: CostTotals, jobTotals: CostTotals): Denial | null {
  if (ctx.period.openingChargedUsdPicos + periodTotals.liabilityUsdPicos + attempt.maximumCostUsdPicos > ctx.period.capUsdPicos) {
    return denied("budget-exhausted");
  }
  if (jobTotals.liabilityUsdPicos + attempt.maximumCostUsdPicos > job.costCapUsdPicos) return denied("job-budget-exhausted");
  if (jobTotals.requests + BigInt(attempt.request.maximum.requests) > BigInt(job.requestLimit)) return denied("request-limit");
  if (jobTotals.inputTokens + BigInt(attempt.request.maximum.inputTokens) > BigInt(job.inputTokenLimit)
    || jobTotals.outputTokens + BigInt(attempt.request.maximum.outputTokens) > BigInt(job.outputTokenLimit)) return denied("token-limit");
  if (jobTotals.billedUnits + BigInt(attempt.request.maximum.billedUnits) > BigInt(job.billedUnitLimit)) return denied("billed-unit-limit");
  const time = timeDenial(job, ctx.now, attempt.request.timeoutMs, jobTotals.elapsedMs);
  if (time) return time;
  if (ctx.now + attempt.request.timeoutMs > ctx.period.endsAt || ctx.now + attempt.request.timeoutMs > attempt.rate.endsAt) return denied("period-inactive");
  return null;
}

/** Durable accounting only. Callers perform external I/O after markDispatched commits. */
export function createCostService(options: Readonly<{
  accountId: string; category: CostCategory; store: CostStore; authority: CostAuthority;
  rateFor(request: CostRequest): CostRateCard | null;
}>) {
  const { accountId, category, store, authority } = options;
  function authorized(): boolean {
    try { authority.authorize(category); return true; } catch { return false; }
  }
  function verified(check: () => boolean): boolean { try { return check() === true; } catch { return false; } }
  async function transact<Result>(operation: (tx: CostTransaction) => Promise<Result>): Promise<Result | Denial> {
    if (!/^[a-f0-9]{64}$/.test(accountId) || !["ai", "research"].includes(category)) return denied("unconfigured");
    if (!authorized()) return denied("operation-not-authorized");
    // Preserve this reason even when the database boundary sanitizes callback errors.
    let rollbackReason: CostDenialReason | undefined;
    try {
      return await store.transaction(accountId, category, async (tx) => {
        if (!authorized()) { rollbackReason = "operation-not-authorized"; throw new Error("Cost operation revoked."); }
        let result: Result;
        try { result = await operation(tx); }
        catch (error) { if (error instanceof CostRollback) rollbackReason = error.reason; throw error; }
        if (!authorized()) { rollbackReason = "operation-not-authorized"; throw new Error("Cost operation revoked."); }
        return result;
      });
    } catch { return denied(rollbackReason ?? "service-unavailable"); }
  }
  async function context(tx: CostTransaction, active = true): Promise<Context | Denial> {
    const account = await tx.account();
    if (account === null) return denied("unconfigured");
    if (account.accountId !== accountId || account.category !== category) throw new Error("Invalid cost account.");
    const now = await tx.now();
    if (now < account.lastNow) return denied("clock-regression");
    account.lastNow = now;
    await tx.saveAccount(account);
    const period = await tx.period(account.activePeriodId);
    if (period === null) throw new Error("Missing cost accounting period.");
    if (active && (now < period.startsAt || now >= period.endsAt)) return denied("period-inactive");
    if (active && !verified(() => authority.verifyPeriod(period))) return denied("unverified-policy");
    return { period, now };
  }
  function parseWork(jobInput: unknown, requestInput: unknown): { job: CostJobPolicy; request: CostRequest; rate: CostRateCard } | Denial {
    try {
      const job = parseCostJob(jobInput), request = parseCostRequest(requestInput);
      if (job.accountId !== accountId || request.accountId !== accountId || job.category !== category
        || request.category !== category || request.jobId !== job.jobId) return denied("invalid-request");
      let candidate: CostRateCard | null;
      try { candidate = options.rateFor(request); } catch { return denied("unpriced"); }
      if (candidate === null) return denied("unpriced");
      let rate: CostRateCard;
      try { rate = parseCostRate(candidate); } catch { return denied("unpriced"); }
      if (rate.category !== category || rate.version !== request.rateVersion || rate.provider !== request.provider
        || rate.model !== request.model || !verified(() => authority.verifyRate(rate))) return denied("unpriced");
      if (!verified(() => authority.verifyJob(job))) return denied("unverified-policy");
      priceCost(rate, request.maximum);
      return { job, request, rate };
    } catch (error) {
      return denied(error instanceof Error && "reason" in error && ["unpriced", "invalid-pricing"].includes(String(error.reason)) ? "unpriced" : "invalid-request");
    }
  }
  async function queueWork(tx: CostTransaction, work: { job: CostJobPolicy; request: CostRequest; rate: CostRateCard }, ctx: Context) {
    const { job, request, rate } = work;
    if (ctx.now < rate.startsAt || ctx.now >= rate.endsAt) return denied("unpriced");
    if (!verified(() => authority.verifyJob(job)) || !verified(() => authority.verifyRate(rate))
      || !verified(() => authority.verifyRequest(request, job, ctx.period, rate))) return denied("unverified-policy");
    const time = timeDenial(job, ctx.now, request.timeoutMs);
    if (time) return time;
    const existingJob = await tx.job(job.jobId), keyedJob = await tx.jobByWorkKey(job.workKey);
    if ((existingJob !== null && costFingerprint(existingJob) !== costFingerprint(job))
      || (keyedJob !== null && keyedJob.jobId !== job.jobId)) return denied("conflicting-policy");
    if (existingJob === null) await tx.saveJob(job);
    const fingerprint = costFingerprint(request), existing = await tx.attempt(request.attemptId);
    if (existing !== null) {
      if (existing.requestFingerprint !== fingerprint) return denied("invalid-request");
      if (costFingerprint(existing.rate) !== costFingerprint(rate)) return denied("conflicting-policy");
      return existing;
    }
    const attempt: CostAttempt = {
      request, requestFingerprint: fingerprint, rate, state: "queued", queuedAt: ctx.now,
      reservedAt: null, dispatchedAt: null, completedAt: null, launchBefore: null, periodId: null, ownerToken: null,
      maximumCostUsdPicos: priceCost(rate, request.maximum), liabilityUsdPicos: 0n,
      estimatedUsdPicos: null, observedUsdPicos: null, invoicedUsdPicos: null,
      usage: null, reconciliationFingerprint: null, reconciliations: [],
    };
    await tx.saveAttempt(attempt);
    return attempt;
  }
  async function validateReservation(tx: CostTransaction, attempt: CostAttempt, job: CostJobPolicy, ctx: Context): Promise<Denial | null> {
    if ((await tx.totals()).hasOverage) return denied("budget-exhausted");
    const periodTotals = await tx.totals({ periodId: ctx.period.periodId });
    const jobTotals = await tx.totals({ jobId: job.jobId });
    const capacity = capacityDenial(attempt, job, ctx, periodTotals, jobTotals);
    if (capacity) return capacity;
    const queued = (await tx.queued()).filter((item) => item.state === "queued");
    const eligible: CostAttempt[] = [];
    const jobs = new Map<string, CostJobPolicy | null>([[job.jobId, job]]);
    const totalsByJob = new Map<string, CostTotals>([[job.jobId, jobTotals]]);
    for (const item of queued) {
      const queuedJobId = item.request.jobId;
      if (!jobs.has(queuedJobId)) jobs.set(queuedJobId, await tx.job(queuedJobId));
      const queuedJob = jobs.get(queuedJobId);
      if (!queuedJob || ctx.now < item.rate.startsAt || ctx.now >= item.rate.endsAt
        || !verified(() => authority.verifyJob(queuedJob)) || !verified(() => authority.verifyRate(item.rate))
        || !verified(() => authority.verifyRequest(item.request, queuedJob, ctx.period, item.rate))) continue;
      if (!totalsByJob.has(queuedJobId)) totalsByJob.set(queuedJobId, await tx.totals({ jobId: queuedJobId }));
      // Unaffordable/expired heads remain auditable, but cannot starve eligible work.
      if (capacityDenial(item, queuedJob, ctx, periodTotals, totalsByJob.get(queuedJobId)!) === null) eligible.push(item);
    }
    eligible.sort(priorityCompare);
    if (eligible[0] && eligible[0].request.attemptId !== attempt.request.attemptId) return denied("priority-wait");
    return null;
  }
  async function workOperation(jobInput: unknown, requestInput: unknown, claim: boolean) {
    const work = parseWork(jobInput, requestInput);
    if ("status" in work) return work;
    return transact(async (tx) => {
      const ctx = await context(tx);
      if ("status" in ctx) return ctx;
      const attempt = await queueWork(tx, work, ctx);
      if ("status" in attempt) return attempt;
      if (attempt.state !== "queued") return { status: "joined" as const, attemptId: attempt.request.attemptId, state: attempt.state };
      if (!claim) {
        if (!verified(() => authority.verifyPeriod(ctx.period)) || !verified(() => authority.verifyJob(work.job))
          || !verified(() => authority.verifyRate(attempt.rate))
          || !verified(() => authority.verifyRequest(attempt.request, work.job, ctx.period, attempt.rate))) throw new CostRollback("unverified-policy");
        return { status: "queued" as const, attemptId: attempt.request.attemptId };
      }
      const rejection = await validateReservation(tx, attempt, work.job, ctx);
      if (rejection) return rejection;
      attempt.state = "reserved";
      attempt.reservedAt = ctx.now;
      attempt.launchBefore = instant(Math.min(ctx.now + LAUNCH_WINDOW_MS, work.job.deadlineAt - work.job.fallbackReserveMs, ctx.period.endsAt));
      attempt.periodId = ctx.period.periodId;
      attempt.ownerToken = randomBytes(32).toString("hex");
      attempt.liabilityUsdPicos = attempt.maximumCostUsdPicos;
      attempt.estimatedUsdPicos = attempt.maximumCostUsdPicos;
      await tx.saveAttempt(attempt);
      if (!verified(() => authority.verifyPeriod(ctx.period))
        || !verified(() => authority.verifyRequest(attempt.request, work.job, ctx.period, attempt.rate))
        || !verified(() => authority.verifyRate(attempt.rate)) || !verified(() => authority.verifyJob(work.job))) {
        throw new CostRollback("unverified-policy");
      }
      const permit: CostPermit = Object.freeze({ attemptId: attempt.request.attemptId, jobId: attempt.request.jobId,
        periodId: attempt.periodId, ownerToken: attempt.ownerToken, reservedAt: attempt.reservedAt,
        launchBefore: attempt.launchBefore, maximumCostUsdPicos: attempt.maximumCostUsdPicos });
      return { status: "reserved" as const, permit };
    });
  }

  return Object.freeze({
    async initialize(input: unknown): Promise<Readonly<{ status: "initialized" }> | Denial> {
      let policy: CostPeriodPolicy;
      try { policy = parseCostPeriod(input); } catch { return denied("invalid-request"); }
      if (policy.accountId !== accountId || policy.category !== category) return denied("invalid-request");
      if (!verified(() => authority.verifyPeriod(policy))) return denied("unverified-policy");
      return transact(async (tx) => {
        const now = await tx.now(), account = await tx.account();
        if (!verified(() => authority.verifyPeriod(policy))) return denied("unverified-policy");
        if (account && (account.accountId !== accountId || account.category !== category)) throw new Error("Invalid cost account.");
        if (account && now < account.lastNow) return denied("clock-regression");
        const existing = await tx.period(policy.periodId);
        if (existing !== null) {
          if (costFingerprint(existing) !== costFingerprint(policy)) return denied("conflicting-policy");
          return { status: "initialized" as const };
        }
        if (now < policy.startsAt || now >= policy.endsAt) return denied("period-inactive");
        const periods = await tx.periods();
        if (periods.some((item) => policy.startsAt < item.endsAt && policy.endsAt > item.startsAt)) return denied("conflicting-policy");
        if (account !== null) {
          const previous = await tx.period(account.activePeriodId);
          if (previous === null || policy.startsAt < previous.endsAt) return denied("conflicting-policy");
        }
        await tx.savePeriod(policy);
        await tx.saveAccount({ accountId, category, activePeriodId: policy.periodId, lastNow: now });
        if (!verified(() => authority.verifyPeriod(policy))) throw new CostRollback("unverified-policy");
        return { status: "initialized" as const };
      });
    },
    queue(job: unknown, request: unknown) { return workOperation(job, request, false); },
    async reserve(job: unknown, request: unknown): Promise<CostDecision> {
      const result = await workOperation(job, request, true);
      return result.status === "queued" ? denied("service-unavailable") : result;
    },
    async markDispatched(input: unknown): Promise<Readonly<{ status: "claimed"; timeoutMs: number }> | Denial> {
      let permit: CostPermit;
      try { permit = parseCostPermit(input); } catch { return denied("invalid-permit"); }
      return transact(async (tx) => {
        const ctx = await context(tx);
        if ("status" in ctx) return ctx;
        const attempt = await tx.attempt(permit.attemptId);
        if (!owns(attempt, permit)) return denied("invalid-permit");
        if (attempt.state !== "reserved") return denied("already-attempted");
        if (ctx.now >= permit.launchBefore || attempt.periodId !== ctx.period.periodId) return denied("dispatch-expired");
        const job = await tx.job(attempt.request.jobId);
        if (!job) return denied("unknown-job");
        const time = timeDenial(job, ctx.now, attempt.request.timeoutMs);
        if (time) return time;
        if (ctx.now + attempt.request.timeoutMs > ctx.period.endsAt || ctx.now + attempt.request.timeoutMs > attempt.rate.endsAt) return denied("period-inactive");
        if (!verified(() => authority.verifyJob(job)) || !verified(() => authority.verifyRate(attempt.rate))
          || !verified(() => authority.verifyRequest(attempt.request, job, ctx.period, attempt.rate))) return denied("unverified-policy");
        // A concurrently reconciled overage also invalidates an earlier permit.
        if ((await tx.totals()).hasOverage) return denied("budget-exhausted");
        attempt.state = "dispatched";
        attempt.dispatchedAt = ctx.now;
        await tx.saveAttempt(attempt);
        if (!verified(() => authority.verifyPeriod(ctx.period)) || !verified(() => authority.verifyJob(job))
          || !verified(() => authority.verifyRate(attempt.rate))
          || !verified(() => authority.verifyRequest(attempt.request, job, ctx.period, attempt.rate))) throw new CostRollback("unverified-policy");
        return { status: "claimed" as const, timeoutMs: attempt.request.timeoutMs };
      });
    },
    async cancelBeforeDispatch(input: unknown): Promise<Readonly<{ status: "canceled" }> | Denial> {
      let permit: CostPermit;
      try { permit = parseCostPermit(input); } catch { return denied("invalid-permit"); }
      return transact(async (tx) => {
        const ctx = await context(tx, false);
        if ("status" in ctx) return ctx;
        const attempt = await tx.attempt(permit.attemptId);
        if (!owns(attempt, permit)) return denied("invalid-permit");
        if (attempt.state === "canceled") return { status: "canceled" as const };
        if (attempt.state !== "reserved" || attempt.dispatchedAt !== null) return denied("already-attempted");
        attempt.state = "canceled";
        attempt.liabilityUsdPicos = 0n;
        attempt.estimatedUsdPicos = null;
        await tx.saveAttempt(attempt);
        return { status: "canceled" as const };
      });
    },
    async reconcile(permitInput: unknown, usageInput: unknown): Promise<Readonly<{ status: "recorded"; state: CostAttempt["state"]; liabilityUsdPicos: bigint }> | Denial> {
      let permit: CostPermit, usage: CostUsage;
      try { permit = parseCostPermit(permitInput); usage = parseCostUsage(usageInput); } catch { return denied("invalid-request"); }
      if (usage.attemptId !== permit.attemptId) return denied("invalid-request");
      return transact(async (tx) => {
        const ctx = await context(tx, false);
        if ("status" in ctx) return ctx;
        const attempt = await tx.attempt(permit.attemptId);
        if (!owns(attempt, permit)) return denied("invalid-permit");
        if (!["dispatched", "completed", "uncertain"].includes(attempt.state)) return denied("already-attempted");
        const now = ctx.now;
        if (usage.observedAt > now || usage.observedAt < attempt.dispatchedAt!) return denied("invalid-request");
        const fingerprint = costFingerprint(usage), previous = attempt.reconciliations.find((item) => item.id === usage.reconciliationId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) return denied("conflicting-reconciliation");
          return { status: "recorded" as const, state: attempt.state, liabilityUsdPicos: attempt.liabilityUsdPicos };
        }
        if (!verified(() => authority.verifyUsage(usage, attempt))) return denied("unverified-usage");
        const previouslyInvoiced = attempt.invoicedUsdPicos;
        attempt.reconciliations.push({ id: usage.reconciliationId, fingerprint, usage });
        const selected = attempt.reconciliations.reduce((newest, item) => item.usage.observedAt >= newest.usage.observedAt ? item : newest);
        attempt.usage = selected.usage;
        attempt.reconciliationFingerprint = selected.fingerprint;
        let estimated: bigint | null = null, unpricedUsage = false;
        const knownQuantities = costObservedQuantities(attempt.reconciliations);
        if (knownQuantities !== null) {
          try { estimated = priceCost(attempt.rate, knownQuantities); }
          catch { unpricedUsage = true; }
        }
        if (estimated !== null) attempt.estimatedUsdPicos = estimated;
        if (usage.observedUsdPicos !== null) attempt.observedUsdPicos = max(attempt.observedUsdPicos ?? 0n, usage.observedUsdPicos);
        if (usage.invoicedUsdPicos !== null) attempt.invoicedUsdPicos = max(attempt.invoicedUsdPicos ?? 0n, usage.invoicedUsdPicos);
        const complete = selected.usage.kind === "complete" && (!unpricedUsage || attempt.invoicedUsdPicos !== null);
        const release = complete && (attempt.invoicedUsdPicos !== null
          || (attempt.rate.billingRule === "measured-usage" && selected.usage.observedQuantities !== null));
        const observed = max(attempt.observedUsdPicos ?? 0n, attempt.invoicedUsdPicos ?? 0n);
        if (release) {
          // Confirmed invoices take precedence over rate estimates; actual amounts remain separately labeled.
          const actual = attempt.invoicedUsdPicos ?? attempt.observedUsdPicos ?? estimated!;
          attempt.liabilityUsdPicos = max(actual, observed, previouslyInvoiced ?? 0n);
        } else attempt.liabilityUsdPicos = max(attempt.liabilityUsdPicos, attempt.maximumCostUsdPicos, observed, estimated ?? 0n);
        attempt.state = complete ? "completed" : "uncertain";
        attempt.completedAt = complete ? now : null;
        await tx.saveAttempt(attempt);
        if (!verified(() => authority.verifyUsage(usage, attempt))) throw new CostRollback("unverified-usage");
        return { status: "recorded" as const, state: attempt.state, liabilityUsdPicos: attempt.liabilityUsdPicos };
      });
    },
    async summary(periodId?: string): Promise<CostSummary | Denial> {
      return transact(async (tx) => {
        const ctx = await context(tx, false);
        if ("status" in ctx) return ctx;
        const period = periodId === undefined ? ctx.period : await tx.period(periodId);
        if (period === null) return denied("period-inactive");
        const value = await tx.totals({ periodId: period.periodId });
        const liabilityUsdPicos = value.liabilityUsdPicos + period.openingChargedUsdPicos;
        return Object.freeze({ status: "summary" as const, accountId, category, periodId: period.periodId,
          capUsdPicos: period.capUsdPicos, openingChargedUsdPicos: period.openingChargedUsdPicos,
          ...value, liabilityUsdPicos, remainingUsdPicos: max(period.capUsdPicos - liabilityUsdPicos),
          overageBlocked: (await tx.totals()).hasOverage });
      });
    },
    async jobSummary(jobId: string): Promise<CostJobSummary | Denial> {
      return transact(async (tx) => {
        const ctx = await context(tx, false);
        if ("status" in ctx) return ctx;
        const job = await tx.job(jobId);
        if (job === null) return denied("unknown-job");
        const value = await tx.totals({ jobId });
        return Object.freeze({ status: "summary" as const, accountId, category, jobId,
          costCapUsdPicos: job.costCapUsdPicos, ...value,
          remainingUsdPicos: max(job.costCapUsdPicos - value.liabilityUsdPicos) });
      });
    },
  });
}

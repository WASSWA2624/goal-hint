import "server-only";

import { randomBytes } from "node:crypto";
import { utcInstantFromEpochMilliseconds, type UtcInstant } from "../../domain/calendar.ts";
import { operatingRules } from "../config/runtime-policy.ts";
import {
  essentialReserveFor, quotaPriorities,
  type QuotaAccountState, type QuotaAttempt, type QuotaDecision, type QuotaDenialReason,
  type QuotaEvidenceVerifier, type QuotaFeedback, type QuotaPeriodEvidence,
  type QuotaPeriodState, type QuotaPermit, type QuotaRequest, type QuotaStore, type QuotaTransaction,
} from "./quota-contract.ts";

type Denial = Extract<QuotaDecision, { status: "denied" }>;
type Context = { account: QuotaAccountState; period: QuotaPeriodState; now: UtcInstant };
const limits = operatingRules.football;
// A permit allows two durable transactions to commit before bounded I/O. This
// freshness window is independent of the rolling-rate interval; claimLaunch
// rechecks actual account pacing/windows and never books a future dispatch.
const LAUNCH_WINDOW_MS = 1_000;
const identifier = /^[a-f0-9]{64}$/;
const feedbackKinds = new Set<QuotaFeedback["kind"]>([
  "success", "uncertain", "rate-limited", "credential-failure", "subscription-expired", "provider-error",
]);
const instant = (value: number): UtcInstant => utcInstantFromEpochMilliseconds(value);
const denied = (reason: QuotaDenialReason, retryAt?: UtcInstant): Denial =>
  retryAt === undefined ? { status: "denied", reason } : { status: "denied", reason, retryAt };
const integer = (value: unknown, minimum = 0): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= 1_000_000_000;
const validInstant = (value: unknown): value is UtcInstant =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= -30_610_224_000_000 && value <= 253_402_300_799_999;
const spacing = (period: QuotaPeriodState): number =>
  Math.ceil(Math.max(1_000 / period.secondLimit, 60_000 / period.minuteLimit));

function validRequest(request: QuotaRequest): boolean {
  return !!request && identifier.test(request.requestId) && identifier.test(request.workKey) &&
    Object.hasOwn(quotaPriorities, request.priority) && validInstant(request.deadlineAt) &&
    integer(request.timeoutMs, 1);
}
function validEvidence(evidence: QuotaPeriodEvidence, accountId: string): boolean {
  return !!evidence && evidence.accountId === accountId && identifier.test(evidence.periodId) &&
    validInstant(evidence.startsAt) && validInstant(evidence.endsAt) &&
    validInstant(evidence.subscriptionExpiresAt) && evidence.startsAt < evidence.endsAt &&
    integer(evidence.providerDailyLimit, 1) && integer(evidence.dailyRemaining) &&
    evidence.dailyRemaining <= evidence.providerDailyLimit && integer(evidence.secondLimit, 1) &&
    integer(evidence.minuteLimit, 1) && typeof evidence.evidenceRef === "string" &&
    evidence.evidenceRef.length > 0 && evidence.evidenceRef.length <= 512;
}
function newPeriod(evidence: QuotaPeriodEvidence, kind: QuotaPeriodState["kind"]): QuotaPeriodState {
  const dayLimit = Math.min(limits.requestsPerProviderDay, evidence.providerDailyLimit);
  const used = kind === "candidate" ? 0 : evidence.providerDailyLimit - evidence.dailyRemaining;
  return {
    id: evidence.periodId, kind, startsAt: evidence.startsAt, endsAt: evidence.endsAt,
    subscriptionExpiresAt: evidence.subscriptionExpiresAt, providerDailyLimit: evidence.providerDailyLimit,
    secondLimit: Math.min(limits.requestsPerRollingSecond, evidence.secondLimit),
    minuteLimit: Math.min(limits.requestsPerRollingMinute, evidence.minuteLimit),
    dayLimit, used, ordinaryUsed: used, dayRemaining: Math.max(0, Math.min(evidence.dailyRemaining, dayLimit - used)),
    minuteRemaining: null, minuteFloorUntil: null, probeRequestId: null,
    evidenceRef: evidence.evidenceRef, observationRevision: 0,
  };
}
function permitFor(attempt: QuotaAttempt, period: QuotaPeriodState): QuotaPermit {
  return {
    requestId: attempt.id, periodId: period.id, ownerToken: attempt.ownerToken!,
    dispatchedAt: attempt.dispatchedAt!,
    launchBefore: instant(Math.min(attempt.leaseUntil!, attempt.dispatchedAt! + LAUNCH_WINDOW_MS)),
  };
}
function owns(attempt: QuotaAttempt | null, permit: QuotaPermit): attempt is QuotaAttempt {
  return attempt !== null && attempt.id === permit.requestId && attempt.periodId === permit.periodId &&
    attempt.ownerToken === permit.ownerToken && attempt.dispatchedAt === permit.dispatchedAt;
}
function validPermit(permit: QuotaPermit): boolean {
  return !!permit && identifier.test(permit.requestId) && identifier.test(permit.ownerToken) &&
    identifier.test(permit.periodId) && validInstant(permit.dispatchedAt) && validInstant(permit.launchBefore) &&
    permit.launchBefore > permit.dispatchedAt;
}

/** No external I/O occurs under the account lock. Every attempted reservation stays spent. */
export function createQuotaLimiter(options: {
  accountId: string;
  store: QuotaStore;
  verifyEvidence?: QuotaEvidenceVerifier;
}) {
  const { accountId, store, verifyEvidence } = options;
  async function transact<Result>(operation: (tx: QuotaTransaction) => Promise<Result>): Promise<Result | Denial> {
    if (!identifier.test(accountId)) return denied("unverified-account");
    try { return await store.transaction(accountId, operation); }
    catch { return denied("storage-unavailable"); }
  }
  function trusted(evidence: QuotaPeriodEvidence, purpose: Parameters<QuotaEvidenceVerifier>[1], probeId?: string): boolean {
    try { return validEvidence(evidence, accountId) && verifyEvidence?.(evidence, purpose, probeId) === true; }
    catch { return false; }
  }
  async function context(tx: QuotaTransaction): Promise<Context | Denial> {
    const account = await tx.account();
    if (!account) return denied("unknown-account");
    const now = await tx.now();
    if (now < account.lastNow) return denied("clock-regression", account.lastNow);
    account.lastNow = now;
    await tx.saveAccount(account);
    const period = await tx.period(account.activePeriodId);
    if (!period || period.kind !== "confirmed") throw new Error("Invalid active quota period.");
    if (account.status !== "active") return denied(account.status);
    if (now >= period.subscriptionExpiresAt) return denied("subscription-expired");
    return { account, period, now };
  }
  async function expire(tx: QuotaTransaction, attempt: QuotaAttempt): Promise<void> {
    attempt.state = attempt.dispatchedAt === null ? "expired" : "uncertain";
    attempt.workKey = null;
    attempt.leaseUntil = null;
    await tx.saveAttempt(attempt);
  }
  async function promote(tx: QuotaTransaction, attempt: QuotaAttempt, request: QuotaRequest): Promise<void> {
    const priority = quotaPriorities[request.priority];
    if (priority.rank < attempt.rank || (priority.rank === attempt.rank && priority.essential && !attempt.essential)) {
      attempt.priority = request.priority;
      attempt.rank = priority.rank;
      attempt.essential = priority.essential;
      await tx.saveAttempt(attempt);
    }
  }
  async function queue(tx: QuotaTransaction, request: QuotaRequest, now: UtcInstant): Promise<QuotaAttempt | QuotaDecision> {
    if (request.deadlineAt <= now) return denied("request-expired");
    const existing = await tx.attempt(request.requestId);
    if (existing) {
      if (existing.state === "queued") {
        if (existing.workKey !== request.workKey ||
            existing.deadlineAt !== request.deadlineAt || existing.timeoutMs !== request.timeoutMs) return denied("invalid-request");
        await promote(tx, existing, request);
        return existing;
      }
      if (existing.state === "attempted" && existing.leaseUntil! > now) {
        return { status: "joined", requestId: existing.id, leaseUntil: existing.leaseUntil! };
      }
      return denied("already-attempted");
    }
    const inFlight = await tx.inFlight(request.workKey);
    if (inFlight) {
      const leaseUntil = inFlight.state === "queued" ? inFlight.deadlineAt : inFlight.leaseUntil;
      if (leaseUntil !== null && leaseUntil > now && ["queued", "attempted"].includes(inFlight.state)) {
        if (inFlight.state === "queued") await promote(tx, inFlight, request);
        return { status: "joined", requestId: inFlight.id, leaseUntil };
      }
      await expire(tx, inFlight);
    }
    const priority = quotaPriorities[request.priority];
    const attempt: QuotaAttempt = {
      id: request.requestId, workKey: request.workKey, priority: request.priority, rank: priority.rank,
      essential: priority.essential, queuedAt: now, deadlineAt: request.deadlineAt, timeoutMs: request.timeoutMs,
      state: "queued", dispatchedAt: null, leaseUntil: null, periodId: null, sequence: null,
      ownerToken: null, responseKind: null, launchedAt: null, observationRevision: 0,
    };
    await tx.saveAttempt(attempt);
    return attempt;
  }
  async function rateDecision(tx: QuotaTransaction, account: QuotaAccountState, period: QuotaPeriodState, now: UtcInstant): Promise<Denial | null> {
    if (now < account.cooldownUntil) return denied("retry-delay", account.cooldownUntil);
    if (period.secondLimit === 0) return denied("second-limit");
    if (period.minuteLimit === 0) return denied("minute-limit");
    if (period.minuteFloorUntil !== null && now >= period.minuteFloorUntil) {
      period.minuteRemaining = null;
      period.minuteFloorUntil = null;
    }
    if (period.minuteRemaining === 0) return denied("minute-limit", period.minuteFloorUntil!);
    const attempts = await tx.rollingAttempts(instant(now - 60_000));
    const seconds = attempts.filter((attempt) => attempt.dispatchedAt! > now - 1_000);
    if (seconds.length >= period.secondLimit) return denied("second-limit", instant(seconds[0]!.dispatchedAt! + 1_000));
    if (attempts.length >= period.minuteLimit) return denied("minute-limit", instant(attempts[0]!.dispatchedAt! + 60_000));
    if (now < account.nextDispatchAt) return denied("pacing", account.nextDispatchAt);
    return null;
  }
  async function dispatch(tx: QuotaTransaction, ctx: Context, period: QuotaPeriodState, attempt: QuotaAttempt, probe = false): Promise<QuotaDecision> {
    if (!probe) {
      if (period.used >= period.dayLimit || period.dayRemaining === 0) {
        await expire(tx, attempt);
        return denied("daily-limit", period.endsAt);
      }
      if (!attempt.essential && period.used >= period.dayLimit - essentialReserveFor(period.dayLimit)) {
        await expire(tx, attempt);
        return denied("essential-reserve", period.endsAt);
      }
      const head = await tx.queueHead(ctx.now);
      // An ordinary waiter cannot block use of the protected essential reserve.
      if (head && head.id !== attempt.id && !(attempt.essential && !head.essential &&
          period.used >= period.dayLimit - essentialReserveFor(period.dayLimit))) return denied("priority-wait");
    }
    const rate = await rateDecision(tx, ctx.account, period, ctx.now);
    if (rate) return rate;
    period.used += 1;
    if (!attempt.essential) period.ordinaryUsed += 1;
    period.dayRemaining = Math.max(0, period.dayRemaining - 1);
    if (period.minuteRemaining !== null) period.minuteRemaining = Math.max(0, period.minuteRemaining - 1);
    attempt.state = "attempted";
    attempt.dispatchedAt = ctx.now;
    attempt.leaseUntil = instant(Math.min(attempt.deadlineAt, ctx.now + attempt.timeoutMs));
    attempt.periodId = period.id;
    attempt.sequence = period.used;
    attempt.ownerToken = randomBytes(32).toString("hex");
    attempt.observationRevision = period.observationRevision;
    ctx.account.nextDispatchAt = instant(ctx.now + spacing(period));
    if (probe) period.probeRequestId = attempt.id;
    await tx.savePeriod(period);
    await tx.saveAttempt(attempt);
    await tx.saveAccount(ctx.account);
    return { status: "reserved", permit: permitFor(attempt, period) };
  }

  return Object.freeze({
    async initialize(evidence: QuotaPeriodEvidence): Promise<{ status: "initialized" } | Denial> {
      if (!trusted(evidence, "initial-period")) return denied("unverified-account");
      return transact(async (tx) => {
        // Verified refreshes may tighten terms, but never reset spent capacity.
        const existing = await tx.account();
        const now = await tx.now();
        if (existing) {
          if (now < existing.lastNow) return denied("clock-regression", existing.lastNow);
          const period = await tx.period(existing.activePeriodId);
          if (!period || period.id !== evidence.periodId || period.startsAt !== evidence.startsAt ||
              period.endsAt !== evidence.endsAt || now >= period.endsAt) return denied("invalid-reset-evidence");
          period.providerDailyLimit = Math.min(period.providerDailyLimit, evidence.providerDailyLimit);
          period.dayLimit = Math.min(period.dayLimit, period.providerDailyLimit);
          period.secondLimit = Math.min(period.secondLimit, evidence.secondLimit);
          period.minuteLimit = Math.min(period.minuteLimit, evidence.minuteLimit);
          period.subscriptionExpiresAt = instant(Math.min(period.subscriptionExpiresAt, evidence.subscriptionExpiresAt));
          const unresolved = await tx.unresolvedBefore(period.id, 2_147_483_647);
          const spent = Math.max(0, period.providerDailyLimit - evidence.dailyRemaining) + unresolved;
          const extra = Math.max(0, spent - period.used);
          period.used += extra;
          period.ordinaryUsed += extra;
          period.dayRemaining = Math.max(0, Math.min(period.dayRemaining, evidence.dailyRemaining - unresolved, period.dayLimit - period.used));
          period.observationRevision += 1;
          period.evidenceRef = evidence.evidenceRef;
          existing.lastNow = now;
          if (now >= period.subscriptionExpiresAt) existing.status = "subscription-expired";
          if (period.secondLimit > 0 && period.minuteLimit > 0) existing.nextDispatchAt = instant(Math.max(existing.nextDispatchAt, existing.lastLaunchedAt + spacing(period)));
          await tx.savePeriod(period);
          await tx.saveAccount(existing);
          return existing.status === "active" ? { status: "initialized" as const } : denied(existing.status);
        }
        if (now < evidence.startsAt || now >= evidence.endsAt) return denied("invalid-reset-evidence");
        if (now >= evidence.subscriptionExpiresAt) return denied("subscription-expired");
        const period = newPeriod(evidence, "confirmed");
        await tx.savePeriod(period);
        await tx.saveAccount({
          activePeriodId: period.id, candidatePeriodId: null, nextDispatchAt: now,
          cooldownUntil: now, lastNow: now, lastLaunchedAt: instant(now - spacing(period)), status: "active",
        });
        return { status: "initialized" as const };
      });
    },
    /** A caller that stops waiting releases its queued, never-dispatched place; nothing else changes. */
    async abandon(requestId: string): Promise<{ status: "abandoned" | "unchanged" } | Denial> {
      if (!identifier.test(requestId)) return denied("invalid-request");
      return transact(async (tx) => {
        const attempt = await tx.attempt(requestId);
        if (!attempt || attempt.state !== "queued" || attempt.dispatchedAt !== null) return { status: "unchanged" as const };
        await expire(tx, attempt);
        return { status: "abandoned" as const };
      });
    },
    async reserve(request: QuotaRequest): Promise<QuotaDecision> {
      if (!validRequest(request)) return denied("invalid-request");
      return transact(async (tx) => {
        const ctx = await context(tx);
        if ("status" in ctx) return ctx;
        if (ctx.now >= ctx.period.endsAt) return denied("reset-unconfirmed");
        const attempt = await queue(tx, request, ctx.now);
        return "status" in attempt ? attempt : dispatch(tx, ctx, ctx.period, attempt);
      });
    },
    async claimLaunch(permit: QuotaPermit): Promise<{ status: "claimed"; timeoutMs: number } | Denial> {
      if (!validPermit(permit)) return denied("invalid-request");
      return transact(async (tx) => {
        const ctx = await context(tx);
        if ("status" in ctx) return ctx;
        const attempt = await tx.attempt(permit.requestId);
        if (!owns(attempt, permit) || attempt.state !== "attempted" || attempt.launchedAt !== null) return denied("already-attempted");
        const period = await tx.period(permit.periodId);
        if (!period) throw new Error("Missing quota period.");
        const expectedPermit = permitFor(attempt, period);
        if (ctx.now >= Math.min(permit.launchBefore, expectedPermit.launchBefore) || ctx.now >= attempt.deadlineAt) {
          await expire(tx, attempt);
          return denied("dispatch-expired");
        }
        if (period.kind === "confirmed" && (ctx.account.activePeriodId !== period.id || ctx.now >= period.endsAt)) return denied("reset-unconfirmed");
        if (period.kind === "candidate" && (ctx.account.candidatePeriodId !== period.id || period.probeRequestId !== attempt.id)) return denied("reset-unconfirmed");
        if (ctx.now >= period.endsAt) return denied("reset-unconfirmed");
        if (ctx.now >= period.subscriptionExpiresAt) return denied("subscription-expired");
        if (ctx.now < ctx.account.cooldownUntil) return denied("retry-delay", ctx.account.cooldownUntil);
        if (period.secondLimit === 0 || period.minuteLimit === 0) return denied("minute-limit");
        if (period.observationRevision !== attempt.observationRevision) {
          if (period.dayRemaining === 0 || period.used > period.dayLimit) return denied("daily-limit");
          if (period.minuteRemaining === 0) return denied("minute-limit");
          if (!attempt.essential && period.used > period.dayLimit - essentialReserveFor(period.dayLimit)) return denied("essential-reserve");
        }
        const earliest = ctx.account.lastLaunchedAt + spacing(period);
        if (ctx.now < earliest) return denied("pacing", instant(earliest));
        // A delayed launch cannot bunch with another replica's newer reservation.
        const rolling = (await tx.rollingAttempts(instant(ctx.now - 61_000))).filter((other) => other.id !== attempt.id);
        if (rolling.filter((other) => (other.launchedAt ?? other.dispatchedAt!) > ctx.now - 1_000).length >= period.secondLimit) return denied("second-limit");
        if (rolling.filter((other) => (other.launchedAt ?? other.dispatchedAt!) > ctx.now - 60_000).length >= period.minuteLimit) return denied("minute-limit");
        attempt.launchedAt = ctx.now;
        ctx.account.lastLaunchedAt = ctx.now;
        ctx.account.nextDispatchAt = instant(Math.max(ctx.account.nextDispatchAt, ctx.now + spacing(period)));
        await tx.saveAttempt(attempt);
        await tx.saveAccount(ctx.account);
        return { status: "claimed" as const, timeoutMs: attempt.leaseUntil! - ctx.now };
      });
    },
    async complete(permit: QuotaPermit, feedback: QuotaFeedback): Promise<{ status: "recorded" } | Denial> {
      if (!validPermit(permit) || !feedbackKinds.has(feedback?.kind)) return denied("invalid-request");
      for (const key of ["dailyLimit", "dailyRemaining", "minuteLimit", "minuteRemaining", "retryAfterMs"] as const) {
        if (feedback[key] !== undefined && !integer(feedback[key])) return denied("invalid-request");
      }
      return transact(async (tx) => {
        const account = await tx.account();
        if (!account) return denied("unknown-account");
        const now = await tx.now();
        if (now < account.lastNow) return denied("clock-regression", account.lastNow);
        const attempt = await tx.attempt(permit.requestId);
        if (!owns(attempt, permit)) return denied("invalid-request");
        if (attempt.responseKind !== null) return { status: "recorded" as const };
        // Success without a single-use dispatch claim is never reset evidence.
        if (feedback.kind !== "uncertain" && attempt.launchedAt === null) return denied("invalid-request");
        const period = await tx.period(permit.periodId);
        if (!period) throw new Error("Missing quota period.");
        const later = (await tx.periodAttempts(period.id, attempt.sequence!)).length;
        const unresolved = await tx.unresolvedBefore(period.id, attempt.sequence!);
        const rolling = feedback.minuteRemaining === undefined ? [] : await tx.rollingAttempts(instant(now - 60_000));
        const crossPeriod = rolling.filter((other) => other.periodId !== period.id &&
          (other.dispatchedAt! >= attempt.dispatchedAt! || other.state === "attempted" || other.state === "uncertain")).length;
        if (feedback.dailyLimit !== undefined) {
          period.providerDailyLimit = Math.min(period.providerDailyLimit, feedback.dailyLimit);
          period.dayLimit = Math.min(period.dayLimit, period.providerDailyLimit);
        }
        if (feedback.minuteLimit !== undefined) period.minuteLimit = Math.min(period.minuteLimit, feedback.minuteLimit);
        if (feedback.dailyRemaining !== undefined) {
          const observedSpent = Math.max(0, period.providerDailyLimit - feedback.dailyRemaining) + later + unresolved;
          const extra = Math.max(0, observedSpent - period.used);
          period.used += extra;
          period.ordinaryUsed += extra;
          period.dayRemaining = Math.min(period.dayRemaining, Math.max(0, feedback.dailyRemaining - later - unresolved));
        }
        period.dayRemaining = Math.max(0, Math.min(period.dayRemaining, period.dayLimit - period.used));
        if (feedback.minuteRemaining !== undefined) {
          const floor = Math.max(0, Math.min(period.minuteLimit, feedback.minuteRemaining) - later - unresolved - crossPeriod);
          // The observation can constrain capacity for a full trailing minute; a late
          // response extends that conservative horizon but never restores a floor.
          period.minuteRemaining = period.minuteFloorUntil !== null && now < period.minuteFloorUntil
            ? Math.min(period.minuteRemaining!, floor) : floor;
          period.minuteFloorUntil = instant(now + 60_000);
        }
        // Minute protection and lower account terms outlive daily boundaries.
        // An old-period reply cannot refill the new day, but it can still tighten
        // account-wide rate protection for the active period or counted probe.
        if (feedback.minuteLimit !== undefined || feedback.minuteRemaining !== undefined || feedback.dailyLimit !== undefined) {
          for (const targetId of new Set([account.activePeriodId, account.candidatePeriodId])) {
            if (targetId === null || targetId === period.id) continue;
            const target = await tx.period(targetId);
            if (!target) throw new Error("Missing coordinated quota period.");
            if (feedback.dailyLimit !== undefined) {
              target.providerDailyLimit = Math.min(target.providerDailyLimit, feedback.dailyLimit);
              target.dayLimit = Math.min(target.dayLimit, target.providerDailyLimit);
              target.dayRemaining = Math.max(0, Math.min(target.dayRemaining, target.dayLimit - target.used));
            }
            if (feedback.minuteLimit !== undefined) target.minuteLimit = Math.min(target.minuteLimit, feedback.minuteLimit);
            if (feedback.minuteRemaining !== undefined) {
              const floor = Math.max(0, Math.min(target.minuteLimit, feedback.minuteRemaining) - later - unresolved - crossPeriod);
              target.minuteRemaining = target.minuteFloorUntil !== null && now < target.minuteFloorUntil
                ? Math.min(target.minuteRemaining!, floor) : floor;
              target.minuteFloorUntil = instant(now + 60_000);
            }
            target.observationRevision += 1;
            if (target.secondLimit > 0 && target.minuteLimit > 0) account.nextDispatchAt = instant(Math.max(account.nextDispatchAt, account.lastLaunchedAt + spacing(target)));
            await tx.savePeriod(target);
          }
        }
        period.observationRevision += 1;
        attempt.state = feedback.kind === "uncertain" ? "uncertain" : "completed";
        attempt.responseKind = feedback.kind;
        attempt.workKey = null;
        attempt.leaseUntil = null;
        account.lastNow = now;
        if (feedback.kind === "credential-failure" || feedback.kind === "subscription-expired") account.status = feedback.kind;
        if (feedback.kind === "rate-limited") account.cooldownUntil = instant(Math.max(account.cooldownUntil, now + Math.max(1, feedback.retryAfterMs ?? 60_000)));
        if (period.secondLimit > 0 && period.minuteLimit > 0) account.nextDispatchAt = instant(Math.max(account.nextDispatchAt, account.lastLaunchedAt + spacing(period)));
        await tx.saveAttempt(attempt);
        await tx.savePeriod(period);
        await tx.saveAccount(account);
        return { status: "recorded" as const };
      });
    },
    async reserveResetProbe(evidence: QuotaPeriodEvidence, request: QuotaRequest): Promise<QuotaDecision> {
      if (!validRequest(request)) return denied("invalid-request");
      if (!trusted(evidence, "candidate-boundary")) return denied("invalid-reset-evidence");
      return transact(async (tx) => {
        const ctx = await context(tx);
        if ("status" in ctx) return ctx;
        if (ctx.now < ctx.period.endsAt) return denied("reset-unconfirmed", ctx.period.endsAt);
        if (evidence.startsAt !== ctx.period.endsAt || ctx.now < evidence.startsAt || ctx.now >= evidence.endsAt ||
            evidence.periodId === ctx.period.id || evidence.subscriptionExpiresAt <= ctx.now) return denied("invalid-reset-evidence");
        if (ctx.account.candidatePeriodId !== null && ctx.account.candidatePeriodId !== evidence.periodId) return denied("reset-unconfirmed");
        let period = await tx.period(evidence.periodId);
        if (period && (period.kind !== "candidate" || period.probeRequestId !== null ||
            period.startsAt !== evidence.startsAt || period.endsAt !== evidence.endsAt)) return denied("reset-unconfirmed");
        if (!period) {
          period = newPeriod(evidence, "candidate");
          // A candidate cannot raise previously confirmed plan limits.
          period.secondLimit = Math.min(period.secondLimit, ctx.period.secondLimit);
          period.minuteLimit = Math.min(period.minuteLimit, ctx.period.minuteLimit);
          period.providerDailyLimit = Math.min(period.providerDailyLimit, ctx.period.providerDailyLimit);
          period.dayLimit = Math.min(period.dayLimit, ctx.period.dayLimit);
          if (ctx.period.minuteFloorUntil !== null && ctx.now < ctx.period.minuteFloorUntil) {
            period.minuteRemaining = ctx.period.minuteRemaining;
            period.minuteFloorUntil = ctx.period.minuteFloorUntil;
          }
          ctx.account.candidatePeriodId = period.id;
          await tx.savePeriod(period);
          await tx.saveAccount(ctx.account);
        }
        const attempt = await queue(tx, request, ctx.now);
        return "status" in attempt ? attempt : dispatch(tx, ctx, period, attempt, true);
      });
    },
    async confirmReset(probeRequestId: string, evidence: QuotaPeriodEvidence): Promise<{ status: "confirmed" } | Denial> {
      if (!identifier.test(probeRequestId) || !trusted(evidence, "reset-confirmation", probeRequestId)) return denied("invalid-reset-evidence");
      return transact(async (tx) => {
        const ctx = await context(tx);
        if ("status" in ctx) return ctx;
        const candidate = await tx.period(evidence.periodId);
        const probe = await tx.attempt(probeRequestId);
        if (ctx.account.candidatePeriodId !== evidence.periodId || candidate?.kind !== "candidate" ||
            candidate.probeRequestId !== probeRequestId || probe?.periodId !== candidate.id ||
            probe.responseKind !== "success" || probe.launchedAt === null || probe.launchedAt < candidate.startsAt ||
            evidence.startsAt !== candidate.startsAt || evidence.endsAt !== candidate.endsAt ||
            ctx.now < evidence.startsAt || ctx.now >= evidence.endsAt || evidence.subscriptionExpiresAt <= ctx.now) return denied("invalid-reset-evidence");
        const confirmed = newPeriod(evidence, "confirmed");
        // A reset is not approval to undo lower terms or provider floors learned
        // from its own probe. Account upgrades require a separate trusted change.
        confirmed.providerDailyLimit = Math.min(confirmed.providerDailyLimit, candidate.providerDailyLimit);
        confirmed.dayLimit = Math.min(confirmed.dayLimit, candidate.dayLimit);
        confirmed.secondLimit = Math.min(confirmed.secondLimit, candidate.secondLimit);
        confirmed.minuteLimit = Math.min(confirmed.minuteLimit, candidate.minuteLimit);
        confirmed.used = Math.max(candidate.used, confirmed.used);
        confirmed.ordinaryUsed = Math.max(candidate.ordinaryUsed, confirmed.ordinaryUsed);
        confirmed.dayRemaining = Math.max(0, Math.min(candidate.dayRemaining, confirmed.dayRemaining, confirmed.dayLimit - confirmed.used));
        confirmed.minuteRemaining = candidate.minuteRemaining;
        confirmed.minuteFloorUntil = candidate.minuteFloorUntil;
        confirmed.probeRequestId = probeRequestId;
        confirmed.observationRevision = candidate.observationRevision + 1;
        ctx.account.activePeriodId = confirmed.id;
        ctx.account.candidatePeriodId = null;
        await tx.savePeriod(confirmed);
        await tx.saveAccount(ctx.account);
        return { status: "confirmed" as const };
      });
    },
  });
}

export type QuotaLimiter = ReturnType<typeof createQuotaLimiter>;

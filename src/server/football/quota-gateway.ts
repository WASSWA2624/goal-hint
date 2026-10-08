import "server-only";

import {
  assertOperationAllowed,
  type EvidenceVerifier,
  type RuntimePolicy,
} from "../config/runtime-policy.ts";
import type {
  QuotaDecision,
  QuotaFeedback,
  QuotaPeriodEvidence,
  QuotaPermit,
  QuotaRequest,
} from "./quota-contract.ts";

type Denied = Extract<QuotaDecision, { status: "denied" }>;
type Joined = Extract<QuotaDecision, { status: "joined" }>;

/** Structural dependency shared by the durable limiter and isolated gateway tests. */
export interface GatewayQuotaLimiter {
  reserve(request: QuotaRequest): Promise<QuotaDecision>;
  reserveResetProbe?(evidence: QuotaPeriodEvidence, request: QuotaRequest): Promise<QuotaDecision>;
  claimLaunch(permit: QuotaPermit): Promise<Readonly<{ status: "claimed"; timeoutMs: number }> | Denied>;
  complete(permit: QuotaPermit, feedback: QuotaFeedback): Promise<Readonly<{ status: "recorded" }> | Denied>;
}

export type QuotaTransport<Value> = (
  signal: AbortSignal,
  permit: QuotaPermit,
  observe: (feedback: QuotaFeedback) => void,
) => Promise<Readonly<{ value: Value; feedback: QuotaFeedback }>>;

export type QuotaGatewayResult<Value> =
  | Denied
  | Joined
  | Readonly<{ status: "completed"; value: Value; feedback: QuotaFeedback }>
  | Readonly<{ status: "failed"; reason: Exclude<QuotaFeedback["kind"], "success"> }>;

const storageUnavailable: Denied = Object.freeze({ status: "denied", reason: "storage-unavailable" });
const operationNotAuthorized: Denied = Object.freeze({ status: "denied", reason: "operation-not-authorized" });
const uncertain: QuotaFeedback = Object.freeze({ kind: "uncertain" });

/**
 * Executes at most one bounded transport after a counted, single-use durable
 * launch claim. Transport callbacks must pass the supplied signal to network I/O;
 * a timeout or uncooperative callback never creates an automatic retry/refund.
 */
export function createQuotaGateway({ limiter, authorize }: {
  limiter: GatewayQuotaLimiter;
  authorize: () => void;
}) {
  if (typeof authorize !== "function") {
    throw new Error("Quota gateway requires an operation authorization callback.");
  }

  function authorized(): boolean {
    try { authorize(); return true; }
    catch { return false; }
  }

  async function record(permit: QuotaPermit, feedback: QuotaFeedback) {
    try { return await limiter.complete(permit, feedback); }
    catch { return storageUnavailable; }
  }

  async function dispatch<Value>(request: QuotaRequest, transport: QuotaTransport<Value>,
    reserve: () => Promise<QuotaDecision>): Promise<QuotaGatewayResult<Value>> {
    if (request === null || typeof request !== "object" || typeof transport !== "function"
      || !Number.isSafeInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > 2_147_483_647) {
      return { status: "denied", reason: "invalid-request" };
    }
    if (!authorized()) return operationNotAuthorized;

    let decision: QuotaDecision;
    const reservationStarted = performance.now();
    try { decision = await reserve(); }
    catch { return storageUnavailable; }
    if (decision.status !== "reserved") return decision;
    const { permit } = decision;

    if (!authorized()) {
      const completion = await record(permit, uncertain);
      return completion.status === "denied" ? completion : operationNotAuthorized;
    }
    let claim: Awaited<ReturnType<GatewayQuotaLimiter["claimLaunch"]>>;
    const claimStarted = performance.now();
    try { claim = await limiter.claimLaunch(permit); }
    catch { return storageUnavailable; }
    if (claim.status === "denied") return claim;
    if (!authorized()) {
      const completion = await record(permit, uncertain);
      return completion.status === "denied" ? completion : operationNotAuthorized;
    }

    const controller = new AbortController();
    const launchDeadline = reservationStarted + (permit.launchBefore - permit.dispatchedAt);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dispatchExpired = false;
    let response: Awaited<ReturnType<QuotaTransport<Value>>> | undefined;
    let earlyFeedback: QuotaFeedback | undefined;
    let observationDeadline = 0;
    let observationOpen = false;
    const observe = (feedback: QuotaFeedback) => {
      if (!observationOpen || controller.signal.aborted || performance.now() >= observationDeadline
        || !["uncertain", "rate-limited", "credential-failure", "subscription-expired", "provider-error"].includes(feedback.kind)) return;
      const fields = ["dailyLimit", "dailyRemaining", "minuteLimit", "minuteRemaining", "retryAfterMs"] as const;
      if (fields.some((field) => feedback[field] !== undefined && (!Number.isSafeInteger(feedback[field]) || feedback[field]! < 0))) return;
      const ranks = { uncertain: 0, "provider-error": 1, "rate-limited": 2, "credential-failure": 3, "subscription-expired": 4, success: -1 };
      const combined = { ...earlyFeedback, kind: earlyFeedback && ranks[earlyFeedback.kind] > ranks[feedback.kind] ? earlyFeedback.kind : feedback.kind };
      for (const field of fields) {
        const previous = earlyFeedback?.[field], next = feedback[field];
        if (next !== undefined) combined[field] = previous === undefined ? next : field === "retryAfterMs" ? Math.max(previous, next) : Math.min(previous, next);
      }
      earlyFeedback = Object.freeze(combined);
    };
    try {
      response = await Promise.resolve().then(async () => {
        // Validate immediately inside the I/O callback: database commit latency
        // or a process pause must not turn an old reservation into a new launch.
        const now = performance.now();
        const transportMs = Math.floor(Math.min(request.timeoutMs, claim.timeoutMs) - (now - claimStarted));
        if (now >= launchDeadline || !Number.isFinite(transportMs) || transportMs <= 0) {
          dispatchExpired = true;
          throw new Error("Provider dispatch permit expired.");
        }
        const transportDeadline = now + transportMs;
        observationDeadline = transportDeadline;
        observationOpen = true;
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("Provider dispatch deadline expired."));
          }, transportMs);
        });
        // Both settlement handlers remain attached to a late transport rejection.
        const result = await Promise.race([transport(controller.signal, permit, observe), timeout]);
        // A blocked event loop can delay the timer beyond transport settlement.
        if (performance.now() >= transportDeadline) {
          controller.abort();
          return undefined;
        }
        return result;
      });
    } catch {
      // Attempted dispatch remains spent even when its network outcome is unknown.
    } finally {
      observationOpen = false;
      clearTimeout(timer);
    }

    let feedback = response?.feedback ?? earlyFeedback ?? uncertain;
    if (response && earlyFeedback) {
      const combined = { ...feedback };
      for (const field of ["dailyLimit", "dailyRemaining", "minuteLimit", "minuteRemaining", "retryAfterMs"] as const) {
        const early = earlyFeedback[field], final = feedback[field];
        if (early !== undefined) combined[field] = final === undefined ? early : field === "retryAfterMs" ? Math.max(early, final) : Math.min(early, final);
      }
      if (combined.kind === "success" && earlyFeedback.kind !== "uncertain") combined.kind = earlyFeedback.kind;
      feedback = Object.freeze(combined);
    }
    const completion = await record(permit, feedback);
    if (completion.status === "denied") return completion;
    if (dispatchExpired) return { status: "denied", reason: "dispatch-expired" };
    if (feedback.kind !== "success") return { status: "failed", reason: feedback.kind };
    if (response === undefined) return { status: "failed", reason: "uncertain" };
    return { status: "completed", value: response.value, feedback };
  }

  return Object.freeze({
    execute<Value>(request: QuotaRequest, transport: QuotaTransport<Value>) {
      return dispatch(request, transport, () => limiter.reserve(request));
    },
    executeResetProbe<Value>(evidence: QuotaPeriodEvidence, request: QuotaRequest, transport: QuotaTransport<Value>) {
      return dispatch(request, transport, () => limiter.reserveResetProbe
        ? limiter.reserveResetProbe(evidence, request)
        : Promise.resolve({ status: "denied", reason: "invalid-reset-evidence" }));
    },
  });
}

/** References alone never authorize transport; the existing trusted verifier applies. */
export function createPolicyQuotaGateway({ limiter, policy, verifyEvidence }: {
  limiter: GatewayQuotaLimiter;
  policy: RuntimePolicy;
  verifyEvidence?: EvidenceVerifier;
}) {
  return createQuotaGateway({
    limiter,
    authorize: () => assertOperationAllowed(policy, "football", verifyEvidence),
  });
}

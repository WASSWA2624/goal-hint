import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock, type UtcInstant } from "../../domain/calendar.ts";
import type { CostDenialReason, CostJobPolicy, CostPermit, CostQuantities, CostRequest, CostUsage } from "./cost-contract.ts";
import { parseCostEvidenceRef, parseCostJob, parseCostPermit, parseCostRequest, parseCostUsage } from "./cost-input.ts";
import type { createCostService } from "./cost-service.ts";

type CostService = ReturnType<typeof createCostService>;
type DispatchService = Pick<CostService, "reserve" | "markDispatched" | "reconcile" | "cancelBeforeDispatch">;
type Denial = Readonly<{ status: "denied"; reason: CostDenialReason }>;
export type CostTransportContext = Readonly<{ signal: AbortSignal; maximum: CostQuantities; timeoutMs: number; permit: CostPermit }>;
export type CostTransportResponse<Value> = Readonly<{ value: Value; usage: CostUsage }>;
export type CostGatewayResult<Value> = Readonly<{ status: "completed"; value: Value; usage: CostUsage }> | Denial;
const denied = (reason: CostDenialReason): Denial => Object.freeze({ status: "denied", reason });
const systemClock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
function safeAuthorize(authorize: () => void): boolean { try { authorize(); return true; } catch { return false; } }
function paidDeadline(job: CostJobPolicy): number {
  return Math.min(job.deadlineAt, job.startsAt + job.timeLimitMs) - job.fallbackReserveMs;
}
function timeReason(job: CostJobPolicy, request: CostRequest, now: number): CostDenialReason | null {
  if (now < job.startsAt) return "period-inactive";
  if (now >= job.deadlineAt) return "timeout";
  const hardDeadline = Math.min(job.deadlineAt, job.startsAt + job.timeLimitMs);
  if (now >= hardDeadline || now + request.timeoutMs > hardDeadline) return "time-limit";
  if (now >= paidDeadline(job) || now + request.timeoutMs > paidDeadline(job)) return "fallback-time-reserved";
  return null;
}

/** One callback represents one outbound provider attempt. Every retry needs a new reservation. */
export function createCostGateway(options: Readonly<{ service: DispatchService; authorize(): void; clock?: Clock }>) {
  const clock = options.clock ?? systemClock;
  return Object.freeze({
    async execute<Value>(jobInput: unknown, requestInput: unknown,
      transport: (context: CostTransportContext) => Promise<CostTransportResponse<Value>>): Promise<CostGatewayResult<Value>> {
      let job: CostJobPolicy, request: CostRequest;
      try { job = parseCostJob(jobInput); request = parseCostRequest(requestInput); } catch { return denied("invalid-request"); }
      if (request.accountId !== job.accountId || request.category !== job.category || request.jobId !== job.jobId || typeof transport !== "function") {
        return denied("invalid-request");
      }
      if (!safeAuthorize(options.authorize)) return denied("operation-not-authorized");
      let now: UtcInstant;
      try { now = utcInstantFromEpochMilliseconds(clock.now()); } catch { return denied("service-unavailable"); }
      const initialTime = timeReason(job, request, now);
      if (initialTime !== null) return denied(initialTime);
      const initialNow = now, startedAt = performance.now(), deadline = paidDeadline(job), paidDuration = deadline - now;
      let controller: AbortController | null = null;
      let boundaryTimer: ReturnType<typeof setTimeout> | undefined;
      const boundary = new Promise<Readonly<{ kind: "expired"; reason: "timeout" }>>((resolve) => {
        boundaryTimer = setTimeout(() => { controller?.abort(); resolve({ kind: "expired", reason: "timeout" }); }, paidDuration);
      });
      type WaitResult<Result> = Readonly<{ kind: "value"; value: Result }> | Readonly<{ kind: "failed" }>
        | Readonly<{ kind: "expired"; reason: CostDenialReason }>;
      function remainingReason(): CostDenialReason | null {
        try { now = utcInstantFromEpochMilliseconds(clock.now()); } catch { return "service-unavailable"; }
        if (now < initialNow) return "clock-regression";
        return now >= deadline || performance.now() - startedAt >= paidDuration ? "timeout" : null;
      }
      function drain(action: () => unknown): void { void Promise.resolve().then(action).catch(() => {}); }
      async function wait<Result>(operation: () => Promise<Result>, lateValue?: (value: Result) => void): Promise<WaitResult<Result>> {
        const before = remainingReason();
        if (before !== null) return { kind: "expired", reason: before };
        let pending: Promise<Result>;
        try { pending = operation(); } catch { return { kind: "failed" }; }
        const settled = Promise.resolve(pending).then((value) => ({ kind: "value" as const, value }), () => ({ kind: "failed" as const }));
        const result = await Promise.race([settled, boundary]);
        if (result.kind === "expired") {
          if (lateValue !== undefined) void settled.then((late) => { if (late.kind === "value") drain(() => lateValue(late.value)); });
          return result;
        }
        const after = remainingReason();
        if (after !== null) {
          if (result.kind === "value" && lateValue !== undefined) drain(() => lateValue(result.value));
          return { kind: "expired", reason: after };
        }
        return result;
      }
      async function cancel(permit: CostPermit): Promise<void> {
        // A slow or failed release stays charged; it cannot delay fallback.
        await wait(() => options.service.cancelBeforeDispatch(permit));
      }
      function cancelLateReservation(reservation: Awaited<ReturnType<DispatchService["reserve"]>>): void {
        if (reservation.status === "reserved") drain(() => options.service.cancelBeforeDispatch(reservation.permit));
      }
      try {
        const reserved = await wait(() => options.service.reserve(job, request), cancelLateReservation);
        if (reserved.kind === "expired") return denied(reserved.reason);
        if (reserved.kind === "failed") return denied("service-unavailable");
        const reservation = reserved.value;
        if (reservation.status === "denied") return denied(reservation.reason);
        if (reservation.status === "joined") return denied("already-attempted");
        let permit: CostPermit;
        try { permit = parseCostPermit(reservation.permit); } catch { return denied("service-unavailable"); }
        if (!safeAuthorize(options.authorize)) { await cancel(permit); return denied("operation-not-authorized"); }
        const reservationTime = timeReason(job, request, now);
        if (reservationTime !== null) { await cancel(permit); return denied(reservationTime); }
        if (now < permit.reservedAt) { await cancel(permit); return denied("clock-regression"); }
        const permitReceivedAt = performance.now(), launchDuration = permit.launchBefore - now;
        if (launchDuration <= 0) { await cancel(permit); return denied("dispatch-expired"); }
        const claimed = await wait(() => options.service.markDispatched(permit));
        if (claimed.kind === "expired") return denied(claimed.reason);
        if (claimed.kind === "failed") return denied("service-unavailable");
        const claim = claimed.value;
        if (claim.status === "denied") { await cancel(permit); return denied(claim.reason); }
        // A late durable claim is potentially billable; its liability is retained.
        if (!safeAuthorize(options.authorize)) return denied("operation-not-authorized");
        const claimedTime = timeReason(job, request, now);
        if (claimedTime !== null) return denied(claimedTime);
        if (now < permit.reservedAt) return denied("clock-regression");
        if (now >= permit.launchBefore || performance.now() - permitReceivedAt >= launchDuration) return denied("dispatch-expired");
        if (claim.timeoutMs !== request.timeoutMs) return denied("invalid-request");
        let lateReceiptRecorded = false;
        function settleLateResponse(response: unknown): void {
          if (lateReceiptRecorded) return;
          let usage: CostUsage;
          try {
            if (response === null || typeof response !== "object" || !Object.hasOwn(response, "value") || !Object.hasOwn(response, "usage") ||
              Object.keys(response).some((key) => !["value", "usage"].includes(key))) return;
            usage = parseCostUsage((response as { usage: unknown }).usage);
            if (usage.attemptId !== request.attemptId) return;
          } catch { return; }
          lateReceiptRecorded = true;
          // A genuine later receipt is bookkeeping, never authority for another dispatch.
          drain(() => options.service.reconcile(permit, usage));
        }
        controller = new AbortController();
        const abort = controller, transportStartedAt = performance.now();
        let transportTimer: ReturnType<typeof setTimeout> | undefined;
        const transportTimeout = new Promise<Readonly<{ kind: "expired"; reason: "timeout" }>>((resolve) => {
          transportTimer = setTimeout(() => { abort.abort(); resolve({ kind: "expired", reason: "timeout" }); }, request.timeoutMs);
        });
        let result: WaitResult<CostTransportResponse<Value>>;
        try {
          const outcome = wait(async () => {
            // Recheck inside the exact microtask that invokes the provider callback.
            if (!safeAuthorize(options.authorize)) return { blocked: "operation-not-authorized" as const };
            const expiry = remainingReason();
            if (expiry !== null) return { blocked: expiry };
            if (now >= permit.launchBefore || performance.now() - permitReceivedAt >= launchDuration) return { blocked: "dispatch-expired" as const };
            return { response: await transport(Object.freeze({ signal: abort.signal, maximum: request.maximum, timeoutMs: request.timeoutMs, permit })) };
          }, (late) => { if ("response" in late) settleLateResponse(late.response); });
          const resolved = await Promise.race([outcome, transportTimeout]);
          if (resolved.kind === "value") {
            if ("blocked" in resolved.value) return denied(resolved.value.blocked);
            result = { kind: "value", value: resolved.value.response };
          } else {
            result = resolved;
            if (resolved.kind === "expired") void outcome.then((late) => {
              if (late.kind === "value" && "response" in late.value) settleLateResponse(late.value.response);
            });
          }
        } finally { if (transportTimer !== undefined) clearTimeout(transportTimer); }
        if (result.kind === "expired") { abort.abort(); return denied(result.reason); }
        if (result.kind === "failed") { abort.abort(); return denied("uncertain-usage"); }
        if (performance.now() - transportStartedAt >= request.timeoutMs) {
          abort.abort(); settleLateResponse(result.value); return denied("timeout");
        }
        let usage: CostUsage, value: Value;
        try {
          const response = result.value;
          if (response === null || typeof response !== "object" || !Object.hasOwn(response, "value") ||
            !Object.hasOwn(response, "usage") || Object.keys(response).some((key) => !["value", "usage"].includes(key))) return denied("unverified-usage");
          usage = parseCostUsage(response.usage); value = response.value;
        } catch { return denied("unverified-usage"); }
        if (usage.attemptId !== request.attemptId) return denied("unverified-usage");
        // A known receipt may settle later, while fallback proceeds at its reserved time.
        const reconciled = await wait(() => options.service.reconcile(permit, usage));
        if (reconciled.kind === "expired") return denied(reconciled.reason);
        if (reconciled.kind === "failed") return denied("service-unavailable");
        const reconciliation = reconciled.value;
        if (reconciliation.status === "denied") return denied(reconciliation.reason);
        if (!safeAuthorize(options.authorize)) return denied("operation-not-authorized");
        if (reconciliation.state !== "completed" || usage.kind !== "complete") return denied("uncertain-usage");
        return Object.freeze({ status: "completed", value, usage });
      } finally { if (boundaryTimer !== undefined) clearTimeout(boundaryTimer); }
    },
  });
}

export type CostEvidenceEntry<Value> = Readonly<{
  value: Value; retrievedAt: UtcInstant; providerUpdatedAt: UtcInstant | null; sourceRef: string; expiresAt: UtcInstant;
}>;
export type CostEvidenceReuse<Value> = Readonly<{ status: "reused"; entry: CostEvidenceEntry<Value>; requestsDispatched: 0 }>
  | Readonly<{ status: "miss"; reason: "invalid-evidence" | "expired-evidence" | "unverified-evidence" | "operation-not-authorized" }>;
/** Reuse consults no provider or ledger; source observation times never become receipt times. */
export function reuseCostEvidence<Value>(entry: CostEvidenceEntry<Value>, options: Readonly<{
  authorize(): void; verifyReuse(entry: CostEvidenceEntry<Value>, now: UtcInstant): boolean; now: UtcInstant;
}>): CostEvidenceReuse<Value> {
  if (!safeAuthorize(options.authorize)) return Object.freeze({ status: "miss", reason: "operation-not-authorized" });
  let original: CostEvidenceEntry<Value>, now: UtcInstant;
  try {
    if (entry === null || typeof entry !== "object" || Object.keys(entry).some((key) =>
      !["value", "retrievedAt", "providerUpdatedAt", "sourceRef", "expiresAt"].includes(key)) || !Object.hasOwn(entry, "value")) throw new Error();
    now = utcInstantFromEpochMilliseconds(options.now);
    const retrievedAt = utcInstantFromEpochMilliseconds(entry.retrievedAt), expiresAt = utcInstantFromEpochMilliseconds(entry.expiresAt);
    const providerUpdatedAt = entry.providerUpdatedAt === null ? null : utcInstantFromEpochMilliseconds(entry.providerUpdatedAt);
    if (retrievedAt > now || expiresAt <= retrievedAt || providerUpdatedAt !== null && providerUpdatedAt > retrievedAt) throw new Error();
    original = Object.freeze({ value: entry.value, retrievedAt, providerUpdatedAt, sourceRef: parseCostEvidenceRef(entry.sourceRef), expiresAt });
  } catch { return Object.freeze({ status: "miss", reason: "invalid-evidence" }); }
  if (now >= original.expiresAt) return Object.freeze({ status: "miss", reason: "expired-evidence" });
  let verified = false;
  try { verified = options.verifyReuse(original, now) === true; } catch { /* Source permission failures expose no private cause. */ }
  if (!verified) return Object.freeze({ status: "miss", reason: "unverified-evidence" });
  if (!safeAuthorize(options.authorize)) return Object.freeze({ status: "miss", reason: "operation-not-authorized" });
  return Object.freeze({ status: "reused", entry: original, requestsDispatched: 0 });
}

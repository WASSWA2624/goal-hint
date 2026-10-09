import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { ApiFootballBounds, ApiFootballFallbackWorkflow } from "../football/api-football-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import type { FallbackContext, FallbackResolutionAuthority, FallbackResolutionResult, ProviderFallbackResult } from "./fallback-contract.ts";
import { FallbackInputError, parseFallbackAiResult, parseFallbackContext, parseProviderFallbackResult } from "./fallback-input.ts";
import { isProviderFallbackCurrent, parseProviderFallbackRequest, type createProviderFallbackAdapter } from "./fallback-adapter.ts";
import { isPredictorForecastCurrent } from "../predictor/predictor-output.ts";
import { fallbackRequestedGroups, resolveFallbackCandidate } from "./fallback-resolution.ts";

export type FallbackRefreshRequest = Readonly<{
  requestId: string; expected: FallbackContext; ai: PredictorResult; bounds: ApiFootballBounds | null; maxElapsedMs: number;
}>;
export type FallbackRefreshReason = "invalid-request" | "not-authorized" | "ineligible-refresh" | "timeout" |
  "clock-regression" | "unavailable" | "invalid-timing" | "conflicting-request" | "capacity-exhausted";
export type FallbackRefreshResult = (Exclude<FallbackResolutionResult, { status: "denied" }> & Readonly<{
  requestsDispatched: number; requestCountUnknown: boolean;
}>) | Readonly<{ status: "denied"; reason: FallbackRefreshReason; requestsDispatched: number; requestCountUnknown: boolean }>;
function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
class RefreshFailure extends Error {
  readonly reason: FallbackRefreshReason;
  constructor(reason: FallbackRefreshReason) { super("Forecast candidate resolution could not complete. Private diagnostics are withheld."); this.reason = reason; }
}
export function parseFallbackRefreshRequest(input: unknown): FallbackRefreshRequest {
  try {
    if (input === null || typeof input !== "object" || Object.keys(input).some((key) =>
      !["requestId", "expected", "ai", "bounds", "maxElapsedMs"].includes(key))) throw new Error();
    const value = input as FallbackRefreshRequest, expected = parseFallbackContext(value.expected), ai = parseFallbackAiResult(value.ai);
    if (typeof value.requestId !== "string" || !/^[a-f0-9]{64}$/u.test(value.requestId) ||
      !Number.isSafeInteger(value.maxElapsedMs) || value.maxElapsedMs < 1 || value.maxElapsedMs > 2_147_483_647) throw new Error();
    const bounds = value.bounds === null ? null : parseProviderFallbackRequest({ context: expected.context,
      jobId: expected.jobId, requestedGroups: ["match-result", "total-goals", "both-teams-to-score"], bounds: value.bounds }).bounds;
    // Preserve the original AI object for trusted invocation/output ownership proof.
    return Object.freeze({ requestId: value.requestId, expected, ai, bounds, maxElapsedMs: value.maxElapsedMs });
  } catch { throw new RefreshFailure("invalid-request"); }
}

/** Resolves one completed AI attempt and, when needed, one bounded fallback
 * collection. It creates no public revision and never reads an old market. */
export function createFallbackService(options: Readonly<{
  fallback: Pick<ReturnType<typeof createProviderFallbackAdapter>, "collect"> | null;
  authority: FallbackResolutionAuthority; clock?: Clock; maxInflight: number;
  /** Binds the owning refresh, AI receipt, original job deadline and quota allowance. */
  verifyRequest(request: FallbackRefreshRequest): boolean;
}>) {
  if (!Number.isSafeInteger(options.maxInflight) || options.maxInflight < 1 || options.maxInflight > 100_000)
    throw new RefreshFailure("invalid-request");
  const now = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  const inflight = new Map<string, Readonly<{ fingerprint: string; promise: Promise<FallbackRefreshResult> }>>();
  const denied = (reason: FallbackRefreshReason, requestsDispatched = 0, requestCountUnknown = false): FallbackRefreshResult =>
    Object.freeze({ status: "denied", reason, requestsDispatched, requestCountUnknown });
  async function execute(request: FallbackRefreshRequest, enteredNow: number, startedAt: number, parent?: ApiFootballFallbackWorkflow): Promise<FallbackRefreshResult> {
    const cutoff = getPublicationDeadline(request.expected.context.kickoffAt);
    if (enteredNow >= cutoff) return denied("ineligible-refresh");
    const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(enteredNow + request.maxElapsedMs, cutoff,
      request.bounds?.deadlineAt ?? Infinity));
    const allowanceMs = Math.min(request.maxElapsedMs, deadlineAt - enteredNow), remainingMs = allowanceMs - (performance.now() - startedAt);
    if (remainingMs <= 0) return denied("timeout");
    const controller = new AbortController();
    let lastNow = enteredNow, requestsDispatched = 0, requestCountUnknown = false, pendingFallback = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiration = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new RefreshFailure("timeout"));
    }, remainingMs); });
    void expiration.catch(() => undefined);
    function timeCheck() {
      parent?.check();
      if (parent?.signal.aborted) throw new RefreshFailure("timeout");
      let current: number; try { current = now(); } catch { throw new RefreshFailure("unavailable"); }
      if (current < lastNow) throw new RefreshFailure("clock-regression");
      lastNow = current;
      if (current >= cutoff) throw new RefreshFailure("ineligible-refresh");
      if (controller.signal.aborted || current >= deadlineAt || performance.now() - startedAt >= allowanceMs)
        throw new RefreshFailure("timeout");
      if (current < request.expected.context.analysisAt) throw new RefreshFailure("ineligible-refresh");
    }
    function check() {
      timeCheck();
      try {
        if (synchronous(options.verifyRequest(request)) !== true || synchronous(options.authority.authorize(request.expected)) !== undefined ||
          synchronous(options.authority.verifyContext(request.expected)) !== true ||
          synchronous(options.authority.verifyAi(request.ai, request.expected, now())) !== true) throw new Error();
      } catch { throw new RefreshFailure("not-authorized"); }
      timeCheck();
    }
    const workflow: ApiFootballFallbackWorkflow = Object.freeze({ signal: parent ? AbortSignal.any([controller.signal, parent.signal]) : controller.signal, deadlineAt, check });
    async function wait<Value>(operation: () => Promise<Value>): Promise<Value> {
      check();
      const pending = Promise.resolve().then(() => { check(); return operation(); });
      const result = await Promise.race([pending, expiration]); check(); return result;
    }
    try {
      check();
      const groups = fallbackRequestedGroups(request.ai, now());
      let provider: ProviderFallbackResult | null = null;
      if (groups.length > 0) {
        if (options.fallback === null || request.bounds === null) {
          provider = Object.freeze({ status: "denied", reason: "unconfigured", requestsDispatched: 0, requestCountUnknown: false });
        } else {
          try {
            provider = await wait(() => {
              pendingFallback = true;
              return options.fallback!.collect({ context: request.expected.context, jobId: request.expected.jobId,
                // Keep the approved job bounds stable; the workflow narrows this call's deadline.
                requestedGroups: groups, bounds: request.bounds! }, workflow).then((result) => {
                pendingFallback = false;
                if (Number.isSafeInteger(result.requestsDispatched) && result.requestsDispatched >= 0) requestsDispatched = result.requestsDispatched;
                if (typeof result.requestCountUnknown === "boolean") requestCountUnknown = result.requestCountUnknown;
                return parseProviderFallbackResult(result);
              });
            });
            if (provider !== null && provider.requestsDispatched > request.bounds.maxRequests) throw new FallbackInputError();
          } catch (error) {
            if (error instanceof RefreshFailure) throw error;
            pendingFallback = false; requestCountUnknown = true;
            provider = Object.freeze({ status: "denied", reason: error instanceof FallbackInputError ? "invalid-response" : "provider-unavailable",
              requestsDispatched, requestCountUnknown });
          }
        }
      }
      check();
      const authority: FallbackResolutionAuthority = Object.freeze({
        authorize(expected) { if (evidenceFingerprint(expected) !== evidenceFingerprint(request.expected)) throw new Error(); check(); },
        verifyContext: options.authority.verifyContext, verifyAi: options.authority.verifyAi, verifyProvider: options.authority.verifyProvider,
      });
      let result = resolveFallbackCandidate({ expected: request.expected, ai: request.ai, provider, now: now() }, authority);
      check();
      if (result.status === "denied") return denied(result.reason, requestsDispatched, requestCountUnknown);
      timeCheck();
      let selected = Object.values(result.candidate.markets).filter((market) => market.available);
      const staleAi = selected.some((market) => market.market.source === "ai") && request.ai.status === "candidate" &&
        !isPredictorForecastCurrent(request.ai.output, utcInstantFromEpochMilliseconds(lastNow));
      const staleProvider = selected.some((market) => market.market.source === "api-football") && provider?.status === "candidate" &&
        !isProviderFallbackCurrent(provider.candidate, request.expected.context, request.expected.jobId, utcInstantFromEpochMilliseconds(lastNow));
      if (staleAi || staleProvider) {
        if (staleProvider) provider = Object.freeze({ status: "denied", reason: "stale", requestsDispatched, requestCountUnknown });
        // One bounded recomposition drops newly expired source groups while retaining the other source.
        result = resolveFallbackCandidate({ expected: request.expected, ai: request.ai, provider, now: utcInstantFromEpochMilliseconds(lastNow) }, authority);
        check();
        if (result.status === "denied") return denied(result.reason, requestsDispatched, requestCountUnknown);
        selected = Object.values(result.candidate.markets).filter((market) => market.available);
      }
      if (selected.some((market) => market.market.source === "ai") && request.ai.status === "candidate" &&
        !isPredictorForecastCurrent(request.ai.output, utcInstantFromEpochMilliseconds(lastNow)) ||
        selected.some((market) => market.market.source === "api-football") && provider?.status === "candidate" &&
        !isProviderFallbackCurrent(provider.candidate, request.expected.context, request.expected.jobId, utcInstantFromEpochMilliseconds(lastNow)))
        return denied("invalid-timing", requestsDispatched, requestCountUnknown);
      return freezeEvidence({ ...result, requestsDispatched, requestCountUnknown });
    } catch (error) {
      if (error instanceof RefreshFailure) return denied(error.reason, requestsDispatched, requestCountUnknown || pendingFallback);
      try { timeCheck(); } catch (failure) { if (failure instanceof RefreshFailure) return denied(failure.reason, requestsDispatched, requestCountUnknown || pendingFallback); }
      return denied("unavailable", requestsDispatched, requestCountUnknown || pendingFallback);
    } finally { controller.abort(); if (timer !== undefined) clearTimeout(timer); }
  }
  return Object.freeze({
    /** Recovery/timeout may discard the provider attempt while preserving independently valid AI groups. */
    resolveWithoutProvider(value: unknown): FallbackRefreshResult {
      try {
        const request = parseFallbackRefreshRequest(value);
        if (synchronous(options.verifyRequest(request)) !== true) return denied("not-authorized");
        const result = resolveFallbackCandidate({ expected: request.expected, ai: request.ai, now: now(),
          provider: { status: "denied", reason: "provider-unavailable", requestsDispatched: 0, requestCountUnknown: true } }, options.authority);
        return freezeEvidence({ ...result, requestsDispatched: 0, requestCountUnknown: true });
      } catch { return denied("unavailable", 0, true); }
    },
    resolve(value: unknown, workflow?: ApiFootballFallbackWorkflow): Promise<FallbackRefreshResult> {
    const startedAt = performance.now();
    let request: FallbackRefreshRequest, enteredNow: number;
    try { enteredNow = now(); request = parseFallbackRefreshRequest(value); } catch { return Promise.resolve(denied("invalid-request")); }
    const fingerprint = evidenceFingerprint(request), running = inflight.get(request.requestId);
    if (running) return running.fingerprint === fingerprint ? running.promise : Promise.resolve(denied("conflicting-request"));
    if (inflight.size >= options.maxInflight) return Promise.resolve(denied("capacity-exhausted"));
    const promise = execute(request, enteredNow, startedAt, workflow).finally(() => {
      if (inflight.get(request.requestId)?.promise === promise) inflight.delete(request.requestId);
    });
    inflight.set(request.requestId, { fingerprint, promise }); return promise;
  } });
}

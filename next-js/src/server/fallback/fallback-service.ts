import "server-only";

import { getPublicationDeadline, utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { ApiFootballBounds, ApiFootballFallbackWorkflow } from "../football/api-football-contract.ts";
import { evidenceFingerprint, freezeEvidence } from "../evidence/evidence-input.ts";
import type { PredictorResult } from "../predictor/predictor-service.ts";
import { LIVE_FORECAST_CASCADE, type FallbackContext, type FallbackResolutionAuthority, type FallbackResolutionResult,
  type ForecastSelectionPolicy, type ForecastSourceOrder, type ProviderFallbackResult, type ResolvedForecastCandidate } from "./fallback-contract.ts";
import { FallbackInputError, parseFallbackAiResult, parseFallbackContext, parseProviderFallbackResult, parseResolvedForecastCandidate } from "./fallback-input.ts";
import { isProviderFallbackCurrent, parseProviderFallbackRequest, type createProviderFallbackAdapter } from "./fallback-adapter.ts";
import { isPredictorForecastCurrent } from "../predictor/predictor-output.ts";
import { synchronous } from "../shared/authority-proof.ts";
import { fallbackRequestedGroups, resolveFallbackCandidate } from "./fallback-resolution.ts";
import { forecastSourceReceipts, type ForecastSourceReceipts } from "./source-receipts.ts";
import type { createLiveLocalEngine } from "../intelligence/live-local-engine.ts";
import { sourceGroups } from "../../domain/markets.ts";

export type FallbackRefreshRequest = Readonly<{
  requestId: string; expected: FallbackContext; ai: PredictorResult; bounds: ApiFootballBounds | null; maxElapsedMs: number;
  /** Legacy ordered requests collect both source receipts. The cascade fills missing groups in priority order. */
  order?: ForecastSourceOrder;
  sourceCascade?: typeof LIVE_FORECAST_CASCADE;
  includeGoalMarkets?: true;
}>;
export type FallbackRefreshReason = "invalid-request" | "not-authorized" | "ineligible-refresh" | "timeout" |
  "clock-regression" | "unavailable" | "invalid-timing" | "conflicting-request" | "capacity-exhausted";
export type FallbackRefreshResult = (Exclude<FallbackResolutionResult, { status: "denied" }> & Readonly<{
  requestsDispatched: number; requestCountUnknown: boolean;
  /** Both sources' contemporaneous receipts; present exactly when the request froze a source order. */
  sources?: ForecastSourceReceipts;
  /** Independently resolved provider-only result, retained even beside complete AI. */
  baseline?: ResolvedForecastCandidate;
}>) | Readonly<{ status: "denied"; reason: FallbackRefreshReason; requestsDispatched: number; requestCountUnknown: boolean }>;
class RefreshFailure extends Error {
  readonly reason: FallbackRefreshReason;
  constructor(reason: FallbackRefreshReason) { super("Forecast candidate resolution could not complete. Private diagnostics are withheld."); this.reason = reason; }
}
export function parseFallbackRefreshRequest(input: unknown): FallbackRefreshRequest {
  try {
    if (input === null || typeof input !== "object" || Object.keys(input).some((key) =>
      !["requestId", "expected", "ai", "bounds", "maxElapsedMs", "order", "sourceCascade", "includeGoalMarkets"].includes(key))) throw new Error();
    const value = input as FallbackRefreshRequest, expected = parseFallbackContext(value.expected), ai = parseFallbackAiResult(value.ai);
    if (typeof value.requestId !== "string" || !/^[a-f0-9]{64}$/u.test(value.requestId) ||
      !Number.isSafeInteger(value.maxElapsedMs) || value.maxElapsedMs < 1 || value.maxElapsedMs > 2_147_483_647 ||
      value.order !== undefined && value.order !== "provider-first" && value.order !== "ai-first" ||
      value.sourceCascade !== undefined && (value.sourceCascade !== LIVE_FORECAST_CASCADE || value.order === "provider-first") ||
      value.includeGoalMarkets !== undefined && (value.includeGoalMarkets !== true || value.sourceCascade !== LIVE_FORECAST_CASCADE)) throw new Error();
    const bounds = value.bounds === null ? null : parseProviderFallbackRequest({ context: expected.context,
      jobId: expected.jobId, requestedGroups: ["match-result", "total-goals", "both-teams-to-score"], bounds: value.bounds }).bounds;
    // Preserve the original AI object for trusted invocation/output ownership proof.
    return Object.freeze({ requestId: value.requestId, expected, ai, bounds, maxElapsedMs: value.maxElapsedMs,
      ...(value.order === undefined ? {} : { order: value.order }),
      ...(value.sourceCascade === undefined ? {} : { sourceCascade: value.sourceCascade }),
      ...(value.includeGoalMarkets ? { includeGoalMarkets: true } : {}) });
  } catch { throw new RefreshFailure("invalid-request"); }
}

/** Resolves the owning AI attempt, optional stored local results and bounded provider fallback.
 * It creates no public revision and never reads an old market. */
export function createFallbackService(options: Readonly<{
  fallback: Pick<ReturnType<typeof createProviderFallbackAdapter>, "collect"> | null;
  authority: FallbackResolutionAuthority; clock?: Clock; maxInflight: number;
  /** A private binding, never visitor input. Defaults to optional AI precedence with an independently retained baseline. */
  selectionPolicy?: ForecastSelectionPolicy;
  localEngine?: ReturnType<typeof createLiveLocalEngine>;
  /** Binds the owning refresh, AI receipt, original job deadline and quota allowance. */
  verifyRequest(request: FallbackRefreshRequest): boolean;
}>) {
  if (!Number.isSafeInteger(options.maxInflight) || options.maxInflight < 1 || options.maxInflight > 100_000)
    throw new RefreshFailure("invalid-request");
  const selectionPolicy = options.selectionPolicy ?? "optional-ai-primary";
  if (selectionPolicy !== "legacy-ai-primary" && selectionPolicy !== "provider-baseline" && selectionPolicy !== "optional-ai-primary") throw new RefreshFailure("invalid-request");
  const now = () => utcInstantFromEpochMilliseconds(options.clock?.now() ?? Date.now());
  const inflight = new Map<string, Readonly<{ fingerprint: string; promise: Promise<FallbackRefreshResult> }>>();
  const denied = (reason: FallbackRefreshReason, requestsDispatched = 0, requestCountUnknown = false): FallbackRefreshResult =>
    Object.freeze({ status: "denied", reason, requestsDispatched, requestCountUnknown });
  function withCascade(result: FallbackResolutionResult, request: FallbackRefreshRequest,
    localStatus: NonNullable<ResolvedForecastCandidate["audit"]["localStatus"]>, localGoalRates?: ResolvedForecastCandidate["audit"]["localGoalRates"]): FallbackResolutionResult {
    if (result.status === "denied" || request.sourceCascade === undefined) return result;
    return { ...result, candidate: parseResolvedForecastCandidate({ ...result.candidate, audit: {
      ...result.candidate.audit, sourceCascade: request.sourceCascade, localStatus,
      ...(localGoalRates === undefined ? {} : { localGoalRates }),
      ...(request.order === undefined ? {} : { sourceOrder: request.order }),
    } }) };
  }
  async function execute(request: FallbackRefreshRequest, enteredNow: number, startedAt: number, parent?: ApiFootballFallbackWorkflow): Promise<FallbackRefreshResult> {
    const cutoff = getPublicationDeadline(request.expected.context.kickoffAt);
    if (enteredNow >= cutoff) return denied("ineligible-refresh");
    const deadlineAt = utcInstantFromEpochMilliseconds(Math.min(enteredNow + request.maxElapsedMs, cutoff,
      request.bounds?.deadlineAt ?? Infinity, parent?.deadlineAt ?? Infinity));
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
      if (selectionPolicy === "provider-baseline" && request.order === "ai-first") return denied("not-authorized");
      const cascade = request.sourceCascade === LIVE_FORECAST_CASCADE;
      const authority: FallbackResolutionAuthority = Object.freeze({
        authorize(expected) { if (evidenceFingerprint(expected) !== evidenceFingerprint(request.expected)) throw new Error(); check(); },
        verifyContext: options.authority.verifyContext, verifyAi: options.authority.verifyAi, verifyProvider: options.authority.verifyProvider,
      });
      const order = request.order === undefined ? {} : { order: request.order };
      const finishEarly = (candidate: ResolvedForecastCandidate): FallbackRefreshResult => freezeEvidence({
        status: "candidate", candidate, requestsDispatched: 0, requestCountUnknown: false,
        ...(request.order === undefined ? {} : { sources: forecastSourceReceipts({ ai: request.ai, provider: null, audit: candidate.audit, order: request.order }) }),
      });
      let local: ResolvedForecastCandidate | null = null;
      let localGoalRates: ResolvedForecastCandidate["audit"]["localGoalRates"];
      let missingGroups: readonly typeof sourceGroups[number][] = sourceGroups;
      if (cascade) {
        const aiOnly = withCascade(resolveFallbackCandidate({ expected: request.expected, ai: request.ai, provider: null, now: now(), ...order },
          authority, "legacy-ai-primary"), request, "not-requested");
        if (aiOnly.status === "denied") return denied(aiOnly.reason);
        check();
        if (aiOnly.status === "candidate" && sourceGroups.every((group) => aiOnly.candidate.markets[group].available) &&
          !request.includeGoalMarkets)
          return finishEarly(aiOnly.candidate);
        const engine = options.localEngine;
        if (engine) {
          let localTimer: ReturnType<typeof setTimeout> | undefined;
          const localLimit = Math.min(3000, allowanceMs - (performance.now() - startedAt) - (request.bounds?.timeoutMs ?? 0));
          if (localLimit > 0) {
            try {
              const output = await Promise.race([
                wait(() => engine(request.expected, { aiStatus: request.ai.status,
                  aiReason: request.ai.status === "candidate" && !isPredictorForecastCurrent(request.ai.output, now())
                    ? "invalid-timing" : aiOnly.candidate.audit.aiReason }, now, check)),
                new Promise<null>((resolve) => { localTimer = setTimeout(() => resolve(null), localLimit); }),
              ]);
              if (output) {
                const parsed = parseResolvedForecastCandidate({ ...output, audit: { ...output.audit,
                  ...(request.order === undefined ? {} : { sourceOrder: request.order }) } });
                if (parsed.audit.localStatus === "candidate" && evidenceFingerprint(parsed.context) === evidenceFingerprint(request.expected))
                  local = parsed;
              }
            } catch (error) {
              if (error instanceof RefreshFailure) throw error;
            } finally { clearTimeout(localTimer); }
          }
          check();
        }
        const localMatch = local?.markets["match-result"];
        if (localMatch?.available && localMatch.provenance.kind === "local-engine") localGoalRates = localMatch.provenance.rates;
        const combined = withCascade(resolveFallbackCandidate({ expected: request.expected, ai: request.ai, provider: null, now: now(), ...order,
          ...(local ? { local } : {}) }, authority), request, localGoalRates ? "candidate" : "unavailable", localGoalRates);
        if (combined.status === "denied") return denied(combined.reason);
        missingGroups = sourceGroups.filter((group) => !combined.candidate.markets[group].available);
        if (combined.status === "candidate" && missingGroups.length === 0) return finishEarly(combined.candidate);
      }
      // Legacy frozen orders capture the provider beside AI. Cascades request only groups the earlier sources could not supply.
      const groups = cascade ? missingGroups : request.order === undefined && selectionPolicy !== "optional-ai-primary" ? fallbackRequestedGroups(request.ai, now(), selectionPolicy)
        : ["match-result", "total-goals", "both-teams-to-score"] as const;
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
      const resolve = (at: ReturnType<typeof now>) => withCascade(resolveFallbackCandidate({
        expected: request.expected, ai: request.ai, provider, now: at, ...order, ...(local ? { local } : {}),
      }, authority, cascade ? "legacy-ai-primary" : selectionPolicy), request, localGoalRates ? "candidate" : "unavailable", localGoalRates);
      let result = resolve(now());
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
        result = resolve(utcInstantFromEpochMilliseconds(lastNow));
        check();
        if (result.status === "denied") return denied(result.reason, requestsDispatched, requestCountUnknown);
        selected = Object.values(result.candidate.markets).filter((market) => market.available);
      }
      if (selected.some((market) => market.market.source === "ai") && request.ai.status === "candidate" &&
        !isPredictorForecastCurrent(request.ai.output, utcInstantFromEpochMilliseconds(lastNow)) ||
        selected.some((market) => market.market.source === "api-football") && provider?.status === "candidate" &&
        !isProviderFallbackCurrent(provider.candidate, request.expected.context, request.expected.jobId, utcInstantFromEpochMilliseconds(lastNow)))
        return denied("invalid-timing", requestsDispatched, requestCountUnknown);
      const baseline = !cascade && selectionPolicy === "optional-ai-primary" ? resolveFallbackCandidate({ expected: request.expected, ai: request.ai, provider, now: utcInstantFromEpochMilliseconds(lastNow), order: "provider-first" }, authority, "provider-baseline") : null;
      return freezeEvidence({ ...result, requestsDispatched, requestCountUnknown, ...(baseline === null || baseline.status === "denied" ? {} : { baseline: baseline.candidate }), ...(request.order === undefined ? {} : {
        sources: forecastSourceReceipts({ ai: request.ai, provider, audit: result.candidate.audit, order: request.order }) }) });
    } catch (error) {
      if (error instanceof RefreshFailure) return denied(error.reason, requestsDispatched, requestCountUnknown || pendingFallback);
      try { timeCheck(); } catch (failure) { if (failure instanceof RefreshFailure) return denied(failure.reason, requestsDispatched, requestCountUnknown || pendingFallback); }
      return denied("unavailable", requestsDispatched, requestCountUnknown || pendingFallback);
    } finally { controller.abort(); if (timer !== undefined) clearTimeout(timer); }
  }
  return Object.freeze({
    /** Recovery drops the provider attempt; baseline policy keeps AI in shadow even on timeout. */
    resolveWithoutProvider(value: unknown): FallbackRefreshResult {
      try {
        const request = parseFallbackRefreshRequest(value);
        if (selectionPolicy === "provider-baseline" && request.order === "ai-first") return denied("not-authorized");
        if (synchronous(options.verifyRequest(request)) !== true) return denied("not-authorized");
        const provider: ProviderFallbackResult = { status: "denied", reason: "provider-unavailable", requestsDispatched: 0, requestCountUnknown: true };
        const result = withCascade(resolveFallbackCandidate({ expected: request.expected, ai: request.ai, now: now(), provider,
          ...(request.order === undefined ? {} : { order: request.order }) }, options.authority,
        request.sourceCascade === undefined ? selectionPolicy : "legacy-ai-primary"), request, "not-requested");
        return freezeEvidence({ ...result, requestsDispatched: 0, requestCountUnknown: true,
          ...(request.order === undefined || result.status === "denied" ? {} : {
            sources: forecastSourceReceipts({ ai: request.ai, provider, audit: result.candidate.audit, order: request.order }) }) });
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

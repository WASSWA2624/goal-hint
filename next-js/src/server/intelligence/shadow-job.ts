import "server-only";

import { z } from "zod";
import { evidenceFingerprint } from "../evidence/evidence-input.ts";
import { defineJob, type JobHandlerContext } from "../jobs/job-registry.ts";
import type { LocalGoalInput } from "./intelligence-contract.ts";
import { estimateLocalGoals, localGoalModelVersion } from "./local-goals-model.ts";
import { validateIntelligenceForecast, type IntelligenceValidationInput } from "./forecast-validator.ts";
import { createShadowIntelligenceService } from "./shadow-service.ts";
import type { MonitoringObservation, MonitoringPolicy } from "./monitoring.ts";
import type { ShadowStore } from "./shadow-store.ts";
import { provenTrue } from "../shared/authority-proof.ts";

export const SHADOW_INTELLIGENCE_JOB = "intelligence.shadow";
export const shadowJobPayload = z.strictObject({ fixtureId: z.uuid(), asOfAt: z.number().int().nonnegative(),
  kickoffAt: z.number().int().positive(), modelVersion: z.string().min(1).max(128), inputRef: z.string().min(1).max(512) });
export type ShadowJobPayload = z.infer<typeof shadowJobPayload>;
export type ShadowJobInput = Readonly<{
  local: LocalGoalInput; observation: MonitoringObservation | null;
  validation?: Omit<IntelligenceValidationInput, "fixture" | "local" | "fixtureStatus">;
}>;
function componentValidity(timestamp: number, at: number, maximumAgeMs: number, authorized = true) {
  if (!authorized) return "unverified";
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > at) return "invalid-time";
  return at - timestamp > maximumAgeMs ? "expired" : "current";
}
/** Register explicitly with the existing durable worker. The authenticated loader
 * reads an immutable local archive; no live provider or paid transport is bound.
 * asOfAt is the preserved archive/check clock, while job events record execution. */
export function createShadowIntelligenceJob(options: Readonly<{
  store: ShadowStore; mode?: "off" | "shadow"; policy?: MonitoringPolicy; clock?: { now(): number };
  authorize(payload: ShadowJobPayload): boolean;
  verifyInput(input: ShadowJobInput, payload: ShadowJobPayload): boolean;
  load(payload: ShadowJobPayload, context: JobHandlerContext): Promise<ShadowJobInput>;
}>) {
  const now = () => options.clock?.now() ?? Date.now();
  const service = createShadowIntelligenceService({ store: options.store, ...(options.mode === undefined ? {} : { mode: options.mode }),
    ...(options.policy === undefined ? {} : { policy: options.policy }) });
  return defineJob({ type: SHADOW_INTELLIGENCE_JOB, handlerVersion: 1, payload: shadowJobPayload,
    eligible(payload, signal) {
      const at = now();
      return options.mode === "shadow" && !signal.aborted && provenTrue(() => options.authorize(payload)) &&
        payload.asOfAt <= at && at < payload.kickoffAt - 300_000 && payload.asOfAt < payload.kickoffAt - 300_000;
    },
    async handle(payload, context) {
      await context.checkpoint();
      if (options.mode !== "shadow" || !provenTrue(() => options.authorize(payload))) return { status: "failed", reason: "non-retryable", retryable: false };
      const checkId = evidenceFingerprint({ jobId: context.lease.jobId, phase: "intelligence-shadow-v1" });
      // An ambiguous prior commit is authoritative; restart must not reload or recompute it.
      const known = await options.store.check(checkId);
      if (known) return known.fixtureId === payload.fixtureId ? { status: "succeeded" } : { status: "failed", reason: "invalid-output", retryable: false };
      const input = await options.load(payload, context);
      await context.checkpoint();
      if (!provenTrue(() => options.verifyInput(input, payload)) || input.local.fixture.fixtureId !== payload.fixtureId ||
        input.local.fixture.forecastAt !== payload.asOfAt || input.local.fixture.kickoffAt !== payload.kickoffAt ||
        localGoalModelVersion(input.local.configuration) !== payload.modelVersion ||
        input.observation !== null && (input.observation.fixtureId !== payload.fixtureId || input.observation.kickoffAt !== payload.kickoffAt ||
          input.observation.observedAt > payload.asOfAt || input.observation.receivedAt > payload.asOfAt))
        return { status: "failed", reason: "invalid-output", retryable: false };
      const maximumAgeMs = input.validation?.maxAgeMs ?? 6 * 3_600_000;
      if (!Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 1)
        return { status: "failed", reason: "invalid-output", retryable: false };
      const previous = await options.store.read(payload.fixtureId);
      const priorLocalAt = previous?.latest?.body.forecast.components.local?.forecastAt;
      const priorRenewal = previous?.latest?.body.forecast.eligibility;
      if (priorRenewal && (!Number.isSafeInteger(priorRenewal.localValidUntil) || priorRenewal.localValidUntil <= 0 ||
        !Number.isSafeInteger(priorRenewal.maximumAgeMs) || priorRenewal.maximumAgeMs < 1 ||
        !Number.isSafeInteger(priorLocalAt) || priorRenewal.localValidUntil < Number(priorLocalAt) ||
        priorRenewal.localValidUntil - Number(priorLocalAt) > priorRenewal.maximumAgeMs))
        return { status: "failed", reason: "invalid-output", retryable: false };
      // Keep the original validity window stable on ordinary checks. Once it
      // expires, fitting at this archive clock opens one new window; subsequent
      // checks reuse that window instead of alternating expired/current hashes.
      const legacyAnchor = !priorRenewal && Number.isSafeInteger(priorLocalAt) && Number(priorLocalAt) <= payload.asOfAt &&
        now() - Number(priorLocalAt) <= maximumAgeMs ? Number(priorLocalAt) : payload.asOfAt;
      const localValidityUntil = priorRenewal?.maximumAgeMs === maximumAgeMs && now() <= priorRenewal.localValidUntil
        ? priorRenewal.localValidUntil : legacyAnchor + maximumAgeMs;
      if (!Number.isSafeInteger(localValidityUntil) || localValidityUntil <= 0)
        return { status: "failed", reason: "invalid-output", retryable: false };
      const observed = { provider: input.validation?.provider?.observedAt ?? null,
        context: input.validation?.context?.assessedAt ?? null, quote: input.validation?.quote?.observedAt ?? null };
      const retainedObserved = { provider: previous?.latest?.body.forecast.components.provider?.observedAt ?? null,
        context: previous?.latest?.body.forecast.components.context?.assessedAt ?? null, quote: priorRenewal?.quoteObservedAt ?? null };
      const componentValidUntil = { provider: null, context: null, quote: null } as Record<keyof typeof observed, number | null>;
      for (const name of ["provider", "context", "quote"] as const) {
        const timestamp = observed[name], retainedTime = retainedObserved[name], saved = priorRenewal?.componentValidUntil?.[name];
        if (saved !== null && saved !== undefined && (!Number.isSafeInteger(saved) || saved <= 0 || retainedTime === null ||
          !Number.isSafeInteger(retainedTime) || saved < retainedTime || saved - retainedTime > priorRenewal!.maximumAgeMs))
          return { status: "failed", reason: "invalid-output", retryable: false };
        if (timestamp === null || !Number.isSafeInteger(timestamp) || timestamp < 0) continue;
        const incomingDeadline = timestamp + maximumAgeMs;
        if (!Number.isSafeInteger(incomingDeadline)) return { status: "failed", reason: "invalid-output", retryable: false };
        const retainedDeadline = priorRenewal?.maximumAgeMs === maximumAgeMs && saved !== undefined ? saved :
          retainedTime === null ? null : retainedTime + maximumAgeMs;
        componentValidUntil[name] = retainedDeadline !== null && now() <= retainedDeadline
          ? Math.min(retainedDeadline, incomingDeadline) : incomingDeadline;
      }
      const validity = () => {
        const at = now(), validation = input.validation;
        return {
          local: componentValidity(payload.asOfAt, at, maximumAgeMs), localValidityUntil, componentValidUntil,
          provider: validation?.provider ? componentValidity(validation.provider.observedAt, at, maximumAgeMs,
            provenTrue(() => validation.verifyProvider?.(validation.provider!))) : "absent",
          context: validation?.context ? componentValidity(validation.context.assessedAt, at, maximumAgeMs,
            provenTrue(() => validation.verifyContext?.(validation.context!))) : "absent",
          quote: validation?.quote ? componentValidity(validation.quote.observedAt, at, maximumAgeMs) : "absent",
          ensemble: validation?.ensemble ? validation.ensemble.learnedAt >= payload.asOfAt ? "invalid-time" :
            provenTrue(() => validation.verifyEnsemble?.(validation.ensemble!)) ? "current" : "unverified" : "absent",
        };
      };
      const initialValidity = validity(), validityHash = evidenceFingerprint(initialValidity);
      const executionDeadlineAt = Math.min(payload.kickoffAt - 300_000,
        ...(initialValidity.local === "current" ? [localValidityUntil + 1] : []),
        ...(["provider", "context", "quote"] as const).flatMap(name => initialValidity[name] === "current" && componentValidUntil[name] !== null
          ? [componentValidUntil[name]! + 1] : []));
      const checkpoint = async () => {
        await context.checkpoint();
        if (now() >= payload.kickoffAt - 300_000 || !provenTrue(() => options.authorize(payload)) ||
          !provenTrue(() => options.verifyInput(input, payload)) || evidenceFingerprint(validity()) !== validityHash)
          throw new Error("Shadow job no longer eligible.");
      };
      await checkpoint();
      await service.observe({ checkId, fixtureId: payload.fixtureId, checkedAt: payload.asOfAt,
        observation: input.observation, modelVersion: payload.modelVersion,
        executionDeadlineAt, beforeRecord: checkpoint,
        dependencyHash: evidenceFingerprint({ inputRef: payload.inputRef, history: input.local.history, configuration: input.local.configuration ?? null,
          fixture: { ...input.local.fixture, forecastAt: null }, modelVersion: payload.modelVersion,
          provider: input.validation?.provider ? { ...input.validation.provider, observedAt: null } : null,
          context: input.validation?.context ? { ...input.validation.context, assessedAt: null } : null,
          ensemble: input.validation?.ensemble?.hash ?? null,
          quote: input.validation?.quote ? { ...input.validation.quote, observedAt: null } : null,
          maxAgeMs: input.validation?.maxAgeMs ?? null, disagreementThreshold: input.validation?.disagreementThreshold ?? null,
          validity: initialValidity }),
        async evaluate() {
          await checkpoint();
          const local = estimateLocalGoals(input.local), status = input.observation?.status;
          const forecast = validateIntelligenceForecast({ ...input.validation, fixture: input.local.fixture, local,
            ...(status === "scheduled" || status === "postponed" || status === "cancelled" ? { fixtureStatus: status } : {}) });
          await checkpoint();
          const invalid = Object.entries(initialValidity).filter(([key, state]) => !["localValidityUntil", "componentValidUntil", "quote"].includes(key) && state !== "current" && state !== "absent");
          const quoteExpired = !["current", "absent"].includes(initialValidity.quote);
          const { hash, ...body } = forecast;
          if (hash !== evidenceFingerprint(body)) throw new Error("Invalid shadow forecast integrity.");
          const reviewed = { ...body, decision: invalid.length ? "withhold" as const : body.decision,
            probabilities: invalid.length ? null : body.probabilities, oddsValue: invalid.length || quoteExpired ? null : body.oddsValue,
            eligibility: { localValidUntil: localValidityUntil, maximumAgeMs, componentValidUntil,
              quoteObservedAt: observed.quote !== null && Number.isSafeInteger(observed.quote) && observed.quote >= 0 ? observed.quote : null },
            reasons: [...new Set([...body.reasons, ...invalid.map(([component, state]) => `component-${component}:${state}`),
              ...(quoteExpired ? ["quote-unavailable-or-stale"] : [])])] };
          return { ...reviewed, hash: evidenceFingerprint(reviewed) };
        },
      });
      await context.checkpoint();
      return { status: "succeeded" };
    },
  });
}

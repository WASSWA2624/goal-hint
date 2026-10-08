import { createFallbackService } from "../../src/server/fallback/fallback-service.ts";
import { assertProviderFallbackCandidate } from "../../src/server/fallback/fallback-adapter.ts";
import { evidenceFingerprint } from "../../src/server/evidence/evidence-input.ts";
import { evidenceHash } from "./evidence-fixtures.mjs";
import { fallbackFixture, fallbackAiDenied } from "./fallback-fixtures.mjs";
import { FALLBACK_NOW, fallbackAdapterSetup, fallbackBounds } from "./fallback-adapter-fixtures.mjs";

// This composes actual 012 validation/calibration, 013 resolution/adapter and
// the 007 adapter/006 quota gateway. Every record, approval and HTTP response is
// synthetic; it does not read live credentials or authorize provider traffic.
export function fallbackServiceSetup(options = {}) {
  const fixture = options.fixture ?? fallbackFixture({ output: options.output ?? {} });
  const ai = options.ai ?? (options.reason === undefined ? fixture.ai : fallbackAiDenied(options.reason));
  const expected = options.expected ?? { ...fixture.expected, pin: ai.status === "candidate" ? fixture.expected.pin : null };
  const provider = fallbackAdapterSetup({ context: expected.context, ...options.provider });
  let current = FALLBACK_NOW;
  const permissions = { refresh: true, ai: true, provider: true, request: true };
  const collected = [], verifications = [];
  const fallback = {
    async collect(request, workflow) {
      collected.push(request);
      return provider.fallback.collect(request, workflow);
    },
  };
  const authority = {
    authorize() { if (!permissions.refresh) throw new Error("Synthetic refresh approval revoked"); },
    verifyContext: (context) => permissions.refresh && evidenceFingerprint(context) === evidenceFingerprint(expected),
    verifyAi(result, context, now) {
      verifications.push({ kind: "ai", now });
      return permissions.ai && result === ai && context.jobId === expected.jobId;
    },
    verifyProvider(candidate, context, now) {
      verifications.push({ kind: "provider", now });
      if (!permissions.provider) return false;
      try { assertProviderFallbackCandidate(candidate, context.context, context.jobId, now); return true; }
      catch { return false; }
    },
    ...options.authority,
  };
  const clock = { now: () => current };
  const defaults = { fallback, authority, clock, maxInflight: 10,
    verifyRequest: (request) => permissions.request && request.ai === ai && evidenceFingerprint(request.expected) === evidenceFingerprint(expected) };
  const service = createFallbackService({ ...defaults, ...options.service });
  const request = (overrides = {}) => ({ requestId: evidenceHash("synthetic-fallback-refresh-request"), expected, ai,
    bounds: fallbackBounds({ deadlineAt: FALLBACK_NOW + 1000, ...options.bounds }), maxElapsedMs: 1000, ...overrides });
  return { service, fallback, provider, fixture, expected, ai, authority, clock, permissions, collected, verifications, request,
    makeService(overrides = {}) { return createFallbackService({ ...defaults, ...overrides }); },
    setNow(value) { current = value; provider.setNow(value); },
  };
}

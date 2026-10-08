import "server-only";

import { utcInstantFromEpochMilliseconds, type Clock } from "../../domain/calendar.ts";
import type { EvidenceAuthority, EvidenceContext, EvidencePolicy, EvidenceSnapshot, EvidenceSource, EvidenceWorkflow } from "./evidence-contract.ts";
import type { FootballEvidenceCollection, FootballEvidencePlan } from "./evidence-football.ts";
import { parseFootballEvidencePlan } from "./evidence-football.ts";
import type { ResearchEvidenceCollection, ResearchEvidencePlan } from "./evidence-research.ts";
import { parseResearchEvidencePlan } from "./evidence-research.ts";
import type { StoredEvidenceSnapshot } from "./evidence-mysql-store.ts";
import { EvidenceStorageError } from "./evidence-mysql-store.ts";
import { EvidenceInputError, evidenceFingerprint, evidenceSerialize, freezeEvidence, parseEvidenceContext, parseEvidencePolicy,
  parseEvidenceSnapshot, parseEvidenceSource } from "./evidence-input.ts";
import { buildEvidenceSnapshot } from "./evidence-snapshot.ts";

export type EvidenceCollectionRequest = Readonly<{
  requestId: string; context: EvidenceContext; policy: EvidencePolicy;
  footballPlan: FootballEvidencePlan | null; researchPlan: ResearchEvidencePlan | null;
  cachedSources: readonly EvidenceSource[]; maxElapsedMs: number;
}>;
export type EvidenceServiceReason = "invalid-request" | "not-authorized" | "unavailable" | "timeout" | "clock-regression" |
  "conflicting-request" | "fixture-changed" | "reuse-not-permitted" | "collection-denied" | "snapshot-too-large";
type ResearchDenialReason = Extract<ResearchEvidenceCollection, { status: "denied" }>["reason"];
export type EvidenceCollectionIssue = Readonly<{ kind: "research"; reason: ResearchDenialReason }>;
export type EvidenceServiceResult = Readonly<{ status: "collected" | "reused"; snapshot: EvidenceSnapshot;
  requestsDispatched: number; requestCountUnknown: boolean; collectionIssues: readonly EvidenceCollectionIssue[] }> |
  Readonly<{ status: "denied"; reason: EvidenceServiceReason }>;
type EvidenceStore = Readonly<{
  find(requestId: string): Promise<StoredEvidenceSnapshot | null>;
  save(requestId: string, fingerprint: string, snapshot: EvidenceSnapshot, authority: EvidenceAuthority): Promise<StoredEvidenceSnapshot>;
}>;
type FootballCollector = Readonly<{ collect(context: EvidenceContext, policy: EvidencePolicy, plan: FootballEvidencePlan,
  workflow?: EvidenceWorkflow): Promise<FootballEvidenceCollection> }>;
type ResearchCollector = Readonly<{ collect(context: EvidenceContext, policy: EvidencePolicy, plan: ResearchEvidencePlan,
  workflow?: EvidenceWorkflow): Promise<ResearchEvidenceCollection> }>;
const systemClock: Clock = { now: () => utcInstantFromEpochMilliseconds(Date.now()) };
const denied = (reason: EvidenceServiceReason): EvidenceServiceResult => Object.freeze({ status: "denied", reason });
const researchReasons = new Set<ResearchDenialReason>(["unconfigured", "invalid-request", "not-authorized", "invalid-response", "unavailable",
  "operation-not-authorized", "unverified-policy", "unpriced", "service-unavailable", "unknown-account", "unknown-job", "unknown-attempt",
  "conflicting-policy", "clock-regression", "period-inactive", "budget-exhausted", "job-budget-exhausted", "request-limit", "token-limit",
  "billed-unit-limit", "time-limit", "fallback-time-reserved", "priority-wait", "already-attempted", "dispatch-expired", "invalid-permit",
  "timeout", "uncertain-usage", "unverified-usage", "conflicting-reconciliation"]);
function synchronous(value: unknown): unknown { if (value instanceof Promise) void value.catch(() => undefined); return value; }
class ServiceFailure extends Error {
  readonly reason: EvidenceServiceReason;
  constructor(reason: EvidenceServiceReason) { super("Fixture evidence collection could not complete. Private diagnostics are withheld."); this.reason = reason; }
}
export function parseEvidenceCollectionRequest(input: unknown): EvidenceCollectionRequest {
  try {
    if (input === null || typeof input !== "object" || Object.keys(input).some((key) =>
      !["requestId", "context", "policy", "footballPlan", "researchPlan", "cachedSources", "maxElapsedMs"].includes(key))) throw new Error();
    const value = input as EvidenceCollectionRequest, context = parseEvidenceContext(value.context), policy = parseEvidencePolicy(value.policy);
    if (typeof value.requestId !== "string" || !/^[a-f0-9]{64}$/u.test(value.requestId) || !Array.isArray(value.cachedSources) ||
      value.cachedSources.length > policy.bounds.maxSources || !Number.isSafeInteger(value.maxElapsedMs) ||
      value.maxElapsedMs < 1 || value.maxElapsedMs > 2_147_483_647) throw new Error();
    const cachedSources = value.cachedSources.map((source) => parseEvidenceSource(source, policy)).sort((a, b) => a.id.localeCompare(b.id));
    if (cachedSources.reduce((bytes, source) => bytes + Buffer.byteLength(evidenceSerialize(source), "utf8"), 0) > policy.bounds.maxSnapshotBytes) throw new Error();
    return freezeEvidence({ requestId: value.requestId, context, policy,
      footballPlan: value.footballPlan === null ? null : parseFootballEvidencePlan(value.footballPlan, context),
      researchPlan: value.researchPlan === null ? null : parseResearchEvidencePlan(value.researchPlan, context, policy),
      cachedSources,
      maxElapsedMs: value.maxElapsedMs });
  } catch { throw new EvidenceInputError(); }
}
export function evidenceCollectionFingerprint(request: EvidenceCollectionRequest): string {
  const { requestId: _id, ...body } = request; void _id; return evidenceFingerprint(body);
}
function eligibleBody(snapshot: EvidenceSnapshot) {
  return { context: snapshot.context, policy: snapshot.policy, sources: snapshot.sources, facts: snapshot.facts,
    missingness: snapshot.missingness, coverage: snapshot.coverage };
}

/** One explicit collection intent; no scheduler, fixture selection, prediction or public publication. */
export function createEvidenceService(options: Readonly<{ authority: EvidenceAuthority; store: EvidenceStore;
  football: FootballCollector; research: ResearchCollector | null; clock?: Clock }>) {
  const clock = options.clock ?? systemClock;
  const inflight = new Map<string, Readonly<{ fingerprint: string; promise: Promise<EvidenceServiceResult> }>>();
  async function execute(request: EvidenceCollectionRequest, fingerprint: string, startedAt: number): Promise<EvidenceServiceResult> {
    const controller = new AbortController(), remainingMs = request.maxElapsedMs - (performance.now() - startedAt);
    if (remainingMs <= 0) return denied("timeout");
    let firstNow: number, lastNow: number, deadlineAt: EvidenceWorkflow["deadlineAt"];
    try {
      firstNow = utcInstantFromEpochMilliseconds(clock.now()); lastNow = firstNow;
      deadlineAt = utcInstantFromEpochMilliseconds(firstNow + Math.floor(remainingMs));
    } catch { return denied("unavailable"); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiration = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new ServiceFailure("timeout"));
    }, remainingMs); });
    // Drain an unused expiration when all synchronous work fails before its first wait.
    void expiration.catch(() => undefined);
    function timeCheck() {
      let now: number; try { now = utcInstantFromEpochMilliseconds(clock.now()); } catch { throw new ServiceFailure("unavailable"); }
      if (now < lastNow) throw new ServiceFailure("clock-regression");
      lastNow = now;
      if (controller.signal.aborted || now >= deadlineAt || performance.now() - startedAt >= request.maxElapsedMs)
        throw new ServiceFailure("timeout");
    }
    function check() {
      timeCheck();
      try {
        if (synchronous(options.authority.authorize(request.context)) !== undefined ||
          synchronous(options.authority.verifyContext(request.context)) !== true || synchronous(options.authority.verifyPolicy(request.policy)) !== true)
          throw new Error();
      } catch { throw new ServiceFailure("not-authorized"); }
      timeCheck();
    }
    const workflow: EvidenceWorkflow = Object.freeze({ signal: controller.signal, deadlineAt, check });
    // The final MySQL permission check also observes this deadline, so a late save rolls back.
    const authority: EvidenceAuthority = Object.freeze({
      authorize(context) { if (evidenceFingerprint(context) !== evidenceFingerprint(request.context)) throw new ServiceFailure("not-authorized"); check(); },
      verifyContext: (context) => options.authority.verifyContext(context), verifyPolicy: (policy) => options.authority.verifyPolicy(policy),
      verifySource: (source, context) => options.authority.verifySource(source, context),
      verifyReuse(source, context, policy) {
        timeCheck();
        return source.reuse.retainUntil < lastNow ? false : options.authority.verifyReuse(source, context, policy);
      },
    });
    async function wait<Value>(operation: () => Promise<Value>): Promise<Value> {
      check();
      const pending = Promise.resolve().then(() => { check(); return operation(); });
      // Promise.race attaches rejection handlers to late operations; no retry or later phase is scheduled.
      const value = await Promise.race([pending, expiration]); check(); return value;
    }
    try {
      check();
      const known = await wait(() => options.store.find(request.requestId));
      if (known !== null) {
        if (known.requestFingerprint !== fingerprint) throw new ServiceFailure("conflicting-request");
        const snapshot = parseEvidenceSnapshot(known.snapshot);
        if (evidenceFingerprint(snapshot.context) !== evidenceFingerprint(request.context) ||
          evidenceFingerprint(snapshot.policy) !== evidenceFingerprint(request.policy)) throw new ServiceFailure("conflicting-request");
        const checked = buildEvidenceSnapshot({ context: request.context, policy: request.policy, sources: snapshot.sources }, authority);
        if (evidenceFingerprint(eligibleBody(checked)) !== evidenceFingerprint(eligibleBody(snapshot))) throw new ServiceFailure("reuse-not-permitted");
        check(); return Object.freeze({ status: "reused", snapshot, requestsDispatched: 0, requestCountUnknown: false, collectionIssues: Object.freeze([]) });
      }
      let sources: readonly EvidenceSource[] = request.cachedSources, requestsDispatched = 0, requestCountUnknown = false;
      // A null plan explicitly selects stored sources only; a supplied football plan retains its requested optional fields.
      if (request.footballPlan !== null) {
        const collection = await wait(() => options.football.collect(request.context, request.policy, request.footballPlan!, workflow));
        if (!Number.isSafeInteger(collection.requestsDispatched) || collection.requestsDispatched < 0 || collection.requestsDispatched > request.footballPlan.maxRequests ||
          typeof collection.requestCountUnknown !== "boolean" || !Array.isArray(collection.sources)) throw new ServiceFailure("unavailable");
        sources = [...sources, ...collection.sources]; requestsDispatched = collection.requestsDispatched;
        requestCountUnknown = collection.requestCountUnknown;
      }
      let snapshot = buildEvidenceSnapshot({ context: request.context, policy: request.policy, sources }, authority); check();
      const collectionIssues: EvidenceCollectionIssue[] = [];
      if (request.researchPlan !== null && snapshot.coverage.independentNewsSources < request.researchPlan.targetIndependentSources) {
        if (options.research === null) collectionIssues.push({ kind: "research", reason: "unconfigured" });
        else {
          if (!Number.isSafeInteger(requestsDispatched + 1)) throw new ServiceFailure("unavailable");
          const collection = await wait(() => options.research!.collect(request.context, request.policy, request.researchPlan!, workflow));
          if (![0, 1].includes(collection.requestsDispatched) || typeof collection.requestCountUnknown !== "boolean" ||
            !Array.isArray(collection.sources)) throw new ServiceFailure("unavailable");
          requestsDispatched += collection.requestsDispatched; requestCountUnknown ||= collection.requestCountUnknown;
          if (!Number.isSafeInteger(requestsDispatched)) throw new ServiceFailure("unavailable");
          if (collection.status === "denied") {
            if (!researchReasons.has(collection.reason) || collection.sources.length !== 0) throw new ServiceFailure("unavailable");
            collectionIssues.push({ kind: "research", reason: collection.reason });
          } else if (collection.status === "completed" && collection.requestsDispatched === 1 && !collection.requestCountUnknown) {
            sources = [...sources, ...collection.sources];
            snapshot = buildEvidenceSnapshot({ context: request.context, policy: request.policy, sources }, authority); check();
          } else throw new ServiceFailure("unavailable");
        }
      }
      const stored = await wait(() => options.store.save(request.requestId, fingerprint, snapshot, authority));
      const persisted = parseEvidenceSnapshot(stored.snapshot);
      if (stored.requestFingerprint !== fingerprint || persisted.hash !== snapshot.hash) throw new ServiceFailure("conflicting-request");
      check(); return freezeEvidence({ status: "collected", snapshot: persisted, requestsDispatched, requestCountUnknown, collectionIssues });
    } catch (error) {
      controller.abort();
      if (error instanceof ServiceFailure) return denied(error.reason);
      try { timeCheck(); } catch (failure) { if (failure instanceof ServiceFailure && failure.reason !== "timeout") return denied(failure.reason); }
      if (performance.now() - startedAt >= request.maxElapsedMs || lastNow >= deadlineAt) return denied("timeout");
      if (error instanceof EvidenceInputError) return denied(error.reason === "snapshot-too-large" ? "snapshot-too-large" :
        error.reason === "not-authorized" ? "not-authorized" : "invalid-request");
      if (error instanceof EvidenceStorageError && ["not-authorized", "fixture-changed", "conflicting-request"].includes(error.reason))
        return denied(error.reason as "not-authorized" | "fixture-changed" | "conflicting-request");
      return denied("unavailable");
    } finally { controller.abort(); if (timer !== undefined) clearTimeout(timer); }
  }
  return Object.freeze({ collect(input: unknown): Promise<EvidenceServiceResult> {
    const startedAt = performance.now();
    let request: EvidenceCollectionRequest;
    try { request = parseEvidenceCollectionRequest(input); } catch { return Promise.resolve(denied("invalid-request")); }
    const fingerprint = evidenceCollectionFingerprint(request), running = inflight.get(request.requestId);
    if (running) return running.fingerprint === fingerprint ? running.promise : Promise.resolve(denied("conflicting-request"));
    const promise = execute(request, fingerprint, startedAt).finally(() => { if (inflight.get(request.requestId)?.promise === promise) inflight.delete(request.requestId); });
    inflight.set(request.requestId, { fingerprint, promise }); return promise;
  } });
}

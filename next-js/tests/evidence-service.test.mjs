import assert from "node:assert/strict";
import test from "node:test";
import { createEvidenceService, evidenceCollectionFingerprint, parseEvidenceCollectionRequest } from "../src/server/evidence/evidence-service.ts";
import { EvidenceStorageError } from "../src/server/evidence/evidence-mysql-store.ts";
import { assertPreparedEvidenceSnapshot } from "../src/server/evidence/evidence-snapshot.ts";
import { evidenceSourceId } from "../src/server/evidence/evidence-input.ts";
import { evidenceAuthority, evidenceContext, evidenceHash, evidencePolicy, evidenceSource, EVIDENCE_NOW } from "./helpers/evidence-fixtures.mjs";
import { costPeriod, costJob, costRequest } from "./helpers/cost-fixtures.mjs";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const request = (overrides = {}) => ({ requestId: evidenceHash("synthetic-evidence-request"), context: evidenceContext(), policy: evidencePolicy(),
  footballPlan: null, researchPlan: null, cachedSources: [evidenceSource()], maxElapsedMs: 1000, ...overrides });
const footballPlan = () => ({ from: "2026-10-01", to: "2026-10-09", historyLimitPerTeam: 3, statisticsLimitPerTeam: 1,
  includeInjuries: true, includeLineups: false, maxRequests: 10, maxElapsedMs: 1000,
  bounds: { priority: "daily-inputs", deadlineAt: EVIDENCE_NOW + 60_000, timeoutMs: 500, maxRequests: 10, maxPages: 5,
    maxRows: 100, maxResponseBytes: 100_000, retry: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0 }, cacheMaxAgeMs: 0 },
  evidenceRef: "synthetic-football-plan", reuse: { evidenceRef: "synthetic-retention", retainUntil: EVIDENCE_NOW + 86_400_000, allowSummary: true } });
const researchPlan = () => {
  const context = evidenceContext(), period = costPeriod("evidence-service", "research"), job = costJob(period, "evidence-service", {
    startsAt: EVIDENCE_NOW - 1000, deadlineAt: EVIDENCE_NOW + 60_000 });
  return { job, request: costRequest(job, "evidence-service", { priority: { kind: "fixture", kickoffAt: context.kickoffAt } }),
    maxSources: 10, targetIndependentSources: 1, maxResponseBytes: 20_000, maxExtractCharacters: 1000, evidenceRef: "synthetic-research-plan" };
};
function fixture(options = {}) {
  const records = new Map(), counts = { find: 0, save: 0, football: 0, research: 0 };
  const authority = options.authority ?? evidenceAuthority();
  const store = options.store ?? {
    async find(id) { counts.find++; return records.get(id) ?? null; },
    async save(id, fingerprint, snapshot, proof) { counts.save++; assertPreparedEvidenceSnapshot(snapshot, proof);
      const previous = records.get(id); if (previous && previous.requestFingerprint !== fingerprint) throw new EvidenceStorageError("conflicting-request");
      const record = { requestFingerprint: fingerprint, snapshot }; records.set(id, record); return record; },
  };
  const football = options.football ?? { async collect() { counts.football++; return { sources: [evidenceSource()], requestsDispatched: 2, requestCountUnknown: false, issues: [] }; } };
  const research = options.research ?? { async collect() { counts.research++; return { status: "completed", sources: [], requestsDispatched: 1, requestCountUnknown: false }; } };
  const service = createEvidenceService({ authority, store, football, research, clock: options.clock ?? { now: () => EVIDENCE_NOW } });
  return { service, records, counts, store, authority };
}

test("strict collection intent binds every explicit plan, context, clock and original cache source", async () => {
  const state = fixture(), input = request();
  for (const change of [{ requestId: "wrong" }, { maxElapsedMs: 0 }, { footballPlan: undefined }, { researchPlan: undefined },
    { cachedSources: undefined }, { maxElapsedMs: 2_147_483_648 }, { secrets: "synthetic-private-key" },
    { footballPlan: { ...footballPlan(), unsupported: true } }]) {
    assert.equal((await state.service.collect({ ...input, ...change })).reason, "invalid-request");
  }
  assert.equal(state.counts.find, 0); assert.equal(state.counts.football, 0);
  const first = parseEvidenceCollectionRequest(input), differentId = parseEvidenceCollectionRequest({ ...input, requestId: evidenceHash("another-request") });
  assert.equal(evidenceCollectionFingerprint(first), evidenceCollectionFingerprint(differentId));
  assert.notEqual(evidenceCollectionFingerprint(first), evidenceCollectionFingerprint(parseEvidenceCollectionRequest({ ...input, maxElapsedMs: 999 })));
});

test("explicit cached-only work and durable replay preserve original timestamps with zero provider calls", async () => {
  const state = fixture(), input = request(), initial = await state.service.collect(input), replay = await state.service.collect(input);
  assert.equal(initial.status, "collected"); assert.equal(replay.status, "reused"); assert.equal(replay.snapshot.hash, initial.snapshot.hash);
  assert.equal(replay.snapshot.sources[0].retrievedAt, input.cachedSources[0].retrievedAt);
  assert.equal(replay.snapshot.context.cycleId, null); assert.equal(replay.snapshot.context.runId, null);
  assert.equal(replay.requestsDispatched, 0); assert.deepEqual(state.counts, { find: 2, save: 1, football: 0, research: 0 });
});

test("replay retains original exclusions while freshly checking every retained source", async () => {
  const state = fixture(), input = request({ cachedSources: [evidenceSource(), evidenceSource(undefined, { binding: { externalFixtureId: 999 } })] });
  const first = await state.service.collect(input); assert.equal(first.snapshot.exclusions[0].reason, "wrong-fixture");
  const replay = await state.service.collect(input); assert.equal(replay.status, "reused");
  assert.deepEqual(replay.snapshot.exclusions, first.snapshot.exclusions); assert.equal(state.counts.football, 0);
});

test("revoked source rights block durable reuse without launching fresh provider work", async () => {
  let allowed = true; const state = fixture({ authority: evidenceAuthority({ verifyReuse: () => allowed }) }), input = request({ footballPlan: footballPlan() });
  assert.equal((await state.service.collect(input)).status, "collected"); allowed = false;
  const replay = await state.service.collect(input); assert.equal(replay.reason, "reuse-not-permitted");
  assert.equal(state.counts.football, 1); assert.equal(state.counts.save, 1);
});

test("expired retention rejects current use while preserving the immutable historical archive", async () => {
  let now = EVIDENCE_NOW;
  const state = fixture({ clock: { now: () => now } }), input = request(), initial = await state.service.collect(input);
  assert.equal(initial.status, "collected"); now = input.cachedSources[0].reuse.retainUntil + 1;
  const replay = await state.service.collect(input); assert.equal(replay.reason, "reuse-not-permitted");
  assert.equal((await state.store.find(input.requestId)).snapshot.hash, initial.snapshot.hash);
  assert.equal((await state.store.find(input.requestId)).snapshot.sources[0].retrievedAt, input.cachedSources[0].retrievedAt);
  const cached = await state.service.collect({ ...input, requestId: evidenceHash("expired-cache-new-intent") });
  assert.equal(cached.status, "collected"); assert.equal(cached.snapshot.sources.length, 0);
  assert.equal(cached.snapshot.exclusions[0].reason, "reuse-not-permitted");
  assert.equal(state.counts.football, 0); assert.equal(state.counts.research, 0);
});

test("a collector cannot report more dispatched requests than the explicit football allowance", async () => {
  const state = fixture({ football: { async collect() { return { sources: [], requestsDispatched: 11, requestCountUnknown: false, issues: [] }; } } });
  const result = await state.service.collect(request({ footballPlan: footballPlan() }));
  assert.equal(result.reason, "unavailable"); assert.equal(state.counts.save, 0); assert.equal(state.counts.research, 0);
});

test("unsafe aggregate request counts prevent a further research dispatch", async () => {
  const state = fixture({ football: { async collect() { return { sources: [], requestsDispatched: Number.MAX_SAFE_INTEGER,
    requestCountUnknown: false, issues: [] }; } } }), plan = footballPlan();
  plan.maxRequests = Number.MAX_SAFE_INTEGER; plan.bounds.maxRequests = Number.MAX_SAFE_INTEGER;
  const result = await state.service.collect(request({ footballPlan: plan, researchPlan: researchPlan() }));
  assert.equal(result.reason, "unavailable"); assert.equal(state.counts.research, 0); assert.equal(state.counts.save, 0);
});

test("same request ID cannot become a different fixture version, analysis context, policy or requested plan", async () => {
  const state = fixture(), input = request(); assert.equal((await state.service.collect(input)).status, "collected");
  for (const change of [{ context: { ...input.context, fixtureVersion: 2n } }, { context: { ...input.context, analysisAt: EVIDENCE_NOW + 1 } },
    { policy: evidencePolicy({ version: "synthetic-policy-v2" }) }, { footballPlan: footballPlan() }])
    assert.equal((await state.service.collect({ ...input, ...change })).reason, "conflicting-request");
  assert.equal(state.counts.football, 0); assert.equal(state.counts.save, 1);
});

test("same intent joins one local in-flight operation and changed intent is denied", async () => {
  const gate = deferred(); let calls = 0;
  const state = fixture({ store: { async find() { calls++; await gate.promise; return null; },
    async save(_id, requestFingerprint, snapshot, authority) { assertPreparedEvidenceSnapshot(snapshot, authority); return { requestFingerprint, snapshot }; } } });
  const input = request(), first = state.service.collect(input), second = state.service.collect(structuredClone(input));
  assert.equal(first, second); assert.equal((await state.service.collect({ ...input, maxElapsedMs: 900 })).reason, "conflicting-request");
  gate.resolve(); assert.equal((await first).status, "collected"); assert.equal(calls, 1);
});

test("approved news coverage skips optional research while missing required news uses one adapter attempt", async () => {
  const state = fixture(), input = request({ researchPlan: researchPlan() });
  const sourceBody = { ...evidenceSource(), kind: "news", sourceKey: evidenceHash("synthetic-required-news"), publisher: "Synthetic publisher",
    title: "Synthetic report", sourceUrl: "https://news.example.com/report", publishedAt: EVIDENCE_NOW - 5000,
    claims: [{ kind: "news", subjectTeamId: input.context.home.teamId, key: "training", value: { claim: "Synthetic confirmed training report" },
      summary: "Synthetic confirmed training report", certainty: "confirmed", asOfAt: EVIDENCE_NOW - 5000 }] };
  sourceBody.id = evidenceSourceId(sourceBody);
  assert.equal((await state.service.collect({ ...input, cachedSources: [...input.cachedSources, sourceBody] })).status, "collected");
  assert.equal(state.counts.research, 0);
  let attempts = 0;
  const withNews = fixture({ research: { async collect(_context, _policy, _plan, workflow) { workflow.check(); attempts++;
    return { status: "completed", sources: [sourceBody], requestsDispatched: 1, requestCountUnknown: false }; } } });
  const result = await withNews.service.collect(request({ policy: evidencePolicy({ minimum: { newsSources: 1 } }), researchPlan: researchPlan() }));
  assert.equal(result.status, "collected"); assert.equal(result.snapshot.coverage.sufficient, true); assert.equal(result.requestsDispatched, 1); assert.equal(attempts, 1);
});

test("revocation after an awaited lookup prevents any collection launch", async () => {
  let allowed = true, launches = 0;
  const state = fixture({ authority: evidenceAuthority({ verifyPolicy: () => allowed }), store: { async find() { allowed = false; return null; }, async save() { throw new Error(); } },
    football: { async collect() { launches++; throw new Error(); } } });
  assert.equal((await state.service.collect(request({ footballPlan: footballPlan() }))).reason, "not-authorized"); assert.equal(launches, 0);
});

test("a stalled lookup is bounded by real elapsed time and late completion cannot launch paid work", async () => {
  const gate = deferred(); let launches = 0;
  const state = fixture({ store: { async find() { await gate.promise; return null; }, async save() { throw new Error(); } },
    football: { async collect() { launches++; throw new Error(); } } });
  const result = await state.service.collect(request({ footballPlan: footballPlan(), maxElapsedMs: 30 }));
  assert.equal(result.reason, "timeout"); gate.resolve(); await new Promise((done) => setImmediate(done)); assert.equal(launches, 0);
});

test("workflow cancellation prevents a collector from dispatching after its slow prerequisite", async () => {
  const gate = deferred(), entered = deferred(); let paidLaunches = 0, signal;
  const state = fixture({ football: { async collect(_context, _policy, _plan, workflow) {
    signal = workflow.signal; entered.resolve(); await gate.promise; workflow.check(); paidLaunches++;
    return { sources: [], requestsDispatched: 1, requestCountUnknown: false, issues: [] }; } } });
  const pending = state.service.collect(request({ footballPlan: footballPlan(), maxElapsedMs: 40 })); await entered.promise;
  assert.equal((await pending).reason, "timeout"); assert.equal(signal.aborted, true);
  gate.resolve(); await new Promise((done) => setImmediate(done)); assert.equal(paidLaunches, 0);
});

test("the final prepared authority rejects a late database save rather than allowing a late commit", async () => {
  const entered = deferred(), gate = deferred(); let commits = 0;
  const state = fixture({ store: { async find() { return null; }, async save(_id, requestFingerprint, snapshot, authority) {
    entered.resolve(); await gate.promise; assertPreparedEvidenceSnapshot(snapshot, authority); commits++; return { requestFingerprint, snapshot }; } } });
  const pending = state.service.collect(request({ maxElapsedMs: 50 })); await entered.promise;
  assert.equal((await pending).reason, "timeout"); gate.resolve(); await new Promise((done) => setImmediate(done)); assert.equal(commits, 0);
});

test("absolute clock advancement and clock regression stop work independently of timer callbacks", async () => {
  for (const [offset, reason] of [[-1, "clock-regression"], [2000, "timeout"]]) {
    let now = EVIDENCE_NOW, launches = 0;
    const state = fixture({ clock: { now: () => now }, store: { async find() { now += offset; return null; }, async save() { throw new Error(); } },
      football: { async collect() { launches++; throw new Error(); } } });
    assert.equal((await state.service.collect(request({ footballPlan: footballPlan() }))).reason, reason); assert.equal(launches, 0);
  }
});

test("storage/collector failures expose safe reasons without retrying or leaking private diagnostics", async () => {
  for (const store of [{ async find() { throw new Error("synthetic-private-key:mysql-driver"); }, async save() {} },
    { async find() { return null; }, async save() { throw new EvidenceStorageError("fixture-changed"); } }]) {
    const result = await fixture({ store }).service.collect(request());
    assert.ok(["unavailable", "fixture-changed"].includes(result.reason)); assert.equal(JSON.stringify(result).includes("synthetic-private-key"), false);
  }
  let attempts = 0; const state = fixture({ football: { async collect() { attempts++; throw new Error("synthetic-private-key:provider-body"); } } });
  const failed = await state.service.collect(request({ footballPlan: footballPlan() })); assert.equal(failed.reason, "unavailable"); assert.equal(attempts, 1);
  const budget = fixture({ research: { async collect() { return { status: "denied", reason: "budget-exhausted", sources: [], requestsDispatched: 0, requestCountUnknown: false }; } } });
  const missing = await budget.service.collect(request({ policy: evidencePolicy({ minimum: { newsSources: 1 } }), researchPlan: researchPlan() }));
  assert.equal(missing.status, "collected"); assert.equal(missing.snapshot.coverage.sufficient, false);
  assert.deepEqual(missing.collectionIssues, [{ kind: "research", reason: "budget-exhausted" }]);
});

test("an explicit acquisition target may request news without making missing news fail primary eligibility", async () => {
  let attempts = 0;
  const state = fixture({ research: { async collect() { attempts++; return { status: "denied", reason: "timeout", sources: [],
    requestsDispatched: 1, requestCountUnknown: true }; } } });
  const result = await state.service.collect(request({ researchPlan: researchPlan() }));
  assert.equal(result.status, "collected"); assert.equal(result.snapshot.coverage.sufficient, true);
  assert.deepEqual(result.snapshot.coverage.labels, ["Limited news coverage"]); assert.equal(result.requestsDispatched, 1);
  assert.equal(result.requestCountUnknown, true); assert.equal(attempts, 1);
  assert.deepEqual(result.collectionIssues, [{ kind: "research", reason: "timeout" }]);
});

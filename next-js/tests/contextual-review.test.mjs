import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceSnapshot } from "../src/server/evidence/evidence-snapshot.ts";
import { buildContextualReviewInput, createContextualReviewService, extractContextualAssessment,
  parseContextualReviewOutput } from "../src/server/intelligence/contextual-review.ts";
import { evidenceAuthority, evidenceContext, evidencePolicy, evidenceSource, EVIDENCE_NOW } from "./helpers/evidence-fixtures.mjs";
import { costJob, costPeriod, costRequest } from "./helpers/cost-fixtures.mjs";

function evidence(overrides = {}) {
  const context = evidenceContext(), authority = evidenceAuthority(), policy = evidencePolicy({ minimum: { requireVenue: false },
    ...(overrides.maximumAgeMs ? { freshness: { news: { maxAgeMs: overrides.maximumAgeMs, basis: "published", unknownTimestamp: "allow-flagged", conflicts: "preserve" } } } : {}) });
  const claims = [
    { kind: "injury", key: "absence-player-1", subjectTeamId: context.home.teamId, value: { playerName: "Synthetic Player", status: "reported" },
      summary: "Reported absence of Synthetic Player.", certainty: "confirmed", asOfAt: EVIDENCE_NOW - 2000 },
    { kind: "news", key: "training-report", subjectTeamId: context.away.teamId, value: { claim: "Unconfirmed training participation report." },
      summary: "Unconfirmed training participation report.", certainty: "rumor", asOfAt: EVIDENCE_NOW - 2000 },
    { kind: "statistic", key: "provider-forecast", subjectTeamId: context.home.teamId, value: { metric: "probability", value: 0.8 },
      summary: "Provider prediction.", certainty: "confirmed", asOfAt: EVIDENCE_NOW - 2000 },
    { kind: "news", key: "bookmaker-news", subjectTeamId: null, value: { claim: "Bookmaker odds and forecasts." },
      summary: "Bookmaker odds and forecasts.", certainty: "confirmed", asOfAt: EVIDENCE_NOW - 2000 },
  ];
  const source = evidenceSource(context, { kind: "news", sourceUrl: "https://news.example.org/synthetic-report",
    publishedAt: EVIDENCE_NOW - 3000, claims, ...(overrides.retainUntil ? { reuse: { retainUntil: overrides.retainUntil } } : {}) });
  return { snapshot: buildEvidenceSnapshot({ context, policy, sources: [source] }, authority), authority };
}
function response(prepared) {
  return { version: "context-review-v1", evidenceHash: prepared.evidenceHash, facts: prepared.facts.map((fact) => ({
    factId: fact.id, status: fact.status, impact: "significant", sourceIds: fact.sourceIds, claimIds: fact.claimIds })) };
}
const change = { severity: "significant", reasons: ["credible-context-change"], hash: "a".repeat(64), suspend: false, recomputeLocal: true, contextualReview: true };
const budget = { dayRemainingRequests: 10, monthRemainingRequests: 20, dayRemainingUsdPicos: 100n, monthRemainingUsdPicos: 200n,
  maximumRequests: 1, maximumUsdPicos: 10n };
function plan(snapshot) {
  const job = costJob(costPeriod("context"), "context", { startsAt: EVIDENCE_NOW - 1000,
    deadlineAt: EVIDENCE_NOW + 60_000, timeLimitMs: 50_000, costCapUsdPicos: 10n });
  const request = costRequest(job, "context", { priority: { kind: "fixture", kickoffAt: snapshot.context.kickoffAt },
    maximum: { requests: 1, inputTokens: 100, outputTokens: 100, billedUnits: 0 } });
  return { job, request };
}
function assisted(input, overrides = {}) {
  let calls = 0, reservations = 0;
  const service = createContextualReviewService({ authority: input.authority, mode: "assisted", clock: { now: () => EVIDENCE_NOW },
    verifyPlan: () => true, verifyTransmission: () => true,
    gateway: { async execute(_job, _request, dispatch) {
      reservations++;
      const result = await dispatch({ signal: new AbortController().signal, maximum: _request.maximum, timeoutMs: 1000,
        permit: { attemptId: _request.attemptId, maximumCostUsdPicos: _job.costCapUsdPicos } });
      return { status: "completed", value: result.value, usage: result.usage };
    } },
    binding: { provider: "synthetic-provider", model: "synthetic-model", modelVersion: "synthetic-context-v1",
      async send(prompt) { calls++; return { value: response(prompt), usage: {} }; } }, ...overrides });
  return { service, calls: () => calls, reservations: () => reservations };
}

test("fact-only preparation excludes model/odds conclusions and preserves source certainty, timestamps and citations", () => {
  const input = evidence(), prepared = buildContextualReviewInput(input);
  assert.equal(prepared.facts.length, 2);
  assert.ok(prepared.facts.every((fact) => fact.sourceIds.length && fact.claimIds.length && fact.observedAt <= prepared.cutoffAt));
  assert.deepEqual(new Set(prepared.facts.map((fact) => fact.status)), new Set(["credible-report", "rumour"]));
  assert.ok(prepared.facts.every((fact) => !Object.hasOwn(fact.value, "probability") && !Object.hasOwn(fact.value, "odds")));
  const deterministic = extractContextualAssessment(prepared);
  assert.equal(deterministic.modelVersion, "evidence-extract-v1");
  assert.equal(deterministic.fixtureId, input.snapshot.context.fixtureId);
  assert.equal(deterministic.evidenceHash, prepared.evidenceHash);
  assert.deepEqual(deterministic.facts.map((fact) => fact.explanation), prepared.facts.map((fact) => fact.summary));
  assert.throws(() => buildContextualReviewInput({ ...input, snapshot: { ...input.snapshot } }), /unavailable/);
});

test("contextual output may neither invent claims/probabilities nor upgrade factual certainty", () => {
  const prepared = buildContextualReviewInput(evidence()), valid = response(prepared);
  assert.equal(parseContextualReviewOutput(valid, prepared, "synthetic-context-v1").facts.length, 2);
  assert.throws(() => parseContextualReviewOutput({ ...valid, probability: 0.99 }, prepared, "synthetic-context-v1"), /Invalid/);
  assert.throws(() => parseContextualReviewOutput({ ...valid, facts: [{ ...valid.facts[0], factId: "invented" }, valid.facts[1]] }, prepared, "synthetic-context-v1"), /Unsupported/);
  assert.throws(() => parseContextualReviewOutput({ ...valid, facts: valid.facts.map((fact) => ({ ...fact, status: "verified" })) }, prepared, "synthetic-context-v1"), /Unsupported/);
  assert.throws(() => parseContextualReviewOutput({ ...valid, facts: [{ ...valid.facts[0], sourceIds: ["invented"] }, valid.facts[1]] }, prepared, "synthetic-context-v1"), /Unsupported/);
  assert.throws(() => parseContextualReviewOutput({ ...valid, facts: [{ ...valid.facts[0], explanation: "New unsupported fact." }, valid.facts[1]] }, prepared, "synthetic-context-v1"), /Invalid/);
});

test("default disabled and deterministic modes never call any transport", async () => {
  const input = evidence();
  assert.equal((await createContextualReviewService({ authority: input.authority }).review({ snapshot: input.snapshot })).status, "disabled");
  const mock = assisted(input, { mode: "facts" });
  const result = await mock.service.review({ snapshot: input.snapshot });
  assert.equal(result.status, "facts-only"); assert.equal(result.assessment.modelVersion, "evidence-extract-v1");
  assert.equal(mock.calls(), 0); assert.equal(mock.reservations(), 0);
});

test("assisted review uses one reserved callback and deduplicates unchanged evidence", async () => {
  const input = evidence(), mock = assisted(input), request = { snapshot: input.snapshot, change, budget, plan: plan(input.snapshot) };
  const [first, joined] = await Promise.all([mock.service.review(request), mock.service.review(request)]);
  assert.equal(first.status, "reviewed"); assert.equal(joined.status, "reviewed");
  assert.equal(mock.calls(), 1); assert.equal(mock.reservations(), 1);
  const cached = await mock.service.review(request);
  assert.equal(cached.status, "reviewed"); assert.equal(cached.dispatched, false); assert.equal(mock.calls(), 1);
  input.authority.verifySource = () => false;
  assert.equal((await mock.service.review(request)).status, "withheld"); assert.equal(mock.calls(), 1);
});

test("budget exhaustion, unjustified review, denied rights and provider errors fail closed", async () => {
  const input = evidence(), request = { snapshot: input.snapshot, change, budget, plan: plan(input.snapshot) };
  const mock = assisted(input);
  assert.equal((await mock.service.review({ ...request, budget: { ...budget, dayRemainingRequests: 0 } })).reason, "budget-exhausted");
  assert.equal((await mock.service.review({ ...request, change: { ...change, contextualReview: false } })).reason, "context-review-not-justified");
  assert.equal(mock.calls(), 0);
  assert.equal((await assisted(input, { verifyTransmission: () => false }).service.review(request)).reason, "context-transmission-unavailable");
  const unavailable = assisted(input, { gateway: { async execute() { return { status: "denied", reason: "budget-exhausted" }; } } });
  assert.equal((await unavailable.service.review(request)).reason, "budget-exhausted"); assert.equal(unavailable.calls(), 0);
  const failed = assisted(input, { gateway: { async execute() { throw new Error("Synthetic outage"); } } });
  assert.equal((await failed.service.review(request)).status, "withheld");
});

test("cutoff and source retention are rechecked before assisted dispatch and cache reuse", async () => {
  const input = evidence(), late = assisted(input, { clock: { now: () => input.snapshot.context.kickoffAt - 300_000 } });
  assert.equal((await late.service.review({ snapshot: input.snapshot, change, budget, plan: plan(input.snapshot) })).status, "withheld");
  assert.equal(late.calls(), 0);
});

test("facts and unconfigured modes reject sources stale or reuse-expired at the current clock", async () => {
  for (const input of [evidence({ maximumAgeMs: 4000 }), evidence({ retainUntil: EVIDENCE_NOW + 1000 })]) {
    for (const mode of ["facts", "assisted"]) {
      const service = createContextualReviewService({ authority: input.authority, mode, clock: { now: () => EVIDENCE_NOW + 2000 } });
      const result = await service.review({ snapshot: input.snapshot });
      assert.equal(result.status, "withheld"); assert.equal(result.assessment, null); assert.equal(result.dispatched, false);
    }
  }
});

test("declared admission maxima must cover the parsed request and job commitment", async () => {
  const input = evidence(), mock = assisted(input), selected = plan(input.snapshot);
  const result = await mock.service.review({ snapshot: input.snapshot, change, budget,
    plan: { ...selected, job: { ...selected.job, costCapUsdPicos: budget.maximumUsdPicos + 1n } } });
  assert.equal(result.reason, "context-plan-exceeds-admitted-budget");
  assert.equal(mock.calls(), 0); assert.equal(mock.reservations(), 0);
  let verifiedBudget;
  const approved = assisted(input, { verifyPlan: (_plan, _prepared, currentBudget) => { verifiedBudget = currentBudget; return true; } });
  assert.equal((await approved.service.review({ snapshot: input.snapshot, change, budget, plan: selected })).status, "reviewed");
  assert.deepEqual(verifiedBudget, budget);
});

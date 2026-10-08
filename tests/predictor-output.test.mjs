import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFingerprint, evidenceSnapshotHash, evidenceSourceId } from "../src/server/evidence/evidence-input.ts";
import { isPredictorOutputCurrent, validatePredictorOutput } from "../src/server/predictor/predictor-output.ts";
import { evidenceAuthority, evidenceContext, evidencePolicy, evidenceSource } from "./helpers/evidence-fixtures.mjs";
import { modelAuthority, modelVersion, predictorHash } from "./helpers/predictor-fixtures.mjs";
import { predictorOutputOptions, predictorRawOutput, predictorSnapshot } from "./helpers/predictor-output-fixtures.mjs";

const reject = (raw, options, reason) => assert.deepEqual(validatePredictorOutput(raw, options), { valid: false, reason });
const accepted = (raw, options) => { const result = validatePredictorOutput(raw, options); assert.equal(result.valid, true, result.reason); return result.output; };
test("valid primary groups use shared regulation rules and retain genuine identities, citations and original clocks", () => {
  const snapshot = predictorSnapshot(), model = modelVersion(), options = predictorOutputOptions(snapshot, model), raw = predictorRawOutput(snapshot, model);
  const output = accepted(JSON.stringify(raw), options);
  assert.deepEqual(output.context, snapshot.context); assert.equal(output.modelVersionId, model.id); assert.equal(output.evidenceHash, snapshot.hash);
  assert.deepEqual(output.evidence, { policyVersion: snapshot.policy.version, coverage: snapshot.coverage, missingness: snapshot.missingness });
  assert.deepEqual(output.evidence.coverage.labels, ["Limited news coverage"]);
  assert.ok(output.evidence.missingness.some((entry) => entry.kind === "injury"));
  assert.equal(Object.isFrozen(output.evidence.coverage.labels), true); assert.equal(Object.isFrozen(output.evidence.missingness), true);
  assert.deepEqual(output.timestamps, options.metadata); assert.equal(output.sources[0].retrievedAt, snapshot.sources[0].retrievedAt);
  assert.equal(output.sources[0].providerUpdatedAt, snapshot.sources[0].providerUpdatedAt);
  assert.equal(output.sources[0].sourceUrl, null); assert.equal(output.sources[0].publisher, snapshot.sources[0].publisher);
  for (const market of Object.values(output.markets.markets)) { assert.equal(market.available, true); assert.equal(market.market.source, "ai"); }
  assert.deepEqual(output.markets.markets["double-chance"].market.probabilities, { "home-or-draw": 0.7, "away-or-draw": 0.6, "home-or-away": 0.7 });
  assert.equal(Object.isFrozen(output), true); assert.equal(Object.isFrozen(output.reasons[0].references), true);
});
test("every canonical fixture, team, model, evidence, cycle, run and schema mismatch rejects all groups", () => {
  const snapshot = predictorSnapshot(), model = modelVersion(), options = predictorOutputOptions(snapshot, model), raw = predictorRawOutput(snapshot, model);
  const changes = { fixtureId: "20000000-0000-4000-8000-000000000001", fixtureVersion: "2", externalFixtureId: 102,
    homeTeamId: raw.awayTeamId, awayTeamId: raw.homeTeamId, homeExternalId: 20, awayExternalId: 10,
    cycleId: "20000000-0000-4000-8000-000000000002", runId: "20000000-0000-4000-8000-000000000003",
    cutoffAt: raw.cutoffAt - 1, modelVersionId: predictorHash("another-model"), evidenceHash: predictorHash("another-evidence"), schemaVersion: "different-schema" };
  for (const [field, value] of Object.entries(changes)) reject({ ...raw, [field]: value }, options, "wrong-identity");
});
test("missing and incomplete families remain independently unavailable without manufactured complements", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model);
  const output = accepted({ ...raw, groups: { "match-result": raw.groups["match-result"], "total-goals": null,
    "both-teams-to-score": { period: "regulation-including-stoppage-time", probabilities: { yes: 0.6 } } } }, options);
  assert.equal(output.markets.markets["match-result"].available, true); assert.equal(output.markets.markets["double-chance"].available, true);
  assert.deepEqual(output.markets.markets["total-goals"], { available: false, reason: "missing-group" });
  assert.deepEqual(output.markets.markets["both-teams-to-score"], { available: false, reason: "incomplete-group" });
});
test("nonfinite, closed-bound, sum, period and line errors reuse shared per-family rejection reasons", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model);
  for (const [probability, reason] of [[NaN, "invalid-probability"], [Infinity, "invalid-probability"], [0, "invalid-probability"], [1, "invalid-probability"], [0.9, "invalid-sum"]]) {
    const groups = structuredClone(raw.groups); groups["both-teams-to-score"].probabilities.yes = probability;
    assert.deepEqual(accepted({ ...raw, groups }, options).markets.markets["both-teams-to-score"], { available: false, reason });
  }
  const groups = structuredClone(raw.groups); groups["total-goals"].line = 3.5; groups["match-result"].period = "including-extra-time";
  const output = accepted({ ...raw, groups }, options);
  assert.equal(output.markets.markets["total-goals"].reason, "unsupported-line"); assert.equal(output.markets.markets["match-result"].reason, "unsupported-period");
});
test("cross-market conflict rejects all jointly inconsistent AI groups under the shared conflict policy", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model), groups = structuredClone(raw.groups);
  groups["match-result"].probabilities = { "home-win": 0.45, draw: 0.1, "away-win": 0.45 };
  groups["total-goals"].probabilities = { "over-2.5": 0.2, "under-2.5": 0.8 };
  groups["both-teams-to-score"].probabilities = { yes: 0.7, no: 0.3 };
  const output = accepted({ ...raw, groups }, options);
  for (const market of Object.values(output.markets.markets)) assert.deepEqual(market, { available: false, reason: "cross-market-conflict" });
});
test("model output cannot label itself fallback, submit odds, verbal confidence or direct double chance", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model), groups = structuredClone(raw.groups);
  groups["match-result"].source = "api-football";
  assert.equal(accepted({ ...raw, groups }, options).markets.markets["match-result"].reason, "invalid-candidate");
  reject({ ...raw, groups: { ...raw.groups, "double-chance": { "home-or-draw": 0.8 } } }, options, "invalid-output");
  reject({ ...raw, confidence: "very certain" }, options, "invalid-output");
  groups["total-goals"] = { period: "regulation-including-stoppage-time", line: 2.5, odds: { over: 2, under: 2 } };
  assert.equal(accepted({ ...raw, groups }, options).markets.markets["total-goals"].reason, "invalid-candidate");
});
test("fabricated source, fact, claim, relationship, duplicate and wrong-team references invalidate the entire response", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model), original = raw.reasons[0].references[0];
  for (const change of [{ sourceId: predictorHash("invented-source") }, { factId: predictorHash("invented-fact") },
    { claimId: predictorHash("invented-claim") }, { subjectTeamId: raw.awayTeamId }]) {
    reject({ ...raw, reasons: [{ ...raw.reasons[0], references: [{ ...original, ...change }] }, raw.reasons[1]] }, options, "invalid-citation");
  }
  reject({ ...raw, reasons: [{ ...raw.reasons[0], references: [original, original] }, raw.reasons[1]] }, options, "invalid-citation");
  reject({ ...raw, reasons: [{ ...raw.reasons[0], references: [] }, raw.reasons[1]] }, options, "invalid-output");
});
test("known IDs do not establish semantic grounding, and promise verifiers cannot approve text", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model);
  for (const verifyExplanation of [() => false, async () => true, () => { throw new Error("private source text"); }])
    reject(raw, { ...options, authority: { ...options.authority, verifyExplanation } }, "unverified-explanation");
  reject(raw, { ...options, authority: { ...options.authority, verifyExplanation: (_item, _snapshot, _model, kind) => kind !== "uncertainty" } }, "unverified-explanation");
});
test("a merged fact cannot pair one genuine source with another source's genuine claim", () => {
  const context = evidenceContext(), first = evidenceSource(context), second = evidenceSource(context, {
    sourceKey: predictorHash("independent-venue-source"), claims: [{ ...first.claims[0], key: "another-extractor-key" }] });
  const snapshot = predictorSnapshot([first, second]), options = predictorOutputOptions(snapshot), raw = predictorRawOutput(snapshot, options.model);
  const fact = snapshot.facts[0], sourceId = first.id, claimId = evidenceFingerprint(second.claims[0]);
  assert.equal(fact.values[0].sourceIds.includes(sourceId), true); assert.equal(fact.values[0].claimIds.includes(claimId), true);
  reject({ ...raw, reasons: [{ ...raw.reasons[0], references: [{ sourceId, factId: fact.id, claimId, subjectTeamId: context.home.teamId }] }, raw.reasons[1]] }, options, "invalid-citation");
});
test("citation and source/fact bounds are enforced independently of the provider schema", () => {
  const snapshot = predictorSnapshot(), model = modelVersion({ bounds: { maxCitationCharacters: 10 } });
  reject(predictorRawOutput(snapshot, model), predictorOutputOptions(snapshot, model), "invalid-citation");
  const context = evidenceContext(), two = predictorSnapshot([evidenceSource(context), evidenceSource(context, { sourceKey: predictorHash("another-observation") })]);
  const constrained = modelVersion({ bounds: { maxSources: 1 } });
  reject(predictorRawOutput(two, constrained), predictorOutputOptions(two, constrained), "invalid-evidence");
});
test("semantic verification cannot release a candidate after source permission is revoked", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model); let permitted = true;
  reject(raw, { ...options, authority: { ...options.authority, evidenceAuthority: evidenceAuthority({ verifyReuse: () => permitted }),
    verifyExplanation() { permitted = false; return true; } } }, "invalid-evidence");
});
test("an uncertainty without citations requires actual missing evidence", () => {
  const context = evidenceContext(), original = evidenceSource(context), claims = [...original.claims];
  for (const [index, team] of [context.home, context.away].entries()) {
    const fixtureId = 99 + index, kickoffAt = context.cutoffAt - 86_400_000;
    const values = { history: { fixtureId, homeExternalId: team.externalId, awayExternalId: 88, kickoffAt,
      homeGoals: 1, awayGoals: 0, regulationVerified: true, period: "regulation-including-stoppage-time" },
    form: { matches: 1, wins: 1, draws: 0, losses: 0, windowStartsAt: kickoffAt, windowEndsAt: kickoffAt, period: "regulation-including-stoppage-time" },
    rest: { lastKickoffAt: kickoffAt, restDays: 1 }, statistic: { metric: "shots", value: 1, fixtureId, teamExternalId: team.externalId },
    injury: { playerExternalId: 10 + index, type: "Synthetic reported injury" }, lineup: { playerExternalId: 20 + index, role: "starting" },
    xg: { value: 1.2, fixtureId, teamExternalId: team.externalId } };
    for (const [kind, value] of Object.entries(values)) claims.push({ kind, subjectTeamId: team.teamId, key: `synthetic-${kind}-${index}`, value,
      summary: "Synthetic confirmed observation.", certainty: "confirmed", asOfAt: context.cutoffAt - 2000 });
  }
  const news = evidenceSource(context, { kind: "news", sourceKey: predictorHash("synthetic-independent-news"), sourceUrl: "https://news.example.com/story",
    publishedAt: context.cutoffAt - 2000, claims: [{ kind: "news", subjectTeamId: null, key: "synthetic-news", value: { claim: "Synthetic confirmed fixture news." },
      summary: "Synthetic confirmed fixture news.", certainty: "confirmed", asOfAt: context.cutoffAt - 2000 }] });
  const snapshot = predictorSnapshot([evidenceSource(context, { claims }), news]), model = modelVersion();
  assert.deepEqual(snapshot.missingness, []);
  reject(predictorRawOutput(snapshot, model), predictorOutputOptions(snapshot, model), "invalid-citation");
});
test("invented links, markup, internal fields and unbounded explanations never escape as public candidates", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model);
  for (const text of ["An invented https://invented.example.com/article", "Read www.invented.example.com", "<script>execute()</script>", "Internal\nreasoning", "`tool_call`"]) {
    reject({ ...raw, reasons: [{ ...raw.reasons[0], text }, raw.reasons[1]] }, options, "invalid-output");
  }
  reject({ ...raw, internalReasoning: "Private reasoning" }, options, "invalid-output");
  reject({ ...raw, reasons: [raw.reasons[0]] }, options, "invalid-output");
  reject({ ...raw, reasons: Array(5).fill(raw.reasons[0]) }, options, "invalid-output");
  reject({ ...raw, reasons: [raw.reasons[0], raw.reasons[0]] }, options, "invalid-output");
  const model = modelVersion({ bounds: { maxReasonCharacters: 10 } });
  reject(predictorRawOutput(options.snapshot, model), predictorOutputOptions(options.snapshot, model), "invalid-output");
});
test("output byte limit applies before JSON parsing and preserves per-family nonfinite object checks", () => {
  const snapshot = predictorSnapshot(), model = modelVersion({ bounds: { maxOutputBytes: 100 } }), options = predictorOutputOptions(snapshot, model);
  reject("{".repeat(101), options, "invalid-output"); reject(predictorRawOutput(snapshot, model), options, "invalid-output");
  reject("{invalid-json}", predictorOutputOptions(), "invalid-output");
});
test("source rights, future evidence and tampered self-hashed facts are rechecked independently of model citations", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model);
  reject(raw, { ...options, authority: { ...options.authority, evidenceAuthority: evidenceAuthority({ verifyReuse: () => false }) } }, "invalid-evidence");
  const snapshot = structuredClone(options.snapshot), source = snapshot.sources[0];
  source.retrievedAt = snapshot.context.cutoffAt + 1; source.id = evidenceFingerprint(Object.fromEntries(Object.entries(source).filter(([key]) => key !== "id")));
  snapshot.facts[0].values[0].sourceIds = [source.id]; snapshot.id = snapshot.hash = evidenceSnapshotHash(snapshot);
  reject(raw, { ...options, snapshot }, "invalid-evidence");
  const forged = structuredClone(options.snapshot); forged.facts[0].values[0].summary = "An invented summary"; forged.id = forged.hash = evidenceSnapshotHash(forged);
  reject(predictorRawOutput(forged, options.model), { ...options, snapshot: forged }, "invalid-evidence");
});
test("insufficient structured evidence is distinct from missing news alone", () => {
  const context = evidenceContext(), snapshot = predictorSnapshot([evidenceSource(context)], evidencePolicy({ minimum: { historyPerTeam: 1 } })), model = modelVersion();
  reject(predictorRawOutput(snapshot, model), predictorOutputOptions(snapshot, model), "insufficient-evidence");
  const sufficient = predictorSnapshot(); assert.equal(sufficient.coverage.limitedNews, true);
  assert.equal(validatePredictorOutput(predictorRawOutput(sufficient, model), predictorOutputOptions(sufficient, model)).valid, true);
});
test("transport clocks remain separate and unknown, future, pre-analysis and stale clocks obey approved policy", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model), original = options.metadata;
  for (const metadata of [{ ...original, generatedAt: options.now + 1 }, { ...original, retrievedAt: options.now + 1 },
    { ...original, providerUpdatedAt: original.retrievedAt + 1 }, { ...original, generatedAt: options.snapshot.context.analysisAt - 1 },
    { ...original, retrievedAt: options.snapshot.context.analysisAt - 1 }]) reject(raw, { ...options, metadata }, "invalid-timing");
  reject(raw, { ...options, now: options.now + 60_001 }, "invalid-timing");
  reject(raw, { ...options, now: options.snapshot.context.kickoffAt }, "invalid-timing");
  const metadata = { ...original, generatedAt: null, providerUpdatedAt: null }, output = accepted(raw, { ...options, metadata });
  assert.deepEqual(output.flags, ["unknown-generation-time", "unknown-provider-update-time"]); assert.deepEqual(output.timestamps, metadata);
  for (const outputTiming of [{ unknownGeneration: "reject" }, { unknownUpdate: "reject" }]) {
    const model = modelVersion({ outputTiming }); reject(predictorRawOutput(options.snapshot, model), predictorOutputOptions(options.snapshot, model, { metadata }), "invalid-timing");
  }
  reject(raw, { ...options, authority: { ...options.authority, verifyTransport: () => false } }, "invalid-timing");
  reject({ ...raw, generatedAt: original.generatedAt }, options, "invalid-output");
});
test("the final temporal check rejects stale postprocessing results without changing original clocks", () => {
  const snapshot = predictorSnapshot(), model = modelVersion({ outputTiming: { maxAgeMs: 1000 } });
  const options = predictorOutputOptions(snapshot, model), output = accepted(predictorRawOutput(snapshot, model), options);
  const generation = output.timestamps.generatedAt;
  assert.equal(isPredictorOutputCurrent(output, model, generation + 1000), true);
  assert.equal(isPredictorOutputCurrent(output, model, generation + 1001), false);
  assert.equal(output.timestamps.generatedAt, generation); assert.deepEqual(output.timestamps, options.metadata);
  assert.equal(isPredictorOutputCurrent(output, modelVersion({ model: "different-model" }), options.now), false);
  assert.equal(isPredictorOutputCurrent({ ...output, timestamps: { ...output.timestamps } }, model, options.now), false);
  assert.equal(isPredictorOutputCurrent({ ...output, timestamps: Object.freeze({ ...output.timestamps, retrievedAt: options.now + 1 }) }, model, options.now), false);
  assert.equal(isPredictorOutputCurrent(output, model, snapshot.context.kickoffAt), false);
});
test("training or evaluation windows extending past evidence cutoff cannot establish a valid primary output", () => {
  const snapshot = predictorSnapshot(), model = modelVersion({ windows: { finalTest: { startsAt: snapshot.context.cutoffAt - 10, endsAt: snapshot.context.cutoffAt + 1 } } });
  reject(predictorRawOutput(snapshot, model), predictorOutputOptions(snapshot, model), "invalid-evidence");
});
test("current model authorization and public-summary rights must survive output validation", () => {
  const options = predictorOutputOptions(), raw = predictorRawOutput(options.snapshot, options.model);
  reject(raw, { ...options, authority: { ...options.authority, modelAuthority: modelAuthority({ verifyModel: () => false }) } }, "not-authorized");
  const snapshot = structuredClone(options.snapshot); snapshot.sources[0].reuse.allowSummary = false;
  snapshot.sources[0].id = evidenceSourceId(snapshot.sources[0]); snapshot.facts[0].values[0].sourceIds = [snapshot.sources[0].id];
  snapshot.id = snapshot.hash = evidenceSnapshotHash(snapshot);
  reject(predictorRawOutput(snapshot, options.model), predictorOutputOptions(snapshot, options.model), "invalid-evidence");
});

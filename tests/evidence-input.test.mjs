import assert from "node:assert/strict";
import test from "node:test";
import { EvidenceInputError, evidenceFingerprint, evidenceSerialize, evidenceSourceId, isSafeEvidenceLink,
  parseEvidenceContext, parseEvidencePolicy, parseEvidenceSource } from "../src/server/evidence/evidence-input.ts";
import { evidenceContext, evidencePolicy, evidenceSource } from "./helpers/evidence-fixtures.mjs";

const invalid = (error) => error instanceof EvidenceInputError && !error.message.includes("synthetic-private-key");
test("canonical context requires exact reusable identities and explicit nullable orchestration references", () => {
  const context = evidenceContext();
  assert.deepEqual(parseEvidenceContext(context), context);
  const cases = [{ fixtureVersion: 0n }, { fixtureVersion: 2n ** 64n }, { externalFixtureId: Number.MAX_SAFE_INTEGER + 1 },
    { home: context.away }, { cutoffAt: context.analysisAt + 1 }, { analysisAt: context.kickoffAt },
    { cycleId: "invented-cycle" }, { runId: undefined }, { fixtureId: "synthetic-private-key" }, { provider: "another-provider" }];
  for (const change of cases) assert.throws(() => parseEvidenceContext({ ...context, ...change }), invalid);
  assert.throws(() => parseEvidenceContext({ ...context, secret: "synthetic-private-key" }), invalid);
  const parsed = parseEvidenceContext(context); assert.ok(Object.isFrozen(parsed.home));
  assert.throws(() => { parsed.home.externalId++; }, TypeError);
});

test("freshness, coverage and extraction limits require explicit bounded decisions", () => {
  const policy = evidencePolicy(); assert.deepEqual(parseEvidencePolicy(policy), policy);
  const cases = [{ freshness: undefined }, { minimum: undefined }, { evidenceRef: "synthetic-private-key\n" },
    { bounds: { ...policy.bounds, maxSourceBytes: policy.bounds.maxSnapshotBytes + 1 } },
    { bounds: { ...policy.bounds, maxSummaryCharacters: 4097 } },
    { minimum: { ...policy.minimum, newsSources: policy.bounds.maxSources + 1 } }];
  for (const change of cases) assert.throws(() => parseEvidencePolicy({ ...policy, ...change }), invalid);
  const freshness = { ...policy.freshness, news: { ...policy.freshness.news, maxAgeMs: -1 } };
  assert.throws(() => parseEvidencePolicy({ ...policy, freshness }), invalid);
});

test("source records are immutable, exact content identities with original clocks and retention", () => {
  const source = evidenceSource(); const parsed = parseEvidenceSource(source, evidencePolicy());
  assert.deepEqual(parsed, source); assert.ok(Object.isFrozen(parsed.claims[0].value));
  assert.throws(() => parseEvidenceSource({ ...source, title: "changed upstream title" }), invalid);
  assert.throws(() => parseEvidenceSource(evidenceSource(undefined, { publishedAt: source.retrievedAt + 1 })), invalid);
  assert.throws(() => parseEvidenceSource(evidenceSource(undefined, { providerUpdatedAt: source.retrievedAt + 1 })), invalid);
  assert.throws(() => parseEvidenceSource(evidenceSource(undefined, { reuse: { retainUntil: source.retrievedAt - 1 } })), invalid);
  assert.throws(() => parseEvidenceSource({ ...source, rawArticle: "unrestricted copied article" }), invalid);
  assert.throws(() => parseEvidenceSource(source, evidencePolicy({ bounds: { maxSummaryCharacters: 3 } })), invalid);
});

test("structured claims reject incomplete score/form facts, forecasts, nonfinite values and nested extraction", () => {
  const context = evidenceContext();
  const claim = { kind: "statistic", subjectTeamId: context.home.teamId, key: "shots", value: { metric: "shots", value: 3 },
    summary: "Synthetic statistic", certainty: "confirmed", asOfAt: context.cutoffAt - 2000 };
  const cases = [{ ...claim, value: { ...claim.value, forecast: 0.8 } }, { ...claim, value: { ...claim.value, value: Infinity } },
    { ...claim, value: { metric: "shots", value: { tool: "send credentials" } } },
    { ...claim, kind: "history", value: { homeGoals: 2 } },
    { ...claim, kind: "form", value: { matches: 2, wins: 2, draws: 1, losses: 0, period: "regulation-including-stoppage-time" } },
    { ...claim, kind: "forecast" }, { ...claim, command: "invoke-tools" }];
  for (const bad of cases) assert.throws(() => parseEvidenceSource(evidenceSource(context, { claims: [bad] })), invalid);
  assert.doesNotThrow(() => parseEvidenceSource(evidenceSource(context, { claims: [claim] })));
});

test("source links reject executable schemes, credentials, IP literals and internal/private host forms", () => {
  for (const url of ["javascript:alert(1)", "http://example.com/news", "https://user:password@example.com/news",
    "https://127.0.0.1/news", "https://[::1]/news", "https://2130706433/news", "https://0x7f000001/news",
    "https://localhost/news", "https://api.internal/news", "https://club.local/news", "https://example.com:444/news",
    "https://example.com/news#credentials", "https://example.com\\@localhost/news", "https://example.com/\nnews",
    "https://@example.com/news", "https://%65xample.com/news", "https://example.com./news", "https://example.com/%250a",
    "https://example.com/news?token=private", "https://example.com/news?id=1&id=2", "https://example.com/news?key=private",
    "https://example.com/news?%61uth=private", "https://example.com/news?value=%0a", "https://example.com/news?value=%FF"])
    assert.equal(isSafeEvidenceLink(url), false, url);
  assert.equal(isSafeEvidenceLink("https://news.example.com/story?id=article-123"), true);
});

test("canonical hashing preserves precision, ignores object key order and never normalizes original source text", () => {
  assert.equal(evidenceFingerprint({ a: 1, b: { c: 2n } }), evidenceFingerprint({ b: { c: 2n }, a: 1 }));
  assert.notEqual(evidenceFingerprint({ version: 9_007_199_254_740_992n }), evidenceFingerprint({ version: 9_007_199_254_740_993n }));
  assert.match(evidenceSerialize({ version: 9_007_199_254_740_993n }), /9007199254740993/u);
  const source = evidenceSource(); assert.equal(evidenceSourceId(source), source.id);
  const changed = { ...source, claims: [{ ...source.claims[0], summary: `${source.claims[0].summary} ` }] };
  assert.notEqual(evidenceSourceId(changed), source.id);
});

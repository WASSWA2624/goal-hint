import assert from "node:assert/strict";
import test from "node:test";
import { marketSelections } from "../src/domain/markets.ts";
import { compareSources } from "../src/server/comparison/source-comparison.ts";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { parseForecastSourceReceipts } from "../src/server/fallback/source-receipts.ts";
import { normalizeFallbackPrediction } from "../src/server/football/api-football-normalize.ts";
import { demoApiFootballResponse, demoFixturesForDate } from "../src/server/demo/api-football.ts";
import { demoForecast, demoId, demoModel } from "../src/server/demo/forecast.ts";
import { DEMO_SOURCE_PAIR_NOTICE, demoSourcePairFromRow, ensureDemoSourcePairs, prepareDemoSourcePair, readDemoSourcePairs } from "../src/server/demo/source-receipts.ts";

const now = Date.parse("2026-10-28T09:00:00+03:00");
const fixture = demoFixturesForDate("2026-10-27", now).find(row => row.fixture.status.short === "FT");
const original = demoForecast(fixture, now);
const revision = { id: original.revisionId, fixtureId: original.fixtureId, cycleId: original.cycleId, jobId: original.jobId,
  modelVersionId: demoModel.id, candidate: original.candidate, requestHash: original.requestHash, evidenceHash: original.snapshot.hash,
  evidenceCutoffAt: original.context.cutoffAt, generationCompletedAt: original.publishedAt - 1000, publishedAt: original.publishedAt };
const capture = prepareDemoSourcePair(revision, now);
const stored = pair => ({ revisionId: pair.revisionId, fixtureId: pair.fixtureId, cycleId: pair.cycleId, jobId: pair.jobId,
  candidateHash: pair.candidateHash, forecastAt: new Date(pair.forecastAt), replayAt: new Date(pair.replayAt), validIntegrity: 1,
  body: evidenceSerialize(pair) });

test("synthetic comparison replay preserves the legacy audit and uses original AI plus normal raw-provider normalization", () => {
  const before = evidenceSerialize(revision), sources = parseForecastSourceReceipts(JSON.parse(capture.sourcesJson));
  assert.equal(capture.kind, "synthetic-comparison-replay"); assert.equal(capture.notice, DEMO_SOURCE_PAIR_NOTICE);
  assert.equal(capture.replayAt, now); assert.equal(capture.replayOrder, "ai-first");
  assert.equal(capture.candidateHash, evidenceFingerprint(revision.candidate));
  assert.equal(JSON.parse(capture.originalAuditJson).providerStatus, "not-requested");
  assert.equal(JSON.parse(capture.originalAuditJson).sourceOrder, undefined);
  assert.equal(revision.candidate.audit.sourceOrder, undefined);
  assert.equal(revision.candidate.audit.providerStatus, "not-requested");
  const raw = demoApiFootballResponse("predictions", { fixture: String(fixture.fixture.id) }, capture.provider.observedAt).response[0];
  const normalized = normalizeFallbackPrediction(raw, { endpoint: "/predictions", retrievedAt: capture.provider.observedAt });
  assert.equal(normalized.valid, true);
  const provider = sources["api-football"].markets.markets["match-result"].market;
  assert.equal(provider.probabilities["home-win"], normalized.data.reportedPercentages.home / 100);
  assert.equal(provider.probabilities.draw, normalized.data.reportedPercentages.draw / 100);
  for (const family of Object.keys(marketSelections)) {
    assert.deepEqual(sources.ai.markets.markets[family].market, revision.candidate.markets[family].market);
    assert.equal(sources["api-football"].markets.markets[family].available, family === "match-result" || family === "double-chance");
  }
  assert.deepEqual(demoSourcePairFromRow(stored(capture), revision), capture);
  assert.ok(Object.isFrozen(capture)); assert.equal(evidenceSerialize(revision), before);
});

test("replay pairs enter normal comparison scoring only for supported API-Football families", () => {
  const record = { fixtureId: revision.fixtureId, cycleId: revision.cycleId, state: "closed", kickoffAt: original.context.kickoffAt,
    locked: { jobId: revision.jobId, forecastAt: revision.generationCompletedAt, sourceOrder: capture.replayOrder,
      published: Object.fromEntries(Object.keys(marketSelections).map(family => [family, "ai"])) },
    settlement: { status: "finished-regulation", cycleEligibility: { eligible: true }, regulationScore: {
      verified: true, period: "regulation-including-stoppage-time", home: fixture.score.fulltime.home, away: fixture.score.fulltime.away } },
    matchLabel: "Synthetic original comparison", href: "/en/matches/demo" };
  const comparison = compareSources([record], new Map([[revision.jobId, parseForecastSourceReceipts(JSON.parse(capture.sourcesJson))]]),
    { families: Object.keys(marketSelections), horizons: null, bands: [0, .5, 1], confidenceZ: 1.96 });
  for (const result of comparison.comparisons) {
    const supported = result.family === "match-result" || result.family === "double-chance";
    assert.equal(result.state, supported ? "available" : "unavailable");
    assert.equal(result.matched.count, supported ? 1 : 0);
    if (!supported) assert.equal(result.reason, "no-provider-counterpart");
  }
});

test("seals, original revision hashes, audit, identities and replay chronology reject mismatches", () => {
  for (const pair of [{ ...capture, candidateHash: "a".repeat(64) }, { ...capture, originalAuditJson: "{}" },
    { ...capture, jobId: "b".repeat(64) }, { ...capture, forecastAt: capture.forecastAt + 1 },
    { ...capture, replayAt: capture.publishedAt - 1 }]) assert.throws(() => demoSourcePairFromRow(stored(pair), revision));
  assert.throws(() => demoSourcePairFromRow({ ...stored(capture), validIntegrity: 0 }, revision));
  assert.throws(() => prepareDemoSourcePair({ ...revision, id: demoId("foreign-revision", 1) }, now));
  assert.throws(() => prepareDemoSourcePair({ ...revision, modelVersionId: "a".repeat(64) }, now));
  const changedEvidence = JSON.parse(capture.sourcesJson);
  changedEvidence.ai.evidence.limitedNews = !changedEvidence.ai.evidence.limitedNews;
  assert.throws(() => demoSourcePairFromRow(stored({ ...capture, sourcesJson: evidenceSerialize(changedEvidence) }), revision));
  const invented = JSON.parse(capture.sourcesJson);
  invented["api-football"].markets.markets["total-goals"] = { available: true,
    market: { ...revision.candidate.markets["total-goals"].market, source: "api-football" } };
  assert.doesNotThrow(() => parseForecastSourceReceipts(invented));
  assert.throws(() => demoSourcePairFromRow(stored({ ...capture, sourcesJson: evidenceSerialize(invented) }), revision), /invented a provider counterpart/u);
});

test("bounded replay reads use only stored sidecars and reject oversized payloads before loading bodies", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_GOAL_HINT_DEMO: process.env.NEXT_PUBLIC_GOAL_HINT_DEMO, DATABASE_URL: process.env.DATABASE_URL };
  Object.assign(process.env, { NODE_ENV: "development", NEXT_PUBLIC_GOAL_HINT_DEMO: "true", DATABASE_URL: "mysql://demo@127.0.0.1/goal_hint_demo_unit" });
  try {
    const calls = [], row = stored(capture), bytes = Buffer.byteLength(row.body);
    const tx = { async $queryRaw(sql) { const text = sql.sql ?? sql.join(" "); calls.push(text);
      if (text.includes("SELECT DATABASE")) return [{ name: "goal_hint_demo_unit" }];
      if (text.includes("SUM(OCTET_LENGTH")) return [{ bytes: BigInt(bytes), total: 1n }];
      return [row];
    } };
    const sources = await readDemoSourcePairs(tx, [revision]);
    assert.equal(sources.size, 1); assert.equal(sources.get(revision.jobId).order, "ai-first");
    assert.equal(calls.length, 3); assert.ok(calls.slice(1).every(text => text.includes("DevelopmentDemoSourcePair")));
    assert.ok(calls.every(text => !/FROM PredictionRefreshStage|FROM PredictionSet/u.test(text)));
    calls.length = 0;
    await assert.rejects(readDemoSourcePairs(tx, [revision], bytes - 1));
    assert.equal(calls.length, 2);
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test("production cannot initialize or read replay artifacts even with public demo enabled", async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let touched = false;
  try {
    await assert.rejects(ensureDemoSourcePairs({ query: async () => { touched = true; } }, ["2026-10-27"], now));
    await assert.rejects(readDemoSourcePairs({ $queryRaw: async () => { touched = true; } }, [revision]));
    assert.equal(touched, false);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

import assert from "node:assert/strict";
import test from "node:test";
import { demoFixtureById, demoFixtureProbabilities } from "../src/server/demo/api-football.ts";
import { demoForecast, demoId } from "../src/server/demo/forecast.ts";
import { parseResolvedForecastCandidate } from "../src/server/fallback/fallback-input.ts";
import { parseEvidenceSnapshot, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { historyJson } from "../src/server/predictions/history-read.ts";
import { parseStoredCycle } from "../src/server/predictions/history-input.ts";
import { getPublicationDeadline } from "../src/domain/calendar.ts";

test("synthetic accepted forecasts preserve evidence identity, timing and complete coherent markets", () => {
  const now = Date.parse("2026-10-28T09:00:00Z");
  for (const id of [900000000, 900058177, 900181559, 900300001, 900333559]) {
    const raw = demoFixtureById(id, now), generated = demoForecast(raw, now), p = demoFixtureProbabilities(id);
    assert.equal(parseEvidenceSnapshot(generated.snapshot).hash, generated.snapshot.hash);
    assert.equal(parseResolvedForecastCandidate(generated.candidate).context.evidenceHash, generated.snapshot.hash);
    assert.deepEqual(parseResolvedForecastCandidate(historyJson(evidenceSerialize(generated.candidate))), generated.candidate,
      "serialized probabilities retain the exact derived market relationships");
    assert.equal(generated.snapshot.context.fixtureId, demoId("fixture", id));
    assert.equal(generated.snapshot.sources.length, 1); assert.ok(generated.snapshot.coverage.sufficient);
    assert.ok(generated.snapshot.facts.length >= 9);
    assert.ok(generated.publishedAt < generated.context.kickoffAt); assert.ok(generated.publishedAt < now);
    assert.ok(Object.values(generated.candidate.markets).every((market) => market.available && market.market.source === "ai" && !market.provenance.provisional));
    assert.equal(generated.candidate.markets["match-result"].market.probabilities["home-win"], Number(p.home.toFixed(6)));
    assert.ok(Math.abs(generated.candidate.markets["double-chance"].market.probabilities["away-or-draw"] - p.away - p.draw) < 0.000002);
    parseStoredCycle({ id: generated.cycleId, fixtureId: generated.fixtureId, creationKey: "1".repeat(64), creationHash: "2".repeat(64),
      ordinal: 1, version: 1, scheduleVersion: 1, kickoffAt: generated.context.kickoffAt,
      cutoffAt: getPublicationDeadline(generated.context.kickoffAt), openedAt: generated.context.analysisAt,
      state: "open", currentSetId: generated.revisionId, lockedSetId: null, closedAt: null, lockedAt: null, voidedAt: null, voidReason: null });
  }
});

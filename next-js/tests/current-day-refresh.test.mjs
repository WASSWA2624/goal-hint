import assert from "node:assert/strict";
import test from "node:test";
import { createCurrentDayContextJob, currentDayContextEnvelope, currentReferenceFreshness, currentReferenceTargets, footballRefreshCadence }
  from "../src/server/football/current-day-refresh.ts";

test("today reuses one task per active context and rotates the bounded sweep", () => {
  const slot = Date.UTC(2026, 10, 20, 6), hour = footballRefreshCadence.currentDay;
  const scopes = [
    { competitionId: 39, season: 2026, coverage: { standings: false, injuries: true }, teamIds: [1, 2] },
    { competitionId: 39, season: 2026, coverage: { standings: false, injuries: true }, teamIds: [2, 3] },
  ];
  const tasks = currentReferenceTargets(scopes, slot);
  assert.equal(tasks.filter(({ endpoint }) => endpoint === "standings").length, 0);
  assert.equal(tasks.filter(({ endpoint }) => endpoint === "injuries").length, 1);
  assert.equal(tasks.filter(({ endpoint }) => endpoint === "teamStatistics").length, 3);
  assert.equal(tasks.filter(({ endpoint, teamId }) => endpoint === "coaches" && teamId === 2).length, 1);
  assert.notDeepEqual(currentReferenceTargets(scopes, slot + hour), tasks);
  assert.equal(currentDayContextEnvelope(slot).idempotencyKey, currentDayContextEnvelope(slot).idempotencyKey);
  assert.notEqual(currentDayContextEnvelope(slot + hour).idempotencyKey, currentDayContextEnvelope(slot).idempotencyKey);
  assert.equal(currentDayContextEnvelope(slot).expiresAt, slot + hour);
  assert.throws(() => currentDayContextEnvelope(slot + 1));
  assert.equal(currentReferenceFreshness("standings"), hour);
  assert.equal(currentReferenceFreshness("teamStatistics"), 12 * hour);
  assert.equal(currentReferenceFreshness("timezones"), undefined);
});

test("successive hour budgets advance across a large set of always-due targets", () => {
  const slot = Date.UTC(2026, 10, 20, 6), hour = footballRefreshCadence.currentDay;
  const scopes = Array.from({ length: 25 }, (_, index) => ({
    competitionId: index + 1, season: 2026, coverage: null, teamIds: [index + 1],
  }));
  const first = currentReferenceTargets(scopes, slot).slice(0, 40).map(target => JSON.stringify(target));
  const second = currentReferenceTargets(scopes, slot + hour).slice(0, 40).map(target => JSON.stringify(target));
  assert.equal(first.filter(target => second.includes(target)).length, 0);
});

test("the coordinator retries when current-day discovery has not produced an authoritative receipt", async () => {
  const reports = [], calls = [];
  const job = createCurrentDayContextJob({ competitionIds: [39], retentionEvidenceRef: "test-ref",
    database: { async query(run) { return run({ footballImport: { async findFirst(query) { calls.push(query); return null; } } }); } },
    reference: { run() { assert.fail("reference refresh must wait for discovery"); } }, onCoverage: report => reports.push(report),
  });
  const slot = Date.UTC(2026, 10, 20, 6);
  assert.deepEqual(await job.handle({ slot }, { checkpoint: async () => {} }),
    { status: "failed", reason: "handler-failed", retryable: true });
  assert.equal(calls[0].where.observedAt.gte.getTime(), slot);
  assert.equal(reports[0].stopped, "awaiting-fixture-discovery");
});

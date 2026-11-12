import assert from "node:assert/strict";
import test from "node:test";
import { createFootballHistoryBackfill, normalizeHistoryCompetition } from "../src/server/football/history-backfill.ts";

test("duplicate league season records share one fixture selector and retain reported coverage", () => {
  const context = { endpoint: "/leagues", retrievedAt: Date.parse("2026-11-12T02:00:00Z") };
  const competition = normalizeHistoryCompetition({ league: { id: 276, name: "League" }, seasons: [
    { year: 2025, coverage: { injuries: false, fixtures: { events: true } } },
    { year: 2025, coverage: { injuries: true, fixtures: { events: false } } },
    { year: 2026 },
  ] }, context);
  assert.deepEqual(competition.seasons.map(({ year }) => year), [2025, 2026]);
  assert.equal(competition.seasons[0].coverage.injuries, true);
  assert.equal(competition.seasons[0].coverage["fixtures.events"], true);
  assert.equal(competition.seasons[0].coverage.odds, null);
});

function harness(failures = [], upcomingSeasons) {
  const receipts = new Map(), requests = [], imported = [];
  const instant = Date.parse("2026-11-12T02:00:00Z");
  let now = instant;
  const run = createFootballHistoryBackfill({
    competitionIds: [11, 7], retentionEvidenceRef: "verified-history-retention",
    upcomingSeasons,
    now: () => now, providerDayEndsAt: () => instant + 24 * 3_600_000,
    async competitions(query, bounds) {
      requests.push({ query, bounds });
      const data = [{ id: 11, seasons: [2025, 2027, 2026] }, { id: 7, seasons: [2024, 2026] }, { id: 21, seasons: [2026] }]
        .filter(({ id }) => query.competitionId === undefined || query.competitionId === id)
        .map(({ id, seasons }) => ({ id, seasons: seasons.map(year => ({ year })) }));
      return { status: "complete", requestsDispatched: 1, data };
    },
    store: { findImport: async id => receipts.get(id) ?? null },
    importer: { async import(request) {
      assert.equal(request.bounds.maxRequests, 1);
      assert.equal(request.bounds.priority, "enrichment");
      assert.equal(request.retentionEvidenceRef, "verified-history-retention");
      assert.equal(request.selection.kind, "fixtures");
      assert.match(request.id, /^[\da-f]{8}-[\da-f]{4}-8[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/u);
      imported.push(request);
      const failure = failures.shift();
      const receipt = { id: request.id, status: failure ? "failed" : "complete", reasons: failure ? [failure] : [],
        recordedAt: now, requestsDispatched: failure ? 0 : 1, importedCount: failure ? 0 : 12, receivedCount: failure ? 0 : 16 };
      receipts.set(request.id, receipt);
      return receipt;
    } },
  });
  return { run, imported, requests, advance: (ms) => { now += ms; } };
}

test("historical batches share a bounded budget, proceed newest first and resume from completed receipts", async () => {
  const h = harness();
  const first = await h.run({ maxRequests: 3 });
  assert.equal(first.status, "partial");
  assert.equal(first.stopped, "request-budget");
  assert.equal(first.requests, 3);
  assert.equal(first.completed, 2);
  assert.deepEqual(h.imported.map(({ selection }) => selection.query), [
    { competitionId: 7, season: 2026 }, { competitionId: 11, season: 2026 },
  ]);
  const second = await h.run({ maxRequests: 3 });
  assert.equal(second.status, "complete");
  assert.equal(second.completed, 4);
  assert.equal(second.imported, 24);
  assert.deepEqual(h.imported.slice(2).map(({ selection }) => selection.query), [
    { competitionId: 11, season: 2025 }, { competitionId: 7, season: 2024 },
  ]);
  const repeat = await h.run({ maxRequests: 3 });
  assert.equal(repeat.requests, 1);
  assert.equal(repeat.processed, 0);
  assert.equal(h.requests[0].bounds.maxRequests, 1);
});

test("upcoming fixtures prioritize their league and include active seasons labelled for a future year", async () => {
  const h = harness([], async () => [{ competitionId: 11, season: 2027, fixtures: 3 }, { competitionId: 7, season: 2026, fixtures: 1 }]);
  await h.run({ maxRequests: 6 });
  assert.deepEqual(h.imported.map(({ selection }) => selection.query), [
    { competitionId: 11, season: 2027 },
    { competitionId: 11, season: 2026 }, { competitionId: 7, season: 2026 },
    { competitionId: 11, season: 2025 }, { competitionId: 7, season: 2024 },
  ]);
});

test("quota refusal pauses the batch, and an incomplete receipt can be retried without rewriting it", async () => {
  const h = harness(["quota-denied"]);
  const blocked = await h.run({ maxRequests: 3, competitionId: 7 });
  assert.equal(blocked.stopped, "quota-denied");
  assert.equal(blocked.requests, 1);
  const beforeRetry = await h.run({ maxRequests: 3, competitionId: 7 });
  assert.equal(beforeRetry.deferred, 1);
  assert.deepEqual(h.imported[1].selection.query, { competitionId: 7, season: 2024 });
  h.advance(15 * 60_000);
  const retried = await h.run({ maxRequests: 3, competitionId: 7 });
  assert.equal(retried.completed, 2);
  assert.deepEqual(h.imported[2].selection.query, h.imported[0].selection.query);
  assert.notEqual(h.imported[2].id, h.imported[0].id);
  await assert.rejects(h.run({ maxRequests: 3, competitionId: 21 }), /approved competition/);
});

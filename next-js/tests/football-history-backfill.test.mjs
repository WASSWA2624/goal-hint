import assert from "node:assert/strict";
import test from "node:test";
import { API_FOOTBALL_CONTRACT_VERSION, apiFootballFixtureRoundParameters } from "../src/server/football/api-football-contract.ts";
import { catalogPersistenceUnavailable, CatalogStoreError } from "../src/server/football/catalog-mysql-store.ts";
import { createFootballCatalogImporter } from "../src/server/football/catalog-service.ts";
import { createFootballHistoryBackfill, normalizeHistoryCompetition } from "../src/server/football/history-backfill.ts";
import { CATALOG_NOW, catalogFixture, catalogRequest, catalogResponse, createSyntheticCatalogAdapter } from "./helpers/catalog-fixtures.mjs";

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

function roundHarness({ reason = "response-too-large", responseParameters, exactProof = () => true } = {}) {
  const scope = { competitionId: 39, season: 2025 };
  const now = Date.parse("2026-11-12T02:00:00Z"), receipts = new Map(), imports = [], observations = [];
  const roundRows = [{ round: "Opening Round", dates: ["2025-08-16"] }, { round: "Play-off", dates: ["2026-05-01"] },
    { round: "Opening Round", dates: ["2025-08-17"] }];
  let archivedRounds = null, roundReads = 0;
  const run = createFootballHistoryBackfill({
    competitionIds: [scope.competitionId], retentionEvidenceRef: "verified-history-retention",
    now: () => now, providerDayEndsAt: () => now + 24 * 3_600_000,
    async competitions() { return { status: "complete", requestsDispatched: 1, data: [{ id: scope.competitionId, seasons: [{ year: scope.season }] }] }; },
    store: { findImport: async (id) => receipts.get(id) ?? null },
    importer: { async import(request) {
      const query = request.selection.query;
      imports.push({ id: request.id, query });
      assert.equal(request.bounds.maxRows, 10_000);
      assert.equal(request.bounds.maxRequests, 1);
      const oversized = query.round === undefined;
      const receipt = { status: oversized ? "partial" : "complete", reasons: oversized ? [reason] : [],
        recordedAt: now, observedAt: now - 100, requestsDispatched: 1, importedCount: oversized ? 0 : 2, receivedCount: oversized ? 5_000 : 3 };
      receipts.set(request.id, receipt);
      return receipt;
    } },
    async hasFixtureSource(parameters, observation) {
      assert.deepEqual(parameters, { league: "39", season: "2025", timezone: "Africa/Kampala", round: parameters.round });
      assert.deepEqual(observation, { retrievedAt: now - 100, rowCount: 3 });
      observations.push({ parameters, observation });
      return exactProof(observations.length);
    },
    rounds: {
      async read() { return archivedRounds; },
      async fetch(query, bounds, workflow) {
        workflow.beforeDispatch();
        roundReads++;
        assert.deepEqual(query, scope);
        assert.equal(bounds.maxRequests, 1);
        return { status: "complete", data: roundRows, error: null, requestsDispatched: 1,
          completeness: { complete: true, invalidRows: 0 }, provenance: [{ provider: "api-football", endpoint: "fixtureRounds",
            requestParameters: responseParameters ?? apiFootballFixtureRoundParameters(query), contractVersion: API_FOOTBALL_CONTRACT_VERSION,
            retrievedAt: now, fromCache: false, currentPage: 1, totalPages: 1, quota: { kind: "success" } }] };
      },
      async save(query, rows, retrievedAt) {
        assert.deepEqual(query, scope);
        assert.equal(retrievedAt, now);
        archivedRounds = rows;
      },
    },
  });
  return { run, imports, observations, roundReads: () => roundReads, archived: () => archivedRounds };
}

test("oversized seasons resume from the same archived round plan without claiming whole-season completeness", async () => {
  const h = roundHarness();
  const first = await h.run({ maxRequests: 3 });
  assert.equal(first.requests, 3);
  assert.equal(first.stopped, "request-budget");
  assert.equal(first.roundsPlanned, 2);
  assert.equal(first.roundsCompleted, 0);
  assert.ok(h.archived());
  const second = await h.run({ maxRequests: 2 });
  assert.equal(second.requests, 2);
  assert.equal(second.roundsCompleted, 1);
  assert.equal(second.partitioned, 0);
  const third = await h.run({ maxRequests: 2 });
  assert.equal(third.requests, 2);
  assert.equal(third.roundsCompleted, 2);
  assert.equal(third.partitioned, 1);
  assert.equal(third.completed, 0);
  assert.equal(third.deferred, 1);
  assert.equal(third.status, "partial");
  assert.deepEqual(h.imports.map(({ query }) => query.round), [undefined, "Play-off", "Opening Round"]);
  assert.equal(new Set(h.imports.map(({ id }) => id)).size, 3);
  const repeat = await h.run({ maxRequests: 2 });
  assert.equal(repeat.requests, 1);
  assert.equal(repeat.roundsCompleted, 2);
  assert.equal(h.roundReads(), 1);
});

test("a successful round import without matching archive proof remains pending", async () => {
  const h = roundHarness({ reason: "pagination-incomplete", exactProof: (attempt) => attempt > 2 });
  const first = await h.run({ maxRequests: 4 });
  assert.equal(first.roundsCompleted, 0);
  const second = await h.run({ maxRequests: 2 });
  assert.equal(second.roundsCompleted, 1);
  assert.equal(second.partitioned, 0);
  assert.deepEqual(h.imports.map(({ query }) => query.round), [undefined, "Play-off", "Play-off"]);
  assert.notEqual(h.imports[1].id, h.imports[2].id);
});

test("incorrect round-plan selector provenance never archives or drives fixture requests", async () => {
  const h = roundHarness({ responseParameters: { league: "39", season: "2024", dates: "true", timezone: "Africa/Kampala" } });
  const result = await h.run({ maxRequests: 6 });
  assert.equal(result.requests, 3);
  assert.equal(result.roundsPlanned, 0);
  assert.equal(result.deferred, 1);
  assert.equal(h.archived(), null);
  assert.equal(h.imports.length, 1);
});

test("a complete raw season with conflicting rows is retained without repeated provider calls", async () => {
  const now = Date.parse("2026-11-12T02:00:00Z"), scope = { competitionId: 915, season: 2025 };
  const receipts = new Map();
  let fetched = 0;
  const run = createFootballHistoryBackfill({
    competitionIds: [scope.competitionId], retentionEvidenceRef: "verified-history-retention",
    now: () => now, providerDayEndsAt: () => now + 24 * 3_600_000,
    async competitions() { return { status: "complete", requestsDispatched: 0, data: [{ id: scope.competitionId, seasons: [{ year: scope.season }] }] }; },
    store: { findImport: async (id) => receipts.get(id) ?? null },
    importer: { async import(request) {
      fetched++;
      const receipt = { status: "partial", reasons: ["invalid-rows", "retrieval-incomplete", "schema-error"], observedAt: now - 100,
        recordedAt: now, receivedCount: 134, requestsDispatched: 1, importedCount: 0 };
      receipts.set(request.id, receipt);
      return receipt;
    } },
    async hasExactFixtureScope(parameters, observation) {
      assert.deepEqual(parameters, { league: "915", season: "2025", timezone: "Africa/Kampala" });
      assert.deepEqual(observation, { retrievedAt: now - 100, rowCount: 134 });
      return true;
    },
  });
  const first = await run({ maxRequests: 2 });
  assert.equal(first.archivedOnly, 1);
  assert.equal(first.completed, 0);
  assert.equal(first.deferred, 1);
  const resumed = await run({ maxRequests: 2 });
  assert.equal(resumed.archivedOnly, 1);
  assert.equal(resumed.requests, 0);
  assert.equal(fetched, 1);
});

function persistenceHarness({ archiveProof = true, durableDeferral = true, loseCommitResponse = false } = {}) {
  const receipts = new Map(), proofCalls = [], deferredWrites = [];
  const round = "Club Friendlies 3";
  const authority = { authorize() {}, verifyRetention: () => true, verifyObservation: () => true,
    verifyLogo: () => true, verifyRegulationScore: () => true };
  const { adapter, network } = createSyntheticCatalogAdapter({ respond(url) {
    const competitionId = Number(url.searchParams.get("league")), season = Number(url.searchParams.get("season"));
    if (competitionId === 667 && !url.searchParams.has("round")) {
      return catalogResponse(url, [], { paging: { current: 1, total: 2 } });
    }
    const fixture = catalogFixture(competitionId, { competitionId, season });
    if (competitionId === 667) fixture.league.round = round;
    return catalogResponse(url, [fixture]);
  } });
  function save(batch, deferred = false) {
    const receipt = { id: batch.request.id, fingerprint: batch.fingerprint, requestFingerprint: batch.requestFingerprint,
      status: deferred ? "partial" : batch.status, observedAt: batch.observedAt, recordedAt: CATALOG_NOW,
      receivedCount: batch.rows.fixtures.length + batch.invalidRows, importedCount: deferred ? 0 : batch.rows.fixtures.length,
      requestsDispatched: batch.requestsDispatched, reasons: deferred ? [...batch.reasons, catalogPersistenceUnavailable] : batch.reasons };
    receipts.set(batch.request.id, receipt);
    return receipt;
  }
  const store = {
    async findImport(id) { return receipts.get(id) ?? null; },
    async importBatch(batch) {
      if (batch.selection.query.round !== round) return save(batch);
      assert.equal(batch.status, "complete");
      if (loseCommitResponse) save(batch);
      throw new CatalogStoreError("unavailable");
    },
    async deferImport(batch) {
      deferredWrites.push(batch);
      if (!durableDeferral) throw new CatalogStoreError("unavailable");
      return save(batch, true);
    },
  };
  const now = () => CATALOG_NOW;
  const importer = createFootballCatalogImporter({ adapter, store, authority, clock: { now } });
  const run = createFootballHistoryBackfill({
    competitionIds: [667, 999], retentionEvidenceRef: "verified-history-retention", now,
    providerDayEndsAt: () => CATALOG_NOW + 24 * 3_600_000,
    async competitions() { return { status: "complete", requestsDispatched: 1,
      data: [{ id: 667, seasons: [{ year: 2026 }] }, { id: 999, seasons: [{ year: 2025 }] }] }; },
    store, importer, hasFixtureSource: async () => true,
    async hasExactFixtureScope(parameters, observation) {
      proofCalls.push({ parameters, observation });
      return archiveProof;
    },
    rounds: { async read() { return [{ round, dates: ["2026-04-18"] }]; },
      async fetch() { throw new Error("The round catalog is already archived."); },
      async save() { throw new Error("The round catalog is already archived."); } },
  });
  return { run, importer, network, deferredWrites, proofCalls, receipts, round };
}

test("a saved oversized round with unavailable canonical storage is deferred and later seasons continue", async () => {
  const h = persistenceHarness(), events = [];
  const first = await h.run({ maxRequests: 4 }, event => events.push(event));
  assert.equal(first.requests, 4);
  assert.equal(first.processed, 3);
  assert.equal(first.completed, 1);
  assert.equal(first.roundsCompleted, 0);
  assert.equal(first.roundsArchivedOnly, 1);
  assert.equal(first.roundsPersistenceDeferred, 1);
  assert.equal(first.partitioned, 0);
  assert.deepEqual(events[1], { competitionId: 667, season: 2026, round: h.round, status: "deferred", received: 1,
    imported: 0, requests: 1, reasons: [catalogPersistenceUnavailable] });
  assert.equal(events[2].competitionId, 999);
  assert.equal(h.deferredWrites.length, 1);
  const [batch] = h.deferredWrites, receipt = h.receipts.get(batch.request.id);
  assert.equal(receipt.fingerprint, batch.fingerprint);
  assert.equal(receipt.requestFingerprint, batch.requestFingerprint);
  assert.equal(receipt.observedAt, CATALOG_NOW);
  assert.deepEqual(h.proofCalls[0], { parameters: { league: "667", season: "2026", timezone: "Africa/Kampala", round: h.round },
    observation: { retrievedAt: CATALOG_NOW, rowCount: 1 } });
  const resumed = await h.run({ maxRequests: 4 });
  assert.equal(resumed.requests, 1);
  assert.equal(resumed.completed, 1);
  assert.equal(resumed.roundsArchivedOnly, 1);
  assert.equal(resumed.roundsPersistenceDeferred, 1);
  assert.equal(h.network.length, 3);
});

test("an ambiguous canonical commit is recovered without a deferred receipt or second provider dispatch", async () => {
  const h = persistenceHarness({ loseCommitResponse: true });
  const request = catalogRequest({ kind: "fixtures", query: { competitionId: 667, season: 2026, round: h.round } });
  const receipt = await h.importer.import(request, async () => { throw new Error("Existing commit must be read first."); });
  assert.equal(receipt.status, "complete");
  assert.equal(receipt.requestsDispatched, 1);
  assert.equal(receipt.importedCount, 1);
  assert.equal(h.deferredWrites.length, 0);
  assert.equal(h.network.length, 1);
});

test("unproven raw coverage and unavailable deferral storage leave honest scope outcomes", async () => {
  for (const archiveProof of [false, true]) {
    const h = persistenceHarness({ archiveProof, durableDeferral: false });
    const result = await h.run({ maxRequests: 4 });
    assert.equal(result.requests, 4);
    assert.equal(result.completed, 1);
    assert.equal(result.roundsCompleted, 0);
    assert.equal(result.roundsArchivedOnly, archiveProof ? 1 : 0);
    assert.equal(result.roundsPersistenceDeferred, 1);
    assert.equal(h.deferredWrites.length, archiveProof ? 1 : 0);
    assert.equal(h.receipts.size, 2);
  }
});

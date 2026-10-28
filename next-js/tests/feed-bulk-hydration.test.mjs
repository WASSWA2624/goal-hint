import assert from "node:assert/strict";
import test from "node:test";
import { getPublicationDeadline } from "../src/domain/calendar.ts";
import { marketSelections } from "../src/domain/markets.ts";
import { demoFixturesForDate } from "../src/server/demo/api-football.ts";
import { demoForecast, demoHash, demoId } from "../src/server/demo/forecast.ts";
import { evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { storedFeedFixture, storedFeedFixtures } from "../src/server/matches/fixture-read.ts";

const asOf = Date.parse("2026-10-28T09:00:00Z"), window = { startInclusive: asOf - 86_400_000, endExclusive: asOf + 7 * 86_400_000 };

function source() {
  const fixtures = [], cycles = [], schedules = [], sets = [], markets = [], reads = [];
  for (const raw of demoFixturesForDate("2026-11-01", asOf).slice(0, 3)) {
    const forecast = demoForecast(raw, asOf), { candidate, context, fixtureId, cycleId, revisionId } = forecast;
    const date = value => value === null ? null : new Date(value);
    const team = value => ({ id: demoId("team", value.id), name: value.name, code: null, logoUrl: null });
    fixtures.push({ id: fixtureId, activeCycleId: cycleId, dataVersion: 1n, kickoff: new Date(context.kickoffAt),
      status: "scheduled", regulationHome: null, regulationAway: null, regulationVerifiedAt: null, regulationEvidenceRef: null,
      resultState: null, lifecycleState: null, retrievedAt: new Date(asOf), homeTeam: team(raw.teams.home), awayTeam: team(raw.teams.away),
      season: { competition: { id: demoId("competition", raw.league.id), name: raw.league.name, country: raw.league.country,
        logoUrl: null, countryFlagUrl: null } } });
    cycles.push({ id: cycleId, fixtureId, creationKey: demoHash(`creation:${fixtureId}`), creationHash: demoHash(`hash:${fixtureId}`),
      ordinal: 1, version: 1, scheduleVersion: 1, kickoffAt: new Date(context.kickoffAt), cutoffAt: new Date(getPublicationDeadline(context.kickoffAt)),
      openedAt: new Date(context.analysisAt), state: "open", currentSetId: revisionId, lockedSetId: null, closedAt: null,
      lockedAt: null, voidedAt: null, voidReason: null });
    schedules.push({ cycleId, fixtureId, version: 1, kickoffAt: cycles.at(-1).kickoffAt, cutoffAt: cycles.at(-1).cutoffAt });
    sets.push({ id: revisionId, fixtureId, fixtureVersion: 1n, cycleId, runId: context.runId, runSequence: 20261101n,
      jobId: forecast.jobId, fixtureRevision: 1, cycleRevision: 1, predecessorId: null, scheduleVersion: 1,
      modelVersionId: candidate.context.pin.modelVersionId, evidenceSnapshotId: forecast.requestId, evidenceHash: forecast.snapshot.hash,
      evidenceCutoffAt: new Date(context.cutoffAt), generationCompletedAt: new Date(forecast.publishedAt - 1000),
      publishedAt: new Date(forecast.publishedAt), recordedAt: new Date(forecast.publishedAt), ruleVersion: candidate.markets["match-result"].market.ruleVersion,
      requestHash: forecast.requestHash, candidateJson: evidenceSerialize(candidate), validIntegrity: 1n });
    for (const [family, item] of Object.entries(candidate.markets)) {
      const probabilities = item.available ? marketSelections[family].map(selection => item.market.probabilities[selection]) : [];
      markets.push({ setId: revisionId, family, available: item.available, source: item.available ? item.market.source : null,
        selection: item.available ? item.market.selection : null, selectedProbability: item.available ? item.market.selectedProbability : null,
        probability1: probabilities[0] ?? null, probability2: probabilities[1] ?? null, probability3: probabilities[2] ?? null,
        unavailableReason: item.available ? null : item.reason, generatedAt: item.available ? date(item.timestamps.generatedAt) : null,
        retrievedAt: item.available ? date(item.timestamps.retrievedAt) : null, providerUpdatedAt: item.available ? date(item.timestamps.providerUpdatedAt) : null,
        payloadJson: evidenceSerialize(item), validIntegrity: 1n });
    }
  }
  const tx = {
    footballFixture: { findMany: async () => fixtures, findUniqueOrThrow: async ({ where }) => fixtures.find(fixture => fixture.id === where.id) },
    predictionCycle: { findMany: async ({ where }) => cycles.filter(cycle => !where.fixtureId || cycle.fixtureId === where.fixtureId),
      findUnique: async ({ where }) => cycles.find(cycle => cycle.id === where.id) },
    predictionSchedule: { findMany: async () => schedules, findUnique: async ({ where }) => schedules.find(schedule =>
      schedule.cycleId === where.cycleId_version.cycleId && schedule.version === where.cycleId_version.version) },
    fixtureLifecycleState: { findUnique: async () => null }, fixtureResultState: { findUnique: async () => null },
    marketSettlement: { findMany: async () => [] },
    predictionRefreshResult: { findFirst: async () => null }, runFixture: { findFirst: async () => null },
    async $queryRaw(query, ...parameters) {
      const sql = query.sql ?? query.join(" "), values = Array.isArray(query) ? parameters : query.values;
      reads.push(sql);
      if (sql.includes("FROM PredictionSet")) return sets.filter(row => values.includes(row.id));
      if (sql.includes("FROM MarketPrediction")) return markets.filter(row => values.includes(row.setId));
      if (sql.includes("FROM FixtureOddsPrice")) return [];
      if (sql.includes("FROM MarketSettlement") || sql.includes("FROM PredictionCycle c")) return [];
      throw new Error("Unexpected bulk fixture query");
    },
  };
  return { tx, fixtures, cycles, schedules, sets, markets, reads };
}

test("bulk open-cycle hydration matches ordinary feed projections using the same archive validators", async () => {
  const expected = source(), actual = source(), ids = actual.fixtures.map(fixture => fixture.id).reverse();
  const ordinary = await Promise.all(ids.map(id => storedFeedFixture(expected.tx, id, false, window, "en", { prices: true })));
  const batch = await storedFeedFixtures(actual.tx, ids, false, window, "en", { prices: true });
  assert.deepEqual(batch, ordinary);
  assert.equal(expected.reads.filter(sql => sql.includes("FROM PredictionSet")).length, 3);
  assert.equal(actual.reads.filter(sql => sql.includes("FROM PredictionSet")).length, 1);
  assert.equal(actual.reads.filter(sql => sql.includes("FROM MarketPrediction")).length, 1);
  assert.deepEqual(batch.map(record => record.fixtureId), ids, "the decision cohort retains its selected order");
});

test("bulk locked-cycle hydration preserves audited outcomes without per-fixture archive queries", async () => {
  const expected = source(), actual = source();
  for (const state of [expected, actual]) for (const cycle of state.cycles) {
    cycle.state = "closed";
    cycle.closedAt = cycle.cutoffAt;
    cycle.lockedAt = cycle.cutoffAt;
    cycle.lockedSetId = cycle.currentSetId;
  }
  const ids = actual.fixtures.map(fixture => fixture.id);
  const ordinary = await Promise.all(ids.map(id => storedFeedFixture(expected.tx, id, false, window, "en", { prices: true })));
  const batch = await storedFeedFixtures(actual.tx, ids, false, window, "en", { prices: true });
  assert.deepEqual(batch, ordinary);
  assert.ok(batch.every(record => record.cycle.mode === "locked" && record.update.prediction === "locked"));
  assert.equal(actual.reads.filter(sql => sql.includes("FROM PredictionSet")).length, 1);
  assert.equal(actual.reads.filter(sql => sql.includes("FROM MarketPrediction")).length, 1);
  assert.equal(actual.reads.filter(sql => sql.includes("FROM MarketSettlement")).length, 1);
  assert.equal(actual.reads.filter(sql => sql.includes("FROM FixtureOddsPrice")).length, 1);
});

test("bulk hydration rejects broken seals, incomplete markets, schedule mismatches and foreign fixture bindings", async () => {
  const corruptions = [state => { state.sets[0].validIntegrity = 0n; }, state => { state.markets.pop(); },
    state => { state.markets[0].selectedProbability = 0.99; }, state => { state.schedules[0].version = 2; },
    state => { state.cycles[0].fixtureId = state.fixtures[1].id; }, state => { state.fixtures.pop(); }];
  for (const corrupt of corruptions) {
    const state = source(), ids = state.fixtures.map(fixture => fixture.id);
    corrupt(state);
    await assert.rejects(storedFeedFixtures(state.tx, ids, false, window, "en", { prices: true }), error => error.name === "PredictionHistoryError");
  }
});

test("bulk hydration rejects duplicate or oversized requests before database reads", async () => {
  const database = { footballFixture: { findMany: () => { throw new Error("Unexpected database read"); } } };
  await assert.rejects(storedFeedFixtures(database, ["same", "same"], false, window, "en"), error => error.name === "PredictionHistoryError");
  await assert.rejects(storedFeedFixtures(database, Array.from({ length: 101 }, (_, index) => String(index)), false, window, "en"), error => error.name === "PredictionHistoryError");
  assert.deepEqual(await storedFeedFixtures(database, [], false, window, "en"), []);
});

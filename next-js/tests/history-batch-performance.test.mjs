import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { cycleFromRows, revisionFromRows, storedCycles, storedRevisions } from '../src/server/predictions/history-read.ts';
import { createMatchDetailService } from '../src/server/matches/detail-service.ts';
import { slipForecastFixture } from './helpers/slip-forecast-fixtures.mjs';

function transaction(fixtures) {
  const calls = { revisions: 0, markets: 0, cycles: 0, schedules: 0 };
  const tx = {
    async $queryRaw(query) {
      const ids = new Set(query.values);
      assert.ok(ids.size <= 100, 'each SQL read remains bounded');
      assert.match(query.sql, /integrity\s*=\s*SHA2/u, 'the database seal is checked before parsing');
      if (query.sql.includes('FROM PredictionSet')) {
        calls.revisions++;
        return fixtures.filter((entry) => ids.has(entry.row.id)).map((entry) => entry.row).reverse();
      }
      assert.match(query.sql, /FROM MarketPrediction/u);
      calls.markets++;
      return fixtures.flatMap((entry) => ids.has(entry.row.id) ? entry.marketRows : []).reverse();
    },
    predictionCycle: { async findMany({ where }) {
      calls.cycles++; assert.ok(where.id.in.length <= 100);
      return fixtures.filter((entry) => where.id.in.includes(entry.cycle.id)).map((entry) => entry.cycle).reverse();
    } },
    predictionSchedule: { async findMany({ where }) {
      calls.schedules++; assert.ok(where.OR.length <= 100);
      return fixtures.filter((entry) => where.OR.some((item) => item.cycleId === entry.schedule.cycleId && item.version === entry.schedule.version))
        .map((entry) => entry.schedule).reverse();
    } },
  };
  return { tx, calls };
}

test('ten history entries use four archive reads with the exact single-entry validation and content', async () => {
  const fixtures = Array.from({ length: 10 }, () => slipForecastFixture()), { tx, calls } = transaction(fixtures);
  const revisions = await storedRevisions(tx, fixtures.map((entry) => entry.row.id));
  const cycles = await storedCycles(tx, fixtures.map((entry) => entry.cycle.id));
  for (const entry of fixtures) {
    assert.deepEqual(revisions.get(entry.row.id), revisionFromRows(entry.row, entry.marketRows));
    assert.deepEqual(cycles.get(entry.cycle.id), cycleFromRows(entry.cycle, entry.schedule));
    assert.ok(Object.isFrozen(revisions.get(entry.row.id).candidate));
  }
  assert.deepEqual(calls, { revisions: 1, markets: 1, cycles: 1, schedules: 1 }, 'previously 40 serial reads for ten distinct revisions/cycles');
});

test('empty and repeated history IDs cause no redundant reads and missing IDs remain absent', async () => {
  const entry = slipForecastFixture(), { tx, calls } = transaction([entry]);
  assert.equal((await storedRevisions(tx, [])).size, 0);
  assert.equal((await storedCycles(tx, [])).size, 0);
  assert.deepEqual(calls, { revisions: 0, markets: 0, cycles: 0, schedules: 0 });
  const missing = randomUUID();
  const revisions = await storedRevisions(tx, [entry.row.id, missing, entry.row.id]);
  const cycles = await storedCycles(tx, [entry.cycle.id, missing, entry.cycle.id]);
  assert.equal(revisions.size, 1); assert.equal(cycles.size, 1);
  assert.equal(revisions.has(missing), false); assert.equal(cycles.has(missing), false);
  assert.deepEqual(calls, { revisions: 1, markets: 1, cycles: 1, schedules: 1 });
});

test('larger archive requests are deduplicated and split into bounded batches', async () => {
  const fixtures = Array.from({ length: 101 }, () => slipForecastFixture()), { tx, calls } = transaction(fixtures);
  const revisions = await storedRevisions(tx, [...fixtures.map((entry) => entry.row.id), fixtures[0].row.id]);
  const cycles = await storedCycles(tx, [...fixtures.map((entry) => entry.cycle.id), fixtures[0].cycle.id]);
  assert.equal(revisions.size, 101); assert.equal(cycles.size, 101);
  assert.deepEqual(calls, { revisions: 2, markets: 2, cycles: 2, schedules: 2 });
});

test('detail history preserves requested order while batching hydration and honoring supplied anchors', async () => {
  const fixtureId = randomUUID(), fixtures = Array.from({ length: 10 }, () => slipForecastFixture({ fixtureId }));
  for (const [index, entry] of fixtures.entries()) { entry.row.fixtureRevision = index + 1; entry.cycle.ordinal = index + 1; }
  const { tx, calls } = transaction(fixtures), ordered = [...fixtures].reverse(), at = fixtures[0].at;
  const fixture = { ...fixtures[0].fixture, activeCycleId: null, dataVersion: 1n, retrievedAt: new Date(at),
    homeTeam: { id: fixtures[0].fixture.homeTeamId, name: 'Home', code: 'HOM', logoUrl: null },
    awayTeam: { id: fixtures[0].fixture.awayTeamId, name: 'Away', code: 'AWY', logoUrl: null },
    season: { competition: { id: 'league-1', name: 'League', country: 'England', countryFlagUrl: null, logoUrl: null } } };
  tx.footballFixture = { findUnique: async () => fixture, findUniqueOrThrow: async () => fixture };
  tx.footballImport = { findMany: async () => [] };
  tx.dailyRunImport = { findMany: async () => [] };
  tx.dailyRun = { findUnique: async () => null, findMany: async () => fixtures.map((entry) => ({ id: entry.row.runId,
    eatDate: new Date('2026-10-09T00:00:00Z'), sequence: 20261009n, createdAt: new Date(at) })) };
  tx.predictionSet = { findFirst: async () => { throw new Error('An anchored read queried the latest revision.'); },
    findMany: async () => ordered.map((entry) => ({ id: entry.row.id })) };
  const readCycles = tx.predictionCycle.findMany;
  tx.predictionCycle.findFirst = async () => { throw new Error('An anchored read queried the latest cycle.'); };
  tx.predictionCycle.findMany = async (query) => query.where.id ? readCycles(query) : ordered.map((entry) => ({ id: entry.cycle.id }));
  const service = createMatchDetailService({ database: { transaction: async (read) => read(tx) }, clock: { now: () => at }, providerOdds: false, allowLiveMatch: false });
  const result = await service.query(fixtureId, new URLSearchParams('revisionAnchor=10&cycleAnchor=10'));
  assert.deepEqual(result.history.revisions.entries.map((entry) => entry.revisionId), ordered.map((entry) => entry.row.id));
  assert.deepEqual(result.history.cycles.entries.map((entry) => entry.id), ordered.map((entry) => entry.cycle.id));
  assert.equal(result.history.revisions.anchor, 10); assert.equal(result.history.cycles.anchor, 10);
  assert.equal(result.history.revisions.next, null); assert.equal(result.history.cycles.next, null);
  assert.deepEqual(calls, { revisions: 1, markets: 1, cycles: 1, schedules: 1 });
});

for (const [name, mutate] of [
  ['revision seal', (entry) => { entry.row.validIntegrity = 0; }],
  ['market seal', (entry) => { entry.marketRows[0].validIntegrity = 0; }],
  ['missing market', (entry) => { entry.marketRows.pop(); }],
  ['foreign market', (entry) => { entry.marketRows[0].setId = randomUUID(); }],
]) {
  test(`batched revision hydration refuses a corrupt ${name}`, async () => {
    const fixtures = [slipForecastFixture(), slipForecastFixture()]; mutate(fixtures[1]);
    await assert.rejects(storedRevisions(transaction(fixtures).tx, fixtures.map((entry) => entry.row.id)),
      (error) => error.reason === 'invalid-state');
  });
}

for (const [name, mutate] of [
  ['missing schedule', (entry) => { entry.schedule.version = 2; }],
  ['foreign schedule', (entry) => { entry.schedule.fixtureId = randomUUID(); }],
  ['altered schedule', (entry) => { entry.schedule.kickoffAt = new Date(+entry.schedule.kickoffAt + 1000); }],
]) {
  test(`batched cycle hydration refuses a corrupt ${name}`, async () => {
    const fixtures = [slipForecastFixture(), slipForecastFixture()]; mutate(fixtures[1]);
    await assert.rejects(storedCycles(transaction(fixtures).tx, fixtures.map((entry) => entry.cycle.id)),
      (error) => error.reason === 'invalid-state');
  });
}

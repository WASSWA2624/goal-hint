import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { cycleFromRows, revisionFromRows, storedCycle, storedRevision } from "../src/server/predictions/history-read.ts";
import { createSettlementProjectionReader, projectSettlementCycle, storedSettlementProjection, storedSettlementRevision } from "../src/server/settlement/settlement-read.ts";
import { publicDetailSnapshot } from "../src/server/matches/detail-read.ts";
import { storedFeedFixture } from "../src/server/matches/fixture-read.ts";
import { slipForecastFixture } from "./helpers/slip-forecast-fixtures.mjs";

function cohort(count) {
  const fixtureId = randomUUID(), entries = Array.from({ length: count }, (_, index) => {
    const entry = slipForecastFixture({ fixtureId });
    Object.assign(entry.cycle, { ordinal: index + 1, state: "closed", lockedSetId: entry.row.id,
      closedAt: entry.cycle.cutoffAt, lockedAt: entry.cycle.cutoffAt });
    const cycle = cycleFromRows(entry.cycle, entry.schedule), lock = revisionFromRows(entry.row, entry.marketRows);
    const projection = projectSettlementCycle(entry.fixture, null, null, cycle, lock, new Map());
    entry.settlements = projection.markets.map(({ base, inputHash }) => {
      const value = { ...base, inputHash, id: evidenceFingerprint({ cycle: cycle.id, family: base.family }),
        batchId: evidenceFingerprint({ cycle: cycle.id }), previousId: null, at: +entry.cycle.cutoffAt,
        kind: "initial", correctedAt: null };
      return { ...value, at: new Date(value.at), body: evidenceSerialize(value), validIntegrity: 1 };
    });
    return entry;
  });
  return { fixtureId, entries, fixture: entries[0]?.fixture ?? slipForecastFixture({ fixtureId }).fixture };
}

function transaction(source) {
  let reads = 0;
  const entries = source.entries, settlements = entries.flatMap(entry => entry.settlements), batches = [];
  const read = value => { reads++; return value; };
  const tx = {
    footballFixture: { findUniqueOrThrow: async () => read(source.fixture) },
    fixtureLifecycleState: { findUnique: async () => read(null) },
    fixtureResultState: { findUnique: async () => read(null) },
    predictionCycle: {
      findUnique: async ({ where }) => read(entries.find(entry => entry.cycle.id === where.id)?.cycle ?? null),
      findMany: async ({ where, select }) => {
        if (select) return read(entries.filter(entry => !where.id || entry.cycle.id === where.id).map(entry => ({ id: entry.cycle.id })));
        assert.ok(where.id.in.length <= 100);
        return read(entries.filter(entry => where.id.in.includes(entry.cycle.id)).map(entry => entry.cycle).reverse());
      },
    },
    predictionSchedule: {
      findUnique: async ({ where }) => read(entries.find(entry => entry.schedule.cycleId === where.cycleId_version.cycleId)?.schedule ?? null),
      findMany: async ({ where }) => read(entries.filter(entry => where.OR.some(value => value.cycleId === entry.schedule.cycleId
        && value.version === entry.schedule.version)).map(entry => entry.schedule).reverse()),
    },
    marketSettlement: { findMany: async ({ where }) => read(entries.filter(entry => typeof where.cycleId === "string"
      ? entry.cycle.id === where.cycleId : where.cycleId.in.includes(entry.cycle.id)).flatMap(entry => entry.settlements.map(row =>
      ({ cycleId: entry.cycle.id, family: row.family, revisionId: row.id })))) },
    async $queryRaw(query, ...parameters) {
      const text = query.sql ?? query.join("?"), ids = new Set(Array.isArray(query) ? parameters : query.values);
      assert.match(text, /integrity\s*=\s*SHA2/u);
      assert.ok(ids.size <= 100);
      batches.push(ids.size);
      if (text.includes("FROM PredictionSet")) return read(entries.filter(entry => ids.has(entry.row.id)).map(entry => entry.row).reverse());
      if (text.includes("FROM MarketPrediction")) return read(entries.flatMap(entry => ids.has(entry.row.id) ? entry.marketRows : []).reverse());
      assert.match(text, /FROM MarketSettlementRevision/u);
      return read(settlements.filter(row => ids.has(row.id)).reverse());
    },
  };
  return { tx, batches, get reads() { return reads; } };
}

// Preserve the former serial read path as an independent before/after oracle.
async function serialProjection(tx, fixtureId) {
  const fixture = await tx.footballFixture.findUniqueOrThrow({ where: { id: fixtureId } });
  const cursor = await tx.fixtureLifecycleState.findUnique({ where: { fixtureId } });
  await tx.fixtureResultState.findUnique({ where: { fixtureId } });
  const rows = await tx.predictionCycle.findMany({ where: { fixtureId }, orderBy: { ordinal: "asc" }, select: { id: true } });
  const cycles = [];
  for (const row of rows) {
    const cycle = await storedCycle(tx, row.id), lock = await storedRevision(tx, cycle.lockedSetId);
    const previous = new Map();
    for (const pointer of await tx.marketSettlement.findMany({ where: { cycleId: cycle.id } })) {
      previous.set(pointer.family, await storedSettlementRevision(tx, pointer.revisionId));
    }
    cycles.push(projectSettlementCycle(fixture, null, cursor?.issue ?? null, cycle, lock, previous));
  }
  return { fixture, result: null, cycles };
}

for (const [count, expectedReads] of [[1, 10], [10, 10], [101, 19]]) {
  test(`${count} settled cycles preserve the serial projection with bounded batch reads`, async () => {
    const source = cohort(count), before = transaction(source), after = transaction(source);
    const expected = await serialProjection(before.tx, source.fixtureId);
    assert.deepEqual(await storedSettlementProjection(after.tx, source.fixtureId), expected);
    assert.equal(before.reads, 4 + 9 * count);
    assert.equal(after.reads, expectedReads);
    assert.ok(after.batches.every(size => size <= 100));
  });
}

test("empty and selected-cycle reads preserve cohort membership and do not hydrate unrelated cycles", async () => {
  const empty = cohort(0), vacant = transaction(empty);
  assert.deepEqual((await storedSettlementProjection(vacant.tx, empty.fixtureId)).cycles, []);
  assert.equal(vacant.reads, 4);
  const source = cohort(3), selected = transaction(source), id = source.entries[1].cycle.id;
  assert.deepEqual((await storedSettlementProjection(selected.tx, source.fixtureId, id)).cycles.map(entry => entry.cycle.id), [id]);
  assert.equal(selected.reads, 10);
});

for (const [name, change] of [
  ["revision seal", source => { source.entries[1].row.validIntegrity = 0; }],
  ["market seal", source => { source.entries[1].marketRows[0].validIntegrity = 0; }],
  ["settlement seal", source => { source.entries[1].settlements[0].validIntegrity = 0; }],
  ["settlement identity", source => { source.entries[1].settlements[0].fixtureId = randomUUID(); }],
  ["schedule", source => { source.entries[1].schedule.version = 2; }],
]) {
  test(`batched settlement projection rejects a corrupt ${name}`, async () => {
    const source = cohort(2); change(source);
    await assert.rejects(storedSettlementProjection(transaction(source).tx, source.fixtureId), error => error.reason === "invalid-state");
  });
}

test("a missing settlement revision fails closed and fresh reads see subsequent pointer content", async () => {
  const source = cohort(1), first = transaction(source), before = await storedSettlementProjection(first.tx, source.fixtureId);
  const reader = transaction(source), read = reader.tx.$queryRaw;
  reader.tx.$queryRaw = async (query, ...values) => (query.sql ?? query.join("?")).includes("FROM MarketSettlementRevision") ? [] : read(query, ...values);
  await assert.rejects(storedSettlementProjection(reader.tx, source.fixtureId), error => error.reason === "invalid-state");
  source.entries[0].settlements.length = 0;
  const after = await storedSettlementProjection(transaction(source).tx, source.fixtureId);
  assert.ok(before.cycles[0].markets.every(market => market.previous !== null));
  assert.ok(after.cycles[0].markets.every(market => market.previous === null));
});

test("card and detail share one settlement projection with identical public content", async () => {
  const source = cohort(1), entry = source.entries[0];
  Object.assign(source.fixture, { dataVersion: 1n, retrievedAt: new Date(entry.at),
    homeTeam: { id: source.fixture.homeTeamId, name: "Home", code: "HOM", logoUrl: null },
    awayTeam: { id: source.fixture.awayTeamId, name: "Away", code: "AWY", logoUrl: null },
    season: { competition: { id: "league-1", name: "League", country: "England", countryFlagUrl: null, logoUrl: null } } });
  const cycle = cycleFromRows(entry.cycle, entry.schedule), revision = revisionFromRows(entry.row, entry.marketRows);
  const display = { cycle, revision, mode: "locked" }, evidence = { hash: entry.row.evidenceHash, sources: [] };
  const standalone = transaction(source), shared = transaction(source);
  async function project(reader, readSettlement) {
    reader.tx.predictionRefreshResult = { findFirst: async () => null };
    reader.tx.runFixture = { findFirst: async () => null };
    const fixture = await storedFeedFixture(reader.tx, source.fixtureId, false,
      { startInclusive: entry.at, endExclusive: entry.at + 86_400_000 }, "en", { prices: false, display, readSettlement });
    const snapshot = await publicDetailSnapshot(reader.tx, revision, cycle, revision.id, evidence, entry.at, undefined, readSettlement);
    return { fixture, snapshot };
  }
  assert.deepEqual(await project(shared, createSettlementProjectionReader(shared.tx)), await project(standalone));
  assert.equal(standalone.reads - shared.reads, 10, "the duplicate complete settlement read is removed");
});

test("projection sharing isolates fixture/cycle keys, retries failures, and expires with the transaction", async () => {
  const source = cohort(2), reader = transaction(source), read = createSettlementProjectionReader(reader.tx);
  const firstId = source.entries[0].cycle.id, secondId = source.entries[1].cycle.id;
  const [first, repeated] = await Promise.all([read(source.fixtureId, firstId), read(source.fixtureId, firstId)]);
  assert.equal(first, repeated);
  assert.equal(reader.reads, 10);
  assert.deepEqual((await read(source.fixtureId, secondId)).cycles.map(entry => entry.cycle.id), [secondId]);
  assert.equal(reader.reads, 20);
  assert.equal((await read(source.fixtureId)).cycles.length, 2, "an all-cycle read has a separate key");
  await assert.rejects(read(randomUUID(), firstId), error => error.reason === "invalid-state");

  const retrySource = cohort(1), retryTx = transaction(retrySource), retry = createSettlementProjectionReader(retryTx.tx);
  const entry = retrySource.entries[0]; entry.settlements[0].validIntegrity = 0;
  await assert.rejects(retry(retrySource.fixtureId, entry.cycle.id), error => error.reason === "invalid-state");
  entry.settlements[0].validIntegrity = 1;
  assert.equal((await retry(retrySource.fixtureId, entry.cycle.id)).cycles.length, 1);
  entry.settlements.length = 0;
  const fresh = createSettlementProjectionReader(transaction(retrySource).tx);
  assert.ok((await fresh(retrySource.fixtureId, entry.cycle.id)).cycles[0].markets.every(market => market.previous === null));
});

test("a shared projection rejects a cycle outside the requested identity", async () => {
  const source = cohort(2), reader = transaction(source), select = reader.tx.predictionCycle.findMany;
  reader.tx.predictionCycle.findMany = args => select(args.select ? { ...args, where: { fixtureId: source.fixtureId } } : args);
  await assert.rejects(createSettlementProjectionReader(reader.tx)(source.fixtureId, source.entries[0].cycle.id),
    error => error.reason === "invalid-state");
});

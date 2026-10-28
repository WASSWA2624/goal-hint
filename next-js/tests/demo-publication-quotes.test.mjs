import assert from "node:assert/strict";
import test from "node:test";
import { launchOddsMapping } from "../src/domain/odds-markets.ts";
import { evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { demoFixtureOdds, demoFixturesForDate } from "../src/server/demo/api-football.ts";
import { demoForecast, demoId } from "../src/server/demo/forecast.ts";
import { demoPublicationQuoteRules, ensureDemoPublicationQuotes, prepareDemoPublicationQuotes } from "../src/server/demo/publication-quotes.ts";
import { predictionQuoteFromRow, writePreparedPredictionQuotes } from "../src/server/predictions/prediction-quote-store.ts";
import { readPerformanceQuotes, performanceQuoteKey } from "../src/server/performance/performance-quotes.ts";

const now = Date.parse("2026-10-28T09:00:00+03:00");
function fixtureTarget() {
  const fixture = demoFixturesForDate("2026-10-27", now).find((row) => row.fixture.status.short === "FT");
  const original = demoForecast(fixture, now);
  return { fixture, original, target: { revisionId: original.revisionId, cycleId: original.cycleId, fixtureId: original.fixtureId,
    externalFixtureId: fixture.fixture.id, homeTeamId: original.context.home.teamId, awayTeamId: original.context.away.teamId,
    publishedAt: original.publishedAt, openedAt: original.context.analysisAt,
    cutoffAt: original.context.kickoffAt - 300_000, kickoffAt: original.context.kickoffAt, markets: original.candidate.markets } };
}
function storedQuote(quote) {
  return { revisionId: quote.revisionId, cycleId: quote.cycleId, fixtureId: quote.fixtureId, family: quote.family,
    selection: quote.selection, state: quote.state, reason: quote.reason, snapshotId: quote.price?.snapshotId ?? null,
    displayHundredths: quote.price?.hundredths ?? null, quotedAt: quote.price ? new Date(quote.price.retrievedAt) : null,
    recordedAt: new Date(quote.recordedAt), body: evidenceSerialize(quote), validIntegrity: 1 };
}

test("demo original quotes use the exact original forecast and raw bookmaker price observed before publication", () => {
  const { target } = fixtureTarget(), capture = prepareDemoPublicationQuotes(target);
  assert.equal(capture.quotes.length, 4); assert.equal(capture.snapshots.length, 4);
  const observedAt = target.publishedAt - 1_000, raw = demoFixtureOdds(target.externalFixtureId, observedAt, 8);
  for (const quote of capture.quotes) {
    const mapping = launchOddsMapping.find((entry) => entry.family === quote.family);
    const rawPrice = raw.bookmakers[0].bets.find((bet) => bet.id === mapping.betId).values.find((value) => value.value === mapping.selections[quote.selection]);
    assert.equal(quote.state, "quoted"); assert.equal(quote.price.display, rawPrice.odd);
    assert.equal(quote.revisionId, target.revisionId); assert.equal(quote.cycleId, target.cycleId); assert.equal(quote.fixtureId, target.fixtureId);
    assert.equal(quote.selection, target.markets[quote.family].market.selection); assert.equal(quote.recordedAt, target.publishedAt);
    assert.equal(quote.price.retrievedAt, observedAt); assert.equal(quote.price.stateRetrievedAt, observedAt);
    assert.ok(quote.price.retrievedAt >= target.openedAt && quote.price.retrievedAt < target.cutoffAt);
    const source = capture.snapshots.find((snapshot) => snapshot.id === quote.price.snapshotId);
    assert.ok(source); assert.equal(source.betId, mapping.betId); assert.equal(source.bookmakerId, 8); assert.equal(source.retrievedAt, observedAt);
    assert.deepEqual(predictionQuoteFromRow(storedQuote(quote)), quote);
  }
  assert.equal(capture.batch.requestsDispatched, 0); assert.equal(capture.batch.receivedAt, observedAt);
  assert.equal(capture.batch.fixtures[0].externalId, target.externalFixtureId);
  assert.equal(capture.batch.fixtures[0].quoteManifest.bookmakerId, 8);
  assert.ok(capture.batch.fixtures[0].quoteManifest.bets.length >= 4);
  for (const snapshot of capture.snapshots) assert.ok(capture.batch.fixtures[0].quoteManifest.bets.some((bet) =>
    bet.betId === snapshot.betId && bet.valuesHash === snapshot.valuesHash));
});

test("original quote captures are immutable, deterministic and separate from later observations", () => {
  const { target } = fixtureTarget(), captured = prepareDemoPublicationQuotes(target), before = evidenceSerialize(captured);
  assert.deepEqual(prepareDemoPublicationQuotes(target), captured);
  assert.ok(Object.isFrozen(captured)); assert.ok(Object.isFrozen(captured.quotes[0]));
  demoFixtureOdds(target.externalFixtureId, now + 86_400_000, 8);
  assert.equal(evidenceSerialize(captured), before);
  const later = prepareDemoPublicationQuotes({ ...target, publishedAt: target.publishedAt + 1 });
  assert.ok(later.snapshots.every((snapshot, index) => snapshot.id !== captured.snapshots[index].id), "snapshot identity includes its publication observation clock");
});

test("foreign fixture/market bindings and unavailable chronology never receive synthetic publication prices", () => {
  const { target } = fixtureTarget();
  for (const changed of [{ ...target, fixtureId: demoId("foreign-fixture", 1) }, { ...target, revisionId: demoId("foreign-revision", 1) },
    { ...target, cycleId: demoId("foreign-cycle", 1) }, { ...target, homeTeamId: target.awayTeamId },
    { ...target, externalFixtureId: 1 }, { ...target, openedAt: target.publishedAt }, { ...target, cutoffAt: target.publishedAt }]) {
    assert.throws(() => prepareDemoPublicationQuotes(changed), /identity or publication chronology/u);
  }
});

test("production performance quote reader accepts the immutable demo sidecars and exact source timing", async () => {
  const { target } = fixtureTarget(), capture = prepareDemoPublicationQuotes(target), rows = capture.quotes.map(storedQuote);
  const tx = { async $queryRaw(query) {
    return query.sql.includes("OCTET_LENGTH") ? [{ bytes: BigInt(rows.reduce((sum, row) => sum + row.body.length, 0)), total: BigInt(rows.length) }] : rows;
  } };
  const quotes = await readPerformanceQuotes(tx, [{ fixtureId: target.fixtureId, revisionId: target.revisionId, cycleId: target.cycleId,
    openedAt: target.openedAt, publishedAt: target.publishedAt, cutoffAt: target.cutoffAt, kickoffAt: target.kickoffAt }],
    { bookmakerId: 8, maximumAgeMs: demoPublicationQuoteRules.maximumAgeMs }, { remainingBytes: 1_000_000 });
  assert.equal(quotes.size, 4);
  for (const quote of capture.quotes) assert.equal(quotes.get(`${performanceQuoteKey(quote.revisionId, quote.family)}:${quote.selection}`), quote.price.display);
});

test("shared sealed quote writer batches strict inserts and refuses duplicate revision/family keys", async () => {
  const { target } = fixtureTarget(), [quote] = prepareDemoPublicationQuotes(target).quotes, calls = [];
  const tx = { async $executeRaw(query) { calls.push(query); return 1; } };
  const batch = Array.from({ length: 205 }, (_, index) => ({ ...quote, revisionId: demoId("quote-test-revision", index) }));
  await writePreparedPredictionQuotes(tx, batch);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((query) => query.sql.includes("INSERT INTO PredictionQuote") && !/INSERT IGNORE|UPDATE|DELETE/u.test(query.sql)));
  assert.ok(calls.every((query) => query.sql.includes("SHA2(CAST(JSON_EXTRACT")));
  await assert.rejects(writePreparedPredictionQuotes(tx, [quote, quote]), (error) => error.reason === "invalid-request");
});

test("demo quote backfill refuses production before opening any database operation", async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  let reads = 0;
  try {
    await assert.rejects(ensureDemoPublicationQuotes({ async query() { reads += 1; } }, ["2026-10-27"], now), /development demo mode/u);
    assert.equal(reads, 0);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

import test from "node:test";
import assert from "node:assert/strict";
import { MARKET_RULE_VERSION } from "../src/domain/markets.ts";
import { evidenceFingerprint, evidenceSerialize } from "../src/server/evidence/evidence-input.ts";
import { frozenLocalFeaturedPickSchema } from "../src/server/matches/frozen-featured-picks.ts";
import { fixtureResultFromRow } from "../src/server/results/result-read.ts";
import { settlementRevisionFromRow } from "../src/server/settlement/settlement-read.ts";
import { assessBestSlipHistory, readBestSlipHistory } from "../src/server/slips/best-slip-history.ts";

const day = 86_400_000;
const asOf = Date.parse("2026-11-21T08:00:00Z");
const candidate = (id, selection, odds = "1.35", probability = 0.81) => ({
  id, family: "total-goals", selection, probability, odds, source: "local-engine",
});
function sample(id, selection, daysAgo, won, props) {
  const kickoffAt = asOf - daysAgo * day;
  return { ...candidate(id, selection), fixtureId: id, kickoffAt, decisionAt: kickoffAt - 300_001,
    decisionRecordedAt: kickoffAt - 299_000, resultObservedAt: kickoffAt + 6_000_000,
    resultRecordedAt: kickoffAt + 6_000_100, settledAt: kickoffAt + 6_000_200, won, ...props };
}
const samples = (selection, daysAgo, count, wins) => Array.from({ length: count }, (_, i) =>
  sample(`${selection}:${daysAgo}:${i}`, selection, daysAgo + i % 7, i < wins));
const separated = (heldOutWinsForOver = 22, heldOutWinsForUnder = 7) => [
  ...samples("over-2.5", 34, 36, 35), ...samples("under-2.5", 34, 36, 10),
  ...samples("over-2.5", 3, 24, heldOutWinsForOver), ...samples("under-2.5", 3, 24, heldOutWinsForUnder),
];

test("point-in-time hit evidence breaks only exact model probability and price ties for comparable markets", () => {
  const history = assessBestSlipHistory(separated(), asOf);
  const higherProbability = candidate("high-p", "under-2.5", "1.35", 0.82);
  const higherOdds = candidate("high-price", "under-2.5", "1.3501");
  const supportedLower = candidate("supported-lower", "under-2.5");
  const unrelatedLine = candidate("other-line", "over-1.5");
  const supportedHigher = candidate("supported-higher", "over-2.5");
  const unsupportedSource = { ...candidate("other-source", "over-2.5"), source: "api-football" };
  assert.equal(history.report.status, "ready");
  assert.equal(history.report.settledDecisions, 120);
  assert.deepEqual(history.report.profiles.map(({ line, training, validation }) => [line, training.samples, validation.samples]),
    [[2.5, 36, 24], [2.5, 36, 24]]);
  assert.deepEqual(history.order([higherProbability, higherOdds, supportedLower, unrelatedLine, unsupportedSource, supportedHigher]),
    [higherProbability, higherOdds, supportedHigher, unrelatedLine, unsupportedSource, supportedLower]);
});

test("sparse cohorts, overlapping intervals, a reversed holdout and budget truncation leave the baseline order intact", () => {
  const baseline = [candidate("under", "under-2.5"), candidate("over", "over-2.5")];
  const sparse = separated().filter((entry) => entry.fixtureId.endsWith(":0"));
  const overlapping = separated().map((entry, i) => ({ ...entry, won: i % 2 === 0 }));
  for (const cohort of [sparse, overlapping, separated(7, 22)]) {
    const history = assessBestSlipHistory(cohort, asOf);
    assert.equal(history.report.status, "insufficient");
    assert.deepEqual(history.order(baseline), baseline);
  }
  const limited = assessBestSlipHistory(separated(), asOf, 2001, "limited");
  assert.equal(limited.report.status, "limited");
  assert.deepEqual(limited.order(baseline), baseline);
});

test("training never borrows later grades; duplicate occurrences, premature results and late decisions do not enter counts", () => {
  const original = sample("eligible", "over-2.5", 36, true);
  const duplicate = sample("different-cycle", "over-2.5", 36, true);
  const history = assessBestSlipHistory([
    original,
    duplicate, { ...duplicate, kickoffAt: duplicate.kickoffAt + 1 },
    sample("split-result", "over-2.5", 31, true, { settledAt: asOf - 30 * day }),
    sample("future-result", "over-2.5", 3, true, { settledAt: asOf }),
    sample("late-decision", "over-2.5", 3, true, { decisionAt: asOf - 3 * day - 300_000 }),
    sample("early-result", "over-2.5", 3, true, { resultObservedAt: asOf - 3 * day }),
    sample("late-recorded-result", "over-2.5", 3, true, { resultRecordedAt: asOf + 1 }),
    sample("outside-lookback", "over-2.5", 91, true),
    sample("eligible", "under-2.5", 3, false),
  ], asOf);
  assert.equal(history.report.scannedDecisions, 10);
  assert.equal(history.report.settledDecisions, 1);
  assert.equal(history.report.profiles[0].training.wins, 1);
});

test("the sealed featured selection is graded on the original occurrence even when the locked market chose otherwise", async () => {
  const fixtureId = "11111111-1111-4111-8111-111111111111";
  const cycleId = "22222222-2222-4222-8222-222222222222";
  const revisionId = "33333333-3333-4333-8333-333333333333";
  const homeTeamId = "44444444-4444-4444-8444-444444444444";
  const awayTeamId = "55555555-5555-4555-8555-555555555555";
  const resultId = "a".repeat(64), settlementId = "b".repeat(64);
  const times = sample("stored", "over-2.5", 3, true);
  const { kickoffAt, decisionAt, decisionRecordedAt, resultObservedAt, resultRecordedAt, settledAt } = times;
  const decision = { status: "priced", version: "local-featured-pre-match-v3", tier: "standard", marketKey: "total-goals",
    selection: "over-2.5", probability: 0.81, threshold: 0.8, expectedNetReturn: "0.0935",
    quote: { bookmakerId: 6, bookmakerName: null, betId: 5, betName: "Goals Over/Under", providerSelection: "Over 2.5",
      decimal: "1.35", observedAt: decisionAt - 100, checkedAt: decisionAt - 20, providerUpdatedAt: null,
      snapshotId: "c".repeat(64), receiptId: "d".repeat(64) } };
  const freeze = { fixtureId, cycleId, revisionId, homeTeamId, awayTeamId, kickoffAt, decisionAt, decision };
  const decisionRow = { fixtureId, cycleId, revisionId, choice: "total-goals", decisionJson: evidenceSerialize(freeze),
    validDecision: true, validClose: true, validRevision: true, effectiveCloseAt: String(decisionAt + 1), kickoffAt: new Date(kickoffAt),
    cutoffAt: new Date(decisionAt + 1), scheduleObservedAt: new Date(decisionAt - 1000), homeTeamId, awayTeamId,
    homeExternalId: "10", awayExternalId: "20", decisionRecordedAt: new Date(decisionRecordedAt),
    revisionPublishedAt: new Date(decisionAt - 500), revisionRecordedAt: new Date(decisionAt - 500), settlementId };
  const settled = { fixtureId, cycleId, family: "total-goals", ruleVersion: MARKET_RULE_VERSION, lockedSetId: revisionId, resultId,
    selection: "under-2.5", source: "local-engine", selectedProbability: .61, resultUsable: true, status: "incorrect",
    reason: "verified", cycleState: "closed", voidReason: null };
  const settlement = { ...settled, id: settlementId, batchId: "e".repeat(64), previousId: null, at: settledAt, correctedAt: null,
    kind: "initial", inputHash: evidenceFingerprint(settled) };
  const settlementRow = { ...settlement, at: new Date(settledAt), body: evidenceSerialize(settlement), validIntegrity: true };
  const score = { home: 2, away: 1 }, blank = { home: null, away: null };
  const content = { status: "finished-regulation", providerStatus: "FT", elapsedMinutes: 90, reportedGoals: score,
    extraTimeScore: blank, penaltyScore: blank, regulation: { ...score, verified: true, evidenceRef: "provider-result" } };
  const result = { ...content, id: resultId, fixtureId, fixtureVersion: 9n, previousId: null, observationId: "f".repeat(64),
    observedAt: resultObservedAt, providerUpdatedAt: null, regulationVerifiedAt: resultObservedAt };
  const resultRow = { ...result, observedAt: new Date(resultObservedAt), recordedAt: new Date(resultRecordedAt),
    regulationVerified: true, regulationHome: 2, regulationAway: 1, body: evidenceSerialize(result), contentHash: evidenceFingerprint(content),
    validIntegrity: true, lifecycleCycleId: cycleId, lifecycleKickoffAt: String(kickoffAt), lifecycleHomeId: "10",
    lifecycleAwayId: "20", lifecycleStartedAt: String(kickoffAt), lifecycleStatus: "finished-regulation" };
  frozenLocalFeaturedPickSchema.parse(freeze);
  settlementRevisionFromRow(settlementRow);
  fixtureResultFromRow(resultRow);
  function db(observed = resultRow, original = decisionRow) {
    return { transaction: (read) => read({ async $queryRaw(sql) {
      if (sql.sql.includes("FROM PredictionSet p"))
        return sql.values.some((v) => v instanceof Date && v.getTime() === asOf) ? [original] : [];
      if (sql.sql.includes("FROM MarketSettlementRevision WHERE")) return [settlementRow];
      if (sql.sql.includes("FROM FixtureResult r")) return [observed];
      throw new Error("Unexpected read.");
    } }) };
  }
  const { report } = await readBestSlipHistory(db(), asOf, [39]);
  assert.equal(report.settledDecisions, 1);
  assert.equal(report.profiles[0].selection, "over-2.5");
  assert.equal(report.profiles[0].validation.wins, 1);
  const mismatched = await readBestSlipHistory(db({ ...resultRow, lifecycleKickoffAt: String(kickoffAt + day) }), asOf, [39]);
  assert.equal(mismatched.report.settledDecisions, 0);
  const corrupted = await readBestSlipHistory(db(resultRow, { ...decisionRow, validDecision: false }), asOf, [39]);
  assert.equal(corrupted.report.settledDecisions, 0);
  const lateQuote = { ...decision, quote: { ...decision.quote, checkedAt: decisionAt + 1 } };
  const afterCutoff = await readBestSlipHistory(db(resultRow, { ...decisionRow, decisionJson: evidenceSerialize({ ...freeze, decision: lateQuote }) }), asOf, [39]);
  assert.equal(afterCutoff.report.settledDecisions, 0);
});

test("database history isolates training from the later holdout and abstains on read failure", async () => {
  const reads = [];
  const db = { async transaction(read, options) {
    assert.equal(options.isolationLevel, "RepeatableRead");
    return read({ async $queryRaw(query) { reads.push(query); return []; } });
  } };
  const history = await readBestSlipHistory(db, asOf, [39]);
  assert.equal(history.report.status, "insufficient");
  assert.equal(reads.length, 2);
  assert.ok(reads[0].values.filter((value) => value instanceof Date).every((clock) => clock.getTime() <= asOf - 30 * day));
  assert.ok(reads[1].values.some((value) => value instanceof Date && value.getTime() === asOf));
  assert.match(reads[0].sql, /MarketSettlementRevision m[\s\S]*m\.at </u);
  assert.match(reads[0].sql, /voided\.at </u);
  const failed = await readBestSlipHistory({ async transaction() { throw new Error("unavailable"); } }, asOf, [39]);
  assert.equal(failed.report.status, "unavailable");
});

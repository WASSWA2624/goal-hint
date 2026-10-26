import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { feedPerformanceSchema } from '../src/domain/match-feed.ts';
import { parseFeedQuery, resolveFeedDates } from '../src/domain/feed-query.ts';
import { parseReportingDate } from '../src/domain/calendar.ts';
import { readFeedPerformance } from '../src/server/matches/feed-performance.ts';
import { feedSql } from '../src/server/matches/feed-read.ts';
import { evidenceFingerprint, evidenceSerialize } from '../src/server/evidence/evidence-input.ts';
import { settlementContextFor, settlementInputFor } from '../src/server/settlement/settlement-read.ts';

const today = parseReportingDate('2026-10-09'), at = Date.parse('2026-10-09T15:00:00Z');
const query = parseFeedQuery({ date: today, page: '2', pageSize: '1' }, { today });
const sql = feedSql(query, resolveFeedDates(query, today), [39]);

function sample({ score = [2, 1], selection = 'home-win', family = 'match-result', issue = null, canonicalScore = score,
  probabilities = family === 'match-result' ? { 'home-win': .7, draw: .2, 'away-win': .1 }
    : family === 'double-chance' ? { 'home-or-draw': .82, 'away-or-draw': .46, 'home-or-away': .72 }
      : { 'under-2.5': .7, 'over-2.5': .3 } } = {}) {
  const fixtureId = randomUUID(), cycle = { id: randomUUID(), lockedSetId: randomUUID(), state: 'closed', voidReason: null };
  const market = { family, selection, source: 'ai', selectedProbability: probabilities[selection], probabilities };
  const content = { status: 'finished-regulation', providerStatus: 'FT', elapsedMinutes: null,
    reportedGoals: { home: score[0], away: score[1] }, extraTimeScore: { home: null, away: null }, penaltyScore: { home: null, away: null },
    regulation: { verified: true, home: score[0], away: score[1], evidenceRef: 'synthetic-verified-regulation' } };
  const result = { id: evidenceFingerprint(fixtureId), fixtureId, fixtureVersion: 1n, previousId: null,
    observationId: 'b'.repeat(64), observedAt: at, providerUpdatedAt: null, regulationVerifiedAt: at, ...content };
  const fixture = { status: content.status, regulationHome: score[0], regulationAway: score[1],
    regulationVerifiedAt: new Date(at), regulationEvidenceRef: content.regulation.evidenceRef };
  const input = settlementInputFor(fixtureId, cycle, family, market, result, true, settlementContextFor(fixture, result, null, cycle), null);
  const previous = { id: evidenceFingerprint(cycle.id), batchId: 'c'.repeat(64), previousId: null,
    inputHash: evidenceFingerprint(input), at, correctedAt: null, kind: 'initial', ...input };
  const row = { ...previous, at: new Date(at), body: evidenceSerialize(previous), validIntegrity: 1n,
    fixtureStatus: fixture.status, fixtureRegulationHome: canonicalScore[0], fixtureRegulationAway: canonicalScore[1],
    fixtureRegulationVerifiedAt: fixture.regulationVerifiedAt, fixtureRegulationEvidenceRef: fixture.regulationEvidenceRef,
    currentLockedSetId: cycle.lockedSetId, currentVoidReason: null, currentResultId: result.id, issue,
    currentFamily: family, currentSelection: selection, currentSource: market.source, currentProbability: market.selectedProbability,
    storedSelection: selection, storedProbability: market.selectedProbability,
    marketPayload: JSON.stringify({ available: true, market }), marketValidIntegrity: 1n };
  const resultRow = { ...result, observedAt: new Date(at), regulationVerified: true, regulationHome: score[0], regulationAway: score[1],
    contentHash: evidenceFingerprint(content), body: evidenceSerialize(result), validIntegrity: 1n };
  return { row, resultRow };
}
function transaction(samples) {
  const calls = [];
  let batch = 0;
  return { calls, async $queryRaw(statement) {
    calls.push(statement);
    if (statement.sql.includes('FROM FixtureResult r')) return samples.map((value) => value.resultRow).filter((row) => statement.values.includes(row.id));
    return samples.slice(batch++ * 500, batch * 500).map((value) => value.row);
  } };
}

test('cohort counts preserve missing predictions and voids without classifying them as pending or losses', async () => {
  const tx = transaction([]);
  assert.deepEqual(await readFeedPerformance(tx, sql, { total: 9, available: 3, void: 3 }),
    { total: 9, won: 0, lost: 0, pending: 0, void: 3, unavailable: 6 });
  assert.equal(tx.calls.length, 0);
  assert.deepEqual(await readFeedPerformance(tx, sql, { total: 9, available: 3, void: 0 }),
    { total: 9, won: 0, lost: 0, pending: 3, void: 0, unavailable: 6 });
});

test('large cohorts continue across bounded batches without losing matches or applying the visible page limit', async () => {
  const samples = Array.from({ length: 501 }, () => sample()).sort((left, right) => left.row.fixtureId.localeCompare(right.row.fixtureId));
  const tx = transaction(samples);
  assert.deepEqual(await readFeedPerformance(tx, sql, { total: 501, available: 501, void: 0 }),
    { total: 501, won: 501, lost: 0, pending: 0, void: 0, unavailable: 0 });
  const batches = tx.calls.filter((statement) => !statement.sql.includes('FROM FixtureResult r'));
  assert.equal(batches.length, 2);
  assert.ok(batches[1].values.includes(samples[499].row.fixtureId));
});

test('summary settles one selected market per match across the complete cohort, independent of visible page', async () => {
  const samples = [sample(), sample({ score: [0, 1] }), sample({ family: 'total-goals', selection: 'under-2.5' })];
  const tx = transaction(samples);
  assert.deepEqual(await readFeedPerformance(tx, sql, { total: 100, available: 80, void: 10 }),
    { total: 100, won: 1, lost: 2, pending: 67, void: 10, unavailable: 20 });
  const statement = tx.calls[0];
  assert.match(statement.sql, /ORDER BY f\.id LIMIT/u);
  assert.doesNotMatch(statement.sql, /OFFSET/u);
  assert.equal(statement.values.at(-1), 500);
});

test('canonical score corrections and unresolved lifecycle issues make old settled outcomes pending', async () => {
  const tx = transaction([sample({ canonicalScore: [0, 1] }), sample({ issue: 'unresolved-conflict' })]);
  assert.deepEqual(await readFeedPerformance(tx, sql, { total: 2, available: 2, void: 0 }),
    { total: 2, won: 0, lost: 0, pending: 2, void: 0, unavailable: 0 });
});

test('a pending settlement recorded before cutoff remains pending after a selection locks', async () => {
  const value = sample(), previous = JSON.parse(value.row.body);
  Object.assign(previous, { lockedSetId: null, selection: null, source: null, selectedProbability: null, resultId: null,
    resultUsable: false, status: 'unavailable', reason: 'awaiting-locked-selection', cycleState: 'open' });
  const { fixtureId, cycleId, family, ruleVersion, lockedSetId, selection, source, selectedProbability,
    resultId, resultUsable, status, reason, cycleState, voidReason } = previous;
  previous.inputHash = evidenceFingerprint({ fixtureId, cycleId, family, ruleVersion, lockedSetId, selection, source, selectedProbability,
    resultId, resultUsable, status, reason, cycleState, voidReason });
  Object.assign(value.row, { lockedSetId: null, resultId: null, inputHash: previous.inputHash, body: evidenceSerialize(previous) });
  assert.deepEqual(await readFeedPerformance(transaction([value]), sql, { total: 1, available: 1, void: 0 }),
    { total: 1, won: 0, lost: 0, pending: 1, void: 0, unavailable: 0 });
});

test('corrupt evidence and mismatched shown selections cannot produce fabricated performance', async () => {
  const invalidSettlement = sample(); invalidSettlement.row.validIntegrity = 0n;
  await assert.rejects(readFeedPerformance(transaction([invalidSettlement]), sql, { total: 1, available: 1, void: 0 }));
  const invalidResult = sample(); invalidResult.resultRow.validIntegrity = 0n;
  await assert.rejects(readFeedPerformance(transaction([invalidResult]), sql, { total: 1, available: 1, void: 0 }));
  const invalidSelection = sample(); invalidSelection.row.currentSelection = 'away-win';
  await assert.rejects(readFeedPerformance(transaction([invalidSelection]), sql, { total: 1, available: 1, void: 0 }));
});

test('recommendation performance uses its exact selection while preserving the recorded family settlement', async () => {
  const value = sample({ family: 'double-chance', selection: 'home-or-draw', score: [0, 0] });
  value.row.currentSelection = 'home-or-away'; value.row.currentProbability = .72;
  const recorded = value.row.body;
  assert.deepEqual(await readFeedPerformance(transaction([value]), sql, { total: 1, available: 1, void: 0 }),
    { total: 1, won: 0, lost: 1, pending: 0, void: 0, unavailable: 0 });
  assert.equal(value.row.body, recorded); assert.equal(JSON.parse(recorded).status, 'correct');
});

test('performance count schema requires a complete nonnegative accounting', () => {
  assert.equal(feedPerformanceSchema.safeParse({ total: 100, won: 60, lost: 20, pending: 20, void: 0, unavailable: 0 }).success, true);
  assert.equal(feedPerformanceSchema.safeParse({ total: 100, won: 60, lost: 20, pending: 19, void: 0, unavailable: 0 }).success, false);
  assert.equal(feedPerformanceSchema.safeParse({ total: 100, won: 60, lost: 20, pending: 21, void: -1, unavailable: 0 }).success, false);
});

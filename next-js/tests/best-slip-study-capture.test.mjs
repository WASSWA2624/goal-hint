import assert from 'node:assert/strict';
import { execFile as executeFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { bestSlipCombinationIdentity } from '../src/domain/best-slips.ts';
import { getReportingDate, getReportingDayBounds } from '../src/domain/calendar.ts';
import { parseDecimalOdds } from '../src/domain/odds.ts';
import { preMatchReferenceOddsFreshMs } from '../src/domain/reference-odds.ts';
import { evidenceFingerprint } from '../src/server/evidence/evidence-input.ts';
import { bestSlipStudyScopeHash, captureBestSlipStudy } from '../src/server/slips/best-slip-study-capture.ts';
import { parseBestSlipStudyCapture, sealBestSlipStudyCapture, sealBestSlipStudyReceipt } from '../src/server/slips/best-slip-study-contract.ts';

const now = Date.parse('2026-11-21T10:00:00Z');
const uuid = (id) => `a0000000-0000-4000-8000-${String(id).padStart(12, '0')}`;

function original(id, odds, bookmakerId, overrides = {}) {
  const bookmakerName = `Book ${bookmakerId}`;
  return {
    fixtureId: uuid(id), kickoffAt: now + 3_600_000, source: 'local-engine',
    homeTeam: { id: uuid(1000 + id), name: `Home ${id}` }, awayTeam: { id: uuid(2000 + id), name: `Away ${id}` },
    competition: { id: uuid(301), name: 'Synthetic league', country: 'Uganda' },
    family: 'total-goals', selection: 'under-1.5', probability: 0.8, odds, oddsBasis: 'bookmaker',
    bookmaker: { id: bookmakerId, name: bookmakerName },
    forecast: { cycleId: uuid(3000 + id), revisionId: uuid(4000 + id), publishedAt: now - 20_000 },
    offer: { bookmakerId, bookmakerName, betId: 5, betName: 'Goals Over/Under', providerSelection: 'Under 1.5',
      decimal: parseDecimalOdds(odds).text, observedAt: now - 10_000, checkedAt: now - 5000, providerUpdatedAt: null,
      snapshotId: String(id).padStart(64, '0'), receiptId: String(id + 1).padStart(64, '0') },
    ...overrides,
  };
}

function scenario(selections, times = [now, now + 1000]) {
  const probes = [], day = getReportingDate(times[0]), window = getReportingDayBounds(day);
  let next = 0;
  const database = { async query(operation) {
    return operation({ async $queryRaw(parts) {
      probes.push(parts.join(''));
      return [{ at: new Date(times[next++]) }];
    } });
  } };
  const read = async (query, context, clock) => {
    assert.equal(query.get('from'), day);
    assert.equal(query.get('to'), day);
    assert.equal(query.get('status'), 'scheduled');
    assert.deepEqual(context, { featured: true });
    assert.equal(clock.now(), times[0]);
    return { asOf: times[0], today: day, range: { from: day, to: day, ...window },
      records: [...new Set(selections.map(({ fixtureId }) => fixtureId))].map((fixtureId) => ({ fixtureId })), featuredSelections: selections,
      searchLimited: false, partialCoverage: false };
  };
  return { probes, database, read, window };
}

test('study uses original exact quotes with disjoint fixtures and no whole-slip estimate', async () => {
  const a = original(1, '1.44', 1), b = original(2, '3.47', 1);
  const c = original(3, '2.53', 2), d = original(4, '3.12', 2);
  const sharedTeam = original(5, '1.86', 3);
  const tomorrow = getReportingDayBounds(getReportingDate(now)).endExclusive;
  const selections = [a, b, c, d, sharedTeam, original(6, '1.86', 3, { awayTeam: sharedTeam.homeTeam }),
    original(7, '3.75', 4, { source: 'api-football' }), original(8, '3.75', 4, { probability: 0.7499 }),
    original(9, '3.75', 4, { kickoffAt: tomorrow })];
  const fixture = scenario(selections);
  const capture = await captureBestSlipStudy(fixture.database, [2, 1], { environment: 'production', read: fixture.read });
  assert.deepEqual(fixture.probes, ['SELECT UTC_TIMESTAMP(3) AS at', 'SELECT UTC_TIMESTAMP(3) AS at']);
  assert.equal(capture.examined, 9);
  assert.equal(capture.eligible, 7);
  assert.deepEqual(capture.slates.map(({ band, slip }) => [band, slip.totalOdds]), [['1.5-5', '5.00'], ['5-10', '7.89']]);
  assert.deepEqual(capture.slates[0].slip.selections, [a, b]);
  assert.ok(capture.slates.every(({ slip }) => slip.id === bestSlipCombinationIdentity(slip.selections)
    && !Object.hasOwn(slip, 'estimatedProbability')));
  assert.equal(new Set(capture.slates.flatMap(({ slip }) => slip.selections.map(({ fixtureId }) => fixtureId))).size, 4);
  assert.deepEqual(parseBestSlipStudyCapture(JSON.parse(JSON.stringify(capture))), capture);

  const reversed = scenario(selections.toReversed());
  const repeated = await captureBestSlipStudy(reversed.database, [1, 2], { environment: 'production', read: reversed.read });
  assert.deepEqual(repeated, capture);

});

test('study uses a common alternate bookmaker when each featured pick has a different best book', async () => {
  const a = original(1, '1.55', 3);
  const b = original(2, '1.80', 3);
  const fixture = scenario([original(1, '2.10', 1), original(2, '2.30', 2), a, b]);
  const capture = await captureBestSlipStudy(fixture.database, [1], { read: fixture.read });
  assert.equal(capture.examined, 2);
  assert.equal(capture.eligible, 2);
  assert.deepEqual(capture.slates.map(({ slip }) => [slip.totalOdds, slip.selections]), [['2.79', [a, b]]]);
});

test('a fresh offer at another bookmaker cannot keep an expired selected offer in the capture', async () => {
  const stale = original(1, '1.55', 3);
  stale.offer.observedAt = now - preMatchReferenceOddsFreshMs;
  const fixture = scenario([original(1, '1.55', 2), stale, original(2, '1.80', 3)]);
  const capture = await captureBestSlipStudy(fixture.database, [1], { read: fixture.read });
  assert.equal(capture.eligible, 2);
  assert.deepEqual(capture.slates, []);
});

test('quotes or fixtures that expire before the database capture clock leave honest empty slates', async () => {
  const nowCutoff = now + 5000;
  const atCutoff = original(2, '1.86', 1, { kickoffAt: nowCutoff + 5 * 60_000 });
  const stale = original(4, '1.86', 2);
  stale.offer.observedAt = now - preMatchReferenceOddsFreshMs;
  const fixture = scenario([original(1, '1.86', 1), atCutoff, original(3, '1.86', 2), stale], [now, nowCutoff]);
  const capture = await captureBestSlipStudy(fixture.database, [1], { read: fixture.read });
  assert.equal(capture.observedAt, now);
  assert.equal(capture.capturedAt, nowCutoff);
  assert.equal(capture.examined, 4);
  assert.equal(capture.eligible, 2);
  assert.deepEqual(capture.slates, []);
});

test('a stale read, backwards database clock or Kampala rollover cannot seal a cohort', async () => {
  const midnight = Date.parse('2026-11-21T21:00:00Z');
  for (const times of [[now, now + 30_001], [now, now - 1], [midnight - 1, midnight]]) {
    const fixture = scenario([], times);
    await assert.rejects(() => captureBestSlipStudy(fixture.database, [1], { read: fixture.read }), /time boundary/);
  }
  const empty = scenario([]);
  const capture = await captureBestSlipStudy(empty.database, [1], { read: empty.read });
  assert.deepEqual([capture.examined, capture.eligible, capture.slates], [0, 0, []]);
});

test('below-75% picks can form a new sealed slate while legacy capture proof retains its original criteria', async () => {
  const a = original(1, '1.55', 1, { probability: 0.72 });
  const b = original(2, '1.80', 1, { probability: 0.68 });
  const fixture = scenario([b, a]);
  const capture = await captureBestSlipStudy(fixture.database, [1], { environment: 'production', read: fixture.read });
  assert.equal(capture.eligible, 2);
  assert.deepEqual(capture.slates.map(({ band, slip }) => [band, slip.totalOdds, slip.selections]),
    [['1.5-5', '2.79', [a, b]]]);
  assert.deepEqual(parseBestSlipStudyCapture(capture), capture);

  const legacyScope = evidenceFingerprint({ policy: 'same-day-featured-compact-disjoint-v1',
    environment: 'production', primaryBookmakerId: 1, competitionIds: [1] });
  assert.notEqual(capture.scopeHash, legacyScope);
  const legacy = { ...capture, version: 'best-slips-study-capture-v1', scopeHash: legacyScope };
  delete legacy.hash;
  assert.throws(() => parseBestSlipStudyCapture({ ...legacy, hash: evidenceFingerprint(legacy) }), /original pre-cutoff/);
  const old = { ...legacy, slates: [], eligible: 0 };
  assert.equal(parseBestSlipStudyCapture({ ...old, hash: evidenceFingerprint(old) }).scopeHash, legacyScope);
});

test('CLI evaluates old and new scopes separately when both captured the same Kampala day', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'goalhint-best-slip-study-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const day = '2020-01-01';
  const at = Date.parse(day + 'T08:00:00Z');
  const legacyScope = evidenceFingerprint({ policy: 'same-day-featured-compact-disjoint-v1',
    environment: 'production', primaryBookmakerId: 1, competitionIds: [1] });
  const scopeHash = bestSlipStudyScopeHash([1], { environment: 'production' });
  const fields = { observedAt: at, capturedAt: at + 1000, examined: 2, eligible: 0,
    searchLimited: false, partialCoverage: false, slates: [] };
  const old = { ...fields, version: 'best-slips-study-capture-v1', scopeHash: legacyScope, examined: 1 };
  const oldCapture = { ...old, hash: evidenceFingerprint(old) };
  const newCapture = sealBestSlipStudyCapture({ ...fields, scopeHash });
  for (const [name, capture] of [[`capture-${day}.json`, oldCapture], [`capture-${day}-${scopeHash}.json`, newCapture]]) {
    const receipt = sealBestSlipStudyReceipt({ captureHash: capture.hash, observedAt: at + 2000, outcomes: [] });
    await writeFile(join(directory, name), JSON.stringify(capture), { mode: 0o600 });
    await writeFile(join(directory, `outcome-${capture.hash}-${receipt.observedAt}.json`), JSON.stringify(receipt), { mode: 0o600 });
  }

  for (const [scope, examined] of [[legacyScope, 1], [scopeHash, 2]]) {
    const { stdout } = await promisify(executeFile)(process.execPath, ['--conditions=react-server',
      'scripts/best-slip-study.mjs', 'evaluate', '--directory', directory, '--scope', scope,
      '--fit-from', day, '--fit-until', '2020-01-02', '--holdout-from', '2020-01-03', '--holdout-until', '2020-01-04'],
    { cwd: new URL('../', import.meta.url) });
    const report = JSON.parse(stdout);
    assert.equal(report.scopeHash, scope);
    assert.equal(report.fit.capturedDays, 1);
    assert.equal(report.fit.examined, examined);
    assert.equal(report.approvedForPublication, false);
  }
});

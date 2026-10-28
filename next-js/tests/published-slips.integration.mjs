import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getReportingDate, utcInstantFromEpochMilliseconds } from '../src/domain/calendar.ts';
import { createPublishedSlips } from '../src/server/slips/published-slips.ts';
import { liveRecord } from './helpers/live-refresh-fixtures.mjs';
import { MysqlServerUnavailableError } from './helpers/mysql-instance.mjs';
import { paidDatabase } from './helpers/paid-database.mjs';

test('genuine MySQL publication DDL, concurrent first-writer ownership, sealed reads and append-only constraints', { timeout: 180_000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const { root, database } = f;
  await root.query(`CREATE TABLE FootballFixture (id CHAR(36) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE PredictionSet (id CHAR(36) NOT NULL, cycleId CHAR(36) NOT NULL, fixtureId CHAR(36) NOT NULL,
      PRIMARY KEY(id), UNIQUE KEY(id,cycleId,fixtureId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;`);
  await root.query(await readFile(new URL('../prisma/migrations/20261025113516_daily_slip_publications/migration.sql', import.meta.url), 'utf8'));
  await root.query(await readFile(new URL('../prisma/migrations/20261028130000_daily_slip_capacity/migration.sql', import.meta.url), 'utf8'));
  for (const table of ['DailySlipPublication', 'PublishedSlip', 'PublishedSlipLeg'])
    await root.query(`GRANT SELECT, INSERT ON goal_hint_test.${table} TO 'paid_application'@'127.0.0.1'`);
  await root.query("GRANT SELECT ON goal_hint_test.FootballFixture TO 'paid_application'@'127.0.0.1'");
  const at = (await root.query('SELECT UTC_TIMESTAMP(3) AS at'))[0].at.getTime();
  const day = getReportingDate(utcInstantFromEpochMilliseconds(at));
  const kickoffAt = Date.parse(`${day}T20:59:00Z`);
  if (kickoffAt - at < 600_000) { t.skip('A current-day pre-match publication requires a future eligible cutoff.'); return; }
  const fixtureId = randomUUID(), cycleId = randomUUID(), revisionId = randomUUID();
  await root.query('INSERT INTO FootballFixture(id) VALUES (?)', [fixtureId]);
  await root.query('INSERT INTO PredictionSet(id,cycleId,fixtureId) VALUES (?,?,?)', [revisionId, cycleId, fixtureId]);
  const record = liveRecord();
  const slip = { id: 'synthetic-editorial-publication', totalOdds: '5.00', oddsBasis: 'bookmaker', averageProbability: 0.7,
    estimatedProbability: 0.7, selections: [{ fixtureId, kickoffAt, homeTeam: record.homeTeam, awayTeam: record.awayTeam,
      competition: record.competition, family: 'match-result', selection: 'home-win', probability: 0.7, odds: '5.00', oddsBasis: 'bookmaker' }] };
  const store = createPublishedSlips(database, {
    async bindForecasts(_tx, original) { return { ...original, selections: original.selections.map(selection => ({ ...selection,
      forecast: { cycleId, revisionId, publishedAt: at - 100 } })) }; },
    async resolveResults(_tx, selections) { return selections.map(selection => ({ fixtureId, family: selection.family,
      selection: selection.selection, forecast: selection.forecast, completed: true, status: 'finished-regulation',
      regulationVerified: true, regulationHome: 0, regulationAway: 1 })); },
  });
  const input = { day, slips: [slip], searchLimited: false, partialCoverage: false,
    model: { calibrationReference: 'synthetic-MySQL-contract', correlationReference: 'synthetic-correlations',
      validFrom: at - 60_000, validUntil: at + 86_400_000, estimate: () => 0.7 }, verifyModel: () => true, verifyPublicOdds: () => true };
  const results = await Promise.all([store.publish(input), store.publish(input)]);
  assert.deepEqual(results.sort(), ['already-published', 'published']);
  const history = await store.history({ from: day, to: day, page: 1, pageSize: 10 });
  assert.equal(history.total, 1); assert.equal(history.records[0].outcome, 'lost');
  assert.equal(history.records[0].slip.selections[0].forecast.revisionId, revisionId);
  assert.equal(history.records[0].slip.totalOdds, '5.00');
  for (const table of ['DailySlipPublication', 'PublishedSlip', 'PublishedSlipLeg']) {
    const column = table === 'PublishedSlipLeg' ? 'slipId' : 'id';
    await assert.rejects(root.query(`UPDATE ${table} SET ${column}=${column}`), /append-only/);
    await assert.rejects(root.query(`DELETE FROM ${table}`), /append-only/);
  }
  const definitions = await root.query("SELECT REFERENCED_TABLE_NAME AS target FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('DailySlipPublication','PublishedSlip','PublishedSlipLeg')");
  assert.equal(definitions.some(row => row.target === 'MemberAccount' || row.target === 'SavedSlip'), false);
  // A mismatched source revision/fixture cannot enter normalized membership.
  await assert.rejects(root.query('INSERT INTO PublishedSlipLeg(slipId,fixtureId,cycleId,revisionId) VALUES (?,?,?,?)',
    [history.records[0].id, randomUUID(), cycleId, revisionId]));
  // The forward migration widens both database boundaries without weakening append-only history.
  await root.query(`INSERT INTO PublishedSlip(id,publicationId,\`rank\`,snapshotJson,integrity)
    SELECT REPEAT('a',64),publicationId,100,snapshotJson,integrity FROM PublishedSlip WHERE \`rank\`=1`);
  await assert.rejects(root.query(`INSERT INTO PublishedSlip(id,publicationId,\`rank\`,snapshotJson,integrity)
    SELECT REPEAT('b',64),publicationId,101,snapshotJson,integrity FROM PublishedSlip WHERE \`rank\`=1`), /check|constraint/i);
  await root.query(`INSERT INTO DailySlipPublication(id,eatDate,publishedAt,modelId,bodyJson,integrity)
    SELECT REPEAT('c',64),DATE_ADD(eatDate,INTERVAL 1 DAY),publishedAt,modelId,JSON_SET(bodyJson,'$.count',100),integrity
    FROM DailySlipPublication LIMIT 1`);
  await assert.rejects(root.query(`INSERT INTO DailySlipPublication(id,eatDate,publishedAt,modelId,bodyJson,integrity)
    SELECT REPEAT('d',64),DATE_ADD(eatDate,INTERVAL 2 DAY),publishedAt,modelId,JSON_SET(bodyJson,'$.count',101),integrity
    FROM DailySlipPublication ORDER BY eatDate LIMIT 1`), /check|constraint/i);
});

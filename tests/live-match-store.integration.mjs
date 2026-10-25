import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { utcInstantFromEpochMilliseconds } from '../src/domain/calendar.ts';
import { createMysqlLiveMatchStore } from '../src/server/live-match/live-match-mysql-store.ts';
import { storedLiveMatchSnapshot } from '../src/server/live-match/live-match-read.ts';
import { MysqlServerUnavailableError } from './helpers/mysql-instance.mjs';
import { paidDatabase } from './helpers/paid-database.mjs';

const key = value => value.repeat(64), reason = expected => error => error?.reason === expected;
const policy = { coverage: [{ competitionId: 39, season: 2026 }], finalWindowMs: 86_400_000 };

test('live details on genuine MySQL use fenced stable ownership, bounded occurrence bodies and SELECT-only canonical access', { timeout: 180_000 }, async t => {
  let fixture;
  try { fixture = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => fixture.close());
  const { root, database } = fixture;
  await root.query(`CREATE TABLE FootballTeamProvider (provider VARCHAR(32) NOT NULL, externalId BIGINT UNSIGNED NOT NULL,
      teamId CHAR(36) NOT NULL, PRIMARY KEY(provider,externalId), INDEX(teamId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE FootballCompetitionProvider (provider VARCHAR(32) NOT NULL, externalId BIGINT UNSIGNED NOT NULL,
      competitionId CHAR(36) NOT NULL, PRIMARY KEY(provider,externalId)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE FootballSeason (id CHAR(36) PRIMARY KEY, competitionId CHAR(36) NOT NULL, year INT NOT NULL, coverage JSON NULL)
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE FootballFixture (id CHAR(36) PRIMARY KEY, provider VARCHAR(32) NOT NULL, externalId BIGINT UNSIGNED NOT NULL,
      activeCycleId CHAR(36) NULL, kickoff DATETIME(3) NULL, homeTeamId CHAR(36) NOT NULL, awayTeamId CHAR(36) NOT NULL,
      seasonId CHAR(36) NOT NULL, status VARCHAR(32) NOT NULL, retrievedAt DATETIME(3) NOT NULL)
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE PredictionCycle (id CHAR(36) PRIMARY KEY, fixtureId CHAR(36) NOT NULL, kickoffAt DATETIME(3) NOT NULL, UNIQUE KEY(id,fixtureId))
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE FixtureResultState (fixtureId CHAR(36) PRIMARY KEY, firstFinalAt DATETIME(3) NULL)
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
    CREATE TABLE PublicCacheTag (tag VARCHAR(64) PRIMARY KEY, generation BIGINT UNSIGNED NOT NULL)
      ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;`);
  await root.query(await readFile(new URL('../prisma/migrations/20261025170000_live_match_details/migration.sql', import.meta.url), 'utf8'));
  for (const table of ['FootballFixture', 'PredictionCycle', 'FootballTeamProvider', 'FootballCompetitionProvider', 'FootballSeason', 'FixtureResultState', 'PublicCacheTag'])
    await root.query(`GRANT SELECT ON goal_hint_test.${table} TO 'paid_application'@'127.0.0.1'`);
  for (const table of ['LiveMatchPollerLease', 'LiveMatchSnapshot'])
    await root.query(`GRANT SELECT,INSERT,UPDATE ON goal_hint_test.${table} TO 'paid_application'@'127.0.0.1'`);
  // The raw connector's Date result decoder uses local fields on Windows; production Prisma decodes UTC strings.
  const now = () => database.query(async tx => utcInstantFromEpochMilliseconds((await tx.$queryRaw`SELECT UTC_TIMESTAMP(3) AS at`)[0].at.getTime()));
  const initial = await now(), home = randomUUID(), away = randomUUID(), replacementHome = randomUUID(), season = randomUUID(), competition = randomUUID();
  const rawEpoch = Number((await root.query('SELECT CAST(UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000 AS UNSIGNED) AS at'))[0].at);
  assert.ok(Math.abs(rawEpoch - initial) < 5000, 'isolated UTC session clocks agree');
  await root.query("INSERT INTO FootballTeamProvider VALUES ('api-football',10,?),('api-football',20,?),('api-football',30,?)", [home, away, replacementHome]);
  await root.query("INSERT INTO FootballCompetitionProvider VALUES ('api-football',39,?)", [competition]);
  await root.query('INSERT INTO FootballSeason VALUES (?,?,2026,?)', [season, competition, JSON.stringify({ 'fixtures.events': true, 'fixtures.statistics_fixtures': true })]);
  async function seed(externalId, status = 'live', offset = 0) {
    const id = randomUUID(), kickoff = initial - 3_600_000, received = initial + offset;
    await root.query('INSERT INTO FootballFixture VALUES (?,\'api-football\',?,NULL,?,?,?,?,?,?)', [id, externalId, new Date(kickoff), home, away, season, status, new Date(received)]);
    return { id, kickoff };
  }
  const live = await seed(100), unselected = await seed(101), final = await seed(102, 'finished-regulation'), old = await seed(103, 'finished-regulation', -2 * 86_400_000);
  await seed(104, 'canceled');
  const cycle = randomUUID();
  await root.query('INSERT INTO PredictionCycle VALUES (?,?,?)', [cycle, live.id, new Date(live.kickoff)]);
  await root.query('UPDATE FootballFixture SET activeCycleId=? WHERE id=?', [cycle, live.id]);
  const store = createMysqlLiveMatchStore({ database, accountKey: key('a') });
  let lease;
  const read = target => database.query(tx => storedLiveMatchSnapshot(tx, { fixtureId: target.fixtureId, cycleId: target.cycleId, kickoffAt: target.kickoffAt, asOf: Date.now() + 1000 }));
  const generation = async () => Number((await root.query('SELECT generation FROM PublicCacheTag WHERE tag=?', [`fixture:${live.id}`]))[0]?.generation ?? 0);
  async function body(target, modifications = {}) {
    const at = await now();
    return { version: 1, fixtureId: target.fixtureId, cycleId: target.cycleId, kickoffAt: target.kickoffAt, status: target.status,
      collectedAt: at, staleAfterMs: 60_000,
      statistics: { state: 'available', retrievedAt: at - 1000, providerUpdatedAt: null, reason: null,
        items: [{ metric: 'corners', unit: 'count', home: 0, away: 3 }, { metric: 'possession', unit: 'percent', home: 45, away: 55 }] },
      events: { state: 'available', retrievedAt: at - 1000, providerUpdatedAt: null, reason: null,
        items: [{ sequence: 1, elapsed: 10, extra: null, team: 'away', type: 'goal', detail: 'Normal Goal', player: 'Synthetic player', assist: null, comments: null }] },
      ...modifications };
  }
  async function due() { return store.due(policy, await now(), 100); }
  async function target(id) { return (await due()).find(value => value.fixtureId === id); }

  await t.test('one stable account owns the cold-start lease; covered unselected fixtures are included and old finals excluded', async () => {
    const owned = await Promise.all([store.acquire(key('b'), 600_000), store.acquire(key('c'), 600_000)]);
    assert.equal(owned.filter(Boolean).length, 1); lease = owned.find(Boolean);
    const targets = await due();
    assert.deepEqual(new Set(targets.map(value => value.fixtureId)), new Set([live.id, unselected.id, final.id]));
    assert.ok(!targets.some(value => value.fixtureId === old.id));
    assert.equal(targets.find(value => value.fixtureId === unselected.id).cycleId, null);
    assert.equal(targets[0].statisticsCoverage, true);
    const first = targets[0]; await store.schedule(lease, first, await now() + 60_000);
    assert.equal((await due()).some(value => value.fixtureId === first.fixtureId), false);
    await root.query('UPDATE LiveMatchSnapshot SET nextPollAt=attemptedAt');
  });
  await t.test('snapshots replace a single bounded body, preserve zeros and invalidate cached detail only on data change', async () => {
    const item = await target(live.id); await store.schedule(lease, item, await now() + 60_000);
    assert.equal(await read(item), null); assert.equal(await generation(), 0);
    const value = await body(item); await store.save(lease, item, value, value.collectedAt + 60_000, 0);
    assert.deepEqual(await read(item), value); assert.equal((await read(item)).statistics.items[0].home, 0); assert.equal(await generation(), 1);
    await store.schedule(lease, item, await now() + 60_000); assert.equal(await generation(), 1);
    const corrected = await body(item, { events: { ...value.events, items: [] } });
    await store.save(lease, item, corrected, corrected.collectedAt + 60_000, 0);
    assert.equal(await generation(), 2); assert.equal((await read(item)).events.items.length, 0);
    assert.equal(Number((await root.query('SELECT COUNT(*) AS count FROM LiveMatchSnapshot WHERE fixtureId=?', [live.id]))[0].count), 1);
    await assert.rejects(store.save(lease, item, value, corrected.collectedAt + 60_000, 0), reason('invalid-request'));
    await assert.rejects(database.query(tx => tx.$executeRaw`DELETE FROM LiveMatchSnapshot WHERE id=${item.occurrenceId}`));
    await assert.rejects(root.query('UPDATE LiveMatchSnapshot SET integrity=? WHERE id=?', [key('d'), item.occurrenceId]), /integrity|protected/);
  });
  await t.test('final details and later event corrections retain one row; first-final clock is protected', async () => {
    await root.query("UPDATE FootballFixture SET status='finished-regulation',retrievedAt=UTC_TIMESTAMP(3) WHERE id=?", [live.id]);
    await root.query('UPDATE LiveMatchSnapshot SET nextPollAt=attemptedAt WHERE fixtureId=?', [live.id]);
    const item = await target(live.id); assert.equal(item.previous.status, 'live');
    await store.schedule(lease, item, await now() + 60_000);
    const value = await body(item); await store.save(lease, item, value, value.collectedAt + 60_000, 0);
    const firstFinal = (await root.query('SELECT firstFinalAt FROM LiveMatchSnapshot WHERE fixtureId=?', [live.id]))[0].firstFinalAt;
    await store.schedule(lease, item, await now() + 60_000);
    const corrected = await body(item, { events: { ...value.events, items: [] } });
    await store.save(lease, item, corrected, corrected.collectedAt + 60_000, 0);
    assert.equal((await read(item)).status, 'finished-regulation'); assert.equal((await read(item)).events.items.length, 0);
    assert.equal(Number((await root.query('SELECT COUNT(*) AS count FROM LiveMatchSnapshot WHERE fixtureId=?', [live.id]))[0].count), 1);
    assert.equal((await root.query('SELECT firstFinalAt FROM LiveMatchSnapshot WHERE fixtureId=?', [live.id]))[0].firstFinalAt.getTime(), firstFinal.getTime());
    await assert.rejects(root.query('UPDATE LiveMatchSnapshot SET firstFinalAt=DATE_ADD(firstFinalAt,INTERVAL 1 SECOND) WHERE fixtureId=?', [live.id]), /protected/);
  });
  await t.test('rescheduling and same-kickoff participant corrections cannot relabel stored details; old occurrence remains retained', async () => {
    await root.query('UPDATE LiveMatchSnapshot SET nextPollAt=attemptedAt WHERE fixtureId=?', [live.id]);
    const previous = await target(live.id), nextCycle = randomUUID(), kickoff = live.kickoff + 86_400_000;
    await root.query('INSERT INTO PredictionCycle VALUES (?,?,?)', [nextCycle, live.id, new Date(kickoff)]);
    await root.query("UPDATE FootballFixture SET activeCycleId=?,kickoff=?,status='live' WHERE id=?", [nextCycle, new Date(kickoff), live.id]);
    await assert.rejects(store.schedule(lease, previous, await now() + 60_000), reason('invalid-request'));
    assert.equal(await read(previous), null);
    const replacement = await target(live.id); assert.notEqual(replacement.occurrenceId, previous.occurrenceId); assert.equal(replacement.previous, null);
    await store.schedule(lease, replacement, await now() + 60_000);
    const value = await body(replacement); await store.save(lease, replacement, value, value.collectedAt + 60_000, 0);
    assert.equal(Number((await root.query('SELECT COUNT(*) AS count FROM LiveMatchSnapshot WHERE fixtureId=?', [live.id]))[0].count), 2);
    await root.query('UPDATE FootballFixture SET homeTeamId=? WHERE id=?', [replacementHome, live.id]);
    assert.equal(await read(replacement), null);
    await assert.rejects(store.save(lease, replacement, await body(replacement), await now() + 60_000, 0), reason('invalid-request'));
    assert.equal((await target(live.id)).previous, null);
  });
  await t.test('ambiguous home or away provider mappings are excluded and cannot authorize a previously selected write', async () => {
    const item = await target(unselected.id); await store.schedule(lease, item, await now() + 60_000);
    const value = await body(item);
    await root.query('UPDATE LiveMatchSnapshot SET nextPollAt=attemptedAt WHERE fixtureId=?', [unselected.id]);
    assert.equal((await due()).filter(candidate => candidate.fixtureId === unselected.id).length, 1);
    for (const [team, externalId] of [[home, 1010], [away, 1020]]) {
      await root.query("INSERT INTO FootballTeamProvider VALUES ('api-football',?,?)", [externalId, team]);
      assert.equal((await due()).some(candidate => candidate.fixtureId === unselected.id), false);
      await assert.rejects(store.schedule(lease, item, await now() + 60_000), reason('invalid-request'));
      await assert.rejects(store.save(lease, item, value, value.collectedAt + 60_000, 0), reason('invalid-request'));
      await root.query("DELETE FROM FootballTeamProvider WHERE provider='api-football' AND externalId=?", [externalId]);
    }
    await root.query('UPDATE LiveMatchSnapshot SET nextPollAt=attemptedAt WHERE fixtureId=?', [unselected.id]);
    assert.equal((await due()).filter(candidate => candidate.fixtureId === unselected.id).length, 1);
  });
  await t.test('expired ownership is fenced out of writes and cannot release its replacement', async () => {
    await root.query('UPDATE LiveMatchPollerLease SET leaseUntil=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND)');
    const successor = await store.acquire(key('e'), 600_000); assert.equal(successor.fence, lease.fence + 1n);
    const item = await target(unselected.id);
    await assert.rejects(store.schedule(lease, item, await now() + 60_000), reason('lost-lease'));
    await store.release(lease); assert.equal(await store.acquire(key('f'), 600_000), null);
    await store.release(successor); assert.ok(await store.acquire(key('f'), 600_000));
  });
});

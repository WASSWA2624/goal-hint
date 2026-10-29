import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSharedSlips } from '../src/server/slips/shared-slips.ts';
import { createAuthenticatedTestSessions } from './helpers/member-fixtures.mjs';
import { liveRecord } from './helpers/live-refresh-fixtures.mjs';
import { MysqlServerUnavailableError } from './helpers/mysql-instance.mjs';
import { paidDatabase } from './helpers/paid-database.mjs';

test('shared slips survive retries and source/account expiry under insert-only MySQL privileges', { timeout: 180000 }, async t => {
  let f;
  try { f = await paidDatabase(); }
  catch (error) { if (!(error instanceof MysqlServerUnavailableError)) throw error; t.skip(error.message); return; }
  t.after(() => f.close());
  const { database, root, config } = f;
  await root.query(await readFile(new URL('../prisma/migrations/20261029180000_shared_slips/migration.sql', import.meta.url), 'utf8'));
  await root.query("GRANT SELECT, INSERT ON goal_hint_test.SharedSlip TO 'paid_application'@'127.0.0.1'");
  const at = Date.parse('2026-10-29T09:00:00Z');
  const sessions = createAuthenticatedTestSessions({ database, config, now: () => at });
  const registered = await sessions.signIn('256700003091', '198.51.100.40');
  const member = { ...await sessions.verify(registered.token), administrator: true };
  assert.ok(member.accountId);
  const record = liveRecord();
  const slip = { id: 'sealed-editorial-test', selections: [{ fixtureId: '10000000-0000-4000-8000-000000000099', kickoffAt: at - 3600000,
    homeTeam: record.homeTeam, awayTeam: record.awayTeam, competition: record.competition, family: 'match-result',
    selection: 'home-win', probability: 0.7, odds: '2.00', oddsBasis: 'bookmaker' }],
    totalOdds: '2.00', oddsBasis: 'bookmaker', averageProbability: 0.7 };
  const service = createSharedSlips(database, config, () => at);
  const first = await service.publish(member, slip, 'best');
  assert.equal(first.state, 'shared');
  const retried = await service.publish(member, slip, 'best');
  assert.deepEqual(retried, first);
  assert.equal((await root.query('SELECT COUNT(*) AS count FROM SharedSlip'))[0].count, 1n);
  assert.doesNotMatch(JSON.stringify(first.shared), /accountId|ownerKey|fingerprint|256700/u);
  await root.query('UPDATE MemberAccount SET erasedAt=?, phone=NULL WHERE id=?', [new Date(at + 1000), member.accountId]);
  const readLater = createSharedSlips(database, config, () => at + 366 * 86400000);
  assert.deepEqual(await readLater.read(first.shared.id), first.shared);
  await assert.rejects(root.query('UPDATE SharedSlip SET createdAt=createdAt WHERE id=?', [first.shared.id]), /immutable/u);
  await assert.rejects(root.query('DELETE FROM SharedSlip WHERE id=?', [first.shared.id]), /permanent/u);
  await assert.rejects(database.query(tx => tx.$executeRaw`UPDATE SharedSlip SET createdAt=createdAt WHERE id=${first.shared.id}`));
});

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';
import { BackupError, backupHealth, parseBackupPolicy } from '../scripts/lib/backup-contract.mjs';
import { backupText, decryptBackup, sealBackup, verifyBackup } from '../scripts/lib/backup-crypto.mjs';
import { captureMysqlSnapshot, validateLogChain, withRestoredMysql } from '../scripts/lib/backup-engine.mjs';
import { executeBackupCommand } from '../scripts/backup.mjs';
import { backupPolicy, backupAuthority } from './helpers/backup-fixtures.mjs';
import { assessBackupHealth } from '../src/server/monitoring/monitoring-backup.ts';
import { evaluateMonitoring } from '../src/server/monitoring/monitoring-rules.ts';
import { monitoringPolicy, monitoringSnapshot } from './helpers/monitoring-fixtures.mjs';

test('encrypted streaming artifacts authenticate headers/body/tag/key and never overwrite an existing backup', async () => {
  const root = path.resolve('.tmp'); await mkdir(root, { recursive: true }); const directory = await mkdtemp(path.join(root, 'backup-crypto-'));
  try {
    const artifact = path.join(directory, 'snapshot.ghb'), key = randomBytes(32), options = { key, keyRef: 'synthetic-key' }, metadata = { kind: 'synthetic', approval: 'synthetic-proof' };
    const plaintext = 'Synthetic SQL, no provider credentials.\n'.repeat(10000);
    await sealBackup(artifact, backupText(plaintext), { ...options, metadata });
    assert.deepEqual(await verifyBackup(artifact, options), metadata);
    let restored = ''; await decryptBackup(artifact, options, new Writable({ write(chunk, _encoding, done) { restored += chunk.toString(); done(); } }));
    assert.equal(restored, plaintext);
    const original = await readFile(artifact); assert.ok(!original.includes(Buffer.from('Synthetic SQL')));
    await assert.rejects(sealBackup(artifact, backupText('overwrite'), { ...options, metadata }), BackupError); assert.deepEqual(await readFile(artifact), original);
    await assert.rejects(verifyBackup(artifact, { ...options, key: randomBytes(32) }), BackupError);
    await assert.rejects(verifyBackup(artifact, { ...options, keyRef: 'wrong-key' }), BackupError);
    for (const position of [0, 15, original.length - 30, original.length - 1]) {
      const corrupt = Buffer.from(original); corrupt[position] ^= 1; const file = path.join(directory, `corrupt-${position}.ghb`); await writeFile(file, corrupt);
      await assert.rejects(verifyBackup(file, options), BackupError);
    }
    const truncated = path.join(directory, 'truncated.ghb'); await writeFile(truncated, original.subarray(0, original.length - 10)); await assert.rejects(verifyBackup(truncated, options), BackupError);
  } finally {
    // mkdtemp is our owned immediate child; no operator-supplied paths are removed.
    const actual = await realpath(directory), parent = await realpath(root);
    assert.equal(path.relative(await realpath('.'), parent), '.tmp');
    assert.equal(path.dirname(actual), parent); assert.ok(path.basename(actual).startsWith('backup-crypto-')); await rm(actual, { recursive: true });
  }
});
test('live backup decisions and authority are mandatory; refusal occurs before target, secret or filesystem access', async () => {
  assert.throws(() => parseBackupPolicy(backupPolicy({ mode: 'live' })), BackupError);
  assert.throws(() => parseBackupPolicy(backupPolicy({ unexpected: true })), BackupError);
  let touched = false;
  const options = { policy: backupPolicy(), authority: backupAuthority({ authorize: () => false }),
    get source() { touched = true; throw new Error('must not open source'); }, get directory() { touched = true; throw new Error('must not open artifact'); } };
  await assert.rejects(captureMysqlSnapshot(options), (e) => e.reason === 'unauthorized');
  await assert.rejects(withRestoredMysql(options, () => {}), (e) => e.reason === 'unauthorized'); assert.equal(touched, false);
  await assert.rejects(executeBackupCommand(['restore'], null), (e) => e.reason === 'binding-required');
  await assert.rejects(executeBackupCommand(['restore'], {}), (e) => e.reason === 'verification-required');
  await assert.rejects(executeBackupCommand(['drop-production'], {}), BackupError);
});
test('binary-log chain rejects gaps, reorder, duplicates, foreign backups, traversal and backwards positions', () => {
  const snapshot = { id: 'synthetic-snapshot', identity: { uuid: 'synthetic-server' }, point: { file: 'binlog.000003', position: 100, at: 1000 }, policyHash: 'synthetic-policy' };
  const chain = { kind: 'mysql-recovery-point', snapshotId: snapshot.id, identity: snapshot.identity, policyHash: snapshot.policyHash,
    start: snapshot.point, end: { file: 'binlog.000004', position: 200, at: 2000 }, files: [3,4].map((n) => ({ name: `binlog.00000${n}`, artifact: `binlog-${n}.ghb`, hash: 'a'.repeat(64) })) };
  validateLogChain(snapshot, chain);
  for (const change of [ { files: chain.files.slice(1) }, { files: [...chain.files].reverse() }, { files: [chain.files[0],chain.files[0]] },
    { snapshotId: 'other' }, { identity: { uuid: 'other' } }, { files: [{ ...chain.files[0], artifact: '../private' },chain.files[1]] },
    { end: { file: 'binlog.000003', position: 90, at: 2000 }, files: chain.files.slice(0,1) } ]) assert.throws(() => validateLogChain(snapshot, { ...chain, ...change }), BackupError);
});
test('backup telemetry labels unapproved objectives honestly and contains only allowlisted data', () => {
  const health = backupHealth({ operation: 'restore', status: 'succeeded', startedAt: 1000, finishedAt: 2000, recoverableAt: 500, policy: backupPolicy() });
  assert.equal(health.objective, 'unapproved'); assert.equal(health.durationMs, 1000);
  assert.deepEqual(Object.keys(health), ['event','operation','status','startedAt','finishedAt','durationMs','recoverableAt','objective','reason']);
});
test('private backup health evaluates approved cadence and leaves missing, stale or revoked proof pending', () => {
  const at = Date.now(), evidence = { evidenceRef: 'synthetic-backup-health', measuredAt: at,
    snapshotAt: at - 1000, archiveAt: at - 1000, restoreAt: at - 1000, failureCount: 0,
    snapshotMaxAgeMs: 5000, archiveMaxAgeMs: 5000, restoreMaxAgeMs: 5000 };
  const healthy = assessBackupHealth(evidence, at, 5000, () => true);
  assert.deepEqual(Object.values(healthy), [0,0,0]);
  for (const input of [null, { ...evidence, measuredAt: at - 6000 }, { ...evidence, measuredAt: at + 1 }, { ...evidence, rawPayload: 'private' }]) {
    assert.ok(Object.values(assessBackupHealth(input, at, 5000, () => true)).every((v) => v === null));
  }
  assert.ok(Object.values(assessBackupHealth(evidence, at, 5000, () => false)).every((v) => v === null));
  const metrics = assessBackupHealth({ ...evidence, snapshotAt: at - 6000, restoreAt: null, failureCount: 2 }, at, 5000, () => true);
  assert.deepEqual(Object.values(metrics), [2,1,1]);
  const policy = monitoringPolicy(); policy.thresholds.failureCount = 3;
  const snapshot = monitoringSnapshot(at); Object.assign(snapshot.metrics, metrics);
  const rules = evaluateMonitoring(snapshot, policy);
  assert.equal(rules.find((r) => r.rule === 'backup-stale').active, true);
  assert.equal(rules.find((r) => r.rule === 'restore-verification-pending').active, true);
  assert.equal(rules.find((r) => r.rule === 'backup-failures').active, false);
});

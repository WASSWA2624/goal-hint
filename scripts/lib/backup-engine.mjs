import 'server-only';

import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { authorizeBackup, backupHealth, BackupError, failBackup, parseBackupPolicy, sha256 } from './backup-contract.mjs';
import { backupText, decryptBackup, sealBackup, verifyBackup } from './backup-crypto.mjs';
import { mysqlChild, ownedMysqlSource, repositoryCompatibility, repositoryMigrations } from './mysql-backup.mjs';
import { isOwnedMysql, startIsolatedMysql } from './isolated-mysql.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const logNumber = (name) => { if (!/^binlog\.\d{6}$/u.test(name)) failBackup('invalid-log-chain'); return Number(name.slice(-6)); };
async function point(source) {
  const rows = await source.query('SHOW BINARY LOG STATUS');
  if (rows.length !== 1) failBackup('binlogs-unavailable');
  const [file, position] = rows[0].split('\t'); logNumber(file);
  const value = Number(position); if (!Number.isSafeInteger(value) || value < 4) failBackup('invalid-log-chain');
  const [at] = await source.query('SELECT CAST(ROUND(UNIX_TIMESTAMP(UTC_TIMESTAMP(3))*1000) AS UNSIGNED)');
  return { file, position: value, at: Number(at) };
}
async function compatible(inventory) {
  if (!same(inventory.migrations, await repositoryMigrations())) failBackup('incompatible-schema');
}
function telemetry(options, event) {
  // Telemetry failure cannot undo a successful durable artifact or expose raw errors.
  try { void Promise.resolve(options.emit?.(event)).catch(() => {}); } catch { /* Private adapter unavailable. */ }
}
async function operation(options, kind, run) {
  const policy = parseBackupPolicy(options.policy), startedAt = Date.now();
  try {
    await authorizeBackup(options.authority, policy, kind);
    const result = await run(policy);
    telemetry(options, backupHealth({ operation: kind, status: 'succeeded', startedAt, finishedAt: Date.now(), policy, recoverableAt: result.recoverableAt ?? null }));
    return result;
  } catch (error) {
    telemetry(options, backupHealth({ operation: kind, status: 'failed', startedAt, finishedAt: Date.now(), policy,
      reason: error instanceof BackupError ? error.reason : 'unavailable' }));
    if (error instanceof BackupError) throw error; failBackup('unavailable');
  }
}

/** Suitable for a one-shot scheduler binding; scheduling/retention have no defaults. */
export async function captureMysqlSnapshot(options) {
  return operation(options, 'snapshot', async (policy) => {
    const { source } = options;
    if (policy.mode === 'local-verification' && !isOwnedMysql(source.ownedInstance)) failBackup('unsafe-target');
    if (await options.authority.verifyStorage(options.directory, policy) !== true) failBackup('unsafe-storage');
    await source.assertQuiescence();
    const identity = await source.identity(); if (!identity.logBin || identity.format !== 'ROW') failBackup('binlogs-unavailable');
    const inventory = await source.inventory(); await compatible(inventory);
    const start = await point(source), id = randomUUID();
    const metadata = { kind: 'mysql-snapshot', version: 1, id, identity, inventory, point: start, compatibility: await repositoryCompatibility(),
      policy, policyHash: sha256(JSON.stringify(policy)), grantsRef: policy.grantsRef, quarantined: true };
    await mkdir(options.directory, { recursive: false, mode: 0o700 });
    const artifact = path.join(options.directory, 'snapshot.ghb'), dump = source.dump(); dump.child.stdin.end();
    let prefix = '';
    const scan = new Transform({ transform(chunk, _encoding, done) { if (prefix.length < 65536) prefix += chunk.toString('utf8').slice(0, 65536 - prefix.length); done(null, chunk); } });
    dump.child.stdout.pipe(scan);
    try {
      await Promise.all([sealBackup(artifact, scan, { key: options.key, keyRef: policy.keyRef, metadata }), dump.done]);
      const match = /CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='([^']+)', SOURCE_LOG_POS=(\d+)/u.exec(prefix);
      if (!match || match[1] !== start.file || Number(match[2]) !== start.position) failBackup('inconsistent-snapshot');
      await source.assertQuiescence();
      const after = await point(source);
      if (start.file !== after.file || start.position !== after.position || !same(inventory, await source.inventory())) failBackup('writes-not-fenced');
      await authorizeBackup(options.authority, policy, 'snapshot');
      await verifyBackup(artifact, { key: options.key, keyRef: policy.keyRef });
      return { artifact, metadata, recoverableAt: start.at };
    } catch (error) {
      dump.child.kill(); await dump.done.catch(() => {}); await rm(artifact, { force: true }); throw error;
    }
  });
}

/** Closed log export for the owned local drill. Hosted log transport is a separate capability. */
export async function archiveOwnedMysqlLogs(options) {
  return operation(options, 'binlog', async (policy) => {
    const { source, snapshot } = options, instance = source.ownedInstance;
    if (!isOwnedMysql(instance)) failBackup('unsupported-hosted-log-export');
    if (await options.authority.verifyStorage(options.directory, policy) !== true) failBackup('unsafe-storage');
    await source.assertQuiescence();
    const identity = await source.identity(), end = await point(source), inventory = await source.inventory();
    if (!same(identity, snapshot.metadata.identity) || !same(inventory.migrations, snapshot.metadata.inventory.migrations)) failBackup('source-mismatch');
    const first = logNumber(snapshot.metadata.point.file), last = logNumber(end.file);
    if (first > last) failBackup('invalid-log-chain');
    // Rotation closes the log that contains the exact end-of-transaction point.
    await source.query('FLUSH BINARY LOGS');
    const files = [];
    for (let number = first; number <= last; number++) {
      await instance.assertOwnership(); await authorizeBackup(options.authority, policy, 'binlog');
      const name = `binlog.${String(number).padStart(6, '0')}`, file = path.join(instance.directory, name);
      if (path.dirname(await realpath(file)) !== await realpath(instance.directory)) failBackup('unsafe-storage');
      // Local verifier deliberately bounds log memory; use managed/streamed archives at scale.
      if ((await stat(file)).size > 64 * 1024 * 1024) failBackup('log-too-large');
      const hash = sha256(await readFile(file)), artifact = `binlog-${number}.ghb`;
      const metadata = { kind: 'mysql-binlog', version: 1, name, hash, snapshotId: snapshot.metadata.id, identity };
      await sealBackup(path.join(options.directory, artifact), createReadStream(file), { key: options.key, keyRef: policy.keyRef, metadata });
      files.push({ artifact, name, hash });
    }
    await source.assertQuiescence();
    if (!same(inventory, await source.inventory())) failBackup('writes-not-fenced');
    const recoveryPoint = { kind: 'mysql-recovery-point', version: 1, snapshotId: snapshot.metadata.id, identity, inventory,
      start: snapshot.metadata.point, end, files, policyHash: snapshot.metadata.policyHash };
    const artifact = path.join(options.directory, 'recovery-point.ghb');
    await authorizeBackup(options.authority, policy, 'binlog');
    await sealBackup(artifact, backupText(JSON.stringify(recoveryPoint)), { key: options.key, keyRef: policy.keyRef, metadata: recoveryPoint });
    return { artifact, metadata: recoveryPoint, recoverableAt: end.at };
  });
}

export function validateLogChain(snapshot, recoveryPoint) {
  if (recoveryPoint.kind !== 'mysql-recovery-point' || recoveryPoint.snapshotId !== snapshot.id || !same(recoveryPoint.identity, snapshot.identity) ||
    !same(recoveryPoint.start, snapshot.point) || recoveryPoint.policyHash !== snapshot.policyHash) failBackup('invalid-log-chain');
  const first = logNumber(recoveryPoint.start.file), last = logNumber(recoveryPoint.end.file);
  if (!Array.isArray(recoveryPoint.files) || recoveryPoint.files.length !== last - first + 1 || last < first ||
    !Number.isSafeInteger(recoveryPoint.end.position) || recoveryPoint.end.position < 4 ||
    first === last && recoveryPoint.end.position < recoveryPoint.start.position || recoveryPoint.end.at < recoveryPoint.start.at) failBackup('invalid-log-chain');
  recoveryPoint.files.forEach((file, i) => {
    if (file.name !== `binlog.${String(first + i).padStart(6, '0')}` || file.artifact !== `binlog-${first + i}.ghb` || !/^[a-f0-9]{64}$/u.test(file.hash)) failBackup('invalid-log-chain');
  });
}

/** Only this function allocates the restore target. It has no target URL argument. */
export async function withRestoredMysql(options, inspect) {
  return operation(options, 'restore', async (policy) => {
    if (await options.authority.verifyStorage(options.directory, policy) !== true) failBackup('unsafe-storage');
    const crypto = { key: options.key, keyRef: policy.keyRef };
    const snapshot = await verifyBackup(path.join(options.directory, 'snapshot.ghb'), crypto);
    if (snapshot.kind !== 'mysql-snapshot' || snapshot.policyHash !== sha256(JSON.stringify(snapshot.policy)) ||
      snapshot.policyHash !== sha256(JSON.stringify(policy)) || snapshot.quarantined !== true) failBackup('invalid-artifact');
    await compatible(snapshot.inventory);
    if (!same(snapshot.compatibility, await repositoryCompatibility())) failBackup('incompatible-release');
    let recoveryPoint;
    if (options.pitr === true) {
      recoveryPoint = await verifyBackup(path.join(options.directory, 'recovery-point.ghb'), crypto); validateLogChain(snapshot, recoveryPoint);
      await compatible(recoveryPoint.inventory);
      // Authenticate every segment before starting any SQL or allocating a target.
      for (const file of recoveryPoint.files) {
        const metadata = await verifyBackup(path.join(options.directory, file.artifact), crypto);
        if (metadata.kind !== 'mysql-binlog' || metadata.snapshotId !== snapshot.id || metadata.name !== file.name ||
          metadata.hash !== file.hash || !same(metadata.identity, snapshot.identity)) failBackup('invalid-log-chain');
      }
    }
    await authorizeBackup(options.authority, policy, 'restore');
    const instance = await startIsolatedMysql({ databaseName: snapshot.identity.database });
    try {
      const target = await ownedMysqlSource(instance);
      if ((await target.query('SHOW TABLES')).length) failBackup('unsafe-target');
      // Recreate only reviewed database-scoped roles/trigger definers with fresh secrets.
      // This trusted binding never imports mysql.* accounts or source root grants.
      await options.prepareTarget?.(instance, snapshot.grantsRef);
      await instance.assertOwnership(); await authorizeBackup(options.authority, policy, 'restore');
      const load = mysqlChild(target.binary('mysql'), target.clientArgs);
      load.child.stdout.resume();
      try { await Promise.all([decryptBackup(path.join(options.directory, 'snapshot.ghb'), crypto, load.child.stdin), load.done]); }
      finally { load.child.kill(); await load.done.catch(() => {}); }
      if (!same(await target.inventory(), snapshot.inventory)) failBackup('snapshot-integrity-failed');
      if (recoveryPoint) {
        const plaintextLogs = [];
        for (const file of recoveryPoint.files) {
          const plaintext = path.join(instance.directory, file.name);
          await decryptBackup(path.join(options.directory, file.artifact), crypto, createWriteStream(plaintext, { flags: 'wx', mode: 0o600 }));
          if (sha256(await readFile(plaintext)) !== file.hash) failBackup('invalid-log-chain'); plaintextLogs.push(plaintext);
        }
        await instance.assertOwnership(); await authorizeBackup(options.authority, policy, 'restore');
        // One mysqlbinlog invocation and one mysql session retain transaction/session state across rotations.
        const logs = mysqlChild(target.binary('mysqlbinlog'), ['--no-defaults', '--verify-binlog-checksum', '--disable-log-bin',
          `--start-position=${recoveryPoint.start.position}`, `--stop-position=${recoveryPoint.end.position}`, ...plaintextLogs]); logs.child.stdin.end();
        const apply = mysqlChild(target.binary('mysql'), target.clientArgs); apply.child.stdout.resume();
        try { await Promise.all([pipeline(logs.child.stdout, apply.child.stdin), logs.done, apply.done]); }
        finally { logs.child.kill(); apply.child.kill(); await Promise.allSettled([logs.done, apply.done]); }
        for (const file of plaintextLogs) await rm(file);
        if (!same(await target.inventory(), recoveryPoint.inventory)) failBackup('replay-integrity-failed');
      }
      await authorizeBackup(options.authority, policy, 'restore');
      const point = recoveryPoint?.end ?? snapshot.point;
      const result = await inspect({ instance, target, snapshot, recoveryPoint, quarantined: true });
      return { result, recoverableAt: point.at, recoverablePosition: { file: point.file, position: point.position },
        demonstratedLagMs: Math.max(0, Date.now() - point.at), objective: policy.rpoMs === null ? 'unapproved' : Date.now() - point.at <= policy.rpoMs ? 'met' : 'missed' };
    } finally { await instance.stop(); }
  });
}

import 'server-only';

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { BackupError, failBackup } from './lib/backup-contract.mjs';
import { archiveOwnedMysqlLogs, captureMysqlSnapshot, withRestoredMysql } from './lib/backup-engine.mjs';
import { assertOperationAllowed, getRuntimePolicy } from '../src/server/config/runtime-policy.ts';

export async function executeBackupCommand(args, binding) {
  if (args.length !== 1 || !['snapshot','archive','restore','restore-pitr'].includes(args[0])) failBackup('invalid-command');
  if (!binding) failBackup('binding-required');
  if (args[0] === 'snapshot') return captureMysqlSnapshot(binding);
  if (args[0] === 'archive') return archiveOwnedMysqlLogs(binding);
  if (typeof binding.verifyRestored !== 'function') failBackup('verification-required');
  return withRestoredMysql({ ...binding, pitr: args[0] === 'restore-pitr' }, binding.verifyRestored);
}
async function main() {
  const [operation, flag, file, ...rest] = process.argv.slice(2);
  if (rest.length || flag !== '--binding' || !file || !path.isAbsolute(file)) failBackup('binding-required');
  // This is trusted operator code, never an HTTP parameter, JSON policy or visitor input.
  const adapter = await import(pathToFileURL(file).href);
  if (typeof adapter.createBackupBinding !== 'function') failBackup('binding-required');
  const runtime = getRuntimePolicy(), configured = await adapter.createBackupBinding(runtime);
  const binding = { ...configured, emit: configured.emit ?? ((event) => console.log(JSON.stringify(event))) };
  try {
    if (binding.policy?.mode === 'live' && ['snapshot','archive'].includes(operation)) assertOperationAllowed(runtime, 'database', binding.verifyDatabaseEvidence);
    await executeBackupCommand([operation], binding); console.log('Private backup operation completed; see approved backup-health evidence.');
  }
  finally { await binding.close?.(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(); } catch (error) {
    console.error(error instanceof BackupError ? error.message : 'Backup operation failed; private diagnostics are withheld.'); process.exitCode = 1;
  }
}

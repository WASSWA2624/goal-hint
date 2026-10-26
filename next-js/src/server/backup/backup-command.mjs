import 'server-only';

import { failBackup } from './backup-contract.mjs';
import { archiveOwnedMysqlLogs, captureMysqlSnapshot, withRestoredMysql } from './backup-engine.mjs';

export async function executeBackupCommand(args, binding) {
  if (args.length !== 1 || !['snapshot','archive','restore','restore-pitr'].includes(args[0])) failBackup('invalid-command');
  if (!binding) failBackup('binding-required');
  if (args[0] === 'snapshot') return captureMysqlSnapshot(binding);
  if (args[0] === 'archive') return archiveOwnedMysqlLogs(binding);
  if (typeof binding.verifyRestored !== 'function') failBackup('verification-required');
  return withRestoredMysql({ ...binding, pitr: args[0] === 'restore-pitr' }, binding.verifyRestored);
}

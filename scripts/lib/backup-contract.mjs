import 'server-only';

import { createHash } from 'node:crypto';
import { z } from 'zod';

export class BackupError extends Error {
  constructor(reason) { super(`Backup operation ${reason}; private diagnostics are withheld.`); this.name = 'BackupError'; this.reason = reason; }
}
export const failBackup = (reason) => { throw new BackupError(reason); };
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const ref = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u);
const milliseconds = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const retention = z.strictObject({ predictions: milliseconds, results: milliseconds, evidence: milliseconds,
  audits: milliseconds, structured: milliseconds, backups: milliseconds, binlogs: milliseconds, policyRef: ref });
export const backupPolicySchema = z.strictObject({ version: z.literal(1), mode: z.enum(['local-verification', 'live']),
  evidenceRef: ref, owner: ref.nullable(), keyRef: ref, grantsRef: ref, permissionsRef: ref, releaseRef: ref,
  rpoMs: milliseconds.nullable(), rtoMs: milliseconds.nullable(), retention: retention.nullable(),
}).refine((v) => v.mode === 'local-verification' || v.owner !== null && v.rpoMs !== null && v.rtoMs !== null && v.retention !== null);
export function parseBackupPolicy(value) {
  const result = backupPolicySchema.safeParse(value); if (!result.success) failBackup('invalid-policy');
  return Object.freeze(result.data);
}
export async function authorizeBackup(authority, policy, operation) {
  let allowed = false;
  try { allowed = await authority.verifyPolicy(policy) === true && await authority.authorize(operation) === true; } catch { /* Redacted. */ }
  if (!allowed) failBackup('unauthorized');
}
export function backupHealth({ operation, status, startedAt, finishedAt, recoverableAt = null, policy, reason = null }) {
  // These events contain no paths, database identifiers, source contents or credentials.
  return Object.freeze({ event: 'backup-health', operation, status, startedAt, finishedAt,
    durationMs: Math.max(0, finishedAt - startedAt), recoverableAt,
    objective: policy.rtoMs === null || operation !== 'restore' ? 'unapproved' : finishedAt - startedAt <= policy.rtoMs ? 'met' : 'missed',
    reason });
}

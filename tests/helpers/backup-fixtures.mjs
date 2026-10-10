export const backupPolicy = (changes = {}) => ({ version: 1, mode: 'local-verification', evidenceRef: 'synthetic-backup-proof',
  owner: null, keyRef: 'synthetic-ephemeral-key', grantsRef: 'synthetic-application-grants', permissionsRef: 'synthetic-source-permissions', releaseRef: 'synthetic-application-release',
  rpoMs: null, rtoMs: null, retention: null, ...changes });
export const backupAuthority = (changes = {}) => ({ authorize: () => true, verifyPolicy: () => true, verifyStorage: () => true, ...changes });

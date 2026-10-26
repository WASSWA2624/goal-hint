/** Public cache limits shared by the projection, saved view and update controller. */
export const offlineRules = Object.freeze({ schemaVersion: 1, maximumRecords: 30,
  retentionMs: 24 * 60 * 60 * 1000, maximumSnapshotBytes: 128 * 1024,
  clockSkewMs: 5 * 60 * 1000 });

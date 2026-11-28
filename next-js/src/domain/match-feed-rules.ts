export const matchFeedRules = Object.freeze({ maximumQueryBytes: 2048, maximumResponseBytes: 1_048_576,
  searchWindowMs: 60_000, searchRequestsPerWindow: 120 });

export const maximumFeedWindowRecords = 300;
export const maximumFeedContinuationRecords = 1_000;
/** Continuation pages retain their individual limit. A rebase can carry several pages. */
export const maximumFeedWindowBytes = 6 * matchFeedRules.maximumResponseBytes;

/** Outcome counts for an entire selected cohort, independent of visible pagination. */
export type PerformanceSummaryCounts = Readonly<{
  total: number;
  won: number;
  lost: number;
  pending: number;
  void?: number;
  unavailable?: number;
  filteredOut?: number;
}>;

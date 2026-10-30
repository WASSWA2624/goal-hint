/** Outcome counts for an entire selected cohort, independent of visible pagination. */
export type PerformanceSummaryCounts = Readonly<{
  total: number;
  won: number;
  lost: number;
  pending: number;
  void?: number;
  cancelled?: number;
  unavailable?: number;
  filteredOut?: number;
}>;

/** Predictions retain void outcomes; fixtures without a qualifying prediction are outside this denominator. */
export function predictedPerformanceSummary(counts: PerformanceSummaryCounts) {
  const total = counts.won + counts.lost + counts.pending + (counts.void ?? 0) + (counts.cancelled ?? 0);
  return { total, won: total > 0 ? counts.won / total : null,
    lost: total > 0 ? counts.lost / total : null, pending: total > 0 ? counts.pending / total : null };
}

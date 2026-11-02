/** Shared desktop table tracks: #, date & time, league, home, score, away, market, prediction, odds, probability, result, open. */
export const matchTableColumns = Object.freeze({
  /** An independent odds track keeps prices visible even when a long prediction wraps. */
  compact: "var(--match-index-width, var(--gh-size-6)) var(--gh-size-25) minmax(0, 1fr) minmax(0, 1.3fr) var(--gh-size-13) minmax(0, 1.3fr) var(--gh-size-25) var(--gh-size-24) var(--gh-size-14) var(--gh-size-20) var(--gh-size-20) var(--gh-size-4)",
  full: "var(--match-index-width, var(--gh-size-8)) var(--gh-size-29) minmax(0, 1fr) minmax(0, 1.3fr) var(--gh-size-16) minmax(0, 1.3fr) var(--gh-size-34) var(--gh-size-28) var(--gh-size-16) var(--gh-size-28) var(--gh-size-20) var(--gh-size-4)",
});
export const matchTableGap = "var(--gh-spacing-2_5)";

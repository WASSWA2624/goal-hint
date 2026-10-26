/** Shared desktop table tracks: #, date & time, league, home, score, away, market, prediction, odds, probability, result, open. */
export const matchTableColumns = Object.freeze({
  /** An independent odds track keeps prices visible even when a long prediction wraps. */
  compact: "var(--match-index-width, 1.5rem) 6.25rem minmax(0, 1fr) minmax(0, 1.3fr) 3.25rem minmax(0, 1.3fr) 6.25rem 6rem 3.5rem 5rem 5rem 1rem",
  full: "var(--match-index-width, 2rem) 7.25rem minmax(0, 1fr) minmax(0, 1.3fr) 4rem minmax(0, 1.3fr) 8.5rem 7rem 4rem 7rem 5rem 1rem",
});
export const matchTableGap = "10px";

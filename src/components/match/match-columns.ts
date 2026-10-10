/** Shared desktop table tracks: #, date & time, league, home, score, away, market, prediction, probability, open. */
export const matchTableColumns = Object.freeze({
  /** 64–80rem: probability shows its percent only. */
  compact: "2rem 6.5rem minmax(0, 1fr) minmax(0, 1.3fr) 3.5rem minmax(0, 1.3fr) 7.5rem 4.25rem 3.25rem 1rem",
  full: "2rem 7.25rem minmax(0, 1fr) minmax(0, 1.3fr) 4rem minmax(0, 1.3fr) 9rem 4.75rem 8rem 1rem",
});
export const matchTableGap = "10px";

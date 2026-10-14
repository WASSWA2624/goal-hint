/** Shared desktop table tracks: #, date & time, league, home, score, away, market, prediction, probability, result, open. */
export const matchTableColumns = Object.freeze({
  /** Both widths reserve space for inline prediction odds and a meter beside the probability. */
  compact: "1.5rem 6.25rem minmax(0, 1fr) minmax(0, 1.3fr) 3.25rem minmax(0, 1.3fr) 6.25rem 7.75rem 5rem 4.25rem 1rem",
  full: "2rem 7.25rem minmax(0, 1fr) minmax(0, 1.3fr) 4rem minmax(0, 1.3fr) 8.5rem 8rem 7rem 4.5rem 1rem",
});
export const matchTableGap = "10px";

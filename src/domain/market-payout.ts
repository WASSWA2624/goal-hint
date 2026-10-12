/** Source-independent grades: a push or half result never becomes a binary win/loss. */
export type ExtendedMarketGrade = "win" | "half-win" | "push" | "half-loss" | "loss";

/** Quarter lines split equally across adjacent half lines; each integer-line equality is a push. */
export function asianPayoutGrade(line: number, margin: (line: number) => number): ExtendedMarketGrade {
  if (!Number.isFinite(line) || !Number.isSafeInteger(line * 4)) throw new RangeError("An Asian line must be a finite quarter increment.");
  const lines = Number.isInteger(line * 2) ? [line] : [Math.floor(line * 2) / 2, Math.ceil(line * 2) / 2];
  const payouts = lines.map((part) => {
    const value = margin(part);
    if (!Number.isFinite(value)) throw new RangeError("An Asian settlement margin must be finite.");
    return Math.sign(value);
  });
  const total = payouts.reduce((sum, value) => sum + value, 0);
  return total === lines.length ? "win" : total === -lines.length ? "loss" : total > 0 ? "half-win" : total < 0 ? "half-loss" : "push";
}

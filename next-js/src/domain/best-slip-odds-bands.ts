/** Two-place filter labels share exact hundredth-based engine bounds and stable publication IDs. */
export const bestSlipOddsBands = [
  { id: "1.5-5", label: "2.50–5.00", minimumTotal: 250, maximumTotal: 499 },
  { id: "5-10", label: "5.00–10.00", minimumTotal: 500, maximumTotal: 999 },
  { id: "10-20", label: "10.00–20.00", minimumTotal: 1000, maximumTotal: 1999 },
  { id: "20-50", label: "20.00–50.00", minimumTotal: 2000, maximumTotal: 4999 },
  { id: "50-100", label: "50.00–100.00", minimumTotal: 5000, maximumTotal: 9999 },
  { id: "100-200", label: "100.00–200.00", minimumTotal: 10000, maximumTotal: 20000 },
] as const;
export type BestSlipOddsBand = typeof bestSlipOddsBands[number]["id"];
export const defaultBestSlipOddsBand: BestSlipOddsBand = "1.5-5";
export const bestSlipBandLimit = 20;
export function bestSlipBand(value: BestSlipOddsBand = defaultBestSlipOddsBand) {
  const band = bestSlipOddsBands.find(band => band.id === value);
  if (!band) throw new RangeError("Unknown Best Slips odds range.");
  return band;
}
/** Old boundary quotes can belong to an adjacent persisted family, including 100.00 in 50-100. */
export function bestSlipPublicationBands(value: BestSlipOddsBand = defaultBestSlipOddsBand): readonly BestSlipOddsBand[] {
  const index = bestSlipOddsBands.indexOf(bestSlipBand(value));
  return bestSlipOddsBands.slice(Math.max(0, index - 1), index + 2).map(band => band.id);
}
export function bestSlipOddsBandFor(totalOdds: string): BestSlipOddsBand | null {
  if (!/^\d+\.\d{2}$/.test(totalOdds)) return null;
  const value = BigInt(totalOdds.replace(".", ""));
  return bestSlipOddsBands.find(band => value >= BigInt(band.minimumTotal) && value <= BigInt(band.maximumTotal))?.id ?? null;
}
/** A stable daily public rank keeps existing date/rank links independent of filtering. */
export function bestSlipPublicRank(band: BestSlipOddsBand, rank: number): number {
  return bestSlipOddsBands.findIndex(value => value.id === band) * bestSlipBandLimit + rank;
}

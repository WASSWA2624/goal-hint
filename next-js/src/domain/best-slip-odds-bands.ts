export const bestSlipOddsBands = [
  { id: "1.5-5", label: "1.5–5", minimumTotal: 150, maximumTotal: 499 },
  { id: "5-10", label: "5–10", minimumTotal: 500, maximumTotal: 999 },
  { id: "10-20", label: "10–20", minimumTotal: 1000, maximumTotal: 1999 },
  { id: "20-50", label: "20–50", minimumTotal: 2000, maximumTotal: 4999 },
  { id: "50-100", label: "50–100", minimumTotal: 5000, maximumTotal: 10000 },
] as const;
export type BestSlipOddsBand = typeof bestSlipOddsBands[number]["id"];
export const defaultBestSlipOddsBand: BestSlipOddsBand = "1.5-5";
export const bestSlipBandLimit = 20;
export function bestSlipBand(value: BestSlipOddsBand = defaultBestSlipOddsBand) {
  const band = bestSlipOddsBands.find(band => band.id === value);
  if (!band) throw new RangeError("Unknown Best Slips odds range.");
  return band;
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

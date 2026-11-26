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
/** Original band capacity and permanent stride for historical rank links. */
export const bestSlipBandLimit = 20;
/** Historical version-three publication and version-one append limit. */
export const dailyBestSlipBandLimit = 10;
export const maximumBestSlipLocalRank = 0xffff_ffff;
const legacyPublicRankCount = bestSlipBandLimit * bestSlipOddsBands.length;
export const maximumBestSlipPublicRank = maximumBestSlipLocalRank * bestSlipOddsBands.length;
export function bestSlipExactRange(band: BestSlipOddsBand): Readonly<{ minimum: number; maximum: number; exclusiveMaximum: boolean }> {
  const range = bestSlipBand(band);
  const exclusiveMaximum = range.id !== "100-200";
  return { minimum: range.minimumTotal, maximum: range.maximumTotal + Number(exclusiveMaximum), exclusiveMaximum };
}
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
  const index = bestSlipOddsBands.indexOf(bestSlipBand(band));
  if (!Number.isInteger(rank) || rank < 1 || rank > maximumBestSlipLocalRank) throw new RangeError("Invalid Best Slips rank.");
  return rank <= bestSlipBandLimit ? index * bestSlipBandLimit + rank
    : legacyPublicRankCount + (rank - bestSlipBandLimit - 1) * bestSlipOddsBands.length + index + 1;
}

/** Ranks beyond the original addresses are interleaved by ordinal then band. */
export function bestSlipBandRank(publicRank: number) {
  if (!Number.isInteger(publicRank) || publicRank < 1 || publicRank > maximumBestSlipPublicRank) throw new RangeError("Invalid Best Slips rank.");
  if (publicRank <= legacyPublicRankCount) {
    const ordinal = publicRank - 1;
    return { band: bestSlipOddsBands[Math.floor(ordinal / bestSlipBandLimit)]!.id, rank: ordinal % bestSlipBandLimit + 1 };
  }
  const ordinal = publicRank - legacyPublicRankCount - 1;
  return { band: bestSlipOddsBands[ordinal % bestSlipOddsBands.length]!.id,
    rank: bestSlipBandLimit + Math.floor(ordinal / bestSlipOddsBands.length) + 1 };
}

export function parseBestSlipPublicRank(value: string): number | null {
  if (!/^[1-9]\d{0,10}$/u.test(value)) return null;
  const rank = Number(value);
  return rank <= maximumBestSlipPublicRank ? rank : null;
}

/** Daily identities predate hourly cohorts. Compare their chronological keys without changing stored IDs. */
export function predictionRunOrder(sequence: bigint): bigint {
  return sequence < 100_000_000n ? sequence * 100n : sequence;
}

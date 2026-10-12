/** MySQL UNSIGNED BIGINT travels as canonical decimal text, never a JS number. */
export const maximumFixtureVersion = "18446744073709551615";
export function parseFixtureVersion(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9]\d{0,19}$/.test(value) || BigInt(value) > BigInt(maximumFixtureVersion)) {
    throw new RangeError("Fixture version must be a positive unsigned 64-bit decimal string.");
  }
  return value;
}
export function compareFixtureVersions(left: string, right: string): -1 | 0 | 1 {
  const a = BigInt(parseFixtureVersion(left));
  const b = BigInt(parseFixtureVersion(right));
  return a < b ? -1 : a > b ? 1 : 0;
}


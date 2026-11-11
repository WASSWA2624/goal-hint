import { parseDecimalOdds } from "./odds.ts";

/** Unit return at an exact, currently offered decimal price and an independent forecast probability. */
export function forecastExpectedReturn(probability: number, decimalPrice: string | null): number | null {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1 || decimalPrice === null) return null;
  const odds = parseDecimalOdds(decimalPrice);
  if (!odds) return null;
  const expectedReturn = probability * Number(odds.text) - 1;
  return Math.abs(expectedReturn) <= Number.EPSILON ? 0 : expectedReturn;
}

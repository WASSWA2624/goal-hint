/** Exact decimal odds arithmetic shared by the importer, the feed filter and later market-implied
 * work (053/054). Pure and browser-safe: no floating point touches a stored price or probability. */

const SCALE = 10_000n;
const PROBABILITY_PLACES = 12;
const PROBABILITY_SCALE = 10n ** BigInt(PROBABILITY_PLACES);
const decimalPattern = /^([1-9]\d{0,4})(?:\.(\d{1,4}))?$/u;

/** A provider decimal price: canonical text (no trailing zeros) and its value times 10^4. */
export type DecimalOdds = Readonly<{ text: string; scaled: bigint }>;
/** Inclusive two-place bounds in hundredths: 150 means 1.50. */
export type OddsRange = Readonly<{ min: number; max: number }>;

export const oddsRules = Object.freeze({
  /** 1.01: the lowest price a two-place filter can name; 1.00 is not a price. */
  minimumHundredths: 101,
  /** 1000.00: the explicit cap behind the slider's "20.00+" top stop. */
  maximumHundredths: 100_000,
  /** The slider's top stop (20.00); a raised minimum with the top thumb there serializes 1000.00. */
  sliderMaximumHundredths: 2_000,
});

/** Accepts up to four places and values strictly greater than 1; numbers and exponents are rejected. */
export function parseDecimalOdds(value: string): DecimalOdds | null {
  if (typeof value !== "string") return null;
  const match = decimalPattern.exec(value);
  if (!match) return null;
  const fraction = (match[2] ?? "").replace(/0+$/u, "");
  const scaled = BigInt(match[1]!) * SCALE + BigInt((fraction || "0").padEnd(4, "0"));
  if (scaled <= SCALE) return null;
  return Object.freeze({ text: fraction ? `${match[1]}.${fraction}` : match[1]!, scaled });
}

/** Display and filter value: hundredths rounded half-up, computed once when a price is written. */
export function oddsDisplayHundredths(odds: DecimalOdds): number {
  return Number((odds.scaled + 50n) / 100n);
}

export function formatOddsHundredths(hundredths: number): string {
  if (!Number.isSafeInteger(hundredths) || hundredths < 0) throw new RangeError("Invalid odds hundredths.");
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

/** Strict `MIN-MAX` with exactly two places, 1.01 <= MIN <= MAX <= 1000.00. Returns null when invalid. */
export function parseOddsRange(value: string): OddsRange | null {
  if (typeof value !== "string") return null;
  const match = /^([1-9]\d{0,3})\.(\d{2})-([1-9]\d{0,3})\.(\d{2})$/u.exec(value);
  if (!match) return null;
  const min = Number(match[1]) * 100 + Number(match[2]), max = Number(match[3]) * 100 + Number(match[4]);
  return min >= oddsRules.minimumHundredths && min <= max && max <= oddsRules.maximumHundredths ? Object.freeze({ min, max }) : null;
}

export function formatOddsRange(range: OddsRange): string {
  return `${formatOddsHundredths(range.min)}-${formatOddsHundredths(range.max)}`;
}

export const DE_MARGIN_METHOD = "proportional-v1";

function fixed(numerator: bigint, denominator: bigint): bigint {
  // Round half-up to 12 places; every operand here is positive.
  return (numerator * PROBABILITY_SCALE * 2n + denominator) / (denominator * 2n);
}
function text(scaled: bigint): string {
  const whole = scaled / PROBABILITY_SCALE, fraction = scaled % PROBABILITY_SCALE;
  return `${whole}.${fraction.toString().padStart(PROBABILITY_PLACES, "0")}`;
}

/** Proportional de-margin (implied_i = coverage * (1/o_i) / sum(1/o_j)) for one complete group from
 * one bookmaker. Double chance uses coverage 2 within its own bet, so its probabilities sum to 2.
 * Any missing selection, a group too small for its coverage, or a probability outside (0, 1)
 * yields no group. An overround below 1 is still normalized and recorded. */
export function deMargin(group: readonly (DecimalOdds | null)[], coverage: 1 | 2):
  Readonly<{ probabilities: readonly string[]; overround: string }> | null {
  if (!Array.isArray(group) || (coverage !== 1 && coverage !== 2) || group.length < 2 || group.length <= coverage) return null;
  const prices: bigint[] = [];
  for (const odds of group) {
    if (odds === null || typeof odds !== "object" || typeof odds.scaled !== "bigint" || odds.scaled <= SCALE) return null;
    prices.push(odds.scaled);
  }
  // sum(1/s_j) = numerator / product, with product = prod(s_j).
  const product = prices.reduce((total, price) => total * price, 1n);
  const numerator = prices.reduce((total, price) => total + product / price, 0n);
  const probabilities: string[] = [];
  for (const price of prices) {
    const scaled = fixed(BigInt(coverage) * product, price * numerator);
    if (scaled <= 0n || scaled >= PROBABILITY_SCALE) return null;
    probabilities.push(text(scaled));
  }
  // Overround = sum(1/o_j) = 10^4 * numerator / product.
  return Object.freeze({ probabilities: Object.freeze(probabilities), overround: text(fixed(SCALE * numerator, product)) });
}

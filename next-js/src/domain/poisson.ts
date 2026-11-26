/** Probabilities of zero through the given maximum for a Poisson count. */
export function poisson(rate: number, maximum: number): number[] {
  const probabilities = [Math.exp(-rate)];
  for (let count = 1; count <= maximum; count++) probabilities.push(probabilities[count - 1]! * rate / count);
  return probabilities;
}

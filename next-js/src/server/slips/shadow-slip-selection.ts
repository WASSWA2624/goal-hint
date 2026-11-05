import "server-only";

import { bestSlipBand, bestSlipBandLimit, bestSlipOddsBandFor, bestSlipOddsBands, type BestSlipOddsBand } from "../../domain/best-slip-odds-bands.ts";
import { compareBestSlips, type BestSlip } from "../../domain/best-slips.ts";
import { getReportingDate, utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import { jointSlipProbability, qualifiedJointModel, type JointSlipModel } from "../../domain/joint-slip-model.ts";
import { formatOddsHundredths, parseDecimalOdds } from "../../domain/odds.ts";
import { eligibleShadowSlipCandidate, validatedSlipCandidateKey, type ValidatedSlipCandidate } from "./conservative-joint-model.ts";

export const shadowSlipSearchLimits = Object.freeze({ candidates: 100, legs: 8, nodes: 100_000, retained: 2_000 });
export type ShadowSlip = BestSlip & Readonly<{ evidenceReliability: number; candidateKeys: readonly string[] }>;
export type ShadowSlipSelection = Readonly<{
  mode: "shadow";
  bands: readonly Readonly<{ band: BestSlipOddsBand; slips: readonly ShadowSlip[] }>[];
  examined: number;
  excludedUnestimated: number;
  searchLimited: boolean;
}>;

/** Private evaluation only. It cannot publish, replace snapshots or alter public sorting. */
export function selectShadowSlips(input: Readonly<{
  candidates: readonly ValidatedSlipCandidate[];
  model: JointSlipModel | null;
  asOf: number;
  maximumFixtureExposure?: number;
  minimumJointProbability?: number;
  minimumEvidenceReliability?: number;
}>): ShadowSlipSelection {
  const maximumExposure = input.maximumFixtureExposure ?? 1;
  const minimumProbability = input.minimumJointProbability ?? 0, minimumReliability = input.minimumEvidenceReliability ?? 0;
  if (!Number.isSafeInteger(maximumExposure) || maximumExposure < 1 || maximumExposure > bestSlipOddsBands.length
    || !Number.isFinite(minimumProbability) || minimumProbability < 0 || minimumProbability > 1
    || !Number.isFinite(minimumReliability) || minimumReliability < 0 || minimumReliability > 1) {
    throw new RangeError("Invalid shadow slip selection policy.");
  }
  const bands = bestSlipOddsBands.map(({ id }) => ({ band: id, slips: [] as ShadowSlip[] }));
  if (!qualifiedJointModel(input.model, input.asOf)) return { mode: "shadow", bands, examined: 0, excludedUnestimated: 0, searchLimited: false };
  const day = getReportingDate(utcInstantFromEpochMilliseconds(input.asOf));
  const seen = new Set<string>();
  const eligible = input.candidates.filter(candidate => eligibleShadowSlipCandidate(candidate, input.asOf)
    && candidate.evidenceReliability >= minimumReliability && candidate.selection.oddsBasis === "bookmaker"
    && /^\d+\.\d{2}$/.test(candidate.selection.odds)
    && getReportingDate(utcInstantFromEpochMilliseconds(candidate.selection.kickoffAt)) === day)
    .map(candidate => ({ candidate, key: validatedSlipCandidateKey(candidate), odds: parseDecimalOdds(candidate.selection.odds) }))
    .filter(({ odds, key }) => { if (!odds || seen.has(key)) return false; seen.add(key); return true; })
    .sort((left, right) => right.candidate.selection.probability - left.candidate.selection.probability
      || right.candidate.evidenceReliability - left.candidate.evidenceReliability || left.key.localeCompare(right.key));
  let searchLimited = eligible.length > shadowSlipSearchLimits.candidates, examined = 0, excludedUnestimated = 0;
  const candidates = eligible.slice(0, shadowSlipSearchLimits.candidates), retained: ShadowSlip[] = [];
  const selected: typeof candidates = [], fixtureIds = new Set<string>(), teamIds = new Set<string>();
  const compare = (left: ShadowSlip, right: ShadowSlip) => right.estimatedProbability - left.estimatedProbability
    || right.evidenceReliability - left.evidenceReliability || compareBestSlips(left, right);
  function visit(start: number, product: bigint, denominator: bigint): void {
    for (let index = start; index < candidates.length; index++) {
      if (examined >= shadowSlipSearchLimits.nodes) { searchLimited = true; return; }
      examined++;
      const entry = candidates[index]!, selection = entry.candidate.selection;
      if (fixtureIds.has(selection.fixtureId) || teamIds.has(selection.homeTeam.id) || teamIds.has(selection.awayTeam.id)) continue;
      const nextProduct = product * entry.odds!.scaled, nextDenominator = denominator * 10_000n;
      // Exact prices determine eligibility; rounded display values must not admit >200.00.
      if (nextProduct > 200n * nextDenominator) continue;
      selected.push(entry); fixtureIds.add(selection.fixtureId); teamIds.add(selection.homeTeam.id); teamIds.add(selection.awayTeam.id);
      const hundredths = (nextProduct * 200n + nextDenominator) / (2n * nextDenominator);
      const totalOdds = formatOddsHundredths(Number(hundredths)), band = bestSlipOddsBandFor(totalOdds);
      if (band && nextProduct * 100n >= BigInt(bestSlipBand(band).minimumTotal) * nextDenominator
        && nextProduct * 100n <= BigInt(bestSlipBand(band).maximumTotal) * nextDenominator) {
        const keys = selected.map(item => item.key).sort(), selections = selected.map(item => item.candidate.selection);
        const slip = { id: `shadow:${keys.join(":")}`, selections, totalOdds, oddsBasis: "bookmaker" as const,
          averageProbability: selections.reduce((sum, item) => sum + item.probability, 0) / selections.length };
        const probability = jointSlipProbability(input.model!, slip);
        if (probability === null) excludedUnestimated++;
        else if (probability >= minimumProbability) {
          retained.push({ ...slip, estimatedProbability: probability, evidenceReliability: Math.min(...selected.map(item => item.candidate.evidenceReliability)), candidateKeys: keys });
          if (retained.length > shadowSlipSearchLimits.retained * 2) {
            retained.sort(compare); retained.length = shadowSlipSearchLimits.retained; searchLimited = true;
          }
        }
      }
      if (selected.length < shadowSlipSearchLimits.legs) visit(index + 1, nextProduct, nextDenominator);
      selected.pop(); fixtureIds.delete(selection.fixtureId); teamIds.delete(selection.homeTeam.id); teamIds.delete(selection.awayTeam.id);
    }
  }
  visit(0, 1n, 1n);
  const exposure = new Map<string, number>(), bandFixtures = new Map(bands.map(item => [item.band, new Set<string>()]));
  for (const slip of retained.sort(compare)) {
    const band = bands.find(item => item.band === bestSlipOddsBandFor(slip.totalOdds))!;
    if (band.slips.length >= bestSlipBandLimit || slip.selections.some(item => bandFixtures.get(band.band)!.has(item.fixtureId)
      || (exposure.get(item.fixtureId) ?? 0) >= maximumExposure)) continue;
    band.slips.push(slip);
    for (const selection of slip.selections) {
      bandFixtures.get(band.band)!.add(selection.fixtureId);
      exposure.set(selection.fixtureId, (exposure.get(selection.fixtureId) ?? 0) + 1);
    }
  }
  return { mode: "shadow", bands, examined, excludedUnestimated, searchLimited };
}

import { registeredForecastGoalMarkets } from "./goal-market-definitions.ts";
import { canonicalLegacyForecastSelection, legacyForecastMarketKey } from "./legacy-goal-market-identities.ts";
import { isMarketFamily } from "./markets.ts";
import type { GoalGrade } from "./score-distribution-markets.ts";

export const localFeaturedHistoryVersion = "local-featured-history-v1";

export type LocalFeaturedHistoryContext = Readonly<{
  competitionId?: string | null;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  neutralVenue?: boolean | null;
  /** A verified, point-in-time strength percentile on an identified common rating scale. */
  strength?: Readonly<{ basis: string; home: number; away: number }> | null;
}>;
type Outcome = Readonly<{ marketKey: string; selection: string; probability: number; context?: LocalFeaturedHistoryContext | null }>;
export type LocalFeaturedHistoryTarget = Outcome & Readonly<{ fixtureId: string; decisionAt: number; kickoffAt?: number }>;
export type LocalFeaturedHistoryObservation = Outcome & Readonly<{
  fixtureId: string; revisionId: string; fixtureKickoffAt: number; evidenceCutoffAt: number; publishedAt: number;
  originalLockedAt?: number;
  occurrenceInvalidatedAt?: number;
  resultId: string; resultObservedAt: number; resultAvailableAt: number;
  source: "local-engine"; origin: "original"; accepted: true; grade: GoalGrade | null;
}>;

const MS_PER_DAY = 86_400_000;
const neutralPrior = 80;
const confidenceMultiplier = 1.96;
const comparisonTolerance = 1e-12;
const outcomeDefinitions = new Map(registeredForecastGoalMarkets(true)
  .map(({ definition }) => [definition.key, { payout: definition.group === "payout",
    selections: new Set(definition.selections.map(({ key }) => key)) }]));
const gradeValues: ReadonlySet<GoalGrade> = new Set(["win", "loss", "push", "half-win", "half-loss"]);
const validProbability = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1;
const validInstant = (value: number) => Number.isSafeInteger(value) && value >= 0;
const sameIdentity = (left: string | null | undefined, right: string | null | undefined) => Boolean(left && right && left === right);

function registeredOutcome(marketKey: string, selection: string): Readonly<{ key: string; payout: boolean }> | null {
  if (isMarketFamily(marketKey)) {
    const choice = canonicalLegacyForecastSelection(marketKey, selection);
    return choice === null ? null : registeredOutcome(legacyForecastMarketKey(marketKey), choice);
  }
  const definition = outcomeDefinitions.get(marketKey);
  return definition?.selections.has(selection) ? { key: `${marketKey}\0${selection}`, payout: definition.payout } : null;
}

/** The same exact period, line, side, payout convention and selection share a history key. */
export function localFeaturedHistoryKey(marketKey: string, selection: string) {
  return registeredOutcome(marketKey, selection)?.key ?? null;
}

function strength(context: LocalFeaturedHistoryContext | null | undefined) {
  const rating = context?.strength;
  return rating?.basis && validProbability(rating.home) && validProbability(rating.away) ? rating : null;
}

function originalSignature(sample: LocalFeaturedHistoryObservation) {
  const context = sample.context, rating = strength(context);
  return JSON.stringify([sample.revisionId, sample.fixtureKickoffAt, sample.evidenceCutoffAt, sample.publishedAt, sample.originalLockedAt ?? null,
    sample.occurrenceInvalidatedAt ?? null,
    sample.probability, context?.competitionId ?? null, context?.homeTeamId ?? null, context?.awayTeamId ?? null,
    context?.neutralVenue ?? null, rating?.basis ?? null, rating?.home ?? null, rating?.away ?? null]);
}

function sampleIsCausal(sample: LocalFeaturedHistoryObservation, target: LocalFeaturedHistoryTarget) {
  return Boolean(sample.fixtureId && sample.revisionId && sample.resultId) && sample.fixtureId !== target.fixtureId &&
    sample.source === "local-engine" && sample.origin === "original" && sample.accepted === true && validProbability(sample.probability) &&
    [sample.fixtureKickoffAt, sample.evidenceCutoffAt, sample.publishedAt, sample.resultObservedAt, sample.resultAvailableAt].every(validInstant) &&
    sample.evidenceCutoffAt <= sample.publishedAt && sample.publishedAt < sample.fixtureKickoffAt &&
    sample.fixtureKickoffAt < sample.resultObservedAt && sample.resultObservedAt <= sample.resultAvailableAt &&
    sample.resultAvailableAt < target.decisionAt && (sample.originalLockedAt === undefined ||
      validInstant(sample.originalLockedAt) && sample.originalLockedAt >= sample.publishedAt && sample.originalLockedAt < target.decisionAt) &&
    (sample.occurrenceInvalidatedAt === undefined ||
      validInstant(sample.occurrenceInvalidatedAt) && sample.occurrenceInvalidatedAt >= target.decisionAt);
}

type Comparable = Readonly<{ sample: LocalFeaturedHistoryObservation; probabilityGap: number; sameCompetition: boolean;
  teamMatches: number; verifiedVenue: boolean; strengthGap: number | null }>;
function comparableSample(sample: LocalFeaturedHistoryObservation, target: LocalFeaturedHistoryTarget): Comparable | null {
  const probabilityGap = Math.abs(sample.probability - target.probability);
  if (probabilityGap > .10 + comparisonTolerance) return null;
  const a = target.context, b = sample.context;
  const verifiedVenue = typeof a?.neutralVenue === "boolean" && typeof b?.neutralVenue === "boolean";
  if (verifiedVenue && a.neutralVenue !== b.neutralVenue) return null;
  const targetStrength = strength(a), sampleStrength = strength(b);
  const strengthGap = targetStrength && sampleStrength && targetStrength.basis === sampleStrength.basis
    ? Math.max(Math.abs(targetStrength.home - sampleStrength.home), Math.abs(targetStrength.away - sampleStrength.away)) : null;
  if (strengthGap !== null && strengthGap > .20 + comparisonTolerance) return null;
  return { sample, probabilityGap, verifiedVenue, strengthGap, sameCompetition: sameIdentity(a?.competitionId, b?.competitionId),
    teamMatches: Number(sameIdentity(a?.homeTeamId, b?.homeTeamId)) + Number(sameIdentity(a?.awayTeamId, b?.awayTeamId)) };
}

const scopes = [
  { key: "same-competition-context", probabilityRadius: .05, minSamples: 40, adjustmentLimit: .025,
    includes: (row: Comparable) => row.sameCompetition && (row.teamMatches > 0 || row.verifiedVenue && row.strengthGap !== null) },
  { key: "same-competition", probabilityRadius: .075, minSamples: 50, adjustmentLimit: .020,
    includes: (row: Comparable) => row.sameCompetition },
  { key: "cross-competition", probabilityRadius: .10, minSamples: 80, adjustmentLimit: .015,
    includes: () => true },
] as const;
type HistoryScope = typeof scopes[number]["key"];
type Support = Readonly<{ samples: number; effectiveSamples: number; meanPredicted: number; actualWinRate: number; meanResidual: number;
  standardError: number; residualBeyondUncertainty: number }>;
export type LocalFeaturedHistoryAssessment = Readonly<{
  version: typeof localFeaturedHistoryVersion; status: "invalid-target" | "sparse" | "uncertain" | "supported";
  scope: HistoryScope | null; comparableFixtures: number; conflictingFixtures: number; unsettledFixtures: number;
  support: Support | null; adjustment: number;
}>;

function measure(rows: readonly Comparable[], decisionAt: number, probabilityRadius: number): Support | null {
  const weighted = rows.map(({ sample, probabilityGap, teamMatches, strengthGap, verifiedVenue }) => ({
    sample,
    weight: 2 ** (-(decisionAt - sample.fixtureKickoffAt) / (365 * MS_PER_DAY)) * (1 - .5 * probabilityGap / probabilityRadius) *
      (1 + .10 * teamMatches) * (verifiedVenue ? 1.05 : 1) * (strengthGap === null ? 1 : 1.10 - .5 * strengthGap),
    // Pushes and partial payouts do not count as outright wins. Actual stake return is evaluated separately.
    actualWin: Number(sample.grade === "win"),
  }));
  const sum = weighted.reduce((total, row) => total + row.weight, 0);
  if (!sum) return null;
  const squares = weighted.reduce((total, row) => total + row.weight ** 2, 0);
  const effectiveSamples = Math.min(rows.length, sum ** 2 / squares);
  const meanPredicted = weighted.reduce((total, { sample, weight }) => total + sample.probability * weight, 0) / sum;
  const actualWinRate = weighted.reduce((total, { actualWin, weight }) => total + actualWin * weight, 0) / sum;
  const meanResidual = actualWinRate - meanPredicted;
  const [empiricalVariance, modelVariance] = weighted.reduce(([empirical, model], { actualWin, sample, weight }) => {
    const p = sample.probability;
    return [empirical + weight ** 2 * (actualWin - p - meanResidual) ** 2, model + weight ** 2 * p * (1 - p)];
  }, [0, 0]);
  const empiricalCorrection = effectiveSamples > 1 ? effectiveSamples / (effectiveSamples - 1) : 1;
  const standardError = Math.sqrt(Math.max(empiricalVariance * empiricalCorrection, modelVariance)) / sum;
  return { samples: rows.length, effectiveSamples, meanPredicted, actualWinRate, meanResidual, standardError,
    residualBeyondUncertainty: Math.max(0, Math.abs(meanResidual) - confidenceMultiplier * standardError) };
}

/** Estimate an exact outcome's signed reliability at the target decision time.
 * Scope selection uses support size, not the sign or magnitude of past results. */
export function assessLocalFeaturedHistory(target: LocalFeaturedHistoryTarget,
  observations: readonly LocalFeaturedHistoryObservation[]): LocalFeaturedHistoryAssessment {
  const outcome = registeredOutcome(target.marketKey, target.selection);
  const base = { version: localFeaturedHistoryVersion, scope: null, comparableFixtures: 0, conflictingFixtures: 0,
    unsettledFixtures: 0, support: null, adjustment: 0 } as const;
  if (!outcome || !target.fixtureId || !validInstant(target.decisionAt) || !validProbability(target.probability) ||
    target.kickoffAt !== undefined && (!validInstant(target.kickoffAt) || target.decisionAt >= target.kickoffAt))
    return { ...base, status: "invalid-target" };

  type FixtureProof = { signature: string; sample: LocalFeaturedHistoryObservation; resultConflict: boolean };
  const fixtures = new Map<string, FixtureProof | null>();
  for (const sample of observations) {
    if (!sampleIsCausal(sample, target) || localFeaturedHistoryKey(sample.marketKey, sample.selection) !== outcome.key) continue;
    const prior = fixtures.get(sample.fixtureId);
    if (prior === null) continue;
    const signature = originalSignature(sample);
    if (prior && prior.signature !== signature) fixtures.set(sample.fixtureId, null);
    else if (!prior || prior.sample.resultAvailableAt < sample.resultAvailableAt)
      fixtures.set(sample.fixtureId, { sample, signature, resultConflict: false });
    else if (prior.sample.resultAvailableAt === sample.resultAvailableAt && (prior.sample.resultId !== sample.resultId ||
      prior.sample.grade !== sample.grade || prior.sample.resultObservedAt !== sample.resultObservedAt)) prior.resultConflict = true;
  }
  let conflictingFixtures = 0, unsettledFixtures = 0;
  const comparable = [...fixtures].sort(([left], [right]) => left < right ? -1 : Number(left > right))
    .flatMap(([, entry]) => {
      if (!entry || entry.resultConflict) { conflictingFixtures++; return []; }
      const { grade } = entry.sample;
      if (grade === null || !gradeValues.has(grade) || !outcome.payout && grade !== "win" && grade !== "loss") {
        unsettledFixtures++;
        return [];
      }
      const row = comparableSample(entry.sample, target);
      return row ? [row] : [];
    });
  const traced = { ...base, comparableFixtures: comparable.length, conflictingFixtures, unsettledFixtures };
  let sparseSupport: Support | null = null;
  for (const scope of scopes) {
    const rows = comparable.filter((row) => row.probabilityGap <= scope.probabilityRadius + comparisonTolerance && scope.includes(row));
    const support = measure(rows, target.decisionAt, scope.probabilityRadius);
    sparseSupport = support ?? sparseSupport;
    if (!support || support.effectiveSamples + 1e-9 < scope.minSamples) continue;
    const shrinkage = support.effectiveSamples / (support.effectiveSamples + neutralPrior);
    const magnitude = Math.min(scope.adjustmentLimit, support.residualBeyondUncertainty * shrinkage);
    return { ...traced, scope: scope.key, support, status: magnitude > 0 ? "supported" : "uncertain",
      adjustment: magnitude > 0 ? Math.sign(support.meanResidual) * magnitude : 0 };
  }
  return { ...traced, support: sparseSupport, status: "sparse" };
}

/** For an already eligible tie, leave all published probabilities and gates untouched. */
export function historyAdjustedFeaturedProbability(rawProbability: number, assessment?: LocalFeaturedHistoryAssessment | null) {
  return validProbability(rawProbability) && assessment?.version === localFeaturedHistoryVersion && assessment.status === "supported" &&
    Number.isFinite(assessment.adjustment) && Math.abs(assessment.adjustment) <= scopes[0].adjustmentLimit
    ? Math.min(1, Math.max(0, rawProbability + assessment.adjustment)) : rawProbability;
}

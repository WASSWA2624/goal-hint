import { z } from "zod";

export const SCORE_DISTRIBUTION_VERSION = "joint-regulation-scores-v1";
export const scoreDistributionRules = Object.freeze({ maximumStates: 512, maximumGoals: 30, massTolerance: 1e-9 });

const goals = z.number().int().min(0).max(scoreDistributionRules.maximumGoals);
const stateSchema = z.strictObject({
  home: goals, away: goals, halfHome: goals.nullable(), halfAway: goals.nullable(),
  probability: z.number().finite().gt(0).max(1),
}).superRefine((state, context) => {
  if ((state.halfHome === null) !== (state.halfAway === null) ||
      state.halfHome !== null && (state.halfHome > state.home || state.halfAway! > state.away)) {
    context.addIssue({ code: "custom", message: "Half-time scores must be coherent with the same regulation score." });
  }
});

/** A joint distribution preserves the dependence needed for HT/FT and second-half markets.
 * Unrepresented mass is explicit: it is never discarded or silently renormalized. */
export const scoreDistributionSchema = z.strictObject({
  version: z.literal(SCORE_DISTRIBUTION_VERSION),
  states: z.array(stateSchema).min(1).max(scoreDistributionRules.maximumStates),
  unrepresentedProbability: z.number().finite().min(0).max(1),
}).superRefine((distribution, context) => {
  const identities = distribution.states.map(({ home, away, halfHome, halfAway }) => `${home}:${away}:${halfHome}:${halfAway}`);
  const mass = distribution.states.reduce((sum, state) => sum + state.probability, distribution.unrepresentedProbability);
  if (new Set(identities).size !== identities.length || Math.abs(mass - 1) > scoreDistributionRules.massTolerance) {
    context.addIssue({ code: "custom", message: "Score states must be unique and represented plus unknown probability must sum to one." });
  }
});

export type ScoreState = Readonly<z.infer<typeof stateSchema>>;
export type ScoreDistribution = Readonly<{
  version: typeof SCORE_DISTRIBUTION_VERSION;
  states: readonly ScoreState[];
  unrepresentedProbability: number;
}>;

/** Validates and copies the model-authored distribution without changing its mass or claiming calibration. */
export function parseScoreDistribution(input: unknown): ScoreDistribution {
  const parsed = scoreDistributionSchema.parse(input);
  return Object.freeze({ ...parsed, states: Object.freeze(parsed.states.map((state) => Object.freeze(state))) });
}

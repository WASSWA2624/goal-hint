import { z } from "zod";
import type { OddsBetObservation } from "./odds-markets.ts";
import { deriveGoalMarket, goalMarketDefinitionSchema, type GoalDerivationResult } from "./score-distribution-markets.ts";

const mappingSchema = z.strictObject({
  betId: z.number().int().min(1).max(4_294_967_295), betName: z.string().min(1).max(256),
  definition: goalMarketDefinitionSchema,
  providerLabels: z.record(z.string(), z.string().min(1).max(64)),
}).superRefine((mapping, context) => {
  const keys = mapping.definition.selections.map((selection) => selection.key);
  if (Object.keys(mapping.providerLabels).length !== keys.length || keys.some((key) => !Object.hasOwn(mapping.providerLabels, key)) ||
      new Set(Object.values(mapping.providerLabels)).size !== keys.length) {
    context.addIssue({ code: "custom", message: "Every selection must map to one exact unique provider label." });
  }
});
export type GoalBetMapping = Readonly<z.infer<typeof mappingSchema>>;
export type MappedGoalMarket = GoalDerivationResult | Readonly<{ available: false; reason:
  "invalid-mapping" | "unverified-provider-bet" | "incomplete-provider-group" }>;

/** Uses the actually stored catalog and observation. No invented bet ids, fuzzy name guesses or missing-price selections.
 * Mapping definitions are reviewed source-owned rules; raw provider labels cannot create executable rules. */
export function deriveMappedGoalMarket(distribution: unknown, mappingInput: unknown,
  catalog: ReadonlyMap<number, string> | null, observation: OddsBetObservation | undefined): MappedGoalMarket {
  const parsed = mappingSchema.safeParse(mappingInput);
  if (!parsed.success) return { available: false, reason: "invalid-mapping" };
  const mapping = parsed.data;
  if (!observation || mapping.betId !== observation.betId || mapping.betName !== observation.betName ||
      catalog?.get(mapping.betId) !== mapping.betName) return { available: false, reason: "unverified-provider-bet" };
  const labels = observation.values.map((entry) => entry.label);
  if (mapping.definition.selections.some(({ key }) => labels.filter((label) => label === mapping.providerLabels[key]).length !== 1)) {
    return { available: false, reason: "incomplete-provider-group" };
  }
  return deriveGoalMarket(distribution, mapping.definition);
}

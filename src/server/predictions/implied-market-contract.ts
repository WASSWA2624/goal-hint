import "server-only";
import { z } from "zod";
import { impliedBetMappingSchema, type ImpliedBetMapping, type ImpliedDerivationResult } from "../../domain/market-implied-markets.ts";
import { NON_GOAL_MARKET_RULE_VERSION, type NonGoalMarketDefinition } from "../../domain/non-goal-market-definitions.ts";
import { evidenceSerialize, freezeEvidence } from "../evidence/evidence-input.ts";
import { historyFail } from "./history-contract.ts";
import { historyHash } from "./history-input.ts";
import type { StoredOddsSnapshot } from "../odds/odds-mysql-store.ts";

export const impliedMarketStorageLimits = Object.freeze({ mappings: 256, snapshots: 256, bytes: 4 * 1024 * 1024 });
export const impliedMarketExtensionInputSchema = z.strictObject({ bookmakerId: z.number().int().positive().max(4_294_967_295),
  freshnessMs: z.number().int().min(1).max(7 * 86_400_000), snapshotIds: z.array(historyHash).min(1).max(impliedMarketStorageLimits.snapshots),
  mappings: z.array(impliedBetMappingSchema).min(1).max(impliedMarketStorageLimits.mappings),
}).superRefine(({ snapshotIds, mappings }, context) => {
  if (new Set(snapshotIds).size !== snapshotIds.length || new Set(mappings.map(({ definition }) => definition.key)).size !== mappings.length) {
    context.addIssue({ code: "custom", message: "Source snapshots and period-qualified definitions must be unique." });
  }
});
export type ImpliedMarketExtensionInput = Readonly<{ bookmakerId: number; freshnessMs: number; snapshotIds: readonly string[]; mappings: readonly ImpliedBetMapping[] }>;
export function parseImpliedMarketExtensionInput(input: unknown): ImpliedMarketExtensionInput {
  const parsed = impliedMarketExtensionInputSchema.safeParse(input);
  if (!parsed.success || Buffer.byteLength(evidenceSerialize(parsed.data)) > impliedMarketStorageLimits.bytes) return historyFail("invalid-request");
  return freezeEvidence(parsed.data);
}
export type PreparedImpliedMarketExtension = Readonly<{ version: 1; source: "market-implied"; ruleVersion: typeof NON_GOAL_MARKET_RULE_VERSION;
  bookmakerId: number; freshnessMs: number; confirmedAt: number; mappings: readonly ImpliedBetMapping[];
  catalog: readonly Readonly<{ id: number; name: string }>[]; snapshots: readonly StoredOddsSnapshot[];
  markets: readonly Readonly<{ definition: NonGoalMarketDefinition; snapshotId: string | null; derivation: ImpliedDerivationResult }>[] }>;
export type StoredImpliedMarketExtension = PreparedImpliedMarketExtension & Readonly<{ revisionId: string; cycleId: string; fixtureId: string;
  recordedAt: number; contentHash: string }>;

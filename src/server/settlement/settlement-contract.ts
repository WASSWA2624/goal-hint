import "server-only";

import { z } from "zod";
import { MARKET_RULE_VERSION, isMarketSelection, marketSelections } from "../../domain/markets.ts";
import { historyHash, historyId, historyInstant } from "../predictions/history-input.ts";

export const SETTLEMENT_JOB_TYPE = "prediction.market-settlement";
export const settlementFamily = z.enum(Object.keys(marketSelections) as [keyof typeof marketSelections, ...Array<keyof typeof marketSelections>]);
export const settlementPayload = z.strictObject({ fixtureId: historyId });
export const settlementRevisionSchema = z.strictObject({
  id: historyHash, fixtureId: historyId, cycleId: historyId, family: settlementFamily, batchId: historyHash,
  previousId: historyHash.nullable(), inputHash: historyHash, at: historyInstant, correctedAt: historyInstant.nullable(),
  kind: z.enum(["initial", "transition", "correction"]), ruleVersion: z.literal(MARKET_RULE_VERSION),
  lockedSetId: historyId.nullable(), selection: z.string().max(32).nullable(), source: z.enum(["ai", "api-football"]).nullable(),
  selectedProbability: z.number().gt(0).lt(1).nullable(), resultId: historyHash.nullable(),
  resultUsable: z.boolean(), status: z.enum(["correct", "incorrect", "pending", "void", "unavailable"]), reason: z.string().min(1).max(128),
  cycleState: z.enum(["open", "closed", "void"]), voidReason: z.string().max(2000).nullable(),
}).refine((v) => (v.selection === null
  ? v.status === "unavailable" && v.source === null && v.selectedProbability === null
  : v.lockedSetId !== null && isMarketSelection(v.family, v.selection) && v.source !== null && v.selectedProbability !== null && v.status !== "unavailable") &&
  (v.kind === "initial") === (v.previousId === null) && (v.kind !== "correction" || v.correctedAt === v.at) &&
  (v.correctedAt === null || v.correctedAt <= v.at) && (v.cycleState === "void") === (v.voidReason !== null) &&
  (v.cycleState !== "open" || v.lockedSetId === null) && (!v.resultUsable || v.resultId !== null) &&
  (!["correct", "incorrect"].includes(v.status) || v.resultId !== null && v.resultUsable));
export type SettlementRevision = Readonly<z.infer<typeof settlementRevisionSchema>>;

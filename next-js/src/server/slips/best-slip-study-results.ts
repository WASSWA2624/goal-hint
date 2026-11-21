import "server-only";

import { utcInstantFromEpochMilliseconds } from "../../domain/calendar.ts";
import type { BuiltSlip } from "../../domain/slip-builder.ts";
import { indexSlipResults, slipCompleted, slipResultView, type SlipResult } from "../../domain/slip-snapshot.ts";
import type { DatabaseRuntime } from "../database/client.ts";
import { sealBestSlipStudyReceipt, type BestSlipStudyCapture, type BestSlipStudyOutcome } from "./best-slip-study-contract.ts";
import { readSlipForecastResults } from "./slip-forecast.ts";

export function gradeBestSlipStudySlate(slip: BuiltSlip, results: readonly SlipResult[]): BestSlipStudyOutcome {
  if (!slipCompleted(slip, results)) return "pending";
  const view = slipResultView(slip.id, "", slip, results);
  if (!view || view.results.length !== slip.selections.length) return "unavailable";
  if (view.results.some(({ outcome }) => outcome === "pending")) return "pending";
  if (view.results.some(({ outcome }) => outcome === "void")) return "void";
  return view.outcome;
}

/** Observe outcomes now. A historical date cannot be supplied as an observation clock. */
export async function observeBestSlipStudyResults(database: Pick<DatabaseRuntime, "transaction">, capture: BestSlipStudyCapture) {
  return database.transaction(async tx => {
    const [clock] = await tx.$queryRaw<{ observedAt: Date }[]>`SELECT UTC_TIMESTAMP(3) AS observedAt`;
    const at = utcInstantFromEpochMilliseconds(clock?.observedAt.getTime() ?? NaN);
    if (at <= capture.capturedAt) throw new RangeError("Best Slips results must be observed after capture.");
    const selections = capture.slates.flatMap(({ slip }) => slip.selections);
    const results = indexSlipResults(await readSlipForecastResults(tx, selections, at));
    const [recorded] = await tx.$queryRaw<{ observedAt: Date }[]>`SELECT UTC_TIMESTAMP(3) AS observedAt`;
    const observedAt = utcInstantFromEpochMilliseconds(recorded?.observedAt.getTime() ?? NaN);
    if (observedAt < at) throw new RangeError("Best Slips result clock moved backwards.");
    return sealBestSlipStudyReceipt({ captureHash: capture.hash, observedAt, outcomes: capture.slates.map(({ slip }) => ({
      slipId: slip.id, outcome: gradeBestSlipStudySlate(slip, results(slip)),
    })) });
  }, { isolationLevel: "RepeatableRead", timeout: 30_000 });
}

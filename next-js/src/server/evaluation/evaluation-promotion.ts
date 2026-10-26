import "server-only";

import { API_FOOTBALL_CONTRACT_VERSION } from "../football/api-football-contract.ts";
import type { EvaluationProtocol, EvaluationReport } from "./evaluation-contract.ts";

/** The reference an owner may approve as "ai-promotion" to let one model publish AI-first. It binds the report hash and
 * the evaluated model, so a different report or model needs a new approval. Returns null unless the report is a
 * prospective final test that is eligible for independent review against the current provider contract, and for every
 * protocol horizon a passed candidate gate shows the AI match result strictly beating the matched API-Football forecast
 * (maximum Brier difference below zero). This prints a reference only; it never promotes or approves anything. */
export function aiPromotionReference(report: EvaluationReport, protocol: Pick<EvaluationProtocol, "id" | "horizons">): string | null {
  if (report.protocolId !== protocol.id || report.mode !== "prospective" || report.split !== "finalTest" ||
    report.decision !== "eligible-for-independent-review" || report.candidateModelId === null ||
    report.providerContractVersion !== API_FOOTBALL_CONTRACT_VERSION || protocol.horizons.length === 0) return null;
  const beatsProvider = protocol.horizons.every((horizon) => report.gates.some((gate) => gate.status === "passed" &&
    gate.purpose === "candidate" && gate.criteria.system === "ai" && gate.criteria.family === "match-result" &&
    gate.criteria.horizonId === horizon.id && gate.criteria.baseline === "api-football" &&
    gate.criteria.maximumBrierDifference !== null && gate.criteria.maximumBrierDifference < 0));
  return beatsProvider ? `forecast-evaluation:${report.hash}:${report.candidateModelId}` : null;
}

import "server-only";

import { publicPolicy } from "../../domain/public-policy.ts";
import { getRuntimePolicy, type EvidenceVerifier } from "../config/runtime-policy.ts";
import { loadOwnerApprovals, ownerEvidenceVerifier } from "../live/live-approvals.ts";
import { provenTrue } from "../shared/authority-proof.ts";

export function approvedOddsDisplay(reference: string | null, verify: EvidenceVerifier): boolean {
  return reference !== null && provenTrue(() => verify(reference, "football-odds-rights"));
}

/** Check the private deployment record at the read boundary. Only its boolean result may reach the browser. */
export function publicOddsEnabled(): boolean {
  if (publicPolicy.features.providerOdds) return true;
  return provenTrue(() => {
    const reference = getRuntimePolicy().choices.odds.rightsRef;
    return reference !== null && approvedOddsDisplay(reference, ownerEvidenceVerifier(loadOwnerApprovals()));
  });
}

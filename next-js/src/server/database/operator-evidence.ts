import "server-only";

import type { EvidenceVerifier } from "../config/runtime-policy.ts";
import { loadOwnerApprovals, ownerEvidenceVerifier } from "../live/live-approvals.ts";

/** Private deployment decisions, loaded only when a database gate requires them. */
export function createDatabaseEvidenceVerifier(): EvidenceVerifier {
  let verify: EvidenceVerifier | undefined;
  return (reference, requirement) => {
    if (requirement !== "database-access" && requirement !== "budget-approval") return false;
    verify ??= ownerEvidenceVerifier(loadOwnerApprovals());
    return verify(reference, requirement);
  };
}

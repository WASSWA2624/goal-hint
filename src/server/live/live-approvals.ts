import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { EvidenceRequirement, EvidenceVerifier, RuntimePolicy } from "../config/runtime-policy.ts";

/** Ignored local register of owner decisions. A configuration reference verifies
 * only when the owner recorded that exact reference for that exact requirement. */
export const OWNER_APPROVALS_FILE = ".goal-hint/owner-approvals.json";
const requirements = ["budget-approval", "database-access", "football-private-use", "football-account", "football-public-rights",
  "research-license", "calibration-configuration", "evidence-policy", "freshness-policy", "shadow-protocol", "pipeline-integrity",
  "quality-qualification", "release-approval"] as const satisfies readonly EvidenceRequirement[];
const text = z.string().trim().min(1).max(512).regex(/^[^\p{Cc}]+$/u);
const register = z.strictObject({ version: z.literal(1), owner: text, approvals: z.array(z.strictObject({
  requirement: z.enum(requirements), reference: text, approvedAt: z.iso.date(), decision: z.string().trim().min(1).max(2000),
})).min(1).max(100) });
export type OwnerApprovals = z.infer<typeof register>;

export class OwnerApprovalError extends Error {
  constructor() { super(`Owner approvals are missing or invalid; record decisions in ${OWNER_APPROVALS_FILE}.`); this.name = "OwnerApprovalError"; }
}

export function parseOwnerApprovals(value: unknown): OwnerApprovals {
  const parsed = register.safeParse(value);
  if (!parsed.success || new Set(parsed.data.approvals.map((item) => `${item.requirement}\0${item.reference}`)).size !== parsed.data.approvals.length)
    throw new OwnerApprovalError();
  return Object.freeze(parsed.data);
}
export function loadOwnerApprovals(root = process.cwd()): OwnerApprovals {
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(root, OWNER_APPROVALS_FILE), "utf8")); } catch { throw new OwnerApprovalError(); }
  return parseOwnerApprovals(raw);
}
export function ownerEvidenceVerifier(approvals: OwnerApprovals): EvidenceVerifier {
  const approved = new Set(approvals.approvals.map((item) => `${item.requirement}\0${item.reference}`));
  return (reference, requirement) => typeof reference === "string" && approved.has(`${requirement}\0${reference}`);
}
/** Approved references that a runtime policy names but the owner register lacks. */
export function missingOwnerApprovals(policy: RuntimePolicy, verify: EvidenceVerifier): readonly string[] {
  const { choices } = policy, missing: string[] = [];
  const check = (field: string, reference: string | null, requirement: EvidenceRequirement) => {
    if (reference === null || !verify(reference, requirement)) missing.push(`${field} (${requirement})`);
  };
  check("GOAL_HINT_BUDGET_APPROVAL_REF", choices.budgets.approvalRef, "budget-approval");
  check("GOAL_HINT_FOOTBALL_PRIVATE_USE_REF", choices.football.privateUseRef, "football-private-use");
  if (policy.scope !== "trial") check("GOAL_HINT_FOOTBALL_ACCOUNT_EVIDENCE_REF", choices.football.accountEvidenceRef, "football-account");
  if (policy.scope === "production") {
    check("GOAL_HINT_FOOTBALL_PUBLIC_RIGHTS_REF", choices.football.publicRightsRef, "football-public-rights");
    check("GOAL_HINT_QUALITY_QUALIFICATION_REF", choices.qualityQualificationRef, "quality-qualification");
    check("GOAL_HINT_RELEASE_APPROVAL_REF", choices.releaseApprovalRef, "release-approval");
    check("GOAL_HINT_EVIDENCE_POLICY_REF", choices.evidencePolicyRef, "evidence-policy");
    check("GOAL_HINT_FRESHNESS_POLICY_REF", choices.freshnessPolicyRef, "freshness-policy");
    check("GOAL_HINT_PIPELINE_INTEGRITY_REF", choices.pipelineIntegrityRef, "pipeline-integrity");
  }
  if (policy.mode === "production" || choices.database.accessRef !== null)
    check("GOAL_HINT_DATABASE_ACCESS_REF", choices.database.accessRef, "database-access");
  return Object.freeze(missing);
}

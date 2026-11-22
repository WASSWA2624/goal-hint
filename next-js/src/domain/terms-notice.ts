import { publicOperator } from "./public-operator.ts";

/** The review date identifies the version recorded with purchase consent. */
export const termsNotice = Object.freeze({
  publication: "published",
  releaseReady: true,
  reviewedOn: "2026-11-22",
  effectiveOn: "2026-11-22",
  plannedEffectiveOn: publicOperator.plannedLaunchOn,
  blockers: Object.freeze(["privacy", "payments", "refunds", "data-protection", "jurisdiction", "paid-rights"] as const),
});

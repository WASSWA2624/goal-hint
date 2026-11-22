import { publicOperator } from "./public-operator.ts";

/** Owner-approved Privacy notice. */
export const privacyNotice = Object.freeze({
  publication: "published",
  releaseReady: true,
  reviewedOn: "2026-11-22",
  effectiveOn: "2026-11-22",
  plannedEffectiveOn: publicOperator.plannedLaunchOn,
  blockers: Object.freeze(["logs", "hosting", "sources", "retention", "payments", "refunds", "data-protection"] as const),
});

import { publicOperator } from "./public-operator.ts";

/** Confirmed owner facts; outstanding hosting details still prevent a final notice. */
export const privacyNotice = Object.freeze({
  publication: "prelaunch-summary",
  releaseReady: false,
  reviewedOn: "2026-10-21",
  effectiveOn: null,
  plannedEffectiveOn: publicOperator.plannedLaunchOn,
  blockers: Object.freeze(["logs", "hosting", "sources", "retention", "payments", "refunds", "data-protection"] as const),
});

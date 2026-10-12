import { publicOperator } from "./public-operator.ts";

/** Owner-approved launch facts and reuse terms; final privacy notice remains pending. */
export const termsNotice = Object.freeze({
  publication: "prelaunch-draft",
  releaseReady: false,
  reviewedOn: "2026-10-12",
  effectiveOn: null,
  plannedEffectiveOn: publicOperator.plannedLaunchOn,
  blockers: Object.freeze(["privacy"] as const),
});

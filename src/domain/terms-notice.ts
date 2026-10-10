/** Repository facts only. Owner decisions and legal review still block final publication. */
export const termsNotice = Object.freeze({
  publication: "prelaunch-draft",
  releaseReady: false,
  reviewedOn: "2026-10-10",
  effectiveOn: null,
  blockers: Object.freeze(["operator", "contact", "rights", "privacy", "review"] as const),
});

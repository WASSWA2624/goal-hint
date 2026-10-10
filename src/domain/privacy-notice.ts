/** Reviewed repository facts, not owner/legal approval or a production notice. */
export const privacyNotice = Object.freeze({
  publication: "prelaunch-summary",
  releaseReady: false,
  reviewedOn: "2026-10-10",
  effectiveOn: null,
  blockers: Object.freeze(["operator", "contact", "logs", "analytics", "hosting", "sources", "retention"] as const),
});

# 040 Terms page

**Feature:** Clear terms for the actual Goal Hint service.

**Depends on:** [038-methodology-performance.md](038-methodology-performance.md), [039-privacy-page.md](039-privacy-page.md).

**Source:** [App specification](../app-write-up.md), sections 1, 4–8, 12–15.

## Prompt

Read `dev-plan/000-index.md`, the source sections, published methodology and existing legal/operator decisions. Implement an English terms page in the shared site shell and link it from the footer. Describe the implemented free, account-free football information service, estimated probabilities, AI/provider sourcing, daily refresh limitations and the possibility of unavailable or delayed information. Link to the actual methodology, settlement/correction policy and privacy page rather than duplicating detailed operational documentation.

State accurately that Goal Hint does not offer betting, payments or visitor subscriptions and does not guarantee wins or prediction accuracy. Describe permissible use and intellectual-property/source attribution only to the extent supported by confirmed ownership and third-party permissions. Do not claim ownership of provider/team assets or rights that the trial has not established. Avoid invented experts, affiliations, licenses and service commitments.

Use the actual operator identity, applicable jurisdiction and owner-approved dispute/contact terms. Where these facts or legal requirements are unresolved, complete the reusable layout and supported factual draft, then record the missing decision as a release blocker. Consult current authoritative sources when implementing jurisdiction-specific legal requirements; do not invent liability exclusions, eligibility restrictions or enforceability guarantees. Do not expose public TODOs, fake addresses or placeholder operator names. Keep the final publication gated until necessary factual/legal decisions are recorded.

Use concise prose with semantic headings, externalized English strings, readable mobile typography and consistent Goal Hint branding. Add accurate canonical metadata and an actual effective/review date. This prompt implements the terms document only; it must not introduce accounts, paywalls, betting integrations or an acceptance-tracking system.

## Acceptance checks

- Compare terms with actual free access, markets, sources, update cadence and correction behavior.
- Verify links, footer access, initial server HTML and small-screen readability.
- Check that ownership, jurisdiction, operator identity and contact facts are evidence-backed.
- Ensure unresolved required legal facts prevent release rather than shipping placeholders.

## Handoff

Update `docs/development-progress.md` with changed files, checks/results and real blockers. Record owner decisions, legal references and unresolved requirements in `docs/implementation-decisions.md`.

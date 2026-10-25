# Best Slips (25 October 2026)

`/en` is Best Slips; `/en/matches` preserves the match feed and `/en/slips` keeps
the editable builder. Old feed-query bookmarks redirect to Matches. Public
previews show the rank and match count of available premium slips. Active
selections, total odds and estimated joint probability require entitlement.
Both the initial DTO and the final entitlement recheck use that allowlist.

The daily Kampala cohort targets 4.50–5.50 combined odds and up to ten distinct
slips; source-owned `bestSlipsRules` configures the range/count. Daily slips do
not share fixtures. The bounded compatible-batch search maximizes the feasible
slip count, then compares slip ranks. Individual ranking prioritizes calibrated
joint probability, then fewer matches for equal estimates, then higher odds.
The selection-count tie-break never overrides a higher estimated joint chance.
Matches sort by individual probability. The editable custom builder retains its
optional match-reuse control. Scarce cohorts produce fewer slips with a visible
explanation. Existing candidate/search limits remain disclosed.

Entitled summaries show total odds, estimated whole-slip probability, arithmetic
average match probability and selection count separately. Average match
probability remains a description of the individual forecasts, not a joint
probability estimate.

The stored-cohort reader and price freshness/rights gates are reused. A qualified
server-side joint model must provide calibration and correlation evidence and a
current validity window; mathematical marginal bounds are also checked. No mean,
product-of-marginals or invented estimate is used as a fallback. With unresolved
model qualification and public odds rights (OP-15/17/36), the production binding
shows unavailable. Synthetic tests exercise generation and transport separately.
Custom builds reuse the same ranking contract (`jointSlipRanking` in
`src/domain/joint-slips.ts`) when a qualified request-time model is bound; none
is bound today, so custom ranking stays average-based (`docs/slip-builder.md`).

The page and `/api/best-slips` recheck entitlement after generation. Responses
are private/no-store. Public DTOs omit even the internal slip ID, because it
encodes fixture and selection identifiers. Shared caches never contain a viewer
response. The page refreshes while visible and after a background tab returns.

Local test mode exposes sign-in, plans, trial requests, payment reports and code
activation. Every fixture's predictions/odds remain gated; valid unlocked periods
are honored until expiry. Nothing was deployed or activated on a production host.

Daily Best Slips are still recomputed from the stored cohort. They are not yet
automatically published as immutable dated slip snapshots. Custom saved slips
retain their original selections, probabilities, prices and save timestamp;
completing the daily publication archive is a separate checklist requirement.

`tests/best-slips.test.mjs` verifies diversification, scarcity, whole-slip ranking,
model qualification and both access gates. `scripts/verify-paywall-rendering.py`
checks raw HTML, React flight responses and APIs across viewer states, including
hidden active probabilities and separate mean/joint summaries for subscribers.

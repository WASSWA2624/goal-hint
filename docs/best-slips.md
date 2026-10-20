# Best Slips (20 October 2026)

`/en` is Best Slips; `/en/matches` preserves the match feed and `/en/slips` keeps
the editable builder. Old feed-query bookmarks redirect to Matches. The owner
approved public total odds, estimated joint win probability and match count,
with subscriber-only match selections.

The daily Kampala cohort targets 4.50–5.50 combined odds and ten distinct slips;
source-owned `bestSlipsRules` configures the range/count. Ranking prioritizes
calibrated joint probability, then fewer matches, then higher odds. Matches sort
by individual probability. The existing candidate/search limits remain disclosed.

The stored-cohort reader and price freshness/rights gates are reused. A qualified
server-side joint model must provide calibration and correlation evidence and a
current validity window; mathematical marginal bounds are also checked. No mean,
product-of-marginals or invented estimate is used as a fallback. With unresolved
model qualification and public odds rights (OP-15/17/36), the production binding
shows unavailable. Synthetic tests exercise generation and transport separately.

The page and `/api/best-slips` recheck entitlement after generation. Responses
are private/no-store. Public DTOs omit even the internal slip ID, because it
encodes fixture and selection identifiers. Shared caches never contain a viewer
response. The page refreshes while visible and after a background tab returns.

The owner subsequently requested all local flows open. Local test mode now exposes sign-in, plans, trial requests, payment reports and code activation. Every fixture's predictions/odds remain gated; valid unlocked periods are honored until expiry. Nothing was deployed or activated on a production host.

# 024 — Reconcile bookmaker and separate pre-match/live market catalogs

**Phase:** Odds  
**Key prerequisites:** [002 — Build the versioned provider endpoint inventory](002-endpoint-inventory.md); [003 — Define lossless, temporal provider-data contracts](003-record-contracts.md); [004 — Implement resource-level completeness tracking](004-completeness-ledger.md); [005 — Define the shared versioned market registry](005-market-registry.md); [008 — Persist responses and normalize them idempotently](008-transactional-ingestion.md); [009 — Coalesce requests and reuse fresh shared responses](009-shared-fetch-cache.md); [010 — Implement documented batching and resumable pagination](010-batching-pagination.md); [011 — Implement the shared quota budget and priority scheduler](011-quota-scheduler.md); [012 — Implement failure classification and quota-aware retries](012-retries-errors.md)

## Required context

Read [GLOBAL-RULES.md](support/GLOBAL-RULES.md) and the completed earlier handoffs. Execute only this prompt’s task. Preserve the existing application, design and paid-access controls.

Use source references **R4** in [REFERENCES.md](support/REFERENCES.md); verify the applicable provider/account behavior during implementation.

## Single task

Implement complete odds-catalog ingestion and explicit source-to-registry mapping without conflating live and pre-match IDs.

## Source requirements

The following excerpts retain the original requirements. Original section numbers and R-references refer to the bundled source, not this file’s headings.

### Catalog and availability endpoints

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 41–42, 69–71, 73.*

| Dataset | Endpoint(s) | Required ingestion scope |
|---|---|---|
| Bookmakers | `/odds/bookmakers` | Complete available bookmaker catalog. |
| Pre-match markets | `/odds/bets` | Complete pre-match market catalog. |
| Odds availability mapping | `/odds/mapping` | All available mapping pages. |
| Live market catalog | `/odds/live/bets` | Separate live-market identifiers and definitions. |

### Namespace and mapping rules

*[Original prompt](support/source/goalhint-improvement-prompt.md), lines 226, 303.*

1. Import all available bookmaker and market catalogs. Keep **pre-match and live market ID namespaces separate**; the same numeric ID is not automatically the same market. [R4]

Reconcile the existing registry with API catalogs. Enumerate every catalog entry and map it explicitly, marking unsupported/unmapped entries with reasons rather than silently dropping them. Do not guess the contents of an unprovided market file.

## Scope boundary

Implement catalog ingestion/mapping only. Prices and displayed reference selection belong to the following two tasks.

## Acceptance checks

- [ ] Import the complete bookmaker, pre-match-market, live-market and odds-availability mapping pages.
- [ ] Keep source namespace part of every market identifier and map every catalog entry explicitly.
- [ ] Store unsupported/unmapped reasons and expose mapping coverage; never silently drop entries or assume same numeric ID means same market.

## Handoff

Return actual changed files/artifacts, check commands and results, configuration or migration changes, and any evidence-backed deviations or blockers. Do not claim unverified outcomes.

Next in sequence: [025 — Implement full, independent odds-price ingestion](025-odds-ingestion.md).
